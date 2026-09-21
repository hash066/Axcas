import { SiteSpecV2Schema, type SiteSpecV2 } from "../../../packages/domain/src/growth";
import { inferStudioBusinessType } from "../../../packages/domain/src/studio-builder";
import {
  ApprovalResultSchema,
  BoundaryResultSchema,
  CandidateCopySchema,
  CandidateResultSchema,
  ImprovementProposalSchema,
  IntakeAssessmentSchema,
  IntakeToolInputSchema,
  MerchantWorkflowInputSchema,
  MetricsSchema,
  PublishedImprovementInputSchema,
  VerificationResultSchema,
  type ImprovementProposal,
  type CandidateCopyV1,
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

type WorkflowDependencies = {
  agent: StructuredAgent;
  boundary: AxcasBoundary;
};

const factLabels: Record<MissingFact, string> = {
  businessName: "what is your business name",
  description: "how would you describe what you offer",
  orderWhatsAppNumber: "what WhatsApp number should customers contact",
  fulfillmentArea: "where do you serve or deliver",
  leadTime: "how much advance notice do you need",
  offerings: "what is at least one product or service and its price",
  photos: "can you send at least one real photo",
};

const DEFAULT_STRUCTURED_OUTPUT_TIMEOUT_MS = 3_000;

export function actualMissingFacts(assessment: IntakeAssessment, suppliedAssets: readonly string[]): MissingFact[] {
  // Required fields are the authority. A model-provided missingFacts list is
  // advisory only and may not contradict facts already grounded from the
  // authenticated merchant bundle.
  const missing = new Set<MissingFact>();
  if (!assessment.businessName) missing.add("businessName");
  if (!assessment.description) missing.add("description");
  if (!assessment.orderWhatsAppNumber) missing.add("orderWhatsAppNumber");
  if (!assessment.fulfillmentArea) missing.add("fulfillmentArea");
  if (!assessment.leadTime) missing.add("leadTime");
  if (!assessment.catalog.length) missing.add("offerings");
  if (!suppliedAssets.length) missing.add("photos");
  return Array.from(missing);
}

function firstSentence(value: string): string | undefined {
  const sentence = value.trim().split(/(?<=[.!?])\s+/u)[0]?.trim();
  return sentence ? sentence.slice(0, 500) : undefined;
}

function extractBusinessName(transcript: string): string | undefined {
  const match = transcript.match(/\b(?:my business is|business is|i run|we run|we are)\s+([^,.!?\n]+?)(?=\s*,\s*(?:an?|the)\b|[.!?\n]|$)/iu);
  return match?.[1]?.trim().slice(0, 500);
}

function extractOrderNumber(transcript: string): string | undefined {
  const match = transcript.match(/\+\s*([1-9][\d\s()-]{6,20}\d)/u);
  if (!match?.[1]) return undefined;
  const normalized = `+${match[1].replace(/\D/g, "")}`;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : undefined;
}

function extractFulfillmentArea(transcript: string): string | undefined {
  const match = transcript.match(/\b(?:i|we)\s+(?:serve|deliver(?:\s+to)?|operate(?:\s+in)?)\s+(.+?)(?=\s+and\s+(?:need|require|offer|take)\b|[.!?\n]|$)/iu);
  return match?.[1]?.trim().slice(0, 500);
}

function extractLeadTime(transcript: string): string | undefined {
  const match = transcript.match(/\b(?:need|require|take|lead\s*time(?:\s+is)?)\s+(\d+\s*(?:hours?|days?|weeks?))(?:['’]?\s+notice)?\b/iu);
  return match?.[1]?.replace(/\s+/g, " ").trim();
}

function extractPricedCatalog(transcript: string, assetIds: readonly string[]): IntakeAssessment["catalog"] {
  const imageAssetId = assetIds[0];
  if (!imageAssetId) return [];
  const catalog: IntakeAssessment["catalog"] = [];
  const pricePattern = /(?:^|[.!?]\s*|[,;]\s*|\band\s+)(?:an?\s+)?([\p{L}][\p{L}\d '&/-]{1,80}?)\s+is\s+(₹|rs\.?|inr|\$)\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)/giu;
  for (const match of transcript.matchAll(pricePattern)) {
    const name = match[1]?.trim().replace(/^and\s+/iu, "");
    const amount = Number(match[3]?.replace(/,/g, ""));
    if (!name || !Number.isFinite(amount) || amount < 0) continue;
    const currency = match[2] === "$" ? "USD" : "INR";
    catalog.push({ name, priceMinor: Math.round(amount * 100), currency, imageAssetId });
  }
  return catalog.slice(0, 24);
}

export function resolveIntakeAssessment(value: unknown, transcript: string, assetIds: readonly string[] = []): IntakeAssessment {
  const modelInput = IntakeToolInputSchema.parse(value);
  const groundedCatalog = extractPricedCatalog(transcript, assetIds);
  const grounded = {
    businessName: extractBusinessName(transcript),
    description: firstSentence(transcript),
    orderWhatsAppNumber: extractOrderNumber(transcript),
    fulfillmentArea: extractFulfillmentArea(transcript),
    leadTime: extractLeadTime(transcript),
  };
  const merged = {
    ...modelInput,
    businessName: grounded.businessName ?? modelInput.businessName,
    description: grounded.description ?? modelInput.description,
    orderWhatsAppNumber: grounded.orderWhatsAppNumber,
    fulfillmentArea: grounded.fulfillmentArea ?? modelInput.fulfillmentArea,
    leadTime: grounded.leadTime ?? modelInput.leadTime,
    catalog: groundedCatalog,
  };
  const businessType = inferStudioBusinessType([
    transcript,
    merged.businessName,
    merged.description,
    modelInput.description,
  ].filter((part): part is string => Boolean(part)).join(" "));
  return IntakeAssessmentSchema.parse({ ...merged, businessType });
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

function slugPart(value: string, fallback: string): string {
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

const themes: Record<IntakeAssessment["businessType"], { accent: string; background: string; layout: NonNullable<SiteSpecV2["theme"]["layout"]> }> = {
  home_bakery: { accent: "#9a4f35", background: "#fff8ef", layout: "catalog" },
  tailor: { accent: "#7b4568", background: "#fff8fc", layout: "portfolio" },
  tutor: { accent: "#2f5e9a", background: "#f5f8ff", layout: "services" },
  salon: { accent: "#8a4968", background: "#fff7fa", layout: "services" },
  home_service: { accent: "#32675a", background: "#f5fbf8", layout: "services" },
  retailer: { accent: "#86511f", background: "#fffaf2", layout: "catalog" },
  other: { accent: "#3f5f73", background: "#f7fafc", layout: "minimal" },
};

export function compileSiteSpec(
  assessment: IntakeAssessment,
  copyInput: unknown,
  merchantId: string,
  input: MerchantWorkflowInput,
): SiteSpecV2 {
  const complete = IntakeAssessmentSchema.parse(assessment);
  if (!complete.businessName || !complete.description || !complete.orderWhatsAppNumber || !complete.fulfillmentArea || !complete.leadTime || !complete.catalog.length || !input.assetIds.length) {
    throw new Error("a complete validated intake is required to compile a site");
  }
  const parsedCopy = CandidateCopySchema.safeParse(copyInput);
  const copy: CandidateCopyV1 = parsedCopy.success ? parsedCopy.data : CandidateCopySchema.parse({});
  const suffix = slugPart(merchantId.replace(/^merchant-/, ""), "merchant").slice(-10);
  const siteId = `${slugPart(complete.businessName, "business").slice(0, 48)}-${suffix}`.slice(0, 64).replace(/-+$/g, "");
  const heroAsset = input.assetIds[0]!;
  const catalog = complete.catalog.map((item, index) => ({
    id: `${slugPart(item.name, `offering-${index + 1}`).slice(0, 52)}-${index + 1}`.slice(0, 64),
    name: item.name,
    description: copy.offeringDescriptions[index] ?? item.description ?? `${item.name} from ${complete.businessName}.`,
    ...(item.priceMinor === undefined ? {} : { priceMinor: item.priceMinor }),
    currency: item.currency,
    imageAssetId: item.imageAssetId,
    available: true,
    whatsappMessage: `Hello, I'd like to enquire about ${item.name} from ${complete.businessName}.`,
  }));
  const spec = SiteSpecV2Schema.parse({
    schemaVersion: 2,
    siteId,
    businessType: complete.businessType,
    business: {
      merchantId,
      name: complete.businessName,
      description: copy.businessDescription ?? complete.description,
      timezone: complete.timezone,
      locale: "en-IN",
      orderWhatsAppNumber: complete.orderWhatsAppNumber,
    },
    theme: themes[complete.businessType],
    hero: {
      headline: copy.heroHeadline ?? `${complete.businessName}, made for ${complete.fulfillmentArea}`,
      subheadline: copy.heroSubheadline ?? `${complete.leadTime} lead time. Enquire directly on WhatsApp.`,
      imageAssetId: heroAsset,
    },
    fulfillment: { area: complete.fulfillmentArea, leadTime: complete.leadTime },
    catalog,
    whatsappCta: {
      label: copy.ctaLabel ?? "Enquire on WhatsApp",
      defaultMessage: `Hello, I'd like to enquire with ${complete.businessName}.`,
      stickyOnMobile: true,
    },
    policies: { ordering: "Availability and final details are confirmed directly on WhatsApp." },
    seo: {
      title: copy.seoTitle ?? `${complete.businessName} — ${complete.fulfillmentArea}`,
      description: copy.seoDescription ?? complete.description,
      socialImageAssetId: heroAsset,
    },
    suppliedClaims: complete.suppliedClaims,
    proofBadge: { enabled: true, passportSlug: siteId },
  });
  assertCandidateScope(spec, complete, input, merchantId);
  return spec;
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
  const emptyIntake = { timezone: "Asia/Kolkata", suppliedClaims: [], missingFacts: [] };
  const assessment = resolveIntakeAssessment(emptyIntake, input.transcript, input.assetIds);
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

  // A provider SDK may block synchronously even after reporting tool success.
  // The release-critical path therefore compiles only code-owned copy. Model
  // output can enhance a later immutable candidate, but can never gate intake,
  // verification, approval, or publication.
  const spec = compileSiteSpec(assessment, {}, merchantId, input);
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
  const proposalResult = await dependencies.agent.invoke(improvementPrompt(metrics, input.currentSpec, eligibleForCandidate), {
    structuredOutputSchema: ImprovementProposalSchema,
    cancelSignal: AbortSignal.timeout(DEFAULT_STRUCTURED_OUTPUT_TIMEOUT_MS),
    limits: { turns: 3, outputTokens: 2_000 },
  });
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
