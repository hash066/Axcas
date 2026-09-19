"""Merchant-safe typed Axcas tools for Hermes WhatsApp Cloud.

This plugin deliberately contains no provider or ProofGate credential. Product
operations cross a local Unix socket whose separately isolated service owns the
server credential and validates every payload.
"""

from __future__ import annotations

import http.client
import json
import os
import re
import socket
import threading
from typing import Any


SAFE_RETRY_MESSAGE = (
    "I couldn’t complete this step just now. Please reply RETRY; you won’t "
    "need to retype your business details."
)
SAFE_NO_TOOL_MESSAGE = (
    "I couldn’t start this step just now. Please reply RETRY; you won’t "
    "need to retype your business details."
)

_WHATSAPP_PLATFORMS = frozenset({"whatsapp", "whatsapp_cloud"})
_AXCAS_TOOLS = frozenset({"axcas_continue", "axcas_status"})
_ACTIONS = frozenset({
    "intake",
    "policy",
    "decision",
    "candidate",
    "request_verification",
    "request_publish",
    "lead",
    "call_batch",
    "reel",
    "orchestrate_build",
})

# A public WhatsApp reply is allowed only when it is backed by an Axcas tool
# result from the same Hermes session. The receipt is consumed exactly once by
# transform_llm_output, so it cannot authorize model-written copy in a later
# turn. Hermes serializes turns within one session; the lock also protects
# unrelated merchant sessions handled concurrently by the gateway.
_TOOL_RECEIPTS: dict[str, tuple[bool, str]] = {}
_TOOL_RECEIPTS_LOCK = threading.Lock()

# This is a fail-closed customer-output policy, not a best-effort secret masker.
# LLM-authored technical output is suppressed. A real bridge failure separately returns the
# durable SAFE_RETRY_MESSAGE, so a blocked model response cannot create repetitive fake errors.
_FORBIDDEN_CUSTOMER_OUTPUT = tuple(re.compile(pattern, re.IGNORECASE | re.MULTILINE) for pattern in (
    r"(?:PROOFGATE|HERMES|META|VAPI|AWS|CONVEX|CLOUDFLARE)_[A-Z0-9_]+",
    r"\b(?:npm\s+run\s+proofgate|execute_code|subprocess|os\.environ|export\s+[A-Z_]+)",
    r"(?:^|\s)(?:/opt/|/tmp/|/etc/proofgate/|[A-Z]:\\Users\\)",
    r"```",
    r"[a-fA-F0-9]{48,}",
    r"\b(?:Authorization|Bearer)\s+[A-Za-z0-9._~+/=-]+",
    r"\b(?:provider authentication failed|raw provider details|gateway logs|stack trace|traceback)\b",
    r"\b(?:shell command|backend credentials?|database connection|configure the backend|set up the server)\b",
    r"\b(?:carrd(?:\.co)?|wix|squarespace|weebly|shopify site builder)\b",
    r"\b(?:build|create|make|publish)\s+(?:the|your|a)\s+(?:website|site)\s+(?:yourself|on your own)\b",
    r"\b(?:try|prefer)(?:\s+to)?\s+(?:it|creating|building)(?:\s+(?:the|your|a)\s+(?:website|site))?\s+(?:yourself|on your own)\b",
    r"\b(?:ProofGate|Convex|Cloudflare|Hermes|Vapi|Bedrock|Strands|Meta|AWS|Lambda|S3|DynamoDB|SQS|Fargate|CloudFront|Cognito|API Gateway|WAF|Polly|FFmpeg|backend|provider)\b",
    r"\b(?:candidate|capabilit(?:y|ies)|verifier|verification|intake|rollback)\b",
    r"\b(?:site\s?id|asset\s?id|merchant\s?id|workflow\s?id|approval\s?id|version\s?id|spec\s?hash|bundle\s?id|slug)\b",
    r"\b(?:SiteSpecV[23]|SiteSpec|schemaVersion|specHash)\b",
    r"\bpg:[a-z0-9-]{3,64}:(?:approve|deny)\b",
    r"Command Approval Required",
))


