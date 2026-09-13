import { SiteSpecV2Schema, type SiteSpecV2 } from "../../../packages/domain/src/growth";
import { inferStudioBusinessType } from "../../../packages/domain/src/studio-builder";
import {
  ApprovalResultSchema,
  BoundaryResultSchema,
  CandidateEnvelopeSchema,
  CandidateResultSchema,
  ImprovementProposalSchema,
  IntakeAssessmentSchema,
  IntakeToolInputSchema,
  MerchantWorkflowInputSchema,
  MetricsSchema,
  PublishedImprovementInputSchema,
  VerificationResultSchema,
  type ImprovementProposal,
  type IntakeAssessment,
  type MerchantWorkflowInput,
  type MissingFact,
  type VerificationResult,
} from "./schemas";
import type { StructuredAgent } from "./agent";

export type { StructuredAgent } from "./agent";

export type BoundaryAction = "intake" | "candidate" | "request_publish" | "metrics";
export type AxcasBoundary = {
  execute: (action: BoundaryAction, payload: unknown, context: MerchantWorkflowInput["context"]) => Promise<unknown>;
  dispatchVerification: (scope: {
    merchantId: string;
    siteId: string;
    versionId: string;
    specHash: string;
    previewUrl: string;
    context: MerchantWorkflowInput["context"];
  }) => Promise<VerificationResult>;
  assertPublished?: (scope: { siteId: string; versionId: string; specHash: string }) => Promise<void>;
};

type WorkflowDependencies = { agent: StructuredAgent; boundary: AxcasBoundary };

const factLabels: Record<MissingFact, string> = {
  businessName: "what is your business name",
  description: "how would you describe what you offer",
  orderWhatsAppNumber: "what WhatsApp number should customers contact",
  fulfillmentArea: "where do you serve or deliver",
  leadTime: "how much advance notice do you need",
  offerings: "what is at least one product or service and its price",
  photos: "can you send at least one real photo",
};

export function actualMissingFacts(assessment: IntakeAssessment, suppliedAssets: readonly string[]): MissingFact[] {
  const missing = new Set<MissingFact>(assessment.missingFacts);
  if (!assessment.businessName) missing.add("businessName");
  if (!assessment.description) missing.add("description");
  if (!assessment.orderWhatsAppNumber) missing.add("orderWhatsAppNumber");
  if (!assessment.fulfillmentArea) missing.add("fulfillmentArea");
  if (!assessment.leadTime) missing.add("leadTime");
  if (!assessment.catalog.length) missing.add("offerings");
  if (!suppliedAssets.length) missing.add("photos");
  return Array.from(missing);
}

export function resolveIntakeAssessment(value: unknown, transcript: string): IntakeAssessment {
  const modelInput = IntakeToolInputSchema.parse(value);
  const businessType = inferStudioBusinessType([
    transcript,
    modelInput.businessName,
    modelInput.description,
  ].filter((part): part is string => Boolean(part)).join(" "));
  return IntakeAssessmentSchema.parse({ ...modelInput, businessType });
}

export function consolidatedQuestion(missing: MissingFact[]): string {
  const labels = missing.map((fact) => factLabels[fact]);
  const joined = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
  return `One quick thing before I build: ${joined}?`;
}

export function assertCandidateScope(spec: SiteSpecV2, assessment: IntakeAssessment, input: MerchantWorkflowInput, merchantId: string): void {
  if (spec.business.merchantId !== merchantId) throw new Error("candidate merchant scope does not match the authenticated merchant");
  if (spec.business.name !== assessment.businessName || spec.business.orderWhatsAppNumber !== assessment.orderWhatsAppNumber) {
    throw new Error("candidate changed merchant identity or order contact");
  }
  const supplied = new Set(input.assetIds);
  const used = [spec.hero.imageAssetId, spec.seo.socialImageAssetId, ...spec.catalog.map((item) => item.imageAssetId)];
  if (used.some((asset) => !supplied.has(asset))) throw new Error("candidate contains an asset that the merchant did not supply");
  const claims = new Set(assessment.suppliedClaims);
  if (spec.suppliedClaims.some((claim) => !claims.has(claim))) throw new Error("candidate contains a claim that the merchant did not supply");
}

function intakePrompt(input: MerchantWorkflowInput): string {
  return `Extract one complete merchant intake from this WhatsApp bundle. Infer the constrained business type. Do not invent missing facts. Return every missing fact in one list.\n\n${JSON.stringify({
    intent: input.intent,
    transcript: input.transcript,
    immutableAssetIds: input.assetIds,
  })}`;
}

function candidatePrompt(input: MerchantWorkflowInput, assessment: IntakeAssessment, merchantId: string): string {
  return `Create one constrained SiteSpecV2 candidate from the validated intake below. Use only the listed immutable assets and supplied claims. Use locale en-IN. Do not output HTML or scripts. The authenticated merchantId must be preserved exactly.\n\n${JSON.stringify({
    merchantId,
    projectId: input.projectId,
    immutableAssetIds: input.assetIds,
    intake: assessment,
  })}`;
}

