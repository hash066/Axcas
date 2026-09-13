import { describe, expect, it, vi } from "vitest";
import {
  Agent,
  Model,
  ModelContentBlockDeltaEvent,
  ModelContentBlockStartEvent,
  ModelContentBlockStopEvent,
  ModelMessageStartEvent,
  ModelMessageStopEvent,
  type BaseModelConfig,
  type Message,
  type ModelStreamEvent,
  type StreamOptions,
  type Tool,
} from "@strands-agents/sdk";

import {
  runMerchantWorkflow,
  type AxcasBoundary,
  type StructuredAgent,
} from "../../apps/strands-orchestrator/src/workflow";
import { createImprovementTools, createWorkflowTools, runStrandsImprovementWorkflow, runStrandsToolWorkflow } from "../../apps/strands-orchestrator/src/strands-workflow";

const context = {
  platform: "whatsapp_cloud" as const,
  userId: "919876543210",
  messageId: "wamid.strands-demo",
};

const assessment = {
  businessType: "home_bakery" as const,
  businessName: "Golden Crust",
  description: "Fresh sourdough baked in Hubli.",
  timezone: "Asia/Kolkata",
  orderWhatsAppNumber: "+919876543210",
  fulfillmentArea: "Hubli",
  leadTime: "24 hours",
  suppliedClaims: ["Baked to order"],
  catalog: [{ name: "Sourdough loaf", description: "Naturally leavened loaf.", priceMinor: 18000, currency: "INR" as const, imageAssetId: "asset-bread-1" }],
  missingFacts: [],
};

const spec = {
  schemaVersion: 2 as const,
  siteId: "golden-crust-demo",
  businessType: "home_bakery" as const,
  business: {
    merchantId: "merchant-demo",
    name: "Golden Crust",
    description: "Fresh sourdough baked in Hubli.",
    timezone: "Asia/Kolkata",
    locale: "en-IN" as const,
    orderWhatsAppNumber: "+919876543210",
  },
  theme: { accent: "#b84f3a", background: "#fff8ef", layout: "catalog" as const },
  hero: { headline: "Fresh sourdough in Hubli", subheadline: "Naturally leavened and baked to order.", imageAssetId: "asset-bread-1" },
  fulfillment: { area: "Hubli", leadTime: "24 hours" },
  catalog: [{
    id: "sourdough-loaf",
    name: "Sourdough loaf",
    description: "Naturally leavened loaf.",
    priceMinor: 18000,
    currency: "INR" as const,
    imageAssetId: "asset-bread-1",
    available: true,
    whatsappMessage: "Hello, I'd like to order a sourdough loaf from Golden Crust.",
  }],
  whatsappCta: { label: "Order on WhatsApp", defaultMessage: "Hello, I'd like to order from Golden Crust.", stickyOnMobile: true },
  policies: { ordering: "Message us to confirm availability." },
  seo: { title: "Golden Crust — Hubli sourdough", description: "Fresh sourdough baked in Hubli.", socialImageAssetId: "asset-bread-1" },
  suppliedClaims: ["Baked to order"],
  proofBadge: { enabled: true, passportSlug: "golden-crust-demo" },
};

function agentWith(...outputs: unknown[]): StructuredAgent {
  return { invoke: vi.fn(async () => ({ structuredOutput: outputs.shift() })) };
}

function boundary(overrides: Partial<AxcasBoundary> = {}): AxcasBoundary {
  return {
    execute: vi.fn(async (action) => {
      if (action === "intake") return { status: "accepted", merchantId: "merchant-demo" };
      if (action === "candidate") return { status: "preview_ready", previewUrl: "https://example.workers.dev/preview/pgp_demo.sig", previewExpiresAt: 2_000, specHash: "a".repeat(64) };
      if (action === "request_publish") return { status: "approval_sent", approvalId: "approval-demo" };
      if (action === "metrics") return { status: "accepted", metrics: { qualifiedViews: 120, ctaClicks: 18, since: 1_000, until: 2_000 } };
      throw new Error(`unexpected action ${action}`);
    }),
    dispatchVerification: vi.fn(async () => ({ accepted: true, passed: true, blockers: [], runId: "verify-demo" })),
    assertPublished: vi.fn(async () => undefined),
    ...overrides,
  };
}

class ScriptedStrandsModel extends Model<BaseModelConfig> {
  private index = 0;
  private config: BaseModelConfig = { modelId: "scripted-axcas-test", contextWindowLimit: 100_000 };

  constructor(private readonly calls: Array<{ name: string; input: unknown }>) { super(); }
  getConfig() { return this.config; }
  updateConfig(config: BaseModelConfig) { this.config = { ...this.config, ...config }; }

