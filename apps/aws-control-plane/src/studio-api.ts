import { z } from "zod";

import { createSiteSpecV3Hash, SiteSpecV3Schema, type SiteSpecV3 } from "../../../packages/domain/src/production-redesign";

const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/);
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * Studio can change only presentation/content fields. Tenant, site and schema
 * identity are server-owned and intentionally absent from this schema.
 */
export const StudioSitePatchV1Schema = z.object({
  businessType: SiteSpecV3Schema.shape.businessType.optional(),
  layoutPreset: SiteSpecV3Schema.shape.layoutPreset.optional(),
  sectionOrder: SiteSpecV3Schema.shape.sectionOrder.optional(),
  theme: SiteSpecV3Schema.shape.theme.partial().optional(),
  business: SiteSpecV3Schema.shape.business.omit({ locale: true }).partial().optional(),
  hero: SiteSpecV3Schema.shape.hero.partial().optional(),
  offerings: SiteSpecV3Schema.shape.offerings.optional(),
  proof: SiteSpecV3Schema.shape.proof.optional(),
  contact: SiteSpecV3Schema.shape.contact.partial().optional(),
  seo: SiteSpecV3Schema.shape.seo.partial().optional(),
  publishedAssetIds: SiteSpecV3Schema.shape.publishedAssetIds.optional(),
}).strict().refine((patch) => Object.keys(patch).length > 0, "patch must contain at least one change");

export const StudioProjectPatchRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  patch: StudioSitePatchV1Schema,
}).strict();

export const StudioProjectRevisionSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: slug,
  merchantId: slug,
  revision: z.number().int().positive(),
  spec: SiteSpecV3Schema,
  specHash: sha256,
  updatedAt: z.number().int().nonnegative(),
  updatedBy: z.enum(["whatsapp", "studio"]),
}).strict();

export type StudioProjectRevision = z.infer<typeof StudioProjectRevisionSchema>;
export type StudioProjectPatchRequest = z.infer<typeof StudioProjectPatchRequestSchema>;

export const StudioApprovalCreateRequestSchema = z.object({
  type: z.literal("release"),
  expectedRevision: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
}).strict();

export const StudioPendingApprovalSchema = z.object({
  schemaVersion: z.literal(1),
  approvalId: slug,
  type: z.literal("release"),
  projectId: slug,
  merchantId: slug,
  ownerWaIdHash: sha256,
  revision: z.number().int().positive(),
  scopeHash: sha256,
  expiresAt: z.number().int().positive(),
  decision: z.literal("pending"),
  createdAt: z.number().int().nonnegative(),
}).strict();

export const StudioApprovalReadSchema = StudioPendingApprovalSchema.omit({ decision: true }).extend({
  decision: z.enum(["pending", "approved", "denied"]),
  decidedAt: z.number().int().nonnegative().optional(),
}).strict();

export const StudioApprovalViewSchema = StudioApprovalReadSchema.omit({ merchantId: true, ownerWaIdHash: true, schemaVersion: true });
export type StudioPendingApproval = z.infer<typeof StudioPendingApprovalSchema>;
export type StudioApprovalView = z.infer<typeof StudioApprovalViewSchema>;

export class StudioApiError extends Error {
  constructor(public readonly code: "invalid_request" | "not_found" | "revision_conflict" | "authentication_required", public readonly status: 400 | 401 | 404 | 409) {
    super(code);
    this.name = "StudioApiError";
  }
}

function invalidRequest<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof StudioApiError) throw error;
    throw new StudioApiError("invalid_request", 400);
  }
}

function mergeSiteSpec(spec: SiteSpecV3, patch: z.infer<typeof StudioSitePatchV1Schema>): unknown {
  return {
    ...spec,
    ...patch,
    theme: patch.theme ? { ...spec.theme, ...patch.theme } : spec.theme,
    business: patch.business ? { ...spec.business, ...patch.business } : spec.business,
    hero: patch.hero ? { ...spec.hero, ...patch.hero } : spec.hero,
    contact: patch.contact ? { ...spec.contact, ...patch.contact } : spec.contact,
    seo: patch.seo ? { ...spec.seo, ...patch.seo } : spec.seo,
  };
}

export async function applyStudioSitePatch(
  currentInput: unknown,
  requestInput: unknown,
  context: { now: number; updatedBy: "whatsapp" | "studio" },
): Promise<StudioProjectRevision> {
  const current = invalidRequest(() => StudioProjectRevisionSchema.parse(currentInput));
  const request = invalidRequest(() => StudioProjectPatchRequestSchema.parse(requestInput));
  if (request.expectedRevision !== current.revision) throw new StudioApiError("revision_conflict", 409);
  const nextSpec = invalidRequest(() => SiteSpecV3Schema.parse(mergeSiteSpec(current.spec, request.patch)));
  if (nextSpec.merchantId !== current.merchantId || nextSpec.siteId !== current.spec.siteId) throw new StudioApiError("invalid_request", 400);
  const next = {
    ...current,
    revision: current.revision + 1,
    spec: nextSpec,
    specHash: await createSiteSpecV3Hash(nextSpec),
    updatedAt: context.now,
    updatedBy: context.updatedBy,
  };
  return StudioProjectRevisionSchema.parse(next);
}

export async function createPendingStudioReleaseApproval(input: {
  project: unknown;
  ownerWaIdHash: string;
  expectedRevision: number;
  expiresAt: number;
  now: number;
  approvalId: string;
}): Promise<StudioPendingApproval> {
  const project = invalidRequest(() => StudioProjectRevisionSchema.parse(input.project));
  if (input.expectedRevision !== project.revision) throw new StudioApiError("revision_conflict", 409);
  if (input.expiresAt <= input.now || input.expiresAt > input.now + 86_400_000) throw new StudioApiError("invalid_request", 400);
  return invalidRequest(() => StudioPendingApprovalSchema.parse({
    schemaVersion: 1,
    approvalId: input.approvalId,
    type: "release",
    projectId: project.projectId,
    merchantId: project.merchantId,
    ownerWaIdHash: input.ownerWaIdHash,
    revision: project.revision,
    scopeHash: project.specHash,
    expiresAt: input.expiresAt,
    decision: "pending",
    createdAt: input.now,
  }));
}

export function studioApprovalView(input: unknown): StudioApprovalView {
  const record = input as Partial<z.infer<typeof StudioApprovalReadSchema>>;
  const approval = invalidRequest(() => StudioApprovalReadSchema.parse({
    schemaVersion: record.schemaVersion,
    approvalId: record.approvalId,
    type: record.type,
    projectId: record.projectId,
    merchantId: record.merchantId,
    ownerWaIdHash: record.ownerWaIdHash,
    revision: record.revision,
    scopeHash: record.scopeHash,
    expiresAt: record.expiresAt,
    decision: record.decision,
    createdAt: record.createdAt,
    decidedAt: record.decidedAt,
  }));
  return StudioApprovalViewSchema.parse(approval);
}

export const StudioProjectIdSchema = identifier.and(slug);