function improvementPrompt(metrics: ReturnType<typeof MetricsSchema.parse>, spec: SiteSpecV2, eligible: boolean): string {
  return `Analyze these raw-denominator site metrics and propose one small, testable SiteSpec change. Repeat the raw counts exactly. Do not claim causation or guaranteed growth. requiresApproval must be true and eligibleForCandidate must be ${eligible}.\n\n${JSON.stringify({
    metrics,
    current: { hero: spec.hero, whatsappCta: spec.whatsappCta, catalogOrder: spec.catalog.map((item) => item.id) },
  })}`;
}

export function workflowVersionId(workflowId: string): string {
  return `version-${workflowId.replace(/[^a-zA-Z0-9_-]/g, "-")}`.slice(0, 128);
}

export async function runMerchantWorkflow(inputValue: unknown, dependencies: WorkflowDependencies) {
  const input = MerchantWorkflowInputSchema.parse(inputValue);
  const intakeResult = await dependencies.agent.invoke(intakePrompt(input), { structuredOutputSchema: IntakeToolInputSchema });
  const assessment = resolveIntakeAssessment(intakeResult.structuredOutput, input.transcript);
  const missingFacts = actualMissingFacts(assessment, input.assetIds);
  if (missingFacts.length) {
    return { status: "awaiting_input" as const, missingFacts, customerMessages: [consolidatedQuestion(missingFacts)] };
  }

  const intake = {
    schemaVersion: 1 as const,
    businessType: assessment.businessType,
    businessName: assessment.businessName!,
    timezone: assessment.timezone,
    locale: "en-IN" as const,
    description: assessment.description!,
    orderWhatsAppNumber: assessment.orderWhatsAppNumber!,
    fulfillmentArea: assessment.fulfillmentArea!,
    leadTime: assessment.leadTime!,
    suppliedClaims: assessment.suppliedClaims,
    catalog: assessment.catalog,
    projectId: input.projectId,
    projectIntent: input.intent,
  };
  const intakeBoundaryResult = BoundaryResultSchema.parse(await dependencies.boundary.execute("intake", intake, input.context));
  const merchantId = input.merchantId ?? intakeBoundaryResult.merchantId;
  if (!merchantId) throw new Error("intake did not return the authenticated merchant scope");

  const candidateResult = await dependencies.agent.invoke(candidatePrompt(input, assessment, merchantId), { structuredOutputSchema: CandidateEnvelopeSchema });
  const envelope = CandidateEnvelopeSchema.parse(
    candidateResult.structuredOutput && typeof candidateResult.structuredOutput === "object" && "spec" in candidateResult.structuredOutput
      ? candidateResult.structuredOutput
      : { spec: candidateResult.structuredOutput },
  );
  const spec = SiteSpecV2Schema.parse(envelope.spec);
  assertCandidateScope(spec, assessment, input, merchantId);
  const candidateVersionId = workflowVersionId(input.workflowId);
  const candidate = CandidateResultSchema.parse(await dependencies.boundary.execute("candidate", {
    versionId: candidateVersionId,
    spec,
  }, input.context));

  const verification = VerificationResultSchema.parse(await dependencies.boundary.dispatchVerification({
    merchantId,
    siteId: spec.siteId,
    versionId: candidateVersionId,
    specHash: candidate.specHash,
    previewUrl: candidate.previewUrl,
    context: input.context,
  }));
  if (!verification.accepted || !verification.passed || verification.blockers.length) {
    return { status: "verification_failed" as const, previewUrl: candidate.previewUrl, blockers: verification.blockers };
  }

  const approval = ApprovalResultSchema.parse(await dependencies.boundary.execute("request_publish", {
    merchantId,
    siteId: spec.siteId,
    versionId: candidateVersionId,
    specHash: candidate.specHash,
  }, input.context));

  return {
    status: "awaiting_approval" as const,
    approvalId: approval.approvalId,
    previewUrl: candidate.previewUrl,
    specHash: candidate.specHash,
    verificationRunId: verification.runId,
  };
}

export async function runPublishedImprovementWorkflow(inputValue: unknown, dependencies: WorkflowDependencies) {
  const input = PublishedImprovementInputSchema.parse(inputValue);
  if (!dependencies.boundary.assertPublished) throw new Error("published-version proof boundary is unavailable");
  await dependencies.boundary.assertPublished({ siteId: input.siteId, versionId: input.versionId, specHash: input.specHash });
  const metricsResult = BoundaryResultSchema.parse(await dependencies.boundary.execute("metrics", { siteId: input.siteId, days: 7 }, input.context));
  const metrics = MetricsSchema.parse(metricsResult.metrics);
  const eligibleForCandidate = input.improvementRequested || metrics.qualifiedViews >= 100 || (metrics.until - metrics.since >= 7 * 86_400_000 && metrics.qualifiedViews > 0);
  const proposalResult = await dependencies.agent.invoke(improvementPrompt(metrics, input.currentSpec, eligibleForCandidate), { structuredOutputSchema: ImprovementProposalSchema });
  const modelProposal = ImprovementProposalSchema.parse(proposalResult.structuredOutput);
  const improvement: ImprovementProposal = ImprovementProposalSchema.parse({
    ...modelProposal,
    qualifiedViews: metrics.qualifiedViews,
    ctaClicks: metrics.ctaClicks,
    eligibleForCandidate,
    requiresApproval: true,
  });
  return { status: "improvement_proposed" as const, siteId: input.siteId, versionId: input.versionId, improvement };
}
