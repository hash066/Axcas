import { describe, expect, it, vi } from "vitest";

import { createCampaignScopeHash, CreativeCampaignV2Schema } from "../../packages/domain/src/production-redesign";
import {
  createInstagramReelContainerV2,
  createPausedMetaExperiment,
  activateApprovedMetaCampaign,
  enforceSpendCeiling,
  publishInstagramContainer,
  uploadMetaAdVideo,
  waitForInstagramContainer,
} from "../../packages/social/src/production-client";

const campaignInput = {
  schemaVersion: 2 as const, campaignId: "campaign-maya-launch", merchantId: "merchant-maya", objective: "traffic" as const, platform: "instagram" as const, testedDimension: "hook" as const,
  variants: [
    { variantId: "maya-hook", changedDimension: "hook" as const, hypothesis: "Hook test", reelAssetId: "reel-maya-hook", caption: "Hook", scheduledAt: 1_800_000_000_000 },
    { variantId: "maya-cover", changedDimension: "hook" as const, hypothesis: "Hook test B", reelAssetId: "reel-maya-cover", caption: "Cover", scheduledAt: 1_800_086_400_000 },
    { variantId: "maya-cta", changedDimension: "hook" as const, hypothesis: "Hook test C", reelAssetId: "reel-maya-cta", caption: "CTA", scheduledAt: 1_800_172_800_000 },
  ],
  organic: { mode: "trial_if_supported" as const, selectedVariantId: "maya-hook" },
  paid: { enabled: true as const, adAccountId: "act_123456789", destination: "site" as const, siteUrl: "https://example.cloudfront.net/s/maya-studio", city: "Bengaluru", cityKey: "1027592", radiusKm: 10, ageMin: 18 as const, ageMax: 65, lifetimeBudgetInr: 300, durationDays: 3 as const, automaticPlacements: true as const },
  explorationRate: 0.15, createdAt: 1_799_999_000_000,
};

