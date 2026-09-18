import { describe, expect, it } from "vitest";

import { evaluateCampaignLearning } from "../../packages/social/src/learning-loop";

const base = { schemaVersion: 2 as const, merchantId: "merchant-maya", campaignId: "campaign-maya-launch", channel: "organic" as const, checkpointHours: 72, durationSeconds: 15, impressions: 100, plays: 80, likes: 7, comments: 2, saves: 3, shares: 2, avgWatchTimeSeconds: 8, ctaClicks: 4, spendMinorInr: 0, providerReceiptHash: "a".repeat(64), observedAt: 1_800_259_200_000 };

describe("campaign learning loop", () => {
  it("returns raw-denominator evidence and a tenant-bound winner", () => {
    const result = evaluateCampaignLearning({
      testedDimension: "hook",
      snapshots: [
        { ...base, snapshotId: "snapshot-hook", variantId: "maya-hook", reach: 100, avgWatchTimeSeconds: 11, shares: 8 },
        { ...base, snapshotId: "snapshot-cover", variantId: "maya-cover", reach: 90, avgWatchTimeSeconds: 7 },
        { ...base, snapshotId: "snapshot-cta", variantId: "maya-cta", reach: 80, avgWatchTimeSeconds: 6, ctaClicks: 8 },
      ],
      now: 1_800_259_200_000,
    });
    expect(result.status).toBe("winner");
    if (result.status === "winner") {
      expect(result.artifact.winningVariantId).toBe("maya-hook");
      expect(result.artifact.denominators).toEqual({ "maya-hook": 100, "maya-cover": 90, "maya-cta": 80 });
      expect(result.artifact.evidenceRefs).toEqual(["snapshot-hook", "snapshot-cover", "snapshot-cta"]);
    }
  });

  it("does not invent a winner when any variant lacks signal", () => {
    expect(evaluateCampaignLearning({
      testedDimension: "cover",
      snapshots: [
        { ...base, snapshotId: "snapshot-hook", variantId: "maya-hook", reach: 49 },
        { ...base, snapshotId: "snapshot-cover", variantId: "maya-cover", reach: 90 },
        { ...base, snapshotId: "snapshot-cta", variantId: "maya-cta", reach: 80 },
      ],
      now: 1_800_259_200_000,
    })).toEqual({ status: "insufficient_signal", reason: "minimum_denominator_not_met" });
  });
});
