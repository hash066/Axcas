import { z } from "zod";

import { BusinessTypeSchema, SiteSpecV2Schema } from "../../../packages/domain/src/growth";

const identifier = z.string().regex(/^[a-zA-Z0-9_.:-]{3,256}$/);
const slug = z.string().regex(/^[a-z0-9-]{3,64}$/);
const assetId = z.string().regex(/^[a-zA-Z0-9_-]{3,128}$/);
const safeText = z.string().trim().min(1).max(500).refine(
  (value) => !/[<>]|javascript:|```|(?:^|\s)(?:cd|export|execute_code)\b/i.test(value),
  "internal commands and executable markup are not allowed",
);

export const MissingFactSchema = z.enum([
  "businessName",
  "description",
  "orderWhatsAppNumber",
  "fulfillmentArea",
  "leadTime",
  "offerings",
  "photos",
]);
export type MissingFact = z.infer<typeof MissingFactSchema>;

export const IntakeAssessmentSchema = z.object({
  businessType: BusinessTypeSchema,
  businessName: safeText.optional(),
  description: safeText.optional(),
  timezone: safeText.default("Asia/Kolkata"),
  orderWhatsAppNumber: z.string().regex(/^\+[1-9]\d{7,14}$/).optional(),
  fulfillmentArea: safeText.optional(),
  leadTime: safeText.optional(),
  suppliedClaims: z.array(safeText).max(20).default([]),
  catalog: z.array(z.object({
    name: safeText,
    description: safeText.optional(),
    priceMinor: z.number().int().nonnegative().optional(),
    currency: z.enum(["INR", "USD"]),
    imageAssetId: assetId,
  }).strict()).max(24).default([]),
  missingFacts: z.array(MissingFactSchema).max(7).default([]),
}).strict();
export type IntakeAssessment = z.infer<typeof IntakeAssessmentSchema>;

// Business type is deliberately optional at the model boundary. Runtime code
// derives the authoritative constrained value from the merchant transcript so
// a model never needs to ask the customer to choose an internal enum.
export const IntakeToolInputSchema = IntakeAssessmentSchema.extend({
  businessType: BusinessTypeSchema.optional(),
}).strict();
export type IntakeToolInput = z.infer<typeof IntakeToolInputSchema>;

/**
 * The model may improve presentation copy, but it never owns merchant identity,
 * prices, assets, release identifiers, or any other authoritative SiteSpec field.
 */
export const CandidateCopySchema = z.object({
  businessDescription: safeText.optional(),
  heroHeadline: safeText.optional(),
  heroSubheadline: safeText.optional(),
  ctaLabel: safeText.optional(),
  seoTitle: safeText.optional(),
  seoDescription: safeText.optional(),
  offeringDescriptions: z.array(safeText).max(24).default([]),
}).strict();
export type CandidateCopyV1 = z.infer<typeof CandidateCopySchema>;

export const MerchantWorkflowInputSchema = z.object({
  schemaVersion: z.literal(1),
  workflowId: identifier,
  merchantId: slug.optional(),
  projectId: identifier,
  intent: z.enum(["website", "both"]),
  context: z.object({
    platform: z.enum(["whatsapp", "whatsapp_cloud"]),
    userId: z.string().regex(/^\d{8,15}$/),
    messageId: z.string().trim().min(1).max(512),
  }).strict(),
  transcript: z.string().trim().min(1).max(10_000),
  assetIds: z.array(assetId).max(24),
  now: z.number().int().nonnegative(),
  improvementRequested: z.boolean().default(false),
}).strict();
export type MerchantWorkflowInput = z.infer<typeof MerchantWorkflowInputSchema>;

export const PublishedImprovementInputSchema = z.object({
  schemaVersion: z.literal(1),
  workflowId: identifier,
  merchantId: slug,
  context: MerchantWorkflowInputSchema.shape.context,
  siteId: slug,
  versionId: identifier,
  specHash: z.string().regex(/^[a-f0-9]{64}$/),
  currentSpec: SiteSpecV2Schema,
  now: z.number().int().nonnegative(),
  improvementRequested: z.boolean().default(false),
}).strict().superRefine((value, context) => {
  if (value.currentSpec.siteId !== value.siteId || value.currentSpec.business.merchantId !== value.merchantId) {
    context.addIssue({ code: "custom", message: "published improvement scope must match the exact tenant and site" });
  }
});
export type PublishedImprovementInput = z.infer<typeof PublishedImprovementInputSchema>;

function canonicalizeCandidateOrderNumber(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const envelope = value as Record<string, unknown>;
  if (!envelope.spec || typeof envelope.spec !== "object" || Array.isArray(envelope.spec)) return value;
  const spec = envelope.spec as Record<string, unknown>;
  if (!spec.business || typeof spec.business !== "object" || Array.isArray(spec.business)) return value;
  const business = spec.business as Record<string, unknown>;
  if (typeof business.orderWhatsAppNumber !== "string") return value;
  const rawNumber = business.orderWhatsAppNumber.trim();
  if (!rawNumber.startsWith("+")) return value;
  const normalized = `+${rawNumber.slice(1).replace(/\D/g, "")}`;
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) return value;
  return {
    ...envelope,
    spec: {
      ...spec,
      business: { ...business, orderWhatsAppNumber: normalized },
    },
  };
}

export const CandidateEnvelopeSchema = z.preprocess(
  canonicalizeCandidateOrderNumber,
  z.object({ spec: SiteSpecV2Schema }).strict(),
);

export const MetricsSchema = z.object({
  qualifiedViews: z.number().int().nonnegative(),
  ctaClicks: z.number().int().nonnegative(),
  since: z.number().int().nonnegative(),
  until: z.number().int().nonnegative(),
}).strict().refine((value) => value.ctaClicks <= value.qualifiedViews, "CTA clicks cannot exceed qualified views");
export type Metrics = z.infer<typeof MetricsSchema>;

export const ImprovementProposalSchema = z.object({
  summary: safeText,
  hypothesis: safeText,
  proposedChanges: z.array(z.object({
    field: z.enum(["hero.headline", "hero.subheadline", "whatsappCta.label", "catalog.order"]),
    value: safeText,
  }).strict()).min(1).max(3),
  qualifiedViews: z.number().int().nonnegative(),
  ctaClicks: z.number().int().nonnegative(),
  eligibleForCandidate: z.boolean(),
  requiresApproval: z.literal(true),
}).strict();
export type ImprovementProposal = z.infer<typeof ImprovementProposalSchema>;

export const CandidateResultSchema = z.object({
  status: z.literal("preview_ready"),
  previewUrl: z.string().url().startsWith("https://"),
  previewExpiresAt: z.number().int().positive().optional(),
  specHash: z.string().regex(/^[a-f0-9]{64}$/),
}).passthrough();

export const ApprovalResultSchema = z.object({
  status: z.literal("approval_sent"),
  approvalId: identifier.optional(),
}).passthrough();

export const VerificationResultSchema = z.object({
  accepted: z.boolean(),
  passed: z.boolean(),
  blockers: z.array(z.string().regex(/^[a-z0-9_:-]{3,128}$/)).max(24),
  runId: identifier,
}).strict();
export type VerificationResult = z.infer<typeof VerificationResultSchema>;

export const BoundaryResultSchema = z.object({
  status: z.enum(["accepted", "preview_ready", "approval_sent"]),
  merchantId: slug.optional(),
  previewUrl: z.string().url().optional(),
  previewExpiresAt: z.number().int().positive().optional(),
  specHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  approvalId: identifier.optional(),
  metrics: MetricsSchema.optional(),
}).passthrough();