describe("production Meta boundary", () => {
  it("uses Trial Reel parameters only after a supported capability was recorded", async () => {
    const trialPublisher = vi.fn(async () => ({ containerId: "container-1" }));
    await expect(createInstagramReelContainerV2({
      graphApiVersion: "v26.0", accessToken: "secret", igUserId: "178900001", videoUrl: "https://media.example/reel.mp4", caption: "A real Reel", mode: "trial_reel", trialCapability: "supported", trialPublisher,
    })).resolves.toEqual({ containerId: "container-1", mode: "trial_reel" });
    expect(trialPublisher).toHaveBeenCalledOnce();
    await expect(createInstagramReelContainerV2({
      graphApiVersion: "v26.0", accessToken: "secret", igUserId: "178900001", videoUrl: "https://media.example/reel.mp4", caption: "A real Reel", mode: "trial_reel", trialCapability: "unknown", trialPublisher,
    })).rejects.toThrow(/capability/i);
    await expect(createInstagramReelContainerV2({
      graphApiVersion: "v26.0", accessToken: "secret", igUserId: "178900001", videoUrl: "https://media.example/reel.mp4", caption: "A real Reel", mode: "trial_reel", trialCapability: "supported",
    })).rejects.toThrow(/official adapter/i);
  });

  it("waits for FINISHED and fails closed on provider errors", async () => {
    const statuses = ["IN_PROGRESS", "FINISHED"];
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: "container-1", status_code: statuses.shift() }), { status: 200 }));
    await expect(waitForInstagramContainer({ graphApiVersion: "v26.0", accessToken: "secret", containerId: "container-1", fetcher, wait: async () => undefined, attempts: 3 })).resolves.toEqual({ status: "finished", containerId: "container-1" });
  });

  it("publishes only a finished container and returns the provider media ID", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: "media-123" }), { status: 200 }));
    await expect(publishInstagramContainer({ graphApiVersion: "v26.0", accessToken: "secret", igUserId: "178900001", containerId: "container-1", status: "finished", fetcher })).resolves.toEqual({ mediaId: "media-123" });
  });

  it("uploads merchant video into the merchant Ad Account before creative creation", async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("file_url")).toBe("https://media.example/variant.mp4");
      return new Response(JSON.stringify({ id: "ad-video-123" }), { status: 200 });
    });
    await expect(uploadMetaAdVideo({ graphApiVersion: "v26.0", accessToken: "secret", adAccountId: "act_123456789", videoUrl: "https://media.example/variant.mp4", name: "Maya hook", fetcher })).resolves.toEqual({ videoId: "ad-video-123" });
  });

  it("creates paid resources paused and binds them to the exact approved campaign", async () => {
    const campaign = CreativeCampaignV2Schema.parse(campaignInput);
    const approval = { schemaVersion: 2 as const, approvalId: "approval-maya-launch", campaignId: campaign.campaignId, merchantId: campaign.merchantId, ownerWaIdHash: "a".repeat(64), scopeHash: await createCampaignScopeHash(campaign), expiresAt: 1_800_010_000_000, decision: "approved" as const, decidedAt: 1_800_000_100_000 };
    let counter = 0;
    const bodies: URLSearchParams[] = [];
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(new URLSearchParams(String(init?.body)));
      counter += 1;
      return new Response(JSON.stringify({ id: `provider-${counter}` }), { status: 200 });
    });
    const result = await createPausedMetaExperiment({ graphApiVersion: "v26.0", accessToken: "secret", campaign, approval, instagramActorId: "178900001", facebookPageId: "190000001", providerMediaByVariant: { "maya-hook": "media-1", "maya-cover": "media-2", "maya-cta": "media-3" }, now: 1_800_000_100_000, fetcher });
    expect(result.status).toBe("PAUSED");
    expect(result.adIds).toHaveLength(3);
    expect(bodies.every((body) => body.get("status") === "PAUSED" || body.get("status") === null)).toBe(true);
    expect(bodies.some((body) => body.get("lifetime_budget") === "30000")).toBe(true);
    expect(bodies.some((body) => body.get("targeting")?.includes('"key":"1027592"'))).toBe(true);
    expect(bodies.filter((body) => body.has("object_story_spec"))).toHaveLength(3);
  });

  it("stops at the approved spend ceiling", () => {
    expect(enforceSpendCeiling({ spendMinorInr: 29_999, approvedBudgetMinorInr: 30_000 })).toBe("continue");
    expect(enforceSpendCeiling({ spendMinorInr: 30_000, approvedBudgetMinorInr: 30_000 })).toBe("stop");
  });

  it("activates only the provider campaign bound to an exact current approval", async () => {
    const campaign = CreativeCampaignV2Schema.parse(campaignInput);
    const approval = { schemaVersion: 2 as const, approvalId: "approval-maya-launch", campaignId: campaign.campaignId, merchantId: campaign.merchantId, ownerWaIdHash: "a".repeat(64), scopeHash: await createCampaignScopeHash(campaign), expiresAt: 1_800_010_000_000, decision: "approved" as const, decidedAt: 1_800_000_100_000 };
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new URLSearchParams(String(init?.body)).get("status")).toBe("ACTIVE");
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    await expect(activateApprovedMetaCampaign({ graphApiVersion: "v26.0", accessToken: "secret", providerCampaignId: "provider-1", campaign, approval, now: 1_800_000_100_000, fetcher })).resolves.toEqual({ status: "ACTIVE", providerCampaignId: "provider-1" });
    const editedCampaign = CreativeCampaignV2Schema.parse({ ...campaignInput, paid: { ...campaignInput.paid, lifetimeBudgetInr: 500 } });
    await expect(activateApprovedMetaCampaign({ graphApiVersion: "v26.0", accessToken: "secret", providerCampaignId: "provider-1", campaign: editedCampaign, approval, now: 1_800_000_100_000, fetcher })).rejects.toThrow(/scope/i);
  });
});
