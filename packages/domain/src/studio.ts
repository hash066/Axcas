import { z } from "zod";
import { BusinessBriefInputSchema } from "./growth";

const safeText = z.string().trim().min(1).max(500).refine(
  (value) => !/[<>]|javascript:/i.test(value),
  "HTML, scripts, and javascript URLs are not allowed",
);
const identifier = z.string().regex(/^[a-zA-Z0-9_-]{3,128}$/);
const merchantId = z.string().regex(/^[a-z0-9-]{3,64}$/);
const normalizedPosition = z.number().min(0).max(1);
const e164 = z.string().regex(/^\+[1-9]\d{7,14}$/);

export const StudioIntentSchema = z.enum(["website", "reels", "both"]);
export type StudioIntent = z.infer<typeof StudioIntentSchema>;
export const MAX_STUDIO_OFFERINGS = 24;

export const SiteStyleSchema = z.enum(["minimal", "editorial", "catalog", "services", "portfolio"]);
export const ReelTemplateIdSchema = z.enum([
  "kinetic_type",
  "split_explainer",
  "talking_half",
  "full_infographic",
  "post_highlight",
]);

export const REEL_FORMATS = [
  {
    id: "kinetic_type",
    name: "Kinetic hook",
    description: "Fast human-written hooks and rhythmic typography for offers, lists, and strong opinions.",
    bestFor: "Announcements, listicles, limited offers",
    humanLed: true,
  },
  {
    id: "split_explainer",
    name: "Split explainer",
    description: "A real person, process, or product on one side with visual proof and concise steps on the other.",
    bestFor: "Tutorials, comparisons, before-and-after",
    humanLed: true,
  },
  {
    id: "talking_half",
    name: "Face + proof",
    description: "A founder or customer speaks while supplied work samples, close-ups, or results support the story.",
    bestFor: "Trust, founder stories, testimonials",
    humanLed: true,
  },
  {
    id: "full_infographic",
    name: "Visual breakdown",
    description: "A clean sequence of stats, steps, price breakdowns, or myths with original business evidence.",
    bestFor: "Education, pricing, FAQs",
    humanLed: true,
  },
  {
    id: "post_highlight",
    name: "Comment or review reveal",
    description: "A supplied review, question, or post is revealed and highlighted beat by beat with a clear response.",
    bestFor: "Social proof, FAQs, community replies",
    humanLed: true,
  },
] as const satisfies ReadonlyArray<{
  id: z.infer<typeof ReelTemplateIdSchema>;
  name: string;
  description: string;
  bestFor: string;
  humanLed: true;
}>;

const ReelLayerSchema = z.object({
  id: identifier,
  kind: z.enum(["text", "image", "video", "shape"]),
  text: safeText.optional(),
  sourceAssetId: identifier.optional(),
  startMs: z.number().int().min(0).max(120_000),
  endMs: z.number().int().min(250).max(120_000),
  x: normalizedPosition,
  y: normalizedPosition,
  width: normalizedPosition.refine((value) => value > 0),
  height: normalizedPosition.refine((value) => value > 0),
}).strict().superRefine((layer, context) => {
  if (layer.endMs <= layer.startMs) context.addIssue({ code: "custom", path: ["endMs"], message: "layer must have positive duration" });
  if (layer.kind === "text" && !layer.text) context.addIssue({ code: "custom", path: ["text"], message: "text layer requires text" });
  if ((layer.kind === "image" || layer.kind === "video") && !layer.sourceAssetId) context.addIssue({ code: "custom", path: ["sourceAssetId"], message: "media layer requires a supplied asset" });
  if (layer.x + layer.width > 1.001 || layer.y + layer.height > 1.001) context.addIssue({ code: "custom", message: "layer must stay within the 9:16 canvas" });
});

export const ReelStyleProfileSchema = z.object({
  schemaVersion: z.literal(1),
  profileId: identifier,
  merchantId,
  name: safeText,
  templateId: ReelTemplateIdSchema,
  referenceAssetIds: z.array(identifier).min(1).max(8),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(6),
  layers: z.array(ReelLayerSchema).min(1).max(40),
}).strict();
export type ReelStyleProfileV1 = z.infer<typeof ReelStyleProfileSchema>;

export const StudioOfferingSchema = z.object({
  name: safeText,
  description: safeText,
  priceMinor: z.number().int().nonnegative().optional(),
  currency: z.enum(["INR", "USD"]),
}).strict();
export type StudioOffering = z.infer<typeof StudioOfferingSchema>;

export const StudioProjectInputSchema = z.object({
  projectId: identifier.optional(),
  parentRevisionId: identifier.optional(),
  intent: StudioIntentSchema,
  businessName: safeText,
  description: safeText,
  siteStyle: SiteStyleSchema.optional(),
  reelTemplate: ReelTemplateIdSchema.optional(),
  referenceAssetIds: z.array(identifier).max(12).default([]),
  siteAssetIds: z.array(identifier).max(12).default([]),
  orderWhatsAppNumber: e164.optional(),
  fulfillmentArea: safeText.optional(),
  leadTime: safeText.optional(),
  timezone: safeText.optional(),
  offerings: z.array(StudioOfferingSchema).min(1).max(MAX_STUDIO_OFFERINGS).optional(),
  suppliedClaims: z.array(safeText).max(20).default([]),
  layerOverrides: z.object({
    hook: safeText,
    proof: safeText,
    cta: safeText,
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    pacing: z.enum(["calm", "balanced", "fast"]),
  }).strict().optional(),
}).strict().superRefine((project, context) => {
  if ((project.intent === "website" || project.intent === "both") && !project.siteStyle) {
    context.addIssue({ code: "custom", path: ["siteStyle"], message: "website work requires a site style" });
  }
  if ((project.intent === "reels" || project.intent === "both") && !project.reelTemplate) {
    context.addIssue({ code: "custom", path: ["reelTemplate"], message: "reel work requires a reel format" });
  }
});
export type StudioProjectInput = z.infer<typeof StudioProjectInputSchema>;

// Product metadata belongs beside the typed brief, not inside merchant prose. This
// envelope lets WhatsApp preserve the selected outcome and active project while the
// underlying BusinessBrief remains strict and channel-independent.
export const StudioIntakeInputSchema = BusinessBriefInputSchema.extend({
  projectId: identifier.optional(),
  projectIntent: StudioIntentSchema.optional(),
}).strict();
export type StudioIntakeInput = z.infer<typeof StudioIntakeInputSchema>;

export type ApprovalChecklistInput = {
  type: "release" | "call_batch" | "reel" | "social_campaign";
  subject: string;
  details: string[];
};

export function formatApprovalChecklist(input: ApprovalChecklistInput): string {
  const subject = safeText.parse(input.subject).slice(0, 140);
  const details = z.array(safeText).min(1).max(8).parse(input.details);
  const heading = {
    release: "Ready to publish",
    call_batch: "Ready to call",
    reel: "Ready to render",
    social_campaign: "Ready to schedule",
  }[input.type];
  const consequence = {
    release: "Approve publishes only this version.",
    call_batch: "Approve starts only this consented call batch.",
    reel: "Approve renders only this reel; it is not posted.",
    social_campaign: "Approve schedules only these three listed variations.",
  }[input.type];
  const checklist = [`${heading} — ${subject}`, ...details.map((detail) => `✓ ${detail}`), "", consequence, "Nothing else will run."].join("\n");
  if (checklist.length > 1024) throw new Error("approval checklist is too long for WhatsApp");
  return checklist;
}
