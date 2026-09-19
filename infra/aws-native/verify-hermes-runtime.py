"""Fail the Hermes image build if Python imports an unpatched runtime."""

from __future__ import annotations

import inspect

from gateway.platforms.whatsapp_cloud import WhatsAppCloudAdapter
from gateway.run import GatewayRunner


run_source = inspect.getsource(GatewayRunner._handle_message)
agent_source = inspect.getsource(GatewayRunner._handle_message_with_agent)
cloud_source = inspect.getsource(WhatsAppCloudAdapter._build_message_event_from_cloud)

assert '_action == "respond"' in run_source, "Hermes direct-response patch is not importable"
assert "Platform.WEBHOOK, Platform.WHATSAPP_CLOUD" in agent_source, (
    "Hermes public WhatsApp home-channel suppression is not importable"
)
assert "You are Axcas, the WhatsApp-first growth agent" in agent_source, (
    "Hermes Axcas customer-channel directive is not importable"
)
assert "source.message_id = wamid" in cloud_source, "Hermes inbound message-id patch is not importable"
