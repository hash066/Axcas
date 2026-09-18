import { describe, expect, it, vi } from "vitest";

import { parseWorkflowTaskEnvelope, runWorkflowTask } from "../../apps/aws-control-plane/src/workflow-task";

const input = {
  schemaVersion: 1 as const,
  workflowId: "workflow-demo-001",
  merchantId: "merchant-demo",
  projectId: "project-demo-001",
  intent: "website" as const,
  context: { platform: "whatsapp_cloud" as const, userId: "919876543210", messageId: "wamid.demo" },
  transcript: "Golden Crust sells sourdough in Hubli for 180 rupees with 24 hours notice.",
  assetIds: ["asset-bread-1"],
  now: 1_789_680_000_000,
  improvementRequested: false,
};

describe("AWS workflow task", () => {
  it("accepts only a bounded merchant workflow envelope", () => {
    expect(parseWorkflowTaskEnvelope(JSON.stringify({ workflowInput: input }))).toEqual({ workflowInput: input });
    expect(() => parseWorkflowTaskEnvelope(JSON.stringify({ workflowInput: input, providerToken: "leak" }))).toThrow();
  });

  it("records the outcome in mutable state and append-only evidence", async () => {
    const execute = vi.fn(async () => ({ status: "awaiting_approval", specHash: "a".repeat(64) }));
    const putState = vi.fn(async () => undefined);
    const appendEvidence = vi.fn(async () => undefined);
    const result = await runWorkflowTask({ workflowInput: input }, { execute, putState, appendEvidence, now: () => 1_789_680_000_100 });

    expect(result.status).toBe("awaiting_approval");
    expect(putState).toHaveBeenCalledWith(expect.objectContaining({ pk: "WORKFLOW#workflow-demo-001", sk: "CURRENT", merchantId: "merchant-demo" }));
    expect(appendEvidence).toHaveBeenCalledWith(expect.objectContaining({ pk: "WORKFLOW#workflow-demo-001", eventType: "workflow_outcome" }));
  });
});
