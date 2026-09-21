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
  actualMissingFacts,
  compileSiteSpec,
  resolveIntakeAssessment,
  runMerchantWorkflow,
  type AxcasBoundary,
  type StructuredAgent,
} from "../../apps/strands-orchestrator/src/workflow";
import { createImprovementTools, createWorkflowTools, runStrandsImprovementWorkflow, runStrandsToolWorkflow } from "../../apps/strands-orchestrator/src/strands-workflow";
import { ProofGateBoundary } from "../../apps/strands-orchestrator/src/boundary";

const context = {
  platform: "whatsapp_cloud" as const,
  userId: "919876543210",
  messageId: "wamid.strands-demo",
};

describe("production verification boundary", () => {
  it("asks the trusted edge boundary to complete the verifier round trip in one idempotent request", async () => {
    const submit = vi.fn(async (command) => {
      expect(JSON.parse(String(command.body))).toMatchObject({
        merchantId: "merchant-demo",
        siteId: "golden-crust-demo",
        versionId: "version-workflow-demo-1",
        specHash: "a".repeat(64),
        previewUrl: "https://example.workers.dev/preview/pgp_demo.sig",
      });
      return { accepted: true, passed: true, blockers: [], runId: "verify-edge-1" };
    });
    const directVerifierFetch = vi.fn();
    const api = new ProofGateBoundary({
      PROOFGATE_ADMIN_URL: "https://example.workers.dev",
      PROOFGATE_SERVICE_SECRET: "x".repeat(32),
    }, submit, directVerifierFetch);

    await expect(api.dispatchVerification({
      merchantId: "merchant-demo",
      siteId: "golden-crust-demo",
      versionId: "version-workflow-demo-1",
      specHash: "a".repeat(64),
      previewUrl: "https://example.workers.dev/preview/pgp_demo.sig",
      context,
    })).resolves.toEqual({ accepted: true, passed: true, blockers: [], runId: "verify-edge-1" });
    expect(directVerifierFetch).not.toHaveBeenCalled();
  });
});

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
  transcript: "My business is Golden Crust, a home bakery in Hubli. Customers should contact +91 98765 43210 on WhatsApp. I serve Hubli and need 24 hours' notice. Sourdough loaf is ₹180.",
  assetIds: ["asset-bread-1"],
  now: 2_000,
  improvementRequested: false,
};

