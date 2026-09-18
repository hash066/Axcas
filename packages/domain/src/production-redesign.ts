import { z } from "zod";

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/);
const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.number().int().nonnegative();
const safeText = (maximum: number) => z.string().trim().min(1).max(maximum).refine(
  (value) => !/[<>]|javascript:|data:text\/html/i.test(value),
  "unsafe markup is not allowed",
);

export const MerchantAccountV1Schema = z.object({
  schemaVersion: z.literal(1),
  merchantId: slug,
  ownerWaIdHash: sha256,
  locale: z.literal("en-IN"),
  timezone: z.string().min(3).max(64),
  businessType: z.enum(["home_bakery", "tailor", "tutor", "salon", "home_service", "retailer", "other"]),
  cognitoSubject: z.string().uuid(),
  plan: z.literal("free_beta"),
  createdAt: timestamp,
}).strict();

const ThemeV3Schema = z.object({
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  surface: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  text: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  headingFont: z.enum(["sans", "serif", "display"]),
  bodyFont: z.enum(["sans", "serif"]),
}).strict();

const PriceV3Schema = z.object({
  currency: z.literal("INR"),
  amountMinor: z.number().int().positive().max(100_000_000),
}).strict();

export const SiteSpecV3Schema = z.object({
  schemaVersion: z.literal(3),
  siteId: slug,
  merchantId: slug,
  businessType: z.enum(["home_bakery", "tailor", "tutor", "salon", "home_service", "retailer", "other"]),
  layoutPreset: z.enum(["minimal", "editorial", "catalog", "services", "portfolio"]),
  sectionOrder: z.array(z.enum(["hero", "offerings", "proof", "contact"])).length(4)
    .refine((sections) => new Set(sections).size === 4, "section order must contain every section once"),
  theme: ThemeV3Schema,
  business: z.object({
    name: safeText(100),
    description: safeText(1_500),
    timezone: z.string().min(3).max(64),
    locale: z.literal("en-IN"),
  }).strict(),
  hero: z.object({
    headline: safeText(120),
    subheadline: safeText(240),
    assetId: identifier.optional(),
  }).strict(),
  offerings: z.array(z.object({
    itemId: slug,
    name: safeText(100),
    description: safeText(500),
    price: PriceV3Schema.optional(),
    availability: z.enum(["available", "unavailable", "made_to_order"]),
    assetId: identifier.optional(),
  }).strict()).min(1).max(24),
  proof: z.array(z.object({ label: safeText(80), detail: safeText(240), assetId: identifier.optional() }).strict()).max(12),
  contact: z.object({
    orderWhatsAppNumber: z.string().regex(/^\+91[6-9]\d{9}$/),
    fulfillmentArea: safeText(160),
    leadTime: safeText(100),
    ctaLabel: safeText(60),
  }).strict(),
  seo: z.object({ title: safeText(70), description: safeText(170) }).strict(),
  publishedAssetIds: z.array(identifier).max(48),
}).strict().superRefine((spec, context) => {
  const allowed = new Set(spec.publishedAssetIds);
  const used = [spec.hero.assetId, ...spec.offerings.map((offering) => offering.assetId), ...spec.proof.map((proof) => proof.assetId)].filter(Boolean) as string[];
  for (const assetId of used) {
    if (!allowed.has(assetId)) context.addIssue({ code: "custom", path: ["publishedAssetIds"], message: `used asset ${assetId} must be explicitly published` });
  }
});

export type SiteSpecV3 = z.infer<typeof SiteSpecV3Schema>;

export const MetaConnectionV1Schema = z.object({
  schemaVersion: z.literal(1),
  connectionId: slug,
  merchantId: slug,
  instagramAccountId: z.string().regex(/^\d{3,32}$/),
  facebookPageId: z.string().regex(/^\d{3,32}$/).optional(),
  adAccountId: z.string().regex(/^act_\d{3,32}$/).optional(),
  encryptedTokenRef: z.string().regex(/^kms:\/\/[A-Za-z0-9/_-]{3,256}$/),
  scopes: z.array(z.enum([
    "instagram_basic", "instagram_content_publish", "pages_read_engagement", "pages_show_list",
    "read_insights", "ads_management", "ads_read", "business_management",
  ])).max(8),
  expiresAt: timestamp,
  capabilities: z.object({
    reelPublishing: z.boolean(),
    trialReels: z.enum(["unknown", "supported", "unsupported"]),
    paidAds: z.boolean(),
  }).strict(),
  connectedAt: timestamp,
  revokedAt: timestamp.optional(),
}).strict();

