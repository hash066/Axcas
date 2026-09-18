import { describe, expect, it, vi } from "vitest";

import { createCampaignScopeHash, CreativeCampaignV2Schema } from "../../packages/domain/src/production-redesign";
import { executeApprovedCampaign } from "../../apps/aws-control-plane/src/campaign-executor";

const campaign = CreativeCampaignV2Schema.parse({
  schemaVersion: 2, campaignId: "campaign-maya", merchantId: "merchant-maya", objective: "traffic", platform: "instagram", testedDimension: "hook",
  variants: [
    { variantId: "maya-a", changedDimension: "hook", hypothesis: "Question", reelAssetId: "reel-maya-a", caption: "A", scheduledAt: 1_800_000_000_000 },
    { variantId: "maya-b", changedDimension: "hook", hypothesis: "Outcome", reelAssetId: "reel-maya-b", caption: "B", scheduledAt: 1_800_000_000_000 },
    { variantId: "maya-c", changedDimension: "hook", hypothesis: "Proof", reelAssetId: "reel-maya-c", caption: "C", scheduledAt: 1_800_000_000_000 },
  ],
  organic: { mode: "trial_if_supported", selectedVariantId: "maya-a" },
  paid: { enabled: true, adAccountId: "act_123456789", destination: "site", siteUrl: "https://site.example/s/maya", city: "Bengaluru", cityKey: "1027592", radiusKm: 10, ageMin: 18, ageMax: 65, lifetimeBudgetInr: 300, durationDays: 3, automaticPlacements: true },
  explorationRate: 0.15, createdAt: 1_799_000_000_000,
});

describe("approved campaign executor", () => {
  it("uses one exact approval for one organic publication, one paid experiment and metric checkpoints", async () => {
    const approval = { schemaVersion: 2 as const, approvalId: "approval-maya", campaignId: campaign.campaignId, merchantId: campaign.merchantId, ownerWaIdHash: "a".repeat(64), scopeHash: await createCampaignScopeHash(campaign), expiresAt: 1_801_000_000_000, decision: "approved" as const, decidedAt: 1_800_000_000_000 };
    const publishOrganic = vi.fn(async () => ({ containerId: "container-1", mediaId: "media-1", receiptHash: "b".repeat(64) }));
    const createPaidPaused = vi.fn(async () => ({ providerCampaignId: "campaign-1", providerAdSetId: "adset-1", providerAdIds: ["ad-1", "ad-2", "ad-3"], receiptHash: "c".repeat(64) }));
    const activatePaid = vi.fn(async () => ({ receiptHash: "d".repeat(64) }));
    const scheduleCheckpoint = vi.fn(async () => undefined);
    const recordPublication = vi.fn(async () => undefined);
    const result = await executeApprovedCampaign({ campaign, approval, connection: {
      schemaVersion: 1, connectionId: "meta-maya", merchantId: "merchant-maya", instagramAccountId: "178900001", facebookPageId: "190000001", adAccountId: "act_123456789", encryptedTokenRef: "kms://dynamodb/merchant-maya/meta-maya", scopes: ["instagram_content_publish", "ads_management", "read_insights"], expiresAt: 1_900_000_000_000, capabilities: { reelPublishing: true, trialReels: "unsupported", paidAds: true }, connectedAt: 1_700_000_000_000,
    }, now: 1_800_000_100_000 }, { publishOrganic, createPaidPaused, activatePaid, scheduleCheckpoint, recordPublication });
    expect(result).toMatchObject({ status: "measuring", organicMode: "normal", paidStatus: "ACTIVE" });
    expect(publishOrganic).toHaveBeenCalledWith(expect.objectContaining({ mode: "normal", variantId: "maya-a" }));
    expect(createPaidPaused).toHaveBeenCalledOnce();
    expect(activatePaid).toHaveBeenCalledWith(expect.objectContaining({ providerCampaignId: "campaign-1", approvedBudgetInr: 300 }));
    expect(scheduleCheckpoint).toHaveBeenCalledTimes(6);
    expect(recordPublication).toHaveBeenCalledTimes(2);
  });

  it("refuses expired or edited approvals before any provider action", async () => {
    const approval = { schemaVersion: 2 as const, approvalId: "approval-maya", campaignId: campaign.campaignId, merchantId: campaign.merchantId, ownerWaIdHash: "a".repeat(64), scopeHash: "f".repeat(64), expiresAt: 1_800_000_000_000, decision: "approved" as const, decidedAt: 1_799_000_000_000 };
    const publishOrganic = vi.fn();
    await expect(executeApprovedCampaign({ campaign, approval, connection: {
      schemaVersion: 1, connectionId: "meta-maya", merchantId: "merchant-maya", instagramAccountId: "178900001", encryptedTokenRef: "kms://dynamodb/merchant-maya/meta-maya", scopes: ["instagram_content_publish"], expiresAt: 1_900_000_000_000, capabilities: { reelPublishing: true, trialReels: "unknown", paidAds: false }, connectedAt: 1,
    }, now: 1_800_000_100_000 }, { publishOrganic, createPaidPaused: vi.fn(), activatePaid: vi.fn(), scheduleCheckpoint: vi.fn(), recordPublication: vi.fn() })).rejects.toThrow();
    expect(publishOrganic).not.toHaveBeenCalled();
  });
});