describe("Strands merchant workflow", () => {
  it("compiles authoritative SiteSpec fields deterministically from validated intake", () => {
    const compiled = compileSiteSpec(assessment, {
      heroHeadline: "Hubli sourdough, baked for tomorrow",
      heroSubheadline: "Order directly on WhatsApp.",
      offeringDescriptions: ["Slow-fermented and baked to order."],
    }, "merchant-demo", input);

    expect(compiled).toMatchObject({
      schemaVersion: 2,
      businessType: "home_bakery",
      business: {
        merchantId: "merchant-demo",
        name: "Golden Crust",
        orderWhatsAppNumber: "+919876543210",
      },
      hero: { imageAssetId: "asset-bread-1" },
      catalog: [{
        name: "Sourdough loaf",
        priceMinor: 18000,
        currency: "INR",
        imageAssetId: "asset-bread-1",
      }],
    });
    expect(compiled.siteId).toMatch(/^golden-crust-/);
    expect(compiled.proofBadge.passportSlug).toBe(compiled.siteId);
  });

  it("continues with safe deterministic copy when candidate generation fails", async () => {
    const agent: StructuredAgent = {
      invoke: vi.fn()
        .mockResolvedValueOnce({ structuredOutput: assessment })
        .mockRejectedValueOnce(new Error("provider formatting failure")),
    };
    const api = boundary();

    const result = await runMerchantWorkflow(input, { agent, boundary: api });

    expect(result).toMatchObject({ status: "awaiting_approval", approvalId: "approval-demo" });
    expect(api.execute).toHaveBeenCalledWith("candidate", expect.objectContaining({
      spec: expect.objectContaining({
        business: expect.objectContaining({ merchantId: "merchant-demo", orderWhatsAppNumber: "+919876543210" }),
      }),
    }), context);
  });

  it("preserves explicit WhatsApp facts when model extraction returns blanks", () => {
    const transcript = "My business is Sunrise Bakes, a home bakery in Hubli. I make hazelnut cakes, brownies, and sourdough. Customers should contact +91 98765 43210 on WhatsApp. I serve Hubli city and need 24 hours' notice. Hazelnut cake is ₹650, a brownie box is ₹350, and sourdough is ₹180. I want Both—a website and Reels.";
    const modelOutput = {
      timezone: "Asia/Kolkata",
      suppliedClaims: [],
      catalog: [],
      missingFacts: ["businessName", "description", "orderWhatsAppNumber", "fulfillmentArea", "leadTime", "offerings", "photos"],
    };

    const grounded = resolveIntakeAssessment(modelOutput, transcript, ["merchant-cake-photo"]);

    expect(grounded).toMatchObject({
      businessType: "home_bakery",
      businessName: "Sunrise Bakes",
      orderWhatsAppNumber: "+919876543210",
      fulfillmentArea: "Hubli city",
      leadTime: "24 hours",
    });
    expect(grounded.description).toContain("home bakery in Hubli");
    expect(grounded.catalog).toEqual([
      expect.objectContaining({ name: "Hazelnut cake", priceMinor: 65000, currency: "INR", imageAssetId: "merchant-cake-photo" }),
      expect.objectContaining({ name: "brownie box", priceMinor: 35000, currency: "INR", imageAssetId: "merchant-cake-photo" }),
      expect.objectContaining({ name: "sourdough", priceMinor: 18000, currency: "INR", imageAssetId: "merchant-cake-photo" }),
    ]);
    expect(actualMissingFacts(grounded, ["merchant-cake-photo"])).toEqual([]);
  });

  it("does not send a complete grounded merchant bundle through intake structured output", async () => {
    const completeInput = {
      ...input,
      transcript: "My business is Golden Crust Hubli, a home bakery in Hubli. I make hazelnut cakes, brownies, and sourdough. Customers should contact +91 98765 43210 on WhatsApp. I serve Hubli city and need 24 hours' notice. Hazelnut cake is ₹650, a brownie box is ₹350, and sourdough is ₹180. I want Both—a website and Reels.",
      intent: "both" as const,
    };
    const agent = agentWith({ heroHeadline: "Fresh bakes in Hubli" });

    const result = await runMerchantWorkflow(completeInput, { agent, boundary: boundary() });

    expect(result.status).toBe("awaiting_approval");
    expect(agent.invoke).toHaveBeenCalledTimes(1);
    expect(vi.mocked(agent.invoke).mock.calls[0]?.[0]).toContain("presentation copy");
  });

  it("asks one consolidated, customer-safe question when intake is incomplete", async () => {
    const agent = agentWith({ ...assessment, orderWhatsAppNumber: undefined, leadTime: undefined, missingFacts: ["orderWhatsAppNumber", "leadTime"] });
    const api = boundary();
    const incompleteInput = { ...input, transcript: input.transcript.replace(/ Customers should contact[^.]+\./, "") };

    const result = await runMerchantWorkflow(incompleteInput, { agent, boundary: api });

    expect(result).toEqual({
      status: "awaiting_input",
      missingFacts: ["orderWhatsAppNumber"],
      customerMessages: ["One quick thing before I build: what WhatsApp number should customers contact?"],
    });
    expect(api.execute).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/command|credential|cloudflare|convex|hermes|vapi|PROOFGATE/i);
  });

  it("owns the verified candidate-to-approval workflow and stops before publication", async () => {
    const agent = agentWith(assessment, {
      businessDescription: spec.business.description,
      heroHeadline: spec.hero.headline,
      heroSubheadline: spec.hero.subheadline,
      ctaLabel: spec.whatsappCta.label,
      seoTitle: spec.seo.title,
      seoDescription: spec.seo.description,
      offeringDescriptions: spec.catalog.map((item) => item.description),
    });
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
    expect(vi.mocked(agent.invoke)).toHaveBeenCalledTimes(1);
  });

  it("stops before approval and metrics when independent verification fails", async () => {
    const api = boundary({ dispatchVerification: vi.fn(async () => ({ accepted: true, passed: false, blockers: ["unsafe_content_security_policy"], runId: "verify-failed" })) });

    const result = await runMerchantWorkflow(input, { agent: agentWith(assessment, {}), boundary: api });

    expect(result).toMatchObject({ status: "verification_failed", blockers: ["unsafe_content_security_policy"] });
    expect(vi.mocked(api.execute).mock.calls.map(([action]) => action)).toEqual(["intake", "candidate"]);
  });

  it("ignores model attempts to introduce authoritative assets or claims", async () => {
    const api = boundary();
    const unsafeCopy = { heroHeadline: "Fresh bread", imageAssetId: "synthetic-image", suppliedClaims: ["Award winning"] };

    const result = await runMerchantWorkflow(input, { agent: agentWith(assessment, unsafeCopy), boundary: api });

    expect(result.status).toBe("awaiting_approval");
    const candidate = vi.mocked(api.execute).mock.calls.find(([action]) => action === "candidate")?.[1] as { spec: typeof spec };
    expect(candidate.spec.hero.imageAssetId).toBe("asset-bread-1");
    expect(candidate.spec.suppliedClaims).toEqual([]);
  });
});

