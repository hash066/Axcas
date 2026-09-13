import { describe, expect, it } from "vitest";

import {
  MAX_STUDIO_OFFERINGS,
  StudioIntakeInputSchema,
  StudioProjectInputSchema,
} from "../../packages/domain/src/studio";
import {
  CustomerOutboxMessageSchema,
  InboundWorkflowSchema,
  ProjectSyncCursorSchema,
  advanceWorkflow,
  customerProgressMessage,
  nextProjectCursor,
} from "../../packages/domain/src/workflow";
import { studioProjectFromBusinessBrief } from "../../packages/domain/src/studio-builder";

const brief = {
  schemaVersion: 1 as const,
  merchantId: "merchant-1234567890abcdef",
  ownerWaIdHash: "a".repeat(64),
  businessType: "tailor" as const,
  businessName: "Maya Studio",
  timezone: "Asia/Kolkata",
  locale: "en-IN" as const,
  description: "Custom tailoring and alterations in Bengaluru",
  orderWhatsAppNumber: "+919876543210",
  fulfillmentArea: "Bengaluru",
  leadTime: "Five days",
  suppliedClaims: ["Custom stitching"],
  catalog: [{ name: "Blouse stitching", description: "Made to measure", currency: "INR" as const, imageAssetId: "merchant-photo-one" }],
};

describe("unified Axcas workflow foundation", () => {
  it("preserves Website, Reels, or Both intent and permits multiple explicit projects", () => {
    const first = studioProjectFromBusinessBrief(brief, { intent: "both", projectId: "project-maya-launch" });
    const second = studioProjectFromBusinessBrief({ ...brief, businessName: "Maya Classes", description: "Tailoring classes in Bengaluru" }, { intent: "reels", projectId: "project-maya-classes" });

    expect(first).toMatchObject({ projectId: "project-maya-launch", intent: "both" });
    expect(first.reelTemplate).toBeDefined();
    expect(second).toMatchObject({ projectId: "project-maya-classes", intent: "reels" });
    expect(first.projectId).not.toBe(second.projectId);
  });

  it("accepts a schema-driven catalog beyond the old three-card UI limit", () => {
    const offerings = Array.from({ length: 8 }, (_, index) => ({
      name: `Service ${index + 1}`,
      description: `Description ${index + 1}`,
      currency: "INR" as const,
    }));
    const project = StudioProjectInputSchema.parse({
      intent: "website",
      businessName: "Maya Studio",
      description: "Tailoring in Bengaluru",
      siteStyle: "services",
      offerings,
    });
    expect(MAX_STUDIO_OFFERINGS).toBe(24);
    expect(project.offerings).toHaveLength(8);
  });

  it("validates optional project and intent metadata without weakening the business brief", () => {
    const { merchantId: _merchantId, ownerWaIdHash: _ownerWaIdHash, ...briefInput } = brief;
    const intake = StudioIntakeInputSchema.parse({
      ...briefInput,
      projectId: "project-maya-launch",
      projectIntent: "both",
    });
    expect(intake).toMatchObject({ projectId: "project-maya-launch", projectIntent: "both" });
  });

  it("allows only explicit workflow transitions and keeps progress customer-safe", () => {
    const workflow = InboundWorkflowSchema.parse({
      schemaVersion: 1,
      workflowId: "workflow-merchant-message-1",
      merchantId: "merchant-1234567890abcdef",
      channel: "whatsapp_cloud",
      providerMessageId: "wamid.message-1",
      status: "received",
      createdAt: 1,
      updatedAt: 1,
    });
    expect(advanceWorkflow(workflow, "processing", 2).status).toBe("processing");
    expect(() => advanceWorkflow(workflow, "completed", 2)).toThrow(/invalid workflow transition/i);
    expect(() => CustomerOutboxMessageSchema.parse({
      schemaVersion: 1,
      outboxId: "outbox-message-1",
      workflowId: workflow.workflowId,
      merchantId: workflow.merchantId,
      kind: "progress",
      body: "Run `cd /opt/proofgate` with PROOFGATE_SERVICE_SECRET",
      dedupeKey: "workflow-merchant-message-1:progress",
      createdAt: 2,
    })).toThrow();
  });

  it("keeps routine processing silent and emits only useful customer progress", () => {
    expect(customerProgressMessage("message_received")).toBe(
      "Got it — I’m building your draft now. I’ll message you when the checked preview is ready.",
    );
    expect(customerProgressMessage("brief_saved")).toBeNull();
    expect(customerProgressMessage("media_saved")).toBeNull();
    expect(customerProgressMessage("building")).toBeNull();
    expect(customerProgressMessage("checking")).toBeNull();
    expect(customerProgressMessage("approval_requested")).toBeNull();
    expect(customerProgressMessage("published")).toBe(
      "Your website is live. I’ll keep tracking visits and WhatsApp enquiries here.",
    );
  });

  it("advances a stable cursor without dropping same-millisecond revisions", () => {
    const first = nextProjectCursor(undefined, { createdAt: 100, projectId: "project-alpha", revisionId: "revision-alpha" });
    const second = nextProjectCursor(first, { createdAt: 100, projectId: "project-beta", revisionId: "revision-beta" });
    expect(ProjectSyncCursorSchema.parse(second)).toEqual({ createdAt: 100, projectId: "project-beta", revisionId: "revision-beta" });
    expect(nextProjectCursor(second, { createdAt: 99, projectId: "project-zeta", revisionId: "revision-zeta" })).toEqual(second);
  });
});
