import { BusinessBriefSchema, ReelPlanSchema, SiteSpecV2Schema, type BusinessBriefV1, type BusinessType, type ReelPlanV1, type SiteSpecV2 } from "./growth";
import { StudioProjectInputSchema, type StudioProjectInput } from "./studio";
import { resolveReelSignals, type ReelSignal, type ReelSignalResolution } from "./reel-signals";

export type StudioOwnerIdentity = { merchantId: string; ownerWaIdHash: string };
export type MissingStudioFact = "orderWhatsAppNumber" | "fulfillmentArea" | "leadTime" | "offerings" | "referenceAssetIds";

export class MissingStudioFactsError extends Error {
  constructor(readonly missing: MissingStudioFact[]) {
    super(`Studio project is missing: ${missing.join(", ")}`);
    this.name = "MissingStudioFactsError";
  }
}

function slugify(value: string, fallback = "business"): string {
  const slug = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (slug || fallback).slice(0, 56).replace(/-+$/g, "");
}

export function inferStudioBusinessType(description: string): BusinessType {
  const value = description.toLowerCase();
  if (/bak(?:e|er|ery|ing)|cake|bread|cookie|dessert|pastr/.test(value)) return "home_bakery";
  if (/tailor|stitch|blouse|alteration|garment|sew/.test(value)) return "tailor";
  if (/tutor|tuition|teach|coaching|lesson|classes|education/.test(value)) return "tutor";
  if (/salon|hair|beauty|nail|makeup|spa|groom/.test(value)) return "salon";
  if (/plumb|electric|repair|cleaning|pest|carpenter|home service/.test(value)) return "home_service";
  if (/retail|shop|store|boutique|resell|products?/.test(value)) return "retailer";
  return "other";
}

function requiredFacts(project: StudioProjectInput): MissingStudioFact[] {
  const missing: MissingStudioFact[] = [];
  if (!project.orderWhatsAppNumber) missing.push("orderWhatsAppNumber");
  if (!project.fulfillmentArea) missing.push("fulfillmentArea");
  if (!project.leadTime) missing.push("leadTime");
  if (!project.offerings?.length) missing.push("offerings");
  if (!(project.siteAssetIds.length || project.referenceAssetIds.length)) missing.push("referenceAssetIds");
  return missing;
}

const accentByType: Record<BusinessType, string> = {
  home_bakery: "#b84f3a",
  tailor: "#6546a8",
  tutor: "#2563a7",
  salon: "#a33b72",
  home_service: "#247467",
  retailer: "#b25420",
  other: "#3f5f75",
};

const siteStyleByType: Record<BusinessType, StudioProjectInput["siteStyle"]> = {
  home_bakery: "catalog",
  tailor: "portfolio",
  tutor: "services",
  salon: "portfolio",
  home_service: "services",
  retailer: "catalog",
  other: "minimal",
};

export function studioProjectFromBusinessBrief(
  briefInput: unknown,
  options: { intent?: StudioProjectInput["intent"]; projectId?: string } = {},
): StudioProjectInput {
  const brief = BusinessBriefSchema.parse(briefInput);
  const assetIds = Array.from(new Set(brief.catalog.map((item) => item.imageAssetId)));
  // Keep the legacy default stable so existing WhatsApp workspaces do not fork on
  // upgrade. A journey that starts another business supplies its explicit projectId.
  const inferredProjectId = `project-whatsapp-${brief.merchantId.replace(/^merchant-/, "")}`.slice(0, 128);
  const intent = options.intent ?? "website";
  const projectId = options.projectId ?? inferredProjectId;
  const firstOffering = brief.catalog[0]!.name;
  return StudioProjectInputSchema.parse({
    projectId,
    intent,
    businessName: brief.businessName,
    description: brief.description,
    ...(intent !== "reels" ? { siteStyle: siteStyleByType[brief.businessType] } : {}),
    ...(intent !== "website" ? {
      reelTemplate: "split_explainer",
      layerOverrides: {
        hook: `See ${firstOffering} from ${brief.businessName}`,
        proof: brief.suppliedClaims[0] ?? brief.description,
        cta: `Message ${brief.businessName} on WhatsApp`,
        accent: accentByType[brief.businessType],
        pacing: "balanced",
      },
    } : {}),
    referenceAssetIds: assetIds,
    siteAssetIds: assetIds,
    orderWhatsAppNumber: brief.orderWhatsAppNumber,
    fulfillmentArea: brief.fulfillmentArea,
    leadTime: brief.leadTime,
    timezone: brief.timezone,
    offerings: brief.catalog.map((item) => ({
      name: item.name,
      description: item.description ?? `Ask us about ${item.name}.`,
      priceMinor: item.priceMinor,
      currency: item.currency,
    })),
    suppliedClaims: brief.suppliedClaims,
  });
}

