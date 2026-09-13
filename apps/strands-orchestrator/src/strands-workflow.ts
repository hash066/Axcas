import { tool, type InvokableTool, type Tool } from "@strands-agents/sdk";
import { z } from "zod";

import { SiteSpecV2Schema, type SiteSpecV2 } from "../../../packages/domain/src/growth";
import { createStrandsAgent } from "./agent";
import {
  ApprovalResultSchema,
  BoundaryResultSchema,
  CandidateEnvelopeSchema,
  CandidateResultSchema,
  ImprovementProposalSchema,
  IntakeToolInputSchema,
  MerchantWorkflowInputSchema,
  MetricsSchema,
  PublishedImprovementInputSchema,
  VerificationResultSchema,
  type ImprovementProposal,
  type IntakeAssessment,
  type MerchantWorkflowInput,
  type Metrics,
  type PublishedImprovementInput,
} from "./schemas";
import {
  actualMissingFacts,
  assertCandidateScope,
  consolidatedQuestion,
  resolveIntakeAssessment,
  workflowVersionId,
  type AxcasBoundary,
} from "./workflow";

type AnyInvokableTool = InvokableTool<any, any>;
type ToolAgent = { invoke: (prompt: string) => Promise<unknown> };
type AgentFactory = (tools: Tool[]) => ToolAgent;

type WorkflowOutcome =
  | { status: "awaiting_input"; missingFacts: string[]; customerMessages: string[] }
  | { status: "verification_failed"; previewUrl: string; blockers: string[] }
  | {
    status: "awaiting_approval";
    approvalId?: string;
    previewUrl: string;
    specHash: string;
    verificationRunId: string;
  };

type ImprovementOutcome = {
  status: "improvement_proposed";
  siteId: string;
  versionId: string;
  improvement: ImprovementProposal;
};

class WorkflowToolState {
  private stage: "new" | "intake_saved" | "candidate_ready" | "verified" | "verification_failed" | "approval_requested" | "metrics_read" | "complete" | "awaiting_input" = "new";
  private assessment?: IntakeAssessment;
  private spec?: SiteSpecV2;
  private candidate?: z.infer<typeof CandidateResultSchema>;
  private verification?: z.infer<typeof VerificationResultSchema>;
  private approval?: z.infer<typeof ApprovalResultSchema>;
  private merchantId?: string;
  private outcome?: WorkflowOutcome;

  constructor(private readonly input: MerchantWorkflowInput, private readonly boundary: AxcasBoundary) {}

  async captureIntake(value: unknown) {
    if (this.stage !== "new") throw new Error("intake has already been captured");
    const assessment = resolveIntakeAssessment(value, this.input.transcript);
    const missingFacts = actualMissingFacts(assessment, this.input.assetIds);
    if (missingFacts.length) {
      this.stage = "awaiting_input";
      this.outcome = { status: "awaiting_input", missingFacts, customerMessages: [consolidatedQuestion(missingFacts)] };
      return { status: "awaiting_input", missingFacts, customerMessage: this.outcome.customerMessages[0] };
    }
    this.assessment = assessment;
    const intakeResult = BoundaryResultSchema.parse(await this.boundary.execute("intake", {
      schemaVersion: 1,
      businessType: assessment.businessType,
      businessName: assessment.businessName,
      timezone: assessment.timezone,
      locale: "en-IN",
      description: assessment.description,
      orderWhatsAppNumber: assessment.orderWhatsAppNumber,
      fulfillmentArea: assessment.fulfillmentArea,
      leadTime: assessment.leadTime,
      suppliedClaims: assessment.suppliedClaims,
      catalog: assessment.catalog,
      projectId: this.input.projectId,
      projectIntent: this.input.intent,
    }, this.input.context));
    this.merchantId = this.input.merchantId ?? intakeResult.merchantId;
    if (!this.merchantId) throw new Error("intake did not return the authenticated merchant scope");
    this.stage = "intake_saved";
    return { status: "intake_saved", merchantId: this.merchantId, next: "create_site_candidate" };
  }

  async createCandidate(value: unknown) {
    if (this.stage !== "intake_saved" || !this.assessment) throw new Error("candidate creation requires one complete saved intake");
    const { spec } = CandidateEnvelopeSchema.parse(value);
    this.spec = SiteSpecV2Schema.parse(spec);
    if (!this.merchantId) throw new Error("candidate creation requires authenticated merchant scope");
    assertCandidateScope(this.spec, this.assessment, this.input, this.merchantId);
    this.candidate = CandidateResultSchema.parse(await this.boundary.execute("candidate", {
      versionId: workflowVersionId(this.input.workflowId),
      spec: this.spec,
    }, this.input.context));
    this.stage = "candidate_ready";
    return { status: "candidate_ready", previewUrl: this.candidate.previewUrl, next: "dispatch_independent_verification" };
  }

