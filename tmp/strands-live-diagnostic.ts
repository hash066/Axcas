import { ProofGateBoundary } from "/opt/proofgate/ProofGate/apps/strands-orchestrator/src/boundary.ts";
import { runStrandsToolWorkflow } from "/opt/proofgate/ProofGate/apps/strands-orchestrator/src/strands-workflow.ts";

const input = {
  schemaVersion: 1,
  workflowId: "workflow-bedrock-diagnostic-20260913",
  projectId: "project-bedrock-diagnostic-20260913",
  intent: "website",
  context: {
    platform: "whatsapp_cloud",
    userId: "919000000000",
    messageId: "wamid.bedrock.diagnostic.20260913",
  },
  transcript: "I need a website.",
  assetIds: ["asset_demo_unregistered"],
  now: 1789301000000,
  improvementRequested: false,
} as const;

async function main() {
  try {
    const result = await runStrandsToolWorkflow(input, new ProofGateBoundary());
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error);
    process.stderr.write(`${detail}\n`);
    process.exitCode = 1;
  }
}

void main();
