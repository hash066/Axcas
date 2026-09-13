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
        self.assertEqual(self.plugin.filter_customer_output(value, "whatsapp_cloud"), self.plugin.SAFE_RETRY_MESSAGE)

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

    def test_blocks_customer_facing_setup_and_approval_language(self):
        self.assert_blocked("Please approve this shell command so I can configure the backend credentials.")
        self.assert_blocked("The database connection is missing. Ask your operator to set up the server.")

    def test_leaves_normal_customer_copy_unchanged(self):
        message = "Your checked preview is ready. Open it and approve when the details look right."
        self.assertEqual(self.plugin.filter_customer_output(message, "whatsapp_cloud"), message)

    def test_non_whatsapp_output_is_not_rewritten(self):
        message = "npm run proofgate -- metrics demo"
        self.assertEqual(self.plugin.filter_customer_output(message, "cli"), message)

    def test_empty_whatsapp_output_stays_silent(self):
        self.assertEqual(self.plugin.filter_customer_output("", "whatsapp_cloud"), "")

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


if __name__ == "__main__":
    unittest.main()
