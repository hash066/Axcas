import { createHash } from "node:crypto";

import {
  CampaignApprovalV2Schema,
  CreativeCampaignV2Schema,
  MetaConnectionV1Schema,
  createCampaignScopeHash,
} from "../../../packages/domain/src/production-redesign";

type OrganicReceipt = { containerId: string; mediaId: string; receiptHash: string };
type PaidReceipt = {
  providerCampaignId: string;
  providerAdSetId: string;
  providerAdIds: string[];
  receiptHash: string;
  status: "PAUSED";
  lifetimeBudgetInr: number;
};

type ApprovedCampaignExecution = {
  campaign: ReturnType<typeof CreativeCampaignV2Schema.parse>;
  approval: ReturnType<typeof CampaignApprovalV2Schema.parse>;
  connection: ReturnType<typeof MetaConnectionV1Schema.parse>;
  now: number;
  scopeHash: string;
};

export type CampaignExecutorDependencies = {
  publishOrganic: (input: { merchantId: string; campaignId: string; variantId: string; reelAssetId: string; caption: string; mode: "normal" | "trial_reel"; connectionId: string; idempotencyKey: string }) => Promise<OrganicReceipt>;
  createPaidPaused: (input: { merchantId: string; campaignId: string; variants: Array<{ variantId: string; reelAssetId: string; caption: string }>; connectionId: string; scopeHash: string; idempotencyKey: string }) => Promise<PaidReceipt>;
  activatePaid: (input: { merchantId: string; campaignId: string; providerCampaignId: string; approvedBudgetInr: number; preparedBudgetInr: number; scopeHash: string; idempotencyKey: string }) => Promise<{ receiptHash: string; status: "ACTIVE"; lifetimeBudgetInr: number }>;
  scheduleCheckpoint: (input: { merchantId: string; campaignId: string; channel: "organic" | "paid"; checkpointHours: number; scopeHash: string; idempotencyKey: string }) => Promise<void>;
  recordPublication: (record: Record<string, unknown>) => Promise<void>;
};

function actionKey(scopeHash: string, action: string): string {
  return createHash("sha256").update(`${scopeHash}:${action}`).digest("hex");
}

function assertReceiptHash(value: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("provider receipt is invalid");
}

function assertProviderId(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(value)) throw new Error("provider receipt identifier is invalid");
}

export async function validateApprovedCampaignExecution(inputValue: unknown): Promise<ApprovedCampaignExecution> {
  const input = inputValue as { campaign?: unknown; approval?: unknown; connection?: unknown; now?: unknown };
  const campaign = CreativeCampaignV2Schema.parse(input.campaign);
  const approval = CampaignApprovalV2Schema.parse(input.approval);
  const connection = MetaConnectionV1Schema.parse(input.connection);
  const now = Number(input.now);
  if (!Number.isInteger(now) || now < 0) throw new Error("campaign execution time is invalid");
  const scopeHash = await createCampaignScopeHash(campaign);
  if (approval.decision !== "approved" || approval.expiresAt < now || approval.scopeHash !== scopeHash) throw new Error("exact current campaign approval is required");
  if (approval.merchantId !== campaign.merchantId || approval.campaignId !== campaign.campaignId) throw new Error("campaign approval identity mismatch");
  if (connection.merchantId !== campaign.merchantId || connection.expiresAt < now || connection.revokedAt) throw new Error("active merchant Meta connection is required");
  if (!connection.capabilities.reelPublishing || !connection.scopes.includes("instagram_content_publish")) throw new Error("Instagram publishing permission is unavailable");
  if (campaign.paid.enabled && (!connection.capabilities.paidAds || !connection.scopes.includes("ads_management") || connection.adAccountId !== campaign.paid.adAccountId || !connection.facebookPageId)) {
    throw new Error("merchant Ad Account permission is unavailable");
  }
  return { campaign, approval, connection, now, scopeHash };
}

