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
import sys
import threading
import time
from collections import OrderedDict
from typing import Any


SAFE_RETRY_MESSAGE = (
    "I couldn’t complete this step just now. Please reply RETRY; you won’t "
    "need to retype your business details."
)
SAFE_NO_TOOL_MESSAGE = (
    "I couldn’t start this step just now. Please reply RETRY; you won’t "
    "need to retype your business details."
)
WELCOME_MESSAGE = (
    "Welcome to Axcas. Send one voice note describing your business and say "
    "Website, Reels, or Both. Add your photos, products or services, and prices "
    "in this chat—I’ll ask at most one follow-up."
)
NO_PENDING_RETRY_MESSAGE = (
    "There isn’t a paused step to retry. Send your business details, photos, "
    "prices, and say Website, Reels, or Both."
)
RETRY_ACCEPTED_MESSAGE = "Received. I’m continuing from what you already sent."

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

# A failed bridge call retains the exact typed request for a bounded period so
# an explicit RETRY can replay it without asking the merchant to retype facts.
# Entries are sender-bound, process-local, size-bounded, and never logged.
_PENDING_RETRIES: OrderedDict[str, tuple[float, str, Any]] = OrderedDict()
_PENDING_RETRY_TTL_SECONDS = 60 * 60
_MAX_PENDING_RETRIES = 1024

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


def _merchant_key(context: dict[str, str]) -> str:
    return f"{context['platform']}:{context['userId']}"


def _prune_pending_retries(now: float) -> None:
    while _PENDING_RETRIES:
        first_key = next(iter(_PENDING_RETRIES))
        created_at = _PENDING_RETRIES[first_key][0]
        if now - created_at <= _PENDING_RETRY_TTL_SECONDS:
            break
        _PENDING_RETRIES.popitem(last=False)
    while len(_PENDING_RETRIES) >= _MAX_PENDING_RETRIES:
        _PENDING_RETRIES.popitem(last=False)


def _remember_retry(context: dict[str, str], action: str, payload: Any) -> None:
    # The request was already JSON-serializable before bridge dispatch. A JSON
    # copy prevents a caller from mutating the retained request after failure.
    retained_payload = json.loads(json.dumps(payload, separators=(",", ":")))
    now = time.monotonic()
    with _TOOL_RECEIPTS_LOCK:
        _prune_pending_retries(now)
        key = _merchant_key(context)
        _PENDING_RETRIES.pop(key, None)
        _PENDING_RETRIES[key] = (now, action, retained_payload)


def _take_retry(context: dict[str, str]) -> tuple[str, Any] | None:
    now = time.monotonic()
    with _TOOL_RECEIPTS_LOCK:
        _prune_pending_retries(now)
        entry = _PENDING_RETRIES.pop(_merchant_key(context), None)
    if entry is None or now - entry[0] > _PENDING_RETRY_TTL_SECONDS:
        return None
    return entry[1], entry[2]


def _clear_retry(context: dict[str, str]) -> None:
    with _TOOL_RECEIPTS_LOCK:
        _PENDING_RETRIES.pop(_merchant_key(context), None)


def _operator_diagnostic(action: str, stage: str, failure: str) -> None:
    # Never log exception strings, payloads, sender IDs, message IDs, paths, or
    # provider responses here. The class and stage are enough for operators to
    # distinguish routing, socket, timeout, and response failures.
    sys.stderr.write(json.dumps({
        "service": "axcas-hermes-plugin",
        "action": action,
        "stage": stage,
        "failure": failure,
        "outcome": "retryable_failure",
    }, separators=(",", ":")) + "\n")


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


