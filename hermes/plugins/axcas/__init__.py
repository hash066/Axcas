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
from typing import Any


SAFE_RETRY_MESSAGE = (
    "Axcas hit a temporary connection problem. Your message is still in this "
    "chat, and I’ll continue automatically—you do not need to resend anything."
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

# This is a fail-closed customer-output policy, not a best-effort secret masker.
# Any match replaces the complete reply with SAFE_RETRY_MESSAGE.
_FORBIDDEN_CUSTOMER_OUTPUT = tuple(re.compile(pattern, re.IGNORECASE | re.MULTILINE) for pattern in (
    r"(?:PROOFGATE|HERMES|META|VAPI|AWS)_[A-Z0-9_]+",
    r"\b(?:npm\s+run\s+proofgate|execute_code|subprocess|os\.environ|export\s+[A-Z_]+)",
    r"(?:^|\s)(?:/opt/|/tmp/|/etc/proofgate/|[A-Z]:\\Users\\)",
    r"```",
    r"[a-fA-F0-9]{48,}",
    r"\b(?:Authorization|Bearer)\s+[A-Za-z0-9._~+/=-]+",
    r"\b(?:provider authentication failed|raw provider details|gateway logs|stack trace|traceback)\b",
    r"\b(?:shell command|backend credentials?|database connection|configure the backend|set up the server)\b",
    r"\bProofGate\b",
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
        return SAFE_RETRY_MESSAGE
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
        request_body = json.dumps({
            "action": action,
            "context": _session_context(),
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


def _filter_llm_output(response_text: str, platform: str = "", **_kwargs: Any) -> str | None:
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
    ctx.register_hook("transform_llm_output", _filter_llm_output)