export type MetaConnectionV1 = z.infer<typeof MetaConnectionV1Schema>;

const CreativeVariantV2Schema = z.object({
  variantId: slug,
  changedDimension: z.enum(["hook", "cover", "cta"]),
  hypothesis: safeText(300),
  reelAssetId: identifier,
  caption: safeText(2_200),
  scheduledAt: timestamp,
}).strict();

const PaidCampaignV2Schema = z.discriminatedUnion("enabled", [
  z.object({ enabled: z.literal(false) }).strict(),
  z.object({
    enabled: z.literal(true),
    adAccountId: z.string().regex(/^act_\d{3,32}$/),
    destination: z.enum(["site", "engagement"]),
    siteUrl: z.string().url().refine((value) => value.startsWith("https://"), "site URL must use HTTPS").optional(),
    city: safeText(80),
    cityKey: z.string().regex(/^\d{3,32}$/),
    radiusKm: z.number().int().min(5).max(25),
    ageMin: z.literal(18),
    ageMax: z.number().int().min(18).max(65),
    lifetimeBudgetInr: z.number().int().min(300).max(2_000),
    durationDays: z.literal(3),
    automaticPlacements: z.literal(true),
  }).strict().superRefine((paid, context) => {
    if (paid.destination === "site" && !paid.siteUrl) context.addIssue({ code: "custom", path: ["siteUrl"], message: "site destination requires a URL" });
    if (paid.ageMax < paid.ageMin) context.addIssue({ code: "custom", path: ["ageMax"], message: "age maximum must be at least the minimum" });
  }),
]);

export const CreativeCampaignV2Schema = z.object({
  schemaVersion: z.literal(2),
  campaignId: slug,
  merchantId: slug,
  objective: z.enum(["traffic", "engagement"]),
  platform: z.literal("instagram"),
  testedDimension: z.enum(["hook", "cover", "cta"]),
  variants: z.array(CreativeVariantV2Schema).length(3),
  organic: z.object({
    mode: z.enum(["normal", "trial_if_supported"]),
    selectedVariantId: slug,
  }).strict(),
  paid: PaidCampaignV2Schema,
  explorationRate: z.number().min(0.1).max(0.2),
  createdAt: timestamp,
}).strict().superRefine((campaign, context) => {
  const ids = campaign.variants.map((variant) => variant.variantId);
  if (new Set(ids).size !== 3) context.addIssue({ code: "custom", path: ["variants"], message: "variant IDs must be unique" });
  if (!ids.includes(campaign.organic.selectedVariantId)) context.addIssue({ code: "custom", path: ["organic", "selectedVariantId"], message: "selected organic variant must exist" });
  if (campaign.variants.some((variant) => variant.changedDimension !== campaign.testedDimension)) {
    context.addIssue({ code: "custom", path: ["variants"], message: "all variants must test one declared dimension" });
  }
  if (new Set(campaign.variants.map((variant) => variant.reelAssetId)).size !== 3) context.addIssue({ code: "custom", path: ["variants"], message: "each variant must use an immutable rendered asset" });
});

export type CreativeCampaignV2 = z.infer<typeof CreativeCampaignV2Schema>;

export const CampaignApprovalV2Schema = z.object({
  schemaVersion: z.literal(2),
  approvalId: slug,
  campaignId: slug,
  merchantId: slug,
  ownerWaIdHash: sha256,
  scopeHash: sha256,
  expiresAt: timestamp,
  decision: z.enum(["approved", "denied"]),
  decidedAt: timestamp,
}).strict().superRefine((approval, context) => {
  if (approval.decidedAt > approval.expiresAt) context.addIssue({ code: "custom", path: ["decidedAt"], message: "approval expired before the decision" });
});

export type CampaignApprovalV2 = z.infer<typeof CampaignApprovalV2Schema>;