  async *stream(_messages: Message[], _options?: StreamOptions): AsyncIterable<ModelStreamEvent> {
    const call = this.calls[this.index++];
    yield new ModelMessageStartEvent({ type: "modelMessageStartEvent", role: "assistant" });
    if (call) {
      yield new ModelContentBlockStartEvent({ type: "modelContentBlockStartEvent", start: { type: "toolUseStart", name: call.name, toolUseId: `tool-${this.index}` } });
      yield new ModelContentBlockDeltaEvent({ type: "modelContentBlockDeltaEvent", delta: { type: "toolUseInputDelta", input: JSON.stringify(call.input) } });
      yield new ModelContentBlockStopEvent({ type: "modelContentBlockStopEvent" });
      yield new ModelMessageStopEvent({ type: "modelMessageStopEvent", stopReason: "toolUse" });
      return;
    }
    yield new ModelContentBlockStartEvent({ type: "modelContentBlockStartEvent" });
    yield new ModelContentBlockDeltaEvent({ type: "modelContentBlockDeltaEvent", delta: { type: "textDelta", text: "Workflow paused for merchant approval." } });
    yield new ModelContentBlockStopEvent({ type: "modelContentBlockStopEvent" });
    yield new ModelMessageStopEvent({ type: "modelMessageStopEvent", stopReason: "endTurn" });
  }
}

const input = {
  schemaVersion: 1 as const,
  workflowId: "workflow-demo-1",
  merchantId: "merchant-demo",
  projectId: "project-demo-1",
  intent: "website" as const,
  context,
  transcript: "Golden Crust sells sourdough in Hubli for 180 rupees. Orders need 24 hours.",
  assetIds: ["asset-bread-1"],
  now: 2_000,
};

describe("Strands merchant workflow", () => {
  it("asks one consolidated, customer-safe question when intake is incomplete", async () => {
    const agent = agentWith({ ...assessment, orderWhatsAppNumber: undefined, leadTime: undefined, missingFacts: ["orderWhatsAppNumber", "leadTime"] });
    const api = boundary();

    const result = await runMerchantWorkflow(input, { agent, boundary: api });

    expect(result).toEqual({
      status: "awaiting_input",
      missingFacts: ["orderWhatsAppNumber", "leadTime"],
      customerMessages: ["One quick thing before I build: what WhatsApp number should customers contact, and how much advance notice do you need?"],
    });
    expect(api.execute).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/command|credential|cloudflare|convex|hermes|vapi|PROOFGATE/i);
  });

  it("owns the verified candidate-to-approval workflow and stops before publication", async () => {
    const agent = agentWith(assessment, spec);
    const api = boundary();

    const result = await runMerchantWorkflow(input, { agent, boundary: api });

    expect(api.execute).toHaveBeenCalledTimes(3);
    expect(vi.mocked(api.execute).mock.calls.map(([action]) => action)).toEqual([
      "intake",
      "candidate",
      "request_publish",
    ]);
    expect(api.dispatchVerification).toHaveBeenCalledWith(expect.objectContaining({
      siteId: "golden-crust-demo",
      versionId: "version-workflow-demo-1",
      specHash: "a".repeat(64),
    }));
    expect(result).toMatchObject({
      status: "awaiting_approval",
      approvalId: "approval-demo",
      previewUrl: "https://example.workers.dev/preview/pgp_demo.sig",
    });
    expect(vi.mocked(agent.invoke)).toHaveBeenCalledTimes(2);
  });

  it("stops before approval and metrics when independent verification fails", async () => {
    const api = boundary({ dispatchVerification: vi.fn(async () => ({ accepted: true, passed: false, blockers: ["unsafe_content_security_policy"], runId: "verify-failed" })) });

    const result = await runMerchantWorkflow(input, { agent: agentWith(assessment, spec), boundary: api });

    expect(result).toMatchObject({ status: "verification_failed", blockers: ["unsafe_content_security_policy"] });
    expect(vi.mocked(api.execute).mock.calls.map(([action]) => action)).toEqual(["intake", "candidate"]);
  });

  it("rejects model output that introduces unsupplied assets or claims", async () => {
    const api = boundary();
    const unsafeSpec = { ...spec, hero: { ...spec.hero, imageAssetId: "synthetic-image" } };

    await expect(runMerchantWorkflow(input, { agent: agentWith(assessment, unsafeSpec), boundary: api })).rejects.toThrow("candidate contains an asset that the merchant did not supply");
    expect(vi.mocked(api.execute).mock.calls.map(([action]) => action)).toEqual(["intake"]);
  });
});

