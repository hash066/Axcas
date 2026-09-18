import { describe, expect, it, vi } from "vitest";

import { CreativeCampaignV2Schema, createCampaignScopeHash } from "../../packages/domain/src/production-redesign";
import { createCampaignExecutionHandler, runCampaignRuntime } from "../../apps/aws-control-plane/src/campaign-runtime";

const campaign = CreativeCampaignV2Schema.parse({
  schemaVersion: 2, campaignId: "campaign-maya", merchantId: "merchant-maya", objective: "traffic", platform: "instagram", testedDimension: "hook",
  variants: [
    { variantId: "maya-a", changedDimension: "hook", hypothesis: "Question", reelAssetId: "reel-maya-a", caption: "A", scheduledAt: 1_800_000_000_000 },
    { variantId: "maya-b", changedDimension: "hook", hypothesis: "Outcome", reelAssetId: "reel-maya-b", caption: "B", scheduledAt: 1_800_000_000_000 },
    { variantId: "maya-c", changedDimension: "hook", hypothesis: "Proof", reelAssetId: "reel-maya-c", caption: "C", scheduledAt: 1_800_000_000_000 },
  ],
  organic: { mode: "normal", selectedVariantId: "maya-a" }, paid: { enabled: false }, explorationRate: 0.15, createdAt: 1_799_000_000_000,
});

async function envelope() {
  return {
    schemaVersion: 1 as const, executionId: "execution-maya", campaign,
    approval: { schemaVersion: 2 as const, approvalId: "approval-maya", campaignId: campaign.campaignId, merchantId: campaign.merchantId, ownerWaIdHash: "a".repeat(64), scopeHash: await createCampaignScopeHash(campaign), expiresAt: 1_801_000_000_000, decision: "approved" as const, decidedAt: 1_800_000_000_000 },
    connection: { schemaVersion: 1 as const, connectionId: "meta-maya", merchantId: "merchant-maya", instagramAccountId: "178900001", encryptedTokenRef: "kms://dynamodb/merchant-maya/meta-maya", scopes: ["instagram_content_publish"] as const, expiresAt: 1_900_000_000_000, capabilities: { reelPublishing: true, trialReels: "unsupported" as const, paidAds: false }, connectedAt: 1 },
    requestedAt: 1_800_000_000_000,
  };
}

describe("campaign execution runtime", () => {
  it("claims one execution, records append-only lifecycle evidence, and persists measuring state", async () => {
    const claimExecution = vi.fn(async () => true);
    const execute = vi.fn(async () => ({ status: "measuring" as const, campaignId: campaign.campaignId, scopeHash: await createCampaignScopeHash(campaign), organicMode: "normal" as const, paidStatus: "DISABLED" as const }));
    const appendEvidence = vi.fn(async (_record: Record<string, unknown>) => undefined);
    const putState = vi.fn(async (_record: Record<string, unknown>) => undefined);
    const result = await runCampaignRuntime(await envelope(), { claimExecution, execute, appendEvidence, putState, now: () => 1_800_000_100_000 });
    expect(result.status).toBe("measuring");
    expect(claimExecution).toHaveBeenCalledWith(expect.objectContaining({ executionId: "execution-maya", scopeHash: await createCampaignScopeHash(campaign) }));
    expect(appendEvidence).toHaveBeenCalledTimes(2);
    expect(appendEvidence.mock.calls[0]?.[0]).toMatchObject({ eventType: "campaign_execution_started", scopeHash: await createCampaignScopeHash(campaign) });
    expect(appendEvidence.mock.calls[1]?.[0]).toMatchObject({ eventType: "campaign_execution_completed", scopeHash: await createCampaignScopeHash(campaign) });
    expect(putState).toHaveBeenCalledWith(expect.objectContaining({ pk: "CAMPAIGN#campaign-maya", sk: "CURRENT", status: "measuring" }));
  });

  it("returns an idempotent duplicate result without executing providers", async () => {
    const execute = vi.fn();
    const result = await runCampaignRuntime(await envelope(), { claimExecution: vi.fn(async () => false), execute, appendEvidence: vi.fn(), putState: vi.fn(), now: () => 1_800_000_100_000 });
    expect(result).toEqual({ status: "duplicate", executionId: "execution-maya", campaignId: "campaign-maya" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects an edited campaign before claiming the execution", async () => {
    const value = await envelope();
    value.approval.scopeHash = "f".repeat(64);
    const claimExecution = vi.fn();
    await expect(runCampaignRuntime(value, { claimExecution, execute: vi.fn(), appendEvidence: vi.fn(), putState: vi.fn() })).rejects.toThrow("exact current campaign approval");
    expect(claimExecution).not.toHaveBeenCalled();
  });

  it("composes the runtime with the approved executor without exposing provider credentials", async () => {
    const publishOrganic = vi.fn(async () => ({ containerId: "container-1", mediaId: "media-1", receiptHash: "b".repeat(64) }));
    const handler = createCampaignExecutionHandler({
      claimExecution: vi.fn(async () => true),
      appendEvidence: vi.fn(async () => undefined),
      putState: vi.fn(async () => undefined),
      now: () => 1_800_000_100_000,
    }, {
      publishOrganic,
      createPaidPaused: vi.fn(),
      activatePaid: vi.fn(),
      scheduleCheckpoint: vi.fn(async () => undefined),
      recordPublication: vi.fn(async () => undefined),
    });
    const result = await handler(await envelope());
    expect(result).toMatchObject({ status: "measuring", paidStatus: "DISABLED" });
    expect(publishOrganic).toHaveBeenCalledWith(expect.not.objectContaining({ token: expect.anything(), encryptedTokenRef: expect.anything() }));
  });
});