describe("native Strands typed-tool loop", () => {
  it("deterministically infers business type when Nova omits the enum", async () => {
    const api = boundary();
    const workflow = createWorkflowTools(input, api);
    const intakeTool = workflow.tools.find((item) => item.name === "capture_merchant_intake")!;
    const { businessType: _modelGuess, ...withoutBusinessType } = assessment;

    await expect(intakeTool.invoke(withoutBusinessType)).resolves.toMatchObject({ status: "intake_saved" });
    expect(api.execute).toHaveBeenCalledWith("intake", expect.objectContaining({ businessType: "home_bakery" }), context);
  });

  it("canonicalizes a formatted merchant WhatsApp number before candidate validation", async () => {
    const api = boundary();
    const workflow = createWorkflowTools(input, api);
    const intakeTool = workflow.tools.find((item) => item.name === "capture_merchant_intake")!;
    const candidateTool = workflow.tools.find((item) => item.name === "create_site_candidate")!;

    await intakeTool.invoke(assessment);
    await expect(candidateTool.invoke({
      spec: {
        ...spec,
        business: { ...spec.business, orderWhatsAppNumber: "+91 98765 43210" },
      },
    })).resolves.toMatchObject({ status: "candidate_ready" });

    expect(api.execute).toHaveBeenCalledWith("candidate", expect.objectContaining({
      spec: expect.objectContaining({
        business: expect.objectContaining({ orderWhatsAppNumber: "+919876543210" }),
      }),
    }), context);
  });

  it("returns one consolidated missing-facts question without asking for a business-type enum", async () => {
    const api = boundary();
    const { businessType: _modelGuess, ...withoutBusinessType } = assessment;
    const scripted = new ScriptedStrandsModel([
      { name: "capture_merchant_intake", input: withoutBusinessType },
    ]);

    const result = await runStrandsToolWorkflow({ ...input, assetIds: [] }, api, {}, (tools: Tool[]) => new Agent({
      model: scripted,
      tools,
      toolExecutor: "sequential",
      systemPrompt: "Follow the Axcas workflow tools in order.",
    }));

    expect(result).toEqual({
      status: "awaiting_input",
      missingFacts: ["offerings", "photos"],
      customerMessages: ["One quick thing before I build: what is at least one product or service and its price, and can you send at least one real photo?"],
    });
    expect(api.execute).not.toHaveBeenCalled();
  });

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