def filter_customer_output(response_text: str, platform: str) -> str:
    """Return customer-safe text for WhatsApp, replacing suspicious output."""
    if platform not in _WHATSAPP_PLATFORMS:
        return response_text
    if not isinstance(response_text, str):
        return SAFE_RETRY_MESSAGE
    if not response_text.strip():
        return response_text
    if any(pattern.search(response_text) for pattern in _FORBIDDEN_CUSTOMER_OUTPUT):
        return ""
    return response_text


class _UnixHTTPConnection(http.client.HTTPConnection):
    def __init__(self, socket_path: str, timeout: float = 30.0):
        super().__init__("localhost", timeout=timeout)
        self.socket_path = socket_path

    def connect(self) -> None:
        connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        connection.settimeout(self.timeout)
        connection.connect(self.socket_path)
        self.sock = connection


def _session_context() -> dict[str, str]:
    from gateway.session_context import get_session_env

    platform = get_session_env("HERMES_SESSION_PLATFORM", "")
    user_id = get_session_env("HERMES_SESSION_USER_ID", "")
    message_id = get_session_env("HERMES_SESSION_MESSAGE_ID", "")
    if platform not in _WHATSAPP_PLATFORMS or not re.fullmatch(r"\d{8,15}", user_id):
        raise ValueError("merchant session unavailable")
    if not message_id or len(message_id) > 512:
        raise ValueError("merchant message unavailable")
    return {"platform": platform, "userId": user_id, "messageId": message_id}


def _call_bridge(action: str, payload: Any) -> str:
    try:
        socket_path = os.environ.get("AXCAS_BRIDGE_SOCKET", "/run/axcas/tool-bridge.sock")
        if not socket_path.startswith("/run/axcas/") or not socket_path.endswith(".sock"):
            raise ValueError("bridge unavailable")
        request_context = _session_context()
        request_body = json.dumps({
            "action": action,
            "context": request_context,
            "payload": payload,
        }, separators=(",", ":")).encode("utf-8")
        if len(request_body) > 1024 * 1024:
            raise ValueError("request too large")
        connection = _UnixHTTPConnection(socket_path)
        connection.request(
            "POST",
            "/v1/tool",
            body=request_body,
            headers={"content-type": "application/json", "content-length": str(len(request_body))},
        )
        response = connection.getresponse()
        raw = response.read(1024 * 1024 + 1)
        connection.close()
        if response.status != 200 or len(raw) > 1024 * 1024:
            raise ValueError("bridge unavailable")
        result = json.loads(raw.decode("utf-8"))
        if not isinstance(result, dict):
            raise ValueError("bridge unavailable")
        allowed = {
            key: result[key]
            for key in (
                "status", "customerMessage", "merchantId", "previewUrl",
                "previewExpiresAt", "specHash", "decision", "notifyCustomer",
            )
            if key in result
        }
        if allowed.get("status") not in {
            "accepted", "preview_ready", "approval_sent", "temporarily_unavailable"
        }:
            raise ValueError("bridge unavailable")
        customer_message = allowed.get("customerMessage")
        if customer_message is not None:
            if not isinstance(customer_message, str):
                raise ValueError("bridge unavailable")
            filtered_message = filter_customer_output(customer_message, request_context["platform"])
            if filtered_message != customer_message:
                allowed = {
                    "status": "temporarily_unavailable",
                    "customerMessage": SAFE_RETRY_MESSAGE,
                    "notifyCustomer": True,
                }
        return json.dumps(allowed, separators=(",", ":"))
    except Exception:
        return json.dumps({
            "status": "temporarily_unavailable",
            "customerMessage": SAFE_RETRY_MESSAGE,
            "notifyCustomer": True,
        }, separators=(",", ":"))


def _handle_continue(params: dict[str, Any], **_kwargs: Any) -> str:
    action = params.get("action")
    if action not in _ACTIONS or "payload" not in params:
        return json.dumps({
            "status": "temporarily_unavailable",
            "customerMessage": SAFE_RETRY_MESSAGE,
            "notifyCustomer": True,
        }, separators=(",", ":"))
    return _call_bridge(action, params["payload"])


def _handle_status(params: dict[str, Any], **_kwargs: Any) -> str:
    return _call_bridge("metrics", params)


def _block_non_axcas_tools(tool_name: str, **_kwargs: Any) -> dict[str, str] | None:
    try:
        from gateway.session_context import get_session_env

        platform = get_session_env("HERMES_SESSION_PLATFORM", "")
    except Exception:
        return None
    if platform in _WHATSAPP_PLATFORMS and tool_name not in _AXCAS_TOOLS:
        return {
            "action": "block",
            "message": "This operation is unavailable in the Axcas customer channel.",
        }
    return None