export async function executeApprovedCampaign(inputValue: unknown, dependencies: CampaignExecutorDependencies) {
  const { campaign, connection, now, scopeHash } = await validateApprovedCampaignExecution(inputValue);

  const selected = campaign.variants.find((variant) => variant.variantId === campaign.organic.selectedVariantId)!;
  const organicMode: "trial_reel" | "normal" = campaign.organic.mode === "trial_if_supported" && connection.capabilities.trialReels === "supported" ? "trial_reel" : "normal";
  const organicIdempotencyKey = actionKey(scopeHash, `organic:${selected.variantId}:${organicMode}`);
  const organic = await dependencies.publishOrganic({
    merchantId: campaign.merchantId,
    campaignId: campaign.campaignId,
    variantId: selected.variantId,
    reelAssetId: selected.reelAssetId,
    caption: selected.caption,
    mode: organicMode,
    connectionId: connection.connectionId,
    idempotencyKey: organicIdempotencyKey,
  });
  assertReceiptHash(organic.receiptHash);
  assertProviderId(organic.containerId);
  assertProviderId(organic.mediaId);
  await dependencies.recordPublication({
    merchantId: campaign.merchantId, campaignId: campaign.campaignId, variantId: selected.variantId,
    mode: organicMode === "trial_reel" ? "trial_reel" : "organic", status: "published", scopeHash,
    providerContainerId: organic.containerId, providerMediaId: organic.mediaId, receiptHash: organic.receiptHash, recordedAt: now,
    idempotencyKey: organicIdempotencyKey,
  });
  for (const checkpointHours of [2, 24, 72]) await dependencies.scheduleCheckpoint({ merchantId: campaign.merchantId, campaignId: campaign.campaignId, channel: "organic", checkpointHours, scopeHash, idempotencyKey: actionKey(scopeHash, `checkpoint:organic:${checkpointHours}`) });

  let paidStatus: "DISABLED" | "ACTIVE" = "DISABLED";
  if (campaign.paid.enabled) {
    const paid = await dependencies.createPaidPaused({
      merchantId: campaign.merchantId,
      campaignId: campaign.campaignId,
      variants: campaign.variants.map(({ variantId, reelAssetId, caption }) => ({ variantId, reelAssetId, caption })),
      connectionId: connection.connectionId,
      scopeHash,
      idempotencyKey: actionKey(scopeHash, "paid:prepare"),
    });
    assertReceiptHash(paid.receiptHash);
    assertProviderId(paid.providerCampaignId);
    assertProviderId(paid.providerAdSetId);
    if (paid.providerAdIds.length !== 3 || new Set(paid.providerAdIds).size !== 3) throw new Error("provider did not prepare exactly three distinct ads");
    paid.providerAdIds.forEach(assertProviderId);
    if (paid.status !== "PAUSED" || paid.lifetimeBudgetInr !== campaign.paid.lifetimeBudgetInr) {
      throw new Error("prepared campaign does not match the approved spend ceiling");
    }
    const activation = await dependencies.activatePaid({
      merchantId: campaign.merchantId,
      campaignId: campaign.campaignId,
      providerCampaignId: paid.providerCampaignId,
      approvedBudgetInr: campaign.paid.lifetimeBudgetInr,
      preparedBudgetInr: paid.lifetimeBudgetInr,
      scopeHash,
      idempotencyKey: actionKey(scopeHash, "paid:activate"),
    });
    assertReceiptHash(activation.receiptHash);
    if (activation.status !== "ACTIVE" || activation.lifetimeBudgetInr !== campaign.paid.lifetimeBudgetInr) {
      throw new Error("provider activation exceeded the approved spend ceiling");
    }
    await dependencies.recordPublication({
      merchantId: campaign.merchantId, campaignId: campaign.campaignId, mode: "paid_ad", status: "published", scopeHash,
      providerCampaignId: paid.providerCampaignId, providerAdSetId: paid.providerAdSetId, providerAdIds: paid.providerAdIds,
      receiptHash: activation.receiptHash, preparedReceiptHash: paid.receiptHash, recordedAt: now,
      idempotencyKey: actionKey(scopeHash, "paid:publication"), approvedLifetimeBudgetInr: campaign.paid.lifetimeBudgetInr,
    });
    for (const checkpointHours of [24, 48, 72]) await dependencies.scheduleCheckpoint({ merchantId: campaign.merchantId, campaignId: campaign.campaignId, channel: "paid", checkpointHours, scopeHash, idempotencyKey: actionKey(scopeHash, `checkpoint:paid:${checkpointHours}`) });
    paidStatus = "ACTIVE";
  }
  return { status: "measuring" as const, campaignId: campaign.campaignId, scopeHash, organicMode, paidStatus };
}