export const SocialPublicationV1Schema = z.object({
  schemaVersion: z.literal(1),
  publicationId: slug,
  campaignId: slug,
  variantId: slug,
  merchantId: slug,
  mode: z.enum(["organic", "trial_reel", "paid_ad"]),
  providerContainerId: identifier.optional(),
  providerMediaId: identifier.optional(),
  providerCampaignId: identifier.optional(),
  providerAdSetId: identifier.optional(),
  providerAdId: identifier.optional(),
  receiptHash: sha256,
  status: z.enum(["prepared", "provider_processing", "published", "failed", "stopped"]),
  idempotencyKey: identifier,
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict();

export const MetricSnapshotV2Schema = z.object({
  schemaVersion: z.literal(2),
  snapshotId: slug,
  merchantId: slug,
  campaignId: slug,
  variantId: slug,
  channel: z.enum(["organic", "paid"]),
  checkpointHours: z.number().int().positive().max(720),
  durationSeconds: z.number().positive().max(900),
  reach: z.number().int().nonnegative(),
  impressions: z.number().int().nonnegative(),
  plays: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  comments: z.number().int().nonnegative(),
  saves: z.number().int().nonnegative(),
  shares: z.number().int().nonnegative(),
  avgWatchTimeSeconds: z.number().nonnegative(),
  ctaClicks: z.number().int().nonnegative(),
  spendMinorInr: z.number().int().nonnegative(),
  providerReceiptHash: sha256,
  observedAt: timestamp,
}).strict();

export const LearningArtifactV1Schema = z.object({
  schemaVersion: z.literal(1),
  learningId: slug,
  merchantId: slug,
  campaignId: slug,
  testedDimension: z.enum(["hook", "cover", "cta"]),
  winningVariantId: slug,
  confidence: z.number().min(0).max(1),
  evidenceRefs: z.array(identifier).length(3),
  denominators: z.record(z.string(), z.number().int().min(50)).refine((value) => Object.keys(value).length === 3, "three adequate denominators are required"),
  applicableFrom: timestamp,
  createdAt: timestamp,
}).strict();

export type LearningArtifactV1 = z.infer<typeof LearningArtifactV1Schema>;

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function createCampaignScopeHash(campaignInput: CreativeCampaignV2): Promise<string> {
  const campaign = CreativeCampaignV2Schema.parse(campaignInput);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalize(campaign)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createSiteSpecV3Hash(siteInput: unknown): Promise<string> {
  const site = SiteSpecV3Schema.parse(siteInput);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalize(site)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type CampaignState =
  | { status: "draft" | "previewing" | "awaiting_approval"; campaign: CreativeCampaignV2 }
  | { status: "approved" | "publishing" | "measuring" | "complete"; campaign: CreativeCampaignV2; approval: CampaignApprovalV2 }
  | { status: "failed"; campaign: CreativeCampaignV2; failureCode: string };

export type CampaignEvent =
  | { type: "previews_started" }
  | { type: "previews_ready" }
  | { type: "approval_received"; approval: CampaignApprovalV2; now: number }
  | { type: "publishing_started" }
  | { type: "published" }
  | { type: "measurement_complete" }
  | { type: "failed"; failureCode: string };

export async function advanceCampaign(state: CampaignState, event: CampaignEvent): Promise<CampaignState> {
  if (event.type === "failed") return { status: "failed", campaign: state.campaign, failureCode: event.failureCode };
  if (state.status === "draft" && event.type === "previews_started") return { status: "previewing", campaign: state.campaign };
  if (state.status === "previewing" && event.type === "previews_ready") return { status: "awaiting_approval", campaign: state.campaign };
  if (state.status === "awaiting_approval" && event.type === "approval_received") {
    const approval = CampaignApprovalV2Schema.parse(event.approval);
    if (approval.decision !== "approved") return { status: "failed", campaign: state.campaign, failureCode: "merchant_denied" };
    if (approval.campaignId !== state.campaign.campaignId || approval.merchantId !== state.campaign.merchantId) throw new Error("approval scope identity mismatch");
    if (approval.expiresAt < event.now) throw new Error("approval scope expired");
    if (await createCampaignScopeHash(state.campaign) !== approval.scopeHash) throw new Error("campaign scope hash mismatch");
    return { status: "approved", campaign: state.campaign, approval };
  }
  if (state.status === "approved" && event.type === "publishing_started") return { status: "publishing", campaign: state.campaign, approval: state.approval };
  if (state.status === "publishing" && event.type === "published") return { status: "measuring", campaign: state.campaign, approval: state.approval };
  if (state.status === "measuring" && event.type === "measurement_complete") return { status: "complete", campaign: state.campaign, approval: state.approval };
  throw new Error(`invalid campaign transition ${state.status} -> ${event.type}`);
}