def _record_axcas_tool_result(
    tool_name: str,
    result: Any,
    session_id: str = "",
    **_kwargs: Any,
) -> None:
    """Record the sole customer-visible result authorized for this turn."""
    if tool_name not in _AXCAS_TOOLS or not session_id:
        return
    try:
        parsed = json.loads(result) if isinstance(result, str) else result
        if not isinstance(parsed, dict):
            raise ValueError("invalid Axcas result")
        notify_customer = parsed.get("notifyCustomer")
        customer_message = parsed.get("customerMessage")
        if not isinstance(notify_customer, bool) or not isinstance(customer_message, str):
            raise ValueError("invalid Axcas result")
        receipt = (notify_customer, customer_message)
    except Exception:
        receipt = (True, SAFE_RETRY_MESSAGE)
    receipt_key = _receipt_key(session_id)
    with _TOOL_RECEIPTS_LOCK:
        # A response-less turn must not leave a receipt that can authorize the
        # next inbound message. Keep at most one receipt per Hermes session.
        prefix = f"{session_id}:"
        for key in tuple(_TOOL_RECEIPTS):
            if key == session_id or key.startswith(prefix):
                _TOOL_RECEIPTS.pop(key, None)
        _TOOL_RECEIPTS[receipt_key] = receipt


def _receipt_key(session_id: str) -> str:
    try:
        from gateway.session_context import get_session_env

        message_id = get_session_env("HERMES_SESSION_MESSAGE_ID", "")
    except Exception:
        message_id = ""
    return f"{session_id}:{message_id}" if message_id else session_id


def _consume_tool_receipt(session_id: str) -> tuple[bool, str] | None:
    if not session_id:
        return None
    with _TOOL_RECEIPTS_LOCK:
        return _TOOL_RECEIPTS.pop(_receipt_key(session_id), None)


def _filter_llm_output(
    response_text: str,
    platform: str = "",
    session_id: str = "",
    **_kwargs: Any,
) -> str | None:
    if not platform:
        try:
            from gateway.session_context import get_session_env
            platform = get_session_env("HERMES_SESSION_PLATFORM", "")
        except Exception:
            platform = ""
    if platform in _WHATSAPP_PLATFORMS:
        receipt = _consume_tool_receipt(session_id)
        if receipt is None:
            return SAFE_NO_TOOL_MESSAGE
        notify_customer, customer_message = receipt
        if not notify_customer:
            return ""
        filtered_receipt = filter_customer_output(customer_message, platform)
        return filtered_receipt if filtered_receipt == customer_message else SAFE_RETRY_MESSAGE
    filtered = filter_customer_output(response_text, platform)
    return filtered if filtered != response_text else None


def register(ctx: Any) -> None:
    continue_schema = {
        "name": "axcas_continue",
        "description": "Continue a validated Axcas merchant workflow without shell commands or credentials.",
        "parameters": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": sorted(_ACTIONS)},
                "payload": {"type": "object"},
            },
            "required": ["action", "payload"],
            "additionalProperties": False,
        },
    }
    status_schema = {
        "name": "axcas_status",
        "description": "Fetch a merchant's Axcas activity summary.",
        "parameters": {
            "type": "object",
            "properties": {
                "siteId": {"type": "string", "pattern": "^[a-z0-9-]{3,64}$"},
                "days": {"type": "integer", "minimum": 1, "maximum": 90},
            },
            "required": ["siteId"],
            "additionalProperties": False,
        },
    }
    ctx.register_tool(
        name="axcas_continue",
        toolset="axcas",
        schema=continue_schema,
        handler=_handle_continue,
        description="Continue a typed Axcas workflow.",
    )
    ctx.register_tool(
        name="axcas_status",
        toolset="axcas",
        schema=status_schema,
        handler=_handle_status,
        description="Read a typed Axcas activity summary.",
    )
    ctx.register_hook("pre_tool_call", _block_non_axcas_tools)
    ctx.register_hook("post_tool_call", _record_axcas_tool_result)
    ctx.register_hook("transform_llm_output", _filter_llm_output)
