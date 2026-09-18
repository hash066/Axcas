import { z } from "zod";

import {
  CampaignApprovalV2Schema,
  CreativeCampaignV2Schema,
  createCampaignScopeHash,
  type CampaignApprovalV2,
  type CreativeCampaignV2,
} from "../../domain/src/production-redesign";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type TrialCapability = "unknown" | "supported" | "unsupported";
type TrialPublisher = (input: { graphApiVersion: string; accessToken: string; igUserId: string; videoUrl: string; caption: string }) => Promise<{ containerId: string }>;

const ProviderIdSchema = z.object({ id: z.string().min(1).max(256) });
const ContainerStatusSchema = z.object({ id: z.string().min(1), status_code: z.string().min(1) });

function assertGraphVersion(version: string): void {
  if (!/^v\d+\.\d+$/.test(version)) throw new Error("invalid Graph API version");
}

async function providerId(response: Response, operation: string): Promise<string> {
  if (!response.ok) throw new Error(`${operation} failed with HTTP ${response.status}`);
  return ProviderIdSchema.parse(await response.json()).id;
}

export async function createInstagramReelContainerV2(input: {
  graphApiVersion: string;
  accessToken: string;
  igUserId: string;
  videoUrl: string;
  caption: string;
  mode: "normal" | "trial_reel";
  trialCapability: TrialCapability;
  trialPublisher?: TrialPublisher;
  fetcher?: Fetcher;
}): Promise<{ containerId: string; mode: "normal" | "trial_reel" }> {
  assertGraphVersion(input.graphApiVersion);
  if (!/^\d{3,32}$/.test(input.igUserId)) throw new Error("invalid Instagram account ID");
  if (!input.accessToken) throw new Error("Instagram credential is unavailable");
  if (input.caption.length < 1 || input.caption.length > 2_200) throw new Error("Instagram caption is invalid");
  const videoUrl = new URL(input.videoUrl);
  if (videoUrl.protocol !== "https:") throw new Error("Instagram media URL must use HTTPS");
  if (input.mode === "trial_reel" && input.trialCapability !== "supported") throw new Error("Trial Reel capability has not been proven for this account");
  if (input.mode === "trial_reel") {
    if (!input.trialPublisher) throw new Error("Trial Reel official adapter is unavailable");
    const trial = await input.trialPublisher({
      graphApiVersion: input.graphApiVersion,
      accessToken: input.accessToken,
      igUserId: input.igUserId,
      videoUrl: videoUrl.toString(),
      caption: input.caption,
    });
    return { containerId: z.string().min(1).max(256).parse(trial.containerId), mode: "trial_reel" };
  }

  const body = new URLSearchParams({
    media_type: "REELS",
    video_url: videoUrl.toString(),
    caption: input.caption,
    share_to_feed: "true",
  });
  const response = await (input.fetcher ?? fetch)(`https://graph.facebook.com/${input.graphApiVersion}/${input.igUserId}/media`, {
    method: "POST",
    headers: { authorization: `Bearer ${input.accessToken}`, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  return { containerId: await providerId(response, "Instagram container creation"), mode: input.mode };
}

export async function publishInstagramContainer(input: {
  graphApiVersion: string;
  accessToken: string;
  igUserId: string;
  containerId: string;
  status: "finished";
  fetcher?: Fetcher;
}): Promise<{ mediaId: string }> {
  assertGraphVersion(input.graphApiVersion);
  if (!/^\d{3,32}$/.test(input.igUserId) || !/^[A-Za-z0-9._:-]{3,256}$/.test(input.containerId) || !input.accessToken) {
    throw new Error("invalid Instagram publication input");
  }
  if (input.status !== "finished") throw new Error("Instagram container is not ready");
  const response = await (input.fetcher ?? fetch)(`https://graph.facebook.com/${input.graphApiVersion}/${input.igUserId}/media_publish`, {
    method: "POST",
    headers: { authorization: `Bearer ${input.accessToken}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: input.containerId }),
  });
  return { mediaId: await providerId(response, "Instagram publication") };
}

export async function uploadMetaAdVideo(input: {
  graphApiVersion: string;
  accessToken: string;
  adAccountId: string;
  videoUrl: string;
  name: string;
  fetcher?: Fetcher;
}): Promise<{ videoId: string }> {
  assertGraphVersion(input.graphApiVersion);
  if (!/^act_\d{3,32}$/.test(input.adAccountId) || !input.accessToken || input.name.length < 1 || input.name.length > 200) throw new Error("invalid Meta ad video input");
  const videoUrl = new URL(input.videoUrl);
  if (videoUrl.protocol !== "https:") throw new Error("Meta ad video URL must use HTTPS");
  const response = await (input.fetcher ?? fetch)(`https://graph.facebook.com/${input.graphApiVersion}/${input.adAccountId}/advideos`, {
    method: "POST",
    headers: { authorization: `Bearer ${input.accessToken}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ file_url: videoUrl.toString(), name: input.name }),
  });
  return { videoId: await providerId(response, "Meta ad video upload") };
}

export async function waitForInstagramContainer(input: {
  graphApiVersion: string;
  accessToken: string;
  containerId: string;
  attempts?: number;
  wait?: (milliseconds: number) => Promise<void>;
  fetcher?: Fetcher;
}): Promise<{ status: "finished"; containerId: string }> {
  assertGraphVersion(input.graphApiVersion);
  if (!/^[A-Za-z0-9._:-]{3,256}$/.test(input.containerId)) throw new Error("invalid Instagram container ID");
  const attempts = input.attempts ?? 12;
  const wait = input.wait ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await (input.fetcher ?? fetch)(
      `https://graph.facebook.com/${input.graphApiVersion}/${input.containerId}?fields=id,status_code`,
      { headers: { authorization: `Bearer ${input.accessToken}` } },
    );
    if (!response.ok) throw new Error(`Instagram container status failed with HTTP ${response.status}`);
    const status = ContainerStatusSchema.parse(await response.json());
    if (status.status_code === "FINISHED") return { status: "finished", containerId: input.containerId };
    if (["ERROR", "EXPIRED"].includes(status.status_code)) throw new Error(`Instagram container failed with ${status.status_code}`);
    if (attempt + 1 < attempts) await wait(Math.min(2_000 * (attempt + 1), 10_000));
  }
  throw new Error("Instagram container did not finish before the bounded timeout");
}

async function postGraph(input: {
  graphApiVersion: string;
  accessToken: string;
  path: string;
  body: URLSearchParams;
  operation: string;
  fetcher: Fetcher;
}): Promise<string> {
  const response = await input.fetcher(`https://graph.facebook.com/${input.graphApiVersion}/${input.path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${input.accessToken}`, "content-type": "application/x-www-form-urlencoded" },
    body: input.body,
  });
  return providerId(response, input.operation);
}

export async function createPausedMetaExperiment(input: {
  graphApiVersion: string;
  accessToken: string;
  campaign: CreativeCampaignV2;
  approval: CampaignApprovalV2;
  instagramActorId: string;
  facebookPageId: string;
  providerMediaByVariant: Record<string, string>;
  now: number;
  fetcher?: Fetcher;
}): Promise<{ campaignId: string; adSetId: string; creativeIds: string[]; adIds: string[]; status: "PAUSED" }> {
  assertGraphVersion(input.graphApiVersion);
  const campaign = CreativeCampaignV2Schema.parse(input.campaign);
  const approval = CampaignApprovalV2Schema.parse(input.approval);
  if (!campaign.paid.enabled) throw new Error("paid phase is disabled");
  if (approval.decision !== "approved" || approval.expiresAt < input.now) throw new Error("a current merchant approval is required");
  if (approval.campaignId !== campaign.campaignId || approval.merchantId !== campaign.merchantId) throw new Error("approval scope identity mismatch");
  if (approval.scopeHash !== await createCampaignScopeHash(campaign)) throw new Error("approval scope hash mismatch");
  if (!/^\d{3,32}$/.test(input.instagramActorId)) throw new Error("invalid Instagram actor ID");
  if (!/^\d{3,32}$/.test(input.facebookPageId)) throw new Error("invalid Facebook Page ID");
  for (const variant of campaign.variants) {
    if (!/^[A-Za-z0-9._:-]{3,256}$/.test(input.providerMediaByVariant[variant.variantId] ?? "")) throw new Error(`missing provider media for ${variant.variantId}`);
  }

  const fetcher = input.fetcher ?? fetch;
  const objective = campaign.paid.destination === "site" ? "OUTCOME_TRAFFIC" : "OUTCOME_ENGAGEMENT";
  const providerCampaignId = await postGraph({
    graphApiVersion: input.graphApiVersion, accessToken: input.accessToken, path: `${campaign.paid.adAccountId}/campaigns`, operation: "Meta campaign creation", fetcher,
    body: new URLSearchParams({ name: `Axcas ${campaign.campaignId}`, objective, special_ad_categories: "[]", status: "PAUSED" }),
  });
  const targeting = {
    age_min: campaign.paid.ageMin,
    age_max: campaign.paid.ageMax,
    geo_locations: { cities: [{ key: campaign.paid.cityKey, radius: campaign.paid.radiusKm, distance_unit: "kilometer" }] },
    targeting_automation: { advantage_audience: 1 },
  };
  const adSetId = await postGraph({
    graphApiVersion: input.graphApiVersion, accessToken: input.accessToken, path: `${campaign.paid.adAccountId}/adsets`, operation: "Meta ad set creation", fetcher,
    body: new URLSearchParams({
      name: `Axcas ${campaign.campaignId} experiment`, campaign_id: providerCampaignId,
      lifetime_budget: String(campaign.paid.lifetimeBudgetInr * 100), billing_event: "IMPRESSIONS",
      optimization_goal: campaign.paid.destination === "site" ? "LINK_CLICKS" : "POST_ENGAGEMENT",
      targeting: JSON.stringify(targeting), status: "PAUSED",
    }),
  });

  const creativeIds: string[] = [];
  const adIds: string[] = [];
  for (const variant of campaign.variants) {
    const videoData: Record<string, unknown> = {
      video_id: input.providerMediaByVariant[variant.variantId],
      message: variant.caption,
    };
    if (campaign.paid.destination === "site") videoData.call_to_action = { type: "LEARN_MORE", value: { link: campaign.paid.siteUrl } };
    const objectStorySpec = { page_id: input.facebookPageId, instagram_actor_id: input.instagramActorId, video_data: videoData };
    const creativeId = await postGraph({
      graphApiVersion: input.graphApiVersion, accessToken: input.accessToken, path: `${campaign.paid.adAccountId}/adcreatives`, operation: "Meta ad creative creation", fetcher,
      body: new URLSearchParams({ name: `Axcas ${variant.variantId}`, object_story_spec: JSON.stringify(objectStorySpec) }),
    });
    creativeIds.push(creativeId);
    adIds.push(await postGraph({
      graphApiVersion: input.graphApiVersion, accessToken: input.accessToken, path: `${campaign.paid.adAccountId}/ads`, operation: "Meta ad creation", fetcher,
      body: new URLSearchParams({ name: `Axcas ${variant.variantId}`, adset_id: adSetId, creative: JSON.stringify({ creative_id: creativeId }), status: "PAUSED" }),
    }));
  }
  return { campaignId: providerCampaignId, adSetId, creativeIds, adIds, status: "PAUSED" };
}

export function enforceSpendCeiling(input: { spendMinorInr: number; approvedBudgetMinorInr: number }): "continue" | "stop" {
  if (!Number.isInteger(input.spendMinorInr) || !Number.isInteger(input.approvedBudgetMinorInr) || input.spendMinorInr < 0 || input.approvedBudgetMinorInr <= 0) throw new Error("invalid spend evidence");
  return input.spendMinorInr >= input.approvedBudgetMinorInr ? "stop" : "continue";
}

export async function activateApprovedMetaCampaign(input: {
  graphApiVersion: string;
  accessToken: string;
  providerCampaignId: string;
  campaign: CreativeCampaignV2;
  approval: CampaignApprovalV2;
  now: number;
  fetcher?: Fetcher;
}): Promise<{ status: "ACTIVE"; providerCampaignId: string }> {
  assertGraphVersion(input.graphApiVersion);
  const campaign = CreativeCampaignV2Schema.parse(input.campaign);
  const approval = CampaignApprovalV2Schema.parse(input.approval);
  if (!/^[A-Za-z0-9._:-]{3,256}$/.test(input.providerCampaignId) || !input.accessToken) throw new Error("invalid Meta campaign activation input");
  if (approval.decision !== "approved" || approval.expiresAt < input.now || approval.campaignId !== campaign.campaignId || approval.merchantId !== campaign.merchantId) throw new Error("current campaign approval is required");
  if (approval.scopeHash !== await createCampaignScopeHash(campaign)) throw new Error("campaign approval scope mismatch");
  const response = await (input.fetcher ?? fetch)(`https://graph.facebook.com/${input.graphApiVersion}/${input.providerCampaignId}`, {
    method: "POST",
    headers: { authorization: `Bearer ${input.accessToken}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ status: "ACTIVE" }),
  });
  if (!response.ok || (await response.json() as { success?: boolean }).success !== true) throw new Error("Meta campaign activation failed");
  return { status: "ACTIVE", providerCampaignId: input.providerCampaignId };
}
