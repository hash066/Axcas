import importlib.util
import json
import pathlib
import sys
import tempfile
import types
import unittest
from unittest import mock


PLUGIN_PATH = pathlib.Path(__file__).parents[1] / "hermes" / "plugins" / "axcas" / "__init__.py"


def load_plugin():
    spec = importlib.util.spec_from_file_location("axcas_plugin", PLUGIN_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class MerchantOutputGuardTests(unittest.TestCase):
    def setUp(self):
        self.plugin = load_plugin()

    def assert_blocked(self, value):
        self.assertEqual(self.plugin.filter_customer_output(value, "whatsapp_cloud"), "")

    def test_blocks_shell_approval_with_env_names_and_path(self):
        self.assert_blocked(
            """⚠️ *Command Approval Required*\n```arduino\ncd /opt/proofgate/ProofGate && "
            "export PROOFGATE_ADMIN_URL=\"https://example.invalid\" && "
            "export PROOFGATE_SERVICE_SECRET=\"fake-secret\" && npm run proofgate -- release /tmp/release.json --submit\n```"""
        )

    def test_blocks_execute_code_with_opaque_hex_secret(self):
        fake_secret = "a1" * 32
        self.assert_blocked(
            """⚠️ *Command Approval Required*\n```python\nexecute_code <<'PY'\nimport os\n"
            f"os.environ.update({{'PROOFGATE_SERVICE_SECRET': '{fake_secret}'}})\n"
            "# submit release\nPY\n```"""
        )

    def test_blocks_provider_diagnostics(self):
        self.assert_blocked("Provider authentication failed. Raw provider details are in the gateway logs.")

    def test_blocks_every_internal_vendor_and_workflow_identifier(self):
        for message in (
            "Cloudflare deployment failed",
            "Convex returned an error",
            "Hermes candidate verification is pending",
            "Bedrock and Strands created SiteSpecV3",
            "merchantId=merchant-private workflowId=workflow-private",
            "Use pg:approval-private:approve",
        ):
            with self.subTest(message=message):
                self.assert_blocked(message)

    def test_blocks_customer_facing_setup_and_approval_language(self):
        self.assert_blocked("Please approve this shell command so I can configure the backend credentials.")
        self.assert_blocked("The database connection is missing. Ask your operator to set up the server.")

    def test_blocks_diy_site_builder_deflection(self):
        self.assert_blocked("Go to carrd.co, choose a free template, and build the site yourself.")
        self.assert_blocked("You can make this in Wix or Squarespace in under ten minutes.")
        self.assert_blocked("Would you prefer to try creating the website yourself first?")

    def test_leaves_normal_customer_copy_unchanged(self):
        message = "Your checked preview is ready. Open it and approve when the details look right."
        self.assertEqual(self.plugin.filter_customer_output(message, "whatsapp_cloud"), message)

    def test_non_whatsapp_output_is_not_rewritten(self):
        message = "npm run proofgate -- metrics demo"
        self.assertEqual(self.plugin.filter_customer_output(message, "cli"), message)

    def test_empty_whatsapp_output_stays_silent(self):
        self.assertEqual(self.plugin.filter_customer_output("", "whatsapp_cloud"), "")

    def test_transform_hook_recovers_whatsapp_platform_from_session(self):
        gateway = types.ModuleType("gateway")
        session_context = types.ModuleType("gateway.session_context")
        session_context.get_session_env = lambda name, default="": "whatsapp_cloud" if name.endswith("PLATFORM") else default
        with mock.patch.dict(sys.modules, {
            "gateway": gateway,
            "gateway.session_context": session_context,
        }):
            self.assertEqual(
                self.plugin._filter_llm_output("Cloudflare failed"),
                self.plugin.SAFE_NO_TOOL_MESSAGE,
            )

    def test_runtime_hook_blocks_generic_host_tools_on_whatsapp(self):
        gateway = types.ModuleType("gateway")
        session_context = types.ModuleType("gateway.session_context")
        session_context.get_session_env = lambda name, default="": "whatsapp_cloud" if name.endswith("PLATFORM") else default
        with mock.patch.dict(sys.modules, {
            "gateway": gateway,
            "gateway.session_context": session_context,
        }):
            self.assertEqual(self.plugin._block_non_axcas_tools("terminal")["action"], "block")
            self.assertIsNone(self.plugin._block_non_axcas_tools("axcas_continue"))

    def test_bridge_result_keeps_silent_actions_explicit(self):
        allowed = {
            "status": "accepted",
            "notifyCustomer": False,
        }
        raw = json.dumps(allowed).encode("utf-8")
        response = mock.Mock(status=200)
        response.read.return_value = raw
        connection = mock.Mock()
        connection.getresponse.return_value = response
        with mock.patch.object(self.plugin, "_UnixHTTPConnection", return_value=connection), \
             mock.patch.object(self.plugin, "_session_context", return_value={"platform": "whatsapp_cloud", "userId": "919876543210", "messageId": "wamid.1"}):
            result = json.loads(self.plugin._call_bridge("intake", {}))
        self.assertEqual(result, allowed)

    def test_bridge_scrubs_unsafe_customer_message_before_model_sees_it(self):
        raw = json.dumps({
            "status": "temporarily_unavailable",
            "customerMessage": "PROOFGATE_SERVICE_SECRET=not-for-a-customer",
            "notifyCustomer": True,
        }).encode("utf-8")
        response = mock.Mock(status=200)
        response.read.return_value = raw
        connection = mock.Mock()
        connection.getresponse.return_value = response
        with mock.patch.object(self.plugin, "_UnixHTTPConnection", return_value=connection), \
             mock.patch.object(self.plugin, "_session_context", return_value={"platform": "whatsapp_cloud", "userId": "919876543210", "messageId": "wamid.2"}):
            result = json.loads(self.plugin._call_bridge("intake", {}))
        self.assertEqual(result["customerMessage"], self.plugin.SAFE_RETRY_MESSAGE)
        self.assertNotIn("PROOFGATE", json.dumps(result))

    def test_whatsapp_turn_without_axcas_tool_discards_invented_outage(self):
        invented = (
            "The service is temporarily unavailable. Your request has been saved "
            "and the system will automatically reconnect. Would you like help "
            "reviewing merchant policies?"
        )
        self.assertEqual(
            self.plugin._filter_llm_output(
                invented,
                platform="whatsapp_cloud",
                session_id="session-no-tool",
            ),
            self.plugin.SAFE_NO_TOOL_MESSAGE,
        )

    def test_whatsapp_turn_uses_exact_bridge_customer_message(self):
        bridge_message = "One quick thing before I build: what prices should I show?"
        self.plugin._record_axcas_tool_result(
            "axcas_continue",
            json.dumps({
                "status": "accepted",
                "customerMessage": bridge_message,
                "notifyCustomer": True,
            }),
            session_id="session-with-tool",
        )
        self.assertEqual(
            self.plugin._filter_llm_output(
                "Here is some unrelated model-written advice.",
                platform="whatsapp_cloud",
                session_id="session-with-tool",
            ),
            bridge_message,
        )

    def test_whatsapp_turn_stays_silent_when_bridge_owns_customer_notification(self):
        self.plugin._record_axcas_tool_result(
            "axcas_continue",
            json.dumps({
                "status": "approval_sent",
                "customerMessage": "",
                "notifyCustomer": False,
            }),
            session_id="session-silent",
        )
        self.assertEqual(
            self.plugin._filter_llm_output(
                "I also made another approval message for you.",
                platform="whatsapp_cloud",
                session_id="session-silent",
            ),
            "",
        )

    def test_bridge_receipt_is_single_use_and_cannot_leak_to_next_turn(self):
        self.plugin._record_axcas_tool_result(
            "axcas_continue",
            json.dumps({
                "status": "accepted",
                "customerMessage": "Photos received. I’m building your draft now.",
                "notifyCustomer": True,
            }),
            session_id="session-reused",
        )
        first = self.plugin._filter_llm_output(
            "model response",
            platform="whatsapp_cloud",
            session_id="session-reused",
        )
        second = self.plugin._filter_llm_output(
            "invented follow-up",
            platform="whatsapp_cloud",
            session_id="session-reused",
        )
        self.assertEqual(first, "Photos received. I’m building your draft now.")
        self.assertEqual(second, self.plugin.SAFE_NO_TOOL_MESSAGE)

    def test_non_axcas_tool_result_does_not_authorize_whatsapp_model_copy(self):
        self.plugin._record_axcas_tool_result(
            "terminal",
            "ok",
            session_id="session-wrong-tool",
        )
        self.assertEqual(
            self.plugin._filter_llm_output(
                "Try Carrd instead.",
                platform="whatsapp_cloud",
                session_id="session-wrong-tool",
            ),
            self.plugin.SAFE_NO_TOOL_MESSAGE,
        )

    def test_gateway_start_short_circuits_the_model_entirely(self):
        event = types.SimpleNamespace(
            text="START AXCAS",
            message_id="wamid.start",
            source=types.SimpleNamespace(
                platform="whatsapp_cloud",
                user_id="919876543210",
                message_id="wamid.start",
            ),
        )
        with mock.patch.object(self.plugin, "_call_bridge") as call_bridge:
            routed = self.plugin._route_gateway_control_message(event=event)

        self.assertEqual(routed, {"action": "respond", "text": self.plugin.WELCOME_MESSAGE})
        call_bridge.assert_not_called()

    def test_gateway_retry_replays_before_any_model_request(self):
        payload = {"transcript": "Golden Crust sells sourdough in Hubli."}
        context = {"platform": "whatsapp_cloud", "userId": "919876543210", "messageId": "wamid.original"}
        with mock.patch.object(self.plugin, "_session_context", return_value=context), \
             mock.patch.object(self.plugin, "_UnixHTTPConnection", side_effect=ConnectionRefusedError()), \
             mock.patch.object(self.plugin.sys.stderr, "write"):
            self.plugin._call_bridge("orchestrate_build", payload)

        raw = json.dumps({
            "status": "accepted",
            "customerMessage": "Please send at least one real business photo.",
            "notifyCustomer": True,
        }).encode("utf-8")
        response = mock.Mock(status=200)
        response.read.return_value = raw
        connection = mock.Mock()
        connection.getresponse.return_value = response
        event = types.SimpleNamespace(
            text=" retry ",
            message_id="wamid.retry",
            source=types.SimpleNamespace(
                platform="whatsapp_cloud",
                user_id="919876543210",
                message_id="wamid.retry",
            ),
        )
        with mock.patch.object(self.plugin, "_UnixHTTPConnection", return_value=connection):
            routed = self.plugin._route_gateway_control_message(event=event)

        self.assertEqual(routed, {"action": "respond", "text": "Please send at least one real business photo."})
        sent = json.loads(connection.request.call_args.kwargs["body"].decode("utf-8"))
        self.assertEqual(sent["payload"], payload)
        self.assertEqual(sent["context"]["messageId"], "wamid.retry")

    def test_gateway_retry_without_paused_work_gives_one_clear_next_step(self):
        event = types.SimpleNamespace(
            text="RETRY",
            message_id="wamid.retry-empty",
            source=types.SimpleNamespace(
                platform="whatsapp_cloud",
                user_id="919876543210",
                message_id="wamid.retry-empty",
            ),
        )

        self.assertEqual(
            self.plugin._route_gateway_control_message(event=event),
            {"action": "respond", "text": self.plugin.NO_PENDING_RETRY_MESSAGE},
        )

    def test_gateway_ingests_real_whatsapp_image_and_rewrites_with_bound_asset_id(self):
        with tempfile.TemporaryDirectory() as directory:
            image_path = pathlib.Path(directory) / "merchant-cake.jpg"
            image_path.write_bytes(b"\xff\xd8\xff\xdbmerchant-photo")
            event = types.SimpleNamespace(
                text="Hazelnut cake, I need both website and reels in Hubli",
                message_id="wamid.photo",
                media_urls=[str(image_path)],
                media_types=["image/jpeg"],
                source=types.SimpleNamespace(
                    platform="whatsapp_cloud",
                    user_id="919876543210",
                    message_id="wamid.photo",
                ),
            )
            with mock.patch.object(self.plugin, "_call_bridge", return_value=json.dumps({
                "status": "accepted",
                "customerMessage": "",
                "notifyCustomer": False,
                "assetIds": ["merchant-bound-cake-photo"],
            })) as call_bridge:
                routed = self.plugin._route_gateway_control_message(event=event)

        self.assertEqual(routed, {
            "action": "rewrite",
            "text": "[Axcas verified merchant asset IDs: merchant-bound-cake-photo]\nHazelnut cake, I need both website and reels in Hubli",
        })
        action, payload, context = call_bridge.call_args.args
        self.assertEqual(action, "asset")
        self.assertEqual(context["messageId"], "wamid.photo")
        self.assertEqual(payload["contentType"], "image/jpeg")
        self.assertEqual(payload["byteLength"], len(b"\xff\xd8\xff\xdbmerchant-photo"))
        self.assertRegex(payload["sha256"], r"^[a-f0-9]{64}$")
        self.assertNotIn(str(image_path), json.dumps(payload))

    def test_bridge_failure_logs_only_operator_safe_classification(self):
        context = {"platform": "whatsapp_cloud", "userId": "919876543210", "messageId": "wamid.private"}
        with mock.patch.object(self.plugin, "_session_context", return_value=context), \
             mock.patch.object(self.plugin, "_UnixHTTPConnection", side_effect=FileNotFoundError("/run/axcas/tool-bridge.sock")), \
             mock.patch.object(self.plugin.sys.stderr, "write") as write:
            result = json.loads(self.plugin._call_bridge("orchestrate_build", {"transcript": "private business description"}))

        self.assertEqual(result["status"], "temporarily_unavailable")
        diagnostic = json.loads(write.call_args.args[0])
        self.assertEqual(diagnostic, {
            "service": "axcas-hermes-plugin",
            "action": "orchestrate_build",
            "stage": "bridge_connect",
            "failure": "bridge_connectivity",
            "outcome": "retryable_failure",
        })
        self.assertNotIn("919876543210", write.call_args.args[0])
        self.assertNotIn("private business description", write.call_args.args[0])

    def test_registers_deterministic_control_message_router(self):
        ctx = mock.Mock()
        self.plugin.register(ctx)
        ctx.register_hook.assert_any_call("pre_gateway_dispatch", self.plugin._route_gateway_control_message)


if __name__ == "__main__":
    unittest.main()