describe("native Strands typed-tool loop", () => {
  it("executes the real Strands Agent loop with the guarded tools", async () => {
    const api = boundary();
    const scripted = new ScriptedStrandsModel([
      { name: "capture_merchant_intake", input: assessment },
      { name: "create_site_candidate", input: { spec } },
      { name: "dispatch_independent_verification", input: {} },
      { name: "request_release_approval", input: {} },
    ]);

    const result = await runStrandsToolWorkflow(input, api, {}, (tools: Tool[]) => new Agent({
      model: scripted,
      tools,
      toolExecutor: "sequential",
      systemPrompt: "Follow the Axcas workflow tools in order.",
    }));

    expect(result).toMatchObject({ status: "awaiting_approval", approvalId: "approval-demo", verificationRunId: "verify-demo" });
    expect(vi.mocked(api.execute).mock.calls.map(([action]) => action)).toEqual(["intake", "candidate", "request_publish"]);
  });

  it("registers only bounded capabilities and lets Strands drive the guarded sequence", async () => {
    const api = boundary();
    const observedToolNames: string[] = [];

    const result = await runStrandsToolWorkflow(input, api, {}, (tools) => ({
      invoke: async () => {
        observedToolNames.push(...tools.map((item) => item.name));
        const byName = new Map(tools.map((item) => [item.name, item as any]));
        await byName.get("capture_merchant_intake").invoke(assessment);
        await byName.get("create_site_candidate").invoke({ spec });
        await byName.get("dispatch_independent_verification").invoke({});
        await byName.get("request_release_approval").invoke({});
      },
    }));

    expect(observedToolNames).toEqual([
      "capture_merchant_intake",
      "create_site_candidate",
      "dispatch_independent_verification",
      "request_release_approval",
    ]);
    expect(observedToolNames).not.toEqual(expect.arrayContaining(["approve", "publish", "promote", "shell", "code"]));
    expect(result).toMatchObject({ status: "awaiting_approval", approvalId: "approval-demo", verificationRunId: "verify-demo" });
  });

  it("state guards prevent a model from requesting approval before verification", async () => {
    const workflow = createWorkflowTools(input, boundary());
    const approval = workflow.tools.find((item) => item.name === "request_release_approval")!;

    await expect(approval.invoke({})).rejects.toThrow("only after accepted passing evidence");
  });

  it("runs the learning loop only after the exact public version is proven", async () => {
    const api = boundary();
    const improvementInput = {
      schemaVersion: 1 as const,
      workflowId: "improvement-demo-1",
      merchantId: "merchant-demo",
      context,
      siteId: spec.siteId,
      versionId: "version-workflow-demo-1",
      specHash: "a".repeat(64),
      currentSpec: spec,
      now: 2_000,
      improvementRequested: false,
    };

    const result = await runStrandsImprovementWorkflow(improvementInput, api, {}, (tools) => ({
      invoke: async () => {
        expect(tools.map((item) => item.name)).toEqual(["read_published_site_metrics", "record_improvement_proposal"]);
        const metrics = await (tools[0] as any).invoke({ days: 7 });
        await (tools[1] as any).invoke({
          summary: "The page has enough traffic for one measured test.",
          hypothesis: "A specific local promise may increase enquiry intent.",
          proposedChanges: [{ field: "hero.headline", value: "Hubli sourdough, baked fresh for tomorrow" }],
          qualifiedViews: metrics.qualifiedViews,
          ctaClicks: metrics.ctaClicks,
          eligibleForCandidate: true,
          requiresApproval: true,
        });
      },
    }));

    expect(api.assertPublished).toHaveBeenCalledWith({ siteId: spec.siteId, versionId: "version-workflow-demo-1", specHash: "a".repeat(64) });
    expect(result).toMatchObject({ status: "improvement_proposed", improvement: { qualifiedViews: 120, ctaClicks: 18, eligibleForCandidate: true } });
  });

  it("cannot read metrics when published-version proof is absent", async () => {
    const workflow = createImprovementTools({
      schemaVersion: 1,
      workflowId: "improvement-demo-2",
      merchantId: "merchant-demo",
      context,
      siteId: spec.siteId,
      versionId: "version-workflow-demo-1",
      specHash: "a".repeat(64),
      currentSpec: spec,
      now: 2_000,
      improvementRequested: true,
    }, boundary({ assertPublished: undefined }));

    await expect(workflow.tools[0]!.invoke({ days: 7 })).rejects.toThrow("published-version proof boundary is unavailable");
  });
});