export function buildStudioWebsite(input: unknown, owner: StudioOwnerIdentity): { brief: BusinessBriefV1; spec: SiteSpecV2 } {
  const project = StudioProjectInputSchema.parse(input);
  if (project.intent === "reels") throw new Error("reels-only projects do not contain a website");
  const missing = requiredFacts(project);
  if (missing.length) throw new MissingStudioFactsError(missing);

  const businessType = inferStudioBusinessType(`${project.businessName} ${project.description}`);
  const websiteAssets = project.siteAssetIds.length ? project.siteAssetIds : project.referenceAssetIds;
  const suffix = owner.merchantId.replace(/[^a-z0-9]/g, "").slice(-6).padStart(6, "0");
  const siteId = `${slugify(project.businessName)}-${suffix}`.slice(0, 64).replace(/-+$/g, "");
  const usedIds = new Map<string, number>();
  const catalog = project.offerings!.map((offering, index) => {
    const baseId = slugify(offering.name, `offering-${index + 1}`).slice(0, 56);
    const count = (usedIds.get(baseId) ?? 0) + 1;
    usedIds.set(baseId, count);
    const id = count === 1 ? baseId : `${baseId.slice(0, 61)}-${count}`;
    return {
      id,
      name: offering.name,
      description: offering.description,
      priceMinor: offering.priceMinor,
      currency: offering.currency,
      imageAssetId: websiteAssets[index % websiteAssets.length]!,
      available: true,
      whatsappMessage: `Hello, I'd like to ask about ${offering.name} from ${project.businessName}.`,
    };
  });
  const timezone = project.timezone ?? "Asia/Kolkata";
  const firstAssetId = websiteAssets[0]!;

  const brief = BusinessBriefSchema.parse({
    schemaVersion: 1,
    ...owner,
    businessType,
    businessName: project.businessName,
    timezone,
    locale: "en-IN",
    description: project.description,
    orderWhatsAppNumber: project.orderWhatsAppNumber!,
    fulfillmentArea: project.fulfillmentArea!,
    leadTime: project.leadTime!,
    suppliedClaims: project.suppliedClaims,
    catalog: catalog.map(({ name, description, priceMinor, currency, imageAssetId }) => ({ name, description, priceMinor, currency, imageAssetId })),
  });
  const spec = SiteSpecV2Schema.parse({
    schemaVersion: 2,
    siteId,
    businessType,
    business: {
      merchantId: owner.merchantId,
      name: project.businessName,
      description: project.description,
      timezone,
      locale: "en-IN",
      orderWhatsAppNumber: project.orderWhatsAppNumber!,
    },
    theme: { accent: accentByType[businessType], background: "#fbf8f2", layout: project.siteStyle },
    hero: {
      headline: `Explore ${project.businessName}.`,
      subheadline: project.description,
      imageAssetId: firstAssetId,
    },
    fulfillment: { area: project.fulfillmentArea!, leadTime: project.leadTime! },
    catalog,
    whatsappCta: { label: "Message on WhatsApp", defaultMessage: `Hello, I'd like to know more about ${project.businessName}.`, stickyOnMobile: true },
    policies: {
      ordering: "Message us on WhatsApp to confirm availability and the next step.",
      ...(businessType === "home_bakery" ? { allergens: "Please share allergy information before ordering." } : {}),
    },
    seo: { title: `${project.businessName} — ${project.fulfillmentArea}`, description: project.description, socialImageAssetId: firstAssetId },
    suppliedClaims: project.suppliedClaims,
    proofBadge: { enabled: true, passportSlug: siteId },
  });
  return { brief, spec };
}

