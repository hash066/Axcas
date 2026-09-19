import { z } from "zod";

const safeText = z.string().trim().min(1).max(500).refine(
  (value) => !/[<>]|javascript:/i.test(value),
  "HTML, scripts, and javascript URLs are not allowed",
);
const slug = z.string().regex(/^[a-z0-9-]{3,64}$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const e164 = z.string().regex(/^\+[1-9]\d{7,14}$/);
const assetId = z.string().regex(/^[a-zA-Z0-9_-]{3,128}$/);
const timestamp = z.number().int().nonnegative();

export const BusinessTypeSchema = z.enum([
  "home_bakery",
  "tailor",
  "tutor",
  "salon",
  "home_service",
  "retailer",
  "other",
]);
export type BusinessType = z.infer<typeof BusinessTypeSchema>;

const CatalogDraftItemSchema = z.object({
  name: safeText,
  description: safeText.optional(),
  priceMinor: z.number().int().nonnegative().optional(),
  currency: z.enum(["INR", "USD"]),
  imageAssetId: assetId,
});

export const BusinessBriefSchema = z.object({
  schemaVersion: z.literal(1),
  merchantId: slug,
  ownerWaIdHash: sha256,
  businessType: BusinessTypeSchema,
  businessName: safeText,
  timezone: safeText,
  locale: z.literal("en-IN"),
  description: safeText,
  orderWhatsAppNumber: e164,
  fulfillmentArea: safeText,
  leadTime: safeText,
  suppliedClaims: z.array(safeText).max(20),
  catalog: z.array(CatalogDraftItemSchema).min(1).max(24),
}).strict();

export type BusinessBriefV1 = z.infer<typeof BusinessBriefSchema>;
export const BusinessBriefInputSchema = BusinessBriefSchema.omit({ merchantId: true, ownerWaIdHash: true });
export type BusinessBriefInputV1 = z.infer<typeof BusinessBriefInputSchema>;

const CatalogItemSchema = z.object({
  id: slug,
  name: safeText,
  description: safeText,
  priceMinor: z.number().int().nonnegative().optional(),
  currency: z.enum(["INR", "USD"]),
  imageAssetId: assetId,
  available: z.boolean(),
  whatsappMessage: safeText,
});

export const SiteSpecV2Schema = z.object({
  schemaVersion: z.literal(2),
  siteId: slug,
  businessType: BusinessTypeSchema.optional(),
  business: z.object({
    merchantId: slug,
    name: safeText,
    description: safeText,
    timezone: safeText,
    locale: z.literal("en-IN"),
    orderWhatsAppNumber: e164,
  }),
  theme: z.object({
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    layout: z.enum(["minimal", "editorial", "catalog", "services", "portfolio"]).optional(),
  }),
  hero: z.object({ headline: safeText, subheadline: safeText, imageAssetId: assetId }),
  fulfillment: z.object({ area: safeText, leadTime: safeText }),
  catalog: z.array(CatalogItemSchema).min(1).max(24),
  whatsappCta: z.object({ label: safeText, defaultMessage: safeText, stickyOnMobile: z.boolean() }),
  policies: z.object({ ordering: safeText, cancellation: safeText.optional(), allergens: safeText.optional() }),
  seo: z.object({ title: safeText, description: safeText, socialImageAssetId: assetId }),
  suppliedClaims: z.array(safeText).max(20),
  proofBadge: z.object({ enabled: z.boolean(), passportSlug: slug }),
}).strict();

export type SiteSpecV2 = z.infer<typeof SiteSpecV2Schema>;

export const LeadConsentSchema = z.object({
  schemaVersion: z.literal(1),
  leadId: slug,
  phoneCiphertext: z.string().min(16).max(4096),
  phoneHash: sha256,
  country: z.enum(["IN", "US"]),
  purpose: z.literal("ai_qualification_call"),
  source: z.enum(["merchant_supplied_form", "proofgate_opt_in", "written_consent"]),
  evidenceHash: sha256,
  grantedAt: timestamp,
  revokedAt: timestamp.optional(),
  localTimezone: safeText,
  callWindow: z.object({ startHour: z.number().int().min(9).max(17), endHour: z.number().int().min(10).max(18) })
    .refine((value) => value.startHour < value.endHour, "call window must have positive duration"),
});

export type LeadConsentV1 = z.infer<typeof LeadConsentSchema>;

export const ApprovalSchema = z.object({
  schemaVersion: z.literal(1),
  approvalId: slug,
  merchantId: slug,
  type: z.enum(["release", "call_batch", "reel", "social_campaign"]),
  scopeHash: sha256,
  ownerWaIdHash: sha256,
  providerMessageId: z.string().min(1).max(256),
  decision: z.enum(["approved", "denied"]),
  decidedAt: timestamp,
  expiresAt: timestamp,
});

export type ApprovalV1 = z.infer<typeof ApprovalSchema>;

export const CallOutcomeSchema = z.object({
  schemaVersion: z.literal(1),
  callId: z.string().min(1).max(256),
  batchId: slug,
  leadId: slug,
  recordingConsent: z.enum(["granted", "declined", "not_reached"]),
  outcome: z.enum(["qualified", "not_interested", "no_answer", "failed", "do_not_call"]),
  interest: safeText.optional(),
  timing: safeText.optional(),
  product: safeText.optional(),
  objection: safeText.optional(),
  followUpRequested: z.boolean(),
  doNotCall: z.boolean(),
  costUsd: z.number().nonnegative(),
  artifactRef: z.string().max(2048).optional(),
  completedAt: timestamp,
});

export type CallOutcomeV1 = z.infer<typeof CallOutcomeSchema>;

export const ReelCreativeDirectionSchema = z.object({
  source: z.literal("axcas-brag-v1"),
  tone: z.enum(["default", "polished", "cinematic", "deadpan", "energetic"]),
  format: z.literal("vertical"),
  structure: z.literal("hook-reveal-proof-cta"),
  hookDeadlineMs: z.literal(2_000),
  posterSceneIndex: z.number().int().min(0).max(5),
  motion: z.array(z.enum(["punch_in", "slow_push", "hold"])).min(3).max(6),
  audioPolicy: z.literal("merchant_or_licensed_only"),
});

export const ReelPlanSchema = z.object({
  schemaVersion: z.literal(1),
  reelId: slug,
  merchantId: slug,
  angle: safeText,
  hook: safeText,
  scenes: z.array(z.object({ assetId, overlay: safeText, durationMs: z.number().int().min(1000).max(10_000) })).min(3).max(6),
  voiceover: safeText,
  caption: safeText,
  cta: safeText,
  claims: z.array(safeText).max(12),
  creativeDirection: ReelCreativeDirectionSchema.optional(),
  status: z.enum(["draft", "approved", "rendering", "rendered", "delivering", "delivered", "delivery_failed"]),
}).superRefine((plan, context) => {
  if (plan.scenes.reduce((total, scene) => total + scene.durationMs, 0) < 12_000) {
    context.addIssue({ code: "custom", message: "reel must be at least 12 seconds" });
  }
  if (plan.creativeDirection && plan.creativeDirection.motion.length !== plan.scenes.length) {
    context.addIssue({ code: "custom", path: ["creativeDirection", "motion"], message: "motion cue count must match scene count" });
  }
  if (plan.creativeDirection && plan.creativeDirection.posterSceneIndex >= plan.scenes.length) {
    context.addIssue({ code: "custom", path: ["creativeDirection", "posterSceneIndex"], message: "poster scene must exist" });
  }
});

export type ReelPlanV1 = z.infer<typeof ReelPlanSchema>;

export const initialBakerySiteSpec = {
  schemaVersion: 2,
  siteId: "mayas-oven",
  businessType: "home_bakery",
  business: {
    merchantId: "merchant-demo",
    name: "Maya's Oven",
    description: "Small-batch celebration cakes, baked to order in Bengaluru.",
    timezone: "Asia/Kolkata",
    locale: "en-IN",
    orderWhatsAppNumber: "+919876543210",
  },
  theme: { accent: "#b84f3a", background: "#fff8ef" },
  hero: {
    headline: "A celebration cake made for your moment.",
    subheadline: "Choose a favourite, tell us the date, and finish your order on WhatsApp.",
    imageAssetId: "cake-hero",
  },
  fulfillment: { area: "Bengaluru", leadTime: "Order at least 48 hours ahead." },
  catalog: [
    { id: "chocolate-truffle", name: "Chocolate Truffle", description: "Dark chocolate sponge with silky ganache.", priceMinor: 120000, currency: "INR", imageAssetId: "cake-1", available: true, whatsappMessage: "I'd like to order the Chocolate Truffle cake." },
    { id: "vanilla-berry", name: "Vanilla Berry", description: "Vanilla sponge layered with seasonal berry compote.", priceMinor: 140000, currency: "INR", imageAssetId: "cake-2", available: true, whatsappMessage: "I'd like to order the Vanilla Berry cake." },
    { id: "eggless-butterscotch", name: "Eggless Butterscotch", description: "Eggless sponge with caramel and praline crunch.", priceMinor: 110000, currency: "INR", imageAssetId: "cake-3", available: true, whatsappMessage: "I'd like to order the Eggless Butterscotch cake." },
  ],
  whatsappCta: { label: "Order on WhatsApp", defaultMessage: "Hello, I'd like to order a cake.", stickyOnMobile: true },
  policies: { ordering: "Orders are confirmed by the baker on WhatsApp.", cancellation: "Cancellation terms are confirmed before payment.", allergens: "Please disclose allergies before ordering." },
  seo: { title: "Maya's Oven — Celebration Cakes", description: "Small-batch celebration cakes baked to order in Bengaluru.", socialImageAssetId: "cake-hero" },
  suppliedClaims: ["Made to order", "Eggless option available"],
  proofBadge: { enabled: true, passportSlug: "mayas-oven" },
} satisfies SiteSpecV2;