def _call_bridge(
    action: str,
    payload: Any,
    request_context: dict[str, str] | None = None,
) -> str:
    connection: _UnixHTTPConnection | None = None
    stage = "session_context"
    try:
        request_context = request_context or _session_context()
        stage = "bridge_configuration"
        socket_path = os.environ.get("AXCAS_BRIDGE_SOCKET", "/run/axcas/tool-bridge.sock")
        if not socket_path.startswith("/run/axcas/") or not socket_path.endswith(".sock"):
            raise ValueError("bridge unavailable")
        stage = "request_encoding"
        request_body = json.dumps({
            "action": action,
            "context": request_context,
            "payload": payload,
        }, separators=(",", ":")).encode("utf-8")
        if len(request_body) > 1024 * 1024:
            raise ValueError("request too large")
        stage = "bridge_connect"
        connection = _UnixHTTPConnection(socket_path)
        connection.request(
            "POST",
            "/v1/tool",
            body=request_body,
            headers={"content-type": "application/json", "content-length": str(len(request_body))},
        )
        stage = "bridge_response"
        response = connection.getresponse()
        raw = response.read(1024 * 1024 + 1)
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
        if allowed.get("status") == "temporarily_unavailable":
            _remember_retry(request_context, action, payload)
            _operator_diagnostic(action, "bridge_response", "bridge_reported_unavailable")
        else:
            _clear_retry(request_context)
        return json.dumps(allowed, separators=(",", ":"))
    except Exception as error:
        if request_context is not None:
            _remember_retry(request_context, action, payload)
        if isinstance(error, (socket.timeout, TimeoutError)):
            failure = "bridge_timeout"
        elif isinstance(error, (ConnectionError, OSError)) and stage in {"bridge_connect", "bridge_response"}:
            failure = "bridge_connectivity"
        elif stage == "session_context":
            failure = "session_context_unavailable"
        elif stage == "bridge_configuration":
            failure = "bridge_configuration_invalid"
        elif stage == "request_encoding":
            failure = "bridge_request_invalid"
        elif stage == "bridge_response":
            failure = "bridge_response_invalid"
        else:
            failure = "unexpected_failure"
        _operator_diagnostic(action, stage, failure)
        return json.dumps({
            "status": "temporarily_unavailable",
            "customerMessage": SAFE_RETRY_MESSAGE,
            "notifyCustomer": True,
        }, separators=(",", ":"))
    finally:
        if connection is not None:
            try:
                connection.close()
            except Exception:
                pass


def _gateway_event_context(event: Any) -> dict[str, str] | None:
    source = getattr(event, "source", None)
    platform = str(getattr(getattr(source, "platform", ""), "value", getattr(source, "platform", "")) or "").strip().lower()
    user_id = str(getattr(source, "user_id", "") or "").strip()
    message_id = str(getattr(event, "message_id", "") or getattr(source, "message_id", "") or "").strip()
    if platform not in _WHATSAPP_PLATFORMS or not re.fullmatch(r"\d{8,15}", user_id):
        return None
    if not message_id or len(message_id) > 512:
        return None
    return {"platform": platform, "userId": user_id, "messageId": message_id}


def _route_gateway_control_message(event: Any = None, **_kwargs: Any) -> dict[str, str] | None:
    """Short-circuit exact public control messages before any model request."""
    source = getattr(event, "source", None)
    platform = str(getattr(getattr(source, "platform", ""), "value", getattr(source, "platform", "")) or "").strip().lower()
    if platform not in _WHATSAPP_PLATFORMS:
        return None
    normalized = " ".join(str(getattr(event, "text", "") or "").split()).upper()
    if normalized == "START AXCAS":
        return {"action": "respond", "text": WELCOME_MESSAGE}
    if normalized != "RETRY":
        return None
    context = _gateway_event_context(event)
    if context is None:
        _operator_diagnostic("retry", "session_context", "session_context_unavailable")
        return {"action": "respond", "text": SAFE_RETRY_MESSAGE}
    pending = _take_retry(context)
    if pending is None:
        return {"action": "respond", "text": NO_PENDING_RETRY_MESSAGE}
    action, payload = pending
    result = json.loads(_call_bridge(action, payload, context))
    customer_message = result.get("customerMessage")
    if result.get("notifyCustomer") is True and isinstance(customer_message, str) and customer_message:
        return {"action": "respond", "text": customer_message}
    return {"action": "respond", "text": RETRY_ACCEPTED_MESSAGE}


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
    ctx.register_hook("pre_gateway_dispatch", _route_gateway_control_message)
    ctx.register_hook("transform_llm_output", _filter_llm_output)