const reelAngleByTemplate = {
  kinetic_type: "Offer + urgency",
  split_explainer: "Process + proof",
  talking_half: "Founder + evidence",
  full_infographic: "Useful breakdown",
  post_highlight: "Question + answer",
} as const;

export function buildStudioReelPlan(
  input: unknown,
  owner: StudioOwnerIdentity,
  signalInput: { signals: ReelSignal[]; now: number } = { signals: [], now: Date.now() },
): { plan: ReelPlanV1; recommendations: ReelSignalResolution } {
  const project = StudioProjectInputSchema.parse(input);
  if (project.intent === "website") throw new Error("website-only projects do not contain a reel");
  if (!project.projectId || !project.reelTemplate || !project.layerOverrides) throw new Error("reel format and editable layers are required");
  const assets = project.siteAssetIds.length ? project.siteAssetIds : project.referenceAssetIds;
  if (!assets.length) throw new MissingStudioFactsError(["referenceAssetIds"]);
  const overlays = [project.layerOverrides.hook, project.layerOverrides.proof, project.layerOverrides.cta];
  const angle = reelAngleByTemplate[project.reelTemplate];
  const recommendations = resolveReelSignals(signalInput.signals, signalInput.now);
  const reelId = `reel-${slugify(project.projectId, "studio-project")}`.slice(0, 64).replace(/-+$/g, "");
  const plan = ReelPlanSchema.parse({
    schemaVersion: 1,
    reelId,
    merchantId: owner.merchantId,
    angle,
    hook: project.layerOverrides.hook,
    scenes: overlays.map((overlay, index) => ({ assetId: assets[index % assets.length]!, overlay, durationMs: 5_000 })),
    voiceover: `${project.layerOverrides.hook}. ${project.layerOverrides.proof}. ${project.layerOverrides.cta}.`,
    caption: `${project.layerOverrides.proof}. ${project.layerOverrides.cta}.`,
    cta: project.layerOverrides.cta,
    claims: project.suppliedClaims,
    creativeDirection: {
      source: "axcas-brag-v1",
      tone: project.layerOverrides.pacing === "fast" ? "polished" : "default",
      format: "vertical",
      structure: "hook-reveal-proof-cta",
      hookDeadlineMs: 2_000,
      posterSceneIndex: 1,
      motion: ["punch_in", "slow_push", "hold"],
      audioPolicy: "merchant_or_licensed_only",
    },
    status: "draft",
  });
  return { plan, recommendations };
}

/** Three merchant-media concepts that vary only the opening hook/angle. */
export function buildStudioReelVariants(
  input: unknown,
  owner: StudioOwnerIdentity,
): [ReelPlanV1, ReelPlanV1, ReelPlanV1] {
  const project = StudioProjectInputSchema.parse(input);
  const base = buildStudioReelPlan(project, owner).plan;
  const concepts = [
    { angle: "Offer + urgency", hook: project.layerOverrides!.hook },
    { angle: "Process + proof", hook: `See how ${project.businessName} makes it` },
    { angle: "Question + answer", hook: `What should customers know about ${project.businessName}?` },
  ] as const;
  return concepts.map((concept, index) => ReelPlanSchema.parse({
    ...base,
    reelId: `${base.reelId}-${index + 1}`.slice(0, 64),
    angle: concept.angle,
    hook: concept.hook,
    scenes: base.scenes.map((scene, sceneIndex) => sceneIndex === 0 ? { ...scene, overlay: concept.hook } : scene),
    voiceover: `${concept.hook}. ${project.layerOverrides!.proof}. ${project.layerOverrides!.cta}.`,
  })) as [ReelPlanV1, ReelPlanV1, ReelPlanV1];
}
