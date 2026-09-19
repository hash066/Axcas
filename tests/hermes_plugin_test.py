import importlib.util
import json
import pathlib
import sys
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


if __name__ == "__main__":
    unittest.main()