  async dispatchVerification() {
    if (this.stage !== "candidate_ready" || !this.spec || !this.candidate || !this.merchantId) throw new Error("verification requires an immutable candidate");
    this.verification = VerificationResultSchema.parse(await this.boundary.dispatchVerification({
      merchantId: this.merchantId,
      siteId: this.spec.siteId,
      versionId: workflowVersionId(this.input.workflowId),
      specHash: this.candidate.specHash,
      previewUrl: this.candidate.previewUrl,
      context: this.input.context,
    }));
    if (!this.verification.accepted || !this.verification.passed || this.verification.blockers.length) {
      this.stage = "verification_failed";
      this.outcome = { status: "verification_failed", previewUrl: this.candidate.previewUrl, blockers: this.verification.blockers };
      return { status: "verification_failed", blockers: this.verification.blockers, stop: true };
    }
    this.stage = "verified";
    return { status: "verified", runId: this.verification.runId, next: "request_release_approval" };
  }

  async requestApproval() {
    if (this.stage !== "verified" || !this.spec || !this.candidate || !this.verification || !this.merchantId) throw new Error("approval may be requested only after accepted passing evidence");
    this.approval = ApprovalResultSchema.parse(await this.boundary.execute("request_publish", {
      merchantId: this.merchantId,
      siteId: this.spec.siteId,
      versionId: workflowVersionId(this.input.workflowId),
      specHash: this.candidate.specHash,
    }, this.input.context));
    this.stage = "approval_requested";
    this.stage = "complete";
    this.outcome = {
      status: "awaiting_approval",
      ...(this.approval.approvalId ? { approvalId: this.approval.approvalId } : {}),
      previewUrl: this.candidate.previewUrl,
      specHash: this.candidate.specHash,
      verificationRunId: this.verification.runId,
    };
    return { status: "approval_requested", approvalId: this.approval.approvalId ?? null, customerState: "awaiting_approval", stop: true };
  }

  result(): WorkflowOutcome {
    if (!this.outcome) throw new Error(`Strands workflow stopped before a safe terminal state (${this.stage})`);
    return this.outcome;
  }
}

export function createWorkflowTools(inputValue: unknown, boundary: AxcasBoundary): { tools: AnyInvokableTool[]; result: () => WorkflowOutcome } {
  const input = MerchantWorkflowInputSchema.parse(inputValue);
  const state = new WorkflowToolState(input, boundary);
  const tools = [
    tool({
      name: "capture_merchant_intake",
      description: "Extract only supplied merchant facts. Business type is inferred by deterministic application code; never ask the merchant to choose an internal type. Save a complete intake or return one consolidated missing-facts question.",
      inputSchema: IntakeToolInputSchema,
      callback: (value) => state.captureIntake(value),
    }),
    tool({
      name: "create_site_candidate",
      description: "Create one Zod-validated SiteSpecV2 candidate using only the authenticated merchant scope, supplied claims, and immutable supplied assets. This cannot publish.",
      inputSchema: CandidateEnvelopeSchema,
      callback: (value) => state.createCandidate(value),
    }),
    tool({
      name: "dispatch_independent_verification",
      description: "Send the public preview and a single-use evidence capability to the credential-free verifier. This cannot create evidence itself.",
      inputSchema: z.object({}).strict(),
      callback: () => state.dispatchVerification(),
    }),
    tool({
      name: "request_release_approval",
      description: "Request an identity-bound approval checklist for the exact candidate hash after passing verification. This cannot approve or publish.",
      inputSchema: z.object({}).strict(),
      callback: () => state.requestApproval(),
    }),
  ];
  return { tools, result: () => state.result() };
}

function orchestrationPrompt(input: MerchantWorkflowInput): string {
  return `Own this Axcas build workflow by selecting the provided typed tools in order. Start with capture_merchant_intake. If it reports missing facts, stop. Otherwise create one SiteSpecV2 candidate, dispatch independent verification, and stop if verification fails. Only after passing evidence request release approval, then stop. Never repeat a side-effecting tool. Never claim the site is published.\n\n${JSON.stringify({
    merchantId: input.merchantId,
    projectId: input.projectId,
    intent: input.intent,
    transcript: input.transcript,
    immutableAssetIds: input.assetIds,
    improvementRequested: input.improvementRequested,
  })}`;
}

