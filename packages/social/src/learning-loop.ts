import {
  LearningArtifactV1Schema,
  MetricSnapshotV2Schema,
  type LearningArtifactV1,
} from "../../domain/src/production-redesign";

export type CampaignLearningResult =
  | { status: "insufficient_signal"; reason: "three_comparable_variants_required" | "minimum_denominator_not_met" | "mixed_campaign_scope" }
  | { status: "winner"; artifact: LearningArtifactV1; scores: Record<string, number> };

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function score(snapshot: ReturnType<typeof MetricSnapshotV2Schema.parse>): number {
  const denominator = Math.max(1, snapshot.channel === "paid" ? snapshot.impressions : snapshot.reach);
  const watchRate = clamp(snapshot.avgWatchTimeSeconds / snapshot.durationSeconds);
  const meaningfulEngagement = clamp((snapshot.likes + snapshot.comments * 2 + snapshot.saves * 3 + snapshot.shares * 4) / denominator);
  const clickRate = clamp(snapshot.ctaClicks / denominator);
  return watchRate * 0.45 + meaningfulEngagement * 0.35 + clickRate * 0.2;
}

export function evaluateCampaignLearning(input: {
  testedDimension: "hook" | "cover" | "cta";
  snapshots: unknown[];
  now: number;
}): CampaignLearningResult {
  const snapshots = input.snapshots.map((snapshot) => MetricSnapshotV2Schema.parse(snapshot));
  if (snapshots.length !== 3 || new Set(snapshots.map((snapshot) => snapshot.variantId)).size !== 3) {
    return { status: "insufficient_signal", reason: "three_comparable_variants_required" };
  }
  const merchantIds = new Set(snapshots.map((snapshot) => snapshot.merchantId));
  const campaignIds = new Set(snapshots.map((snapshot) => snapshot.campaignId));
  const channels = new Set(snapshots.map((snapshot) => snapshot.channel));
  if (merchantIds.size !== 1 || campaignIds.size !== 1 || channels.size !== 1) return { status: "insufficient_signal", reason: "mixed_campaign_scope" };

  const channel = snapshots[0].channel;
  const denominators = Object.fromEntries(snapshots.map((snapshot) => [snapshot.variantId, channel === "paid" ? snapshot.impressions : snapshot.reach]));
  const denominatorValues = Object.values(denominators);
  const adequate = channel === "organic"
    ? denominatorValues.every((value) => value >= 50)
    : denominatorValues.every((value) => value >= 250) && denominatorValues.reduce((total, value) => total + value, 0) >= 1_000;
  if (!adequate) return { status: "insufficient_signal", reason: "minimum_denominator_not_met" };

  const ranked = snapshots.map((snapshot) => ({ snapshot, score: score(snapshot) }))
    .sort((left, right) => right.score - left.score || right.snapshot.reach - left.snapshot.reach || left.snapshot.variantId.localeCompare(right.snapshot.variantId));
  const scores = Object.fromEntries(ranked.map((entry) => [entry.snapshot.variantId, entry.score]));
  const winning = ranked[0];
  const confidence = clamp(winning.score - ranked[1].score);
  const artifact = LearningArtifactV1Schema.parse({
    schemaVersion: 1,
    learningId: `learning-${winning.snapshot.campaignId}-${input.now}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 64),
    merchantId: winning.snapshot.merchantId,
    campaignId: winning.snapshot.campaignId,
    testedDimension: input.testedDimension,
    winningVariantId: winning.snapshot.variantId,
    confidence,
    evidenceRefs: snapshots.map((snapshot) => snapshot.snapshotId),
    denominators,
    applicableFrom: input.now,
    createdAt: input.now,
  });
  return { status: "winner", artifact, scores };
}
