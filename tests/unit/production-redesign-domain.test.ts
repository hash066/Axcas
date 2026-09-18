import { describe, expect, it } from "vitest";

import {
  CampaignApprovalV2Schema,
  CreativeCampaignV2Schema,
  LearningArtifactV1Schema,
  MetaConnectionV1Schema,
  SiteSpecV3Schema,
  advanceCampaign,
  createCampaignScopeHash,
} from "../../packages/domain/src/production-redesign";

const campaign = {
  schemaVersion: 2 as const,
  campaignId: "campaign-maya-launch",
  merchantId: "merchant-maya",
  objective: "traffic" as const,
  platform: "instagram" as const,
  testedDimension: "hook" as const,
  variants: [
    { variantId: "maya-hook", changedDimension: "hook" as const, hypothesis: "Question hook improves watch time", reelAssetId: "reel-maya-hook", caption: "Which fit would you choose?", scheduledAt: 1_800_000_000_000 },
    { variantId: "maya-cover", changedDimension: "hook" as const, hypothesis: "Statement hook improves starts", reelAssetId: "reel-maya-cover", caption: "A better blouse fit starts here", scheduledAt: 1_800_086_400_000 },
    { variantId: "maya-cta", changedDimension: "hook" as const, hypothesis: "Outcome hook improves enquiries", reelAssetId: "reel-maya-cta", caption: "Message Maya Studio for a fitting", scheduledAt: 1_800_172_800_000 },
  ],
  organic: { mode: "trial_if_supported" as const, selectedVariantId: "maya-hook" },
  paid: {
    enabled: true,
    adAccountId: "act_123456789",
    destination: "site" as const,
    siteUrl: "https://example.cloudfront.net/s/maya-studio",
    city: "Bengaluru",
    cityKey: "1027592",
    radiusKm: 10,
    ageMin: 18,
    ageMax: 65,
    lifetimeBudgetInr: 300,
    durationDays: 3,
    automaticPlacements: true,
  },
  explorationRate: 0.15,
  createdAt: 1_799_999_000_000,
};

describe("AWS-native production contracts", () => {
  it("binds one approval to the exact campaign and rejects edited spend", async () => {
    const parsed = CreativeCampaignV2Schema.parse(campaign);
    const scopeHash = await createCampaignScopeHash(parsed);
    const approval = CampaignApprovalV2Schema.parse({
      schemaVersion: 2,
      approvalId: "approval-maya-launch",
      campaignId: parsed.campaignId,
      merchantId: parsed.merchantId,
      ownerWaIdHash: "a".repeat(64),
      scopeHash,
      expiresAt: 1_800_010_000_000,
      decision: "approved",
      decidedAt: 1_800_000_100_000,
    });
    await expect(advanceCampaign({ status: "awaiting_approval", campaign: parsed }, { type: "approval_received", approval, now: 1_800_000_100_000 })).resolves.toMatchObject({ status: "approved" });

    const edited = CreativeCampaignV2Schema.parse({ ...campaign, paid: { ...campaign.paid, lifetimeBudgetInr: 500 } });
    await expect(advanceCampaign({ status: "awaiting_approval", campaign: edited }, { type: "approval_received", approval, now: 1_800_000_100_000 })).rejects.toThrow(/scope/i);
  });

  it("rejects a campaign that changes more than its one declared dimension", () => {
    const mixed = { ...campaign, variants: campaign.variants.map((variant, index) => index === 1 ? { ...variant, changedDimension: "cover" as const } : variant) };
    expect(() => CreativeCampaignV2Schema.parse(mixed)).toThrow("one declared dimension");
  });

  it("keeps Meta tokens out of the durable public connection shape", () => {
    expect(MetaConnectionV1Schema.parse({
      schemaVersion: 1,
      connectionId: "meta-maya",
      merchantId: "merchant-maya",
      instagramAccountId: "178900000000001",
      facebookPageId: "190000000000001",
      adAccountId: "act_123456789",
      encryptedTokenRef: "kms://alias/axcas/meta-maya",
      scopes: ["instagram_basic", "instagram_content_publish", "read_insights", "ads_management", "ads_read"],
      expiresAt: 1_900_000_000_000,
      capabilities: { reelPublishing: true, trialReels: "unknown", paidAds: true },
      connectedAt: 1_800_000_000_000,
    })).not.toHaveProperty("accessToken");
    expect(() => MetaConnectionV1Schema.parse({
      schemaVersion: 1, connectionId: "meta-maya", merchantId: "merchant-maya",
      instagramAccountId: "1", encryptedTokenRef: "kms://x", scopes: [], expiresAt: 1,
      capabilities: { reelPublishing: true, trialReels: "unknown", paidAds: false }, connectedAt: 1,
      accessToken: "secret",
    })).toThrow();
  });

  it("allows only constrained SiteSpec V3 sections and immutable assets", () => {
    const spec = SiteSpecV3Schema.parse({
      schemaVersion: 3,
      siteId: "maya-studio",
      merchantId: "merchant-maya",
      businessType: "tailor",
      layoutPreset: "editorial",
      sectionOrder: ["hero", "offerings", "proof", "contact"],
      theme: { accent: "#c54f34", surface: "#fffaf4", text: "#201915", headingFont: "serif", bodyFont: "sans" },
      business: { name: "Maya Studio", description: "Custom blouse stitching in Bengaluru", timezone: "Asia/Kolkata", locale: "en-IN" },
      hero: { headline: "Blouses fitted for you", subheadline: "Custom stitching and alterations", assetId: "asset-maya-hero" },
      offerings: [{ itemId: "custom-blouse", name: "Custom blouse", description: "Made to your measurements", price: { currency: "INR", amountMinor: 150000 }, availability: "available" }],
      proof: [],
      contact: { orderWhatsAppNumber: "+919180499647", fulfillmentArea: "Bengaluru", leadTime: "3–5 days", ctaLabel: "Message to book a fitting" },
      seo: { title: "Maya Studio Bengaluru", description: "Custom blouse stitching and alterations in Bengaluru" },
      publishedAssetIds: ["asset-maya-hero"],
    });
    expect(spec.sectionOrder).toEqual(["hero", "offerings", "proof", "contact"]);
    expect(() => SiteSpecV3Schema.parse({ ...spec, hero: { ...spec.hero, headline: "<script>alert(1)</script>" } })).toThrow();
  });

  it("stores learning only with raw evidence and an adequate denominator", () => {
    expect(LearningArtifactV1Schema.parse({
      schemaVersion: 1,
      learningId: "learning-maya-launch",
      merchantId: "merchant-maya",
      campaignId: "campaign-maya-launch",
      testedDimension: "hook",
      winningVariantId: "maya-hook",
      confidence: 0.18,
      evidenceRefs: ["metric:maya-hook:72h", "metric:maya-cover:72h", "metric:maya-cta:72h"],
      denominators: { mayaHook: 88, mayaCover: 71, mayaCta: 64 },
      applicableFrom: 1_800_259_200_000,
      createdAt: 1_800_259_200_000,
    })).toMatchObject({ testedDimension: "hook" });
    expect(() => LearningArtifactV1Schema.parse({
      schemaVersion: 1, learningId: "learning-bad", merchantId: "merchant-maya", campaignId: "campaign-maya-launch",
      testedDimension: "hook", winningVariantId: "maya-hook", confidence: 0.9,
      evidenceRefs: ["metric:one"], denominators: { mayaHook: 0 }, applicableFrom: 1, createdAt: 1,
    })).toThrow();
  });
});