export async function runStrandsToolWorkflow(
  inputValue: unknown,
  boundary: AxcasBoundary,
  env: NodeJS.ProcessEnv = process.env,
  agentFactory: AgentFactory = (tools) => createStrandsAgent(env, tools),
): Promise<WorkflowOutcome> {
  const input = MerchantWorkflowInputSchema.parse(inputValue);
  const workflow = createWorkflowTools(input, boundary);
  const agent = agentFactory(workflow.tools);
  await agent.invoke(orchestrationPrompt(input));
  return workflow.result();
}

class ImprovementToolState {
  private stage: "new" | "metrics_read" | "complete" = "new";
  private metrics?: Metrics;
  private outcome?: ImprovementOutcome;

  constructor(private readonly input: PublishedImprovementInput, private readonly boundary: AxcasBoundary) {}

  async readPublishedMetrics(value: unknown) {
    if (this.stage !== "new") throw new Error("published metrics have already been read");
    if (!this.boundary.assertPublished) throw new Error("published-version proof boundary is unavailable");
    const request = z.object({ days: z.number().int().min(1).max(90).default(7) }).strict().parse(value);
    await this.boundary.assertPublished({ siteId: this.input.siteId, versionId: this.input.versionId, specHash: this.input.specHash });
    const result = BoundaryResultSchema.parse(await this.boundary.execute("metrics", { siteId: this.input.siteId, days: request.days }, this.input.context));
    this.metrics = MetricsSchema.parse(result.metrics);
    this.stage = "metrics_read";
    return { status: "published_metrics_ready", ...this.metrics, next: "record_improvement_proposal" };
  }

  recordImprovement(value: unknown) {
    if (this.stage !== "metrics_read" || !this.metrics) throw new Error("an improvement proposal requires proven published metrics");
    const modelProposal = ImprovementProposalSchema.parse(value);
    const eligibleForCandidate = this.input.improvementRequested || this.metrics.qualifiedViews >= 100 || (this.metrics.until - this.metrics.since >= 7 * 86_400_000 && this.metrics.qualifiedViews > 0);
    const improvement = ImprovementProposalSchema.parse({
      ...modelProposal,
      qualifiedViews: this.metrics.qualifiedViews,
      ctaClicks: this.metrics.ctaClicks,
      eligibleForCandidate,
      requiresApproval: true,
    });
    this.stage = "complete";
    this.outcome = { status: "improvement_proposed", siteId: this.input.siteId, versionId: this.input.versionId, improvement };
    return { status: "improvement_proposed", eligibleForCandidate, requiresApproval: true, stop: true };
  }

  result(): ImprovementOutcome {
    if (!this.outcome) throw new Error(`Strands improvement workflow stopped before a safe terminal state (${this.stage})`);
    return this.outcome;
  }
}

export function createImprovementTools(inputValue: unknown, boundary: AxcasBoundary): { tools: AnyInvokableTool[]; result: () => ImprovementOutcome } {
  const input = PublishedImprovementInputSchema.parse(inputValue);
  const state = new ImprovementToolState(input, boundary);
  const tools = [
    tool({
      name: "read_published_site_metrics",
      description: "Prove the exact version is public, then read its raw-denominator qualified views and WhatsApp CTA clicks.",
      inputSchema: z.object({ days: z.number().int().min(1).max(90).default(7) }).strict(),
      callback: (value) => state.readPublishedMetrics(value),
    }),
    tool({
      name: "record_improvement_proposal",
      description: "Record one evidence-limited SiteSpec improvement proposal for a proven public version. This cannot create, approve, or publish a candidate.",
      inputSchema: ImprovementProposalSchema,
      callback: (value) => state.recordImprovement(value),
    }),
  ];
  return { tools, result: () => state.result() };
}

export async function runStrandsImprovementWorkflow(
  inputValue: unknown,
  boundary: AxcasBoundary,
  env: NodeJS.ProcessEnv = process.env,
  agentFactory: AgentFactory = (tools) => createStrandsAgent(env, tools),
): Promise<ImprovementOutcome> {
  const input = PublishedImprovementInputSchema.parse(inputValue);
  const workflow = createImprovementTools(input, boundary);
  await agentFactory(workflow.tools).invoke(`Own this Axcas published-site learning workflow. First prove and read seven-day metrics with read_published_site_metrics. Then record exactly one modest, testable proposal with record_improvement_proposal. Repeat the raw counts exactly, never claim causation, and stop.\n\n${JSON.stringify({ siteId: input.siteId, versionId: input.versionId, currentSpec: input.currentSpec, improvementRequested: input.improvementRequested })}`);
  return workflow.result();
}
