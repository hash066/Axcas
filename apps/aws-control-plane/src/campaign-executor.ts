import {
  CampaignApprovalV2Schema,
  CreativeCampaignV2Schema,
  MetaConnectionV1Schema,
  createCampaignScopeHash,
} from "../../../packages/domain/src/production-redesign";

type OrganicReceipt = { containerId: string; mediaId: string; receiptHash: string };
type PaidReceipt = { providerCampaignId: string; providerAdSetId: string; providerAdIds: string[]; receiptHash: string };

type CampaignExecutorDependencies = {
  publishOrganic: (input: { merchantId: string; campaignId: string; variantId: string; reelAssetId: string; caption: string; mode: "normal" | "trial_reel"; connectionId: string }) => Promise<OrganicReceipt>;
  createPaidPaused: (input: { merchantId: string; campaignId: string; variants: Array<{ variantId: string; reelAssetId: string; caption: string }>; connectionId: string; scopeHash: string }) => Promise<PaidReceipt>;
  activatePaid: (input: { merchantId: string; campaignId: string; providerCampaignId: string; approvedBudgetInr: number; scopeHash: string }) => Promise<{ receiptHash: string }>;
  scheduleCheckpoint: (input: { merchantId: string; campaignId: string; channel: "organic" | "paid"; checkpointHours: number; scopeHash: string }) => Promise<void>;
  recordPublication: (record: Record<string, unknown>) => Promise<void>;
};

export async function executeApprovedCampaign(inputValue: unknown, dependencies: CampaignExecutorDependencies) {
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

  const selected = campaign.variants.find((variant) => variant.variantId === campaign.organic.selectedVariantId)!;
  const organicMode = campaign.organic.mode === "trial_if_supported" && connection.capabilities.trialReels === "supported" ? "trial_reel" : "normal";
  const organic = await dependencies.publishOrganic({
    merchantId: campaign.merchantId,
    campaignId: campaign.campaignId,
    variantId: selected.variantId,
    reelAssetId: selected.reelAssetId,
    caption: selected.caption,
    mode: organicMode,
    connectionId: connection.connectionId,
  });
  await dependencies.recordPublication({
    merchantId: campaign.merchantId, campaignId: campaign.campaignId, variantId: selected.variantId,
    mode: organicMode === "trial_reel" ? "trial_reel" : "organic", status: "published", scopeHash,
    providerContainerId: organic.containerId, providerMediaId: organic.mediaId, receiptHash: organic.receiptHash, recordedAt: now,
  });
  for (const checkpointHours of [2, 24, 72]) await dependencies.scheduleCheckpoint({ merchantId: campaign.merchantId, campaignId: campaign.campaignId, channel: "organic", checkpointHours, scopeHash });

  let paidStatus: "DISABLED" | "ACTIVE" = "DISABLED";
  if (campaign.paid.enabled) {
    if (!connection.capabilities.paidAds || !connection.scopes.includes("ads_management") || connection.adAccountId !== campaign.paid.adAccountId || !connection.facebookPageId) {
      throw new Error("merchant Ad Account permission is unavailable");
    }
    const paid = await dependencies.createPaidPaused({
      merchantId: campaign.merchantId,
      campaignId: campaign.campaignId,
      variants: campaign.variants.map(({ variantId, reelAssetId, caption }) => ({ variantId, reelAssetId, caption })),
      connectionId: connection.connectionId,
      scopeHash,
    });
    const activation = await dependencies.activatePaid({
      merchantId: campaign.merchantId,
      campaignId: campaign.campaignId,
      providerCampaignId: paid.providerCampaignId,
      approvedBudgetInr: campaign.paid.lifetimeBudgetInr,
      scopeHash,
    });
    await dependencies.recordPublication({
      merchantId: campaign.merchantId, campaignId: campaign.campaignId, mode: "paid_ad", status: "published", scopeHash,
      providerCampaignId: paid.providerCampaignId, providerAdSetId: paid.providerAdSetId, providerAdIds: paid.providerAdIds,
      receiptHash: activation.receiptHash, preparedReceiptHash: paid.receiptHash, recordedAt: now,
    });
    for (const checkpointHours of [24, 48, 72]) await dependencies.scheduleCheckpoint({ merchantId: campaign.merchantId, campaignId: campaign.campaignId, channel: "paid", checkpointHours, scopeHash });
    paidStatus = "ACTIVE";
  }
  return { status: "measuring" as const, campaignId: campaign.campaignId, scopeHash, organicMode, paidStatus };
}
