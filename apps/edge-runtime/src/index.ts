import { Hono } from "hono";
import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../convex/_generated/api";
import { initialSpikeSiteSpec, SiteSpecSchema } from "../../../packages/domain/src/site-spec";
import { BusinessBriefInputSchema, BusinessBriefSchema, LeadConsentSchema, ReelPlanSchema, SiteSpecV2Schema, type BusinessBriefV1, type LeadConsentV1, type ReelPlanV1, type SiteSpecV2 } from "../../../packages/domain/src/growth";
import { StudioIntakeInputSchema, StudioIntentSchema, StudioProjectInputSchema, formatApprovalChecklist, reelAngleLabel, siteDisplayName, type StudioIntent, type StudioProjectInput } from "../../../packages/domain/src/studio";
import { CustomerOutboxMessageSchema, WorkflowProgressSchema, WorkflowStatusSchema, customerProgressMessage, decodeProjectCursor, encodeProjectCursor, nextProjectCursor, type ProjectSyncCursor } from "../../../packages/domain/src/workflow";
import { quotaExceededCustomerMessage, type UsageMetric, type UsageReservationBatch } from "../../../packages/domain/src/usage";
import { buildStudioReelPlan, buildStudioWebsite, MissingStudioFactsError, studioProjectFromBusinessBrief } from "../../../packages/domain/src/studio-builder";
import { ReelRenderEvidenceSchema, type ReelRenderEvidence } from "../../../packages/domain/src/reel-evidence";
import { deriveTenantIdentity, tenantScopedAssetId } from "../../../packages/domain/src/tenant";
import { DecisionPolicySchema, DecisionRequestSchema, evaluateDecision, type DecisionPolicyV1 } from "../../../packages/domain/src/decision-policy";
import { renderBusinessSite } from "../../../packages/renderer/src/render-bakery-site";
import { renderProductHome } from "../../../packages/renderer/src/render-product-home";
import { renderDemoSandbox } from "../../../packages/renderer/src/render-demo-sandbox";
import { renderStudio, renderStudioCss } from "../../../packages/renderer/src/render-studio";
import { renderStudioClientJs } from "../../../packages/renderer/src/render-studio-client";
import { renderDataDeletion, renderPrivacyPolicy, renderTermsOfService } from "../../../packages/renderer/src/render-legal";
import { renderSite } from "../../../packages/renderer/src/render-site";
import { authenticateVapiWebhook } from "../../../packages/calls/src/vapi";
import { createQualificationCall } from "../../../packages/calls/src/vapi-client";
import { CallArtifactCopyReceiptSchema } from "../../../packages/calls/src/attempts";
import { createCallBatch, type CallBatch } from "../../../packages/release-policy/src/growth-policy";
import { createSocialCampaign, type SocialCampaign } from "../../../packages/social/src/experiment";
import { sendActionRequiredTemplate, sendApprovalButtons, sendTextMessage, sendVideoByMediaId, uploadMetaMedia } from "../../../packages/whatsapp-io/src/meta-client";
import { extractProofGateApproval, extractStudioLinkMessage, verifyMetaWebhookSignature } from "../../../packages/whatsapp-io/src/meta-webhook";

export type Bindings = {
  CONVEX_URL?: string;
  CONVEX_SERVICE_SECRET?: string;
  META_APP_SECRET?: string;
  META_VERIFY_TOKEN?: string;
  VAPI_WEBHOOK_SECRET?: string;
  VAPI_API_KEY?: string;
  VAPI_PHONE_NUMBER_ID?: string;
  VAPI_SQUAD_ID?: string;
  CALLING_LIVE_ENABLED?: string;
  HERMES_ORIGIN_URL?: string;
  HERMES_PROXY_SECRET?: string;
  PROOFGATE_SERVICE_SECRET?: string;
  PROOFGATE_DATA_KEY?: string;
  META_GRAPH_API_VERSION?: string;
  META_PHONE_NUMBER_ID?: string;
  META_ACCESS_TOKEN?: string;
  META_ACTION_REQUIRED_TEMPLATE?: string;
  AXCAS_WHATSAPP_NUMBER?: string;
  SITE_VERIFIER_URL?: string;
  PROOFGATE_ASSETS?: R2Bucket;
  PROOFGATE_CONFIG?: KVNamespace;
};
type AcknowledgmentResult = { inserted: boolean; passportState: "amber" | "green" };
type EvidenceBoundary = {
  acknowledge: (token: string, convexUrl?: string) => Promise<AcknowledgmentResult>;
};

export type StudioVerifierBoundary = {
  run: (input: {
    verifierUrl: string;
    previewUrl: string;
    evidenceUrl: string;
    siteId: string;
    versionId: string;
    specHash: string;
  }) => Promise<{ accepted: boolean; passed: boolean; blockers: string[]; runId: string }>;
};

export type GrowthEvent = {
  eventId: string;
  type: "page_view" | "whatsapp_cta_click";
  siteId: string;
  versionId: string;
  specHash: string;
  sessionHash: string;
  itemId?: string;
  source?: string;
  campaign?: string;
  occurredAt: number;
};

export type GrowthBoundary = {
  getPublishedSite: (slug: string, bindings?: Bindings) => Promise<{ spec: SiteSpecV2; versionId: string; specHash: string; passportState: "gray" | "amber" | "green" | "red" } | null>;
  appendEvent: (event: GrowthEvent, bindings?: Bindings) => Promise<void>;
  resolveApproval: (tap: NonNullable<ReturnType<typeof extractProofGateApproval>>, bindings?: Bindings) => Promise<{ accepted: boolean }>;
  ingestVapiReport: (payload: unknown, bindings?: Bindings) => Promise<{ accepted: boolean }>;
  forwardToHermes: (body: Uint8Array, headers: Headers, bindings?: Bindings) => Promise<Response>;
  getAsset: (assetId: string, bindings?: Bindings) => Promise<{ body: Uint8Array; contentType: string; etag: string } | null>;
  submitVerification: (input: { tokenHash: string; evidenceId: string; siteId: string; versionId: string; specHash: string; runId: string; reportHash: string; passed: boolean; blockers: string[]; observedAt: number }, bindings?: Bindings) => Promise<{ accepted: boolean }>;
};

export type GrowthAdminBoundary = {
  upsertMerchant: (brief: BusinessBriefV1, encryptedOrderNumber: string, bindings?: Bindings) => Promise<unknown>;
  createCandidate: (input: { spec: SiteSpecV2; versionId: string; parentVersionId?: string; specHash: string; actor: string }, bindings?: Bindings) => Promise<unknown>;
  getPreviewSite: (siteId: string, versionId: string, specHash: string, bindings?: Bindings) => Promise<{ spec: SiteSpecV2; versionId: string; specHash: string } | null>;
  registerLead: (merchantId: string, consent: LeadConsentV1, bindings?: Bindings) => Promise<unknown>;
  createApproval: (input: { approvalId: string; merchantId: string; type: "release" | "call_batch" | "reel" | "social_campaign"; scopeHash: string; expiresAt: number; checklist?: string }, bindings?: Bindings) => Promise<unknown>;
  listMerchantApprovals: (merchantId: string, bindings?: Bindings) => Promise<Array<{ approvalId: string; type: "release" | "call_batch" | "reel" | "social_campaign"; checklist?: string; expiresAt: number; createdAt: number }>>;
  resolveStudioApproval: (input: { approvalId: string; merchantId: string; ownerWaIdHash: string; decision: "approved" | "denied"; providerMessageId: string }, bindings?: Bindings) => Promise<{ accepted: boolean; type?: "release" | "reel"; reelId?: string }>;
  attachApprovalMessage: (approvalId: string, providerMessageId: string, bindings?: Bindings) => Promise<unknown>;
  createCallBatch: (batch: CallBatch, approvalId: string, bindings?: Bindings) => Promise<unknown>;
  registerReel: (plan: ReelPlanV1, planHash: string, approvalId: string, bindings?: Bindings) => Promise<unknown>;
  registerSocialCampaign: (input: { campaign: SocialCampaign; approvalId: string }, bindings?: Bindings) => Promise<unknown>;
  registerAsset: (input: { assetId: string; merchantId: string; storageBackend: "r2" | "convex"; objectKey?: string; convexStorageId?: string; sha256: string; contentType: string; byteLength: number; sourceProviderMessageId: string }, bindings?: Bindings) => Promise<unknown>;
  uploadAsset: (input: { assetId: string; merchantId: string; sha256: string; contentType: string; byteLength: number; sourceProviderMessageId: string; body: Uint8Array }, bindings?: Bindings) => Promise<{ inserted: boolean; storageBackend: "convex" }>;
  getPrivateAsset: (assetId: string, bindings?: Bindings) => Promise<{ body: Uint8Array; contentType: string; etag: string } | null>;
  getPrivateAssetForMerchant: (assetId: string, merchantId: string, bindings?: Bindings) => Promise<{ body: Uint8Array; contentType: string; etag: string } | null>;
  metrics: (siteId: string, merchantId: string, since: number, bindings?: Bindings) => Promise<unknown>;
  claimCallBatch: (bindings?: Bindings) => Promise<null | { attemptId: string; batchId: string; earliestAt: number; leadId: string; phoneCiphertext: string; remainingCostMicrousd: number }>;
  updateCallAttempt: (input: { attemptId: string; status: "provider_created" | "failed"; providerCallId?: string; failureCode?: string }, bindings?: Bindings) => Promise<{ updated: boolean }>;
  registerCallArtifact: (input: { artifactId: string; attemptId: string; providerCallId: string; bucketKey: string; sha256: string; byteLength: number; copiedAt: number; expiresAt: number }, bindings?: Bindings) => Promise<{ inserted: boolean }>;
  claimReel: (bindings?: Bindings) => Promise<null | { reelId: string; planJson: string; planHash: string }>;
  completeReel: (input: { reelId: string; status: "rendered" | "delivery_failed"; renderedAssetId?: string; renderEvidenceJson?: string; renderEvidenceHash?: string; failureCode?: string }, bindings?: Bindings) => Promise<{ completed: boolean; status: string; merchantId: string }>;
  beginReelDelivery: (input: { reelId: string; merchantId: string; renderedAssetId: string; recipientHash: string }, bindings?: Bindings) => Promise<{ claimed: boolean; status: string; providerMessageId?: string }>;
  finishReelDelivery: (input: { reelId: string; status: "delivered" | "delivery_failed"; providerMessageId?: string; failureCode?: string }, bindings?: Bindings) => Promise<{ completed: boolean; status: string }>;
  getReelStatus: (reelId: string, merchantId: string, bindings?: Bindings) => Promise<{ status: "draft" | "approved" | "rendering" | "rendered" | "delivering" | "delivered" | "delivery_failed"; renderedAssetId?: string; providerMessageId?: string } | null>;
  mintVerification: (input: { tokenHash: string; merchantId: string; siteId: string; versionId: string; specHash: string; expiresAt: number }, bindings?: Bindings) => Promise<unknown>;
  createReleaseRequest: (input: { requestId: string; siteId: string; merchantId: string; versionId: string; specHash: string; scopeHash: string; approvalId: string }, bindings?: Bindings) => Promise<unknown>;
  promoteRelease: (bindings?: Bindings) => Promise<unknown>;
  saveDecisionPolicy: (input: { policy: DecisionPolicyV1; policyHash: string }, bindings?: Bindings) => Promise<unknown>;
  getDecisionPolicy: (merchantId: string, bindings?: Bindings) => Promise<DecisionPolicyV1 | null>;
  createStudioLink: (input: { linkId: string; codeHash: string; browserNonceHash: string; intent: StudioIntent; expiresAt: number }, bindings?: Bindings) => Promise<unknown>;
  claimStudioLink: (input: { codeHash: string; merchantId: string; ownerWaIdHash: string; providerMessageId: string }, bindings?: Bindings) => Promise<{ linked: boolean }>;
  completeStudioLink: (input: { linkId: string; browserNonceHash: string; sessionHash: string; sessionExpiresAt: number }, bindings?: Bindings) => Promise<{ status: "pending" | "expired" | "authenticated"; merchantId?: string; ownerWaIdHash?: string; intent?: StudioIntent }>;
  getStudioSession: (sessionHash: string, bindings?: Bindings) => Promise<{ merchantId: string; ownerWaIdHash: string; expiresAt: number } | null>;
  revokeStudioSession: (sessionHash: string, bindings?: Bindings) => Promise<{ revoked: boolean }>;
  listStudioSessions: (merchantId: string, currentSessionHash: string, bindings?: Bindings) => Promise<Array<{ deviceId: string; createdAt: number; expiresAt: number; current: boolean }>>;
  revokeStudioDevice: (input: { merchantId: string; deviceId: string }, bindings?: Bindings) => Promise<{ revoked: boolean }>;
  createStudioDataRequest: (input: { requestId: string; merchantId: string; type: "export" | "deletion"; dueBy: number }, bindings?: Bindings) => Promise<{ requestId: string; status: "requested" | "completed"; dueBy: number; created: boolean }>;
  purgeMerchantContent: (input: { merchantId: string; requestId: string }, bindings?: Bindings) => Promise<{ deleted: number; unpublished: number; complete: boolean }>;
  saveStudioProject: (input: { projectId: string; revisionId: string; parentRevisionId?: string; merchantId: string; intent: StudioIntent; source: "whatsapp" | "studio"; project: StudioProjectInput }, bindings?: Bindings) => Promise<{ inserted: boolean; conflict: boolean; headRevisionId?: string }>;
  listStudioProjects: (merchantId: string, bindings?: Bindings) => Promise<Array<{ projectId: string; revisionId: string; parentRevisionId?: string; intent: StudioIntent; source: "whatsapp" | "studio"; project: StudioProjectInput; createdAt: number }>>;
  listStudioProjectChanges: (merchantId: string, cursor: ProjectSyncCursor | undefined, limit: number, bindings?: Bindings) => Promise<Array<{ projectId: string; revisionId: string; parentRevisionId?: string; intent: StudioIntent; source: "whatsapp" | "studio"; project: StudioProjectInput; createdAt: number }>>;
  beginInboundWorkflow: (input: { workflowId: string; merchantId: string; ownerWaIdHash: string; channel: "whatsapp_cloud"; providerMessageId: string }, bindings?: Bindings) => Promise<{ created: boolean; workflowId: string; status: string }>;
  recordWorkflowProgress: (input: { workflowId: string; eventId: string; status: string; progress: string; projectId?: string; intent?: StudioIntent }, bindings?: Bindings) => Promise<{ inserted: boolean; status: string }>;
  enqueueCustomerOutbox: (input: { outboxId: string; workflowId: string; merchantId: string; kind: "progress" | "missing_facts" | "approval" | "completion" | "retry"; body: string; dedupeKey: string }, bindings?: Bindings) => Promise<{ inserted: boolean; outboxId: string }>;
  markCustomerOutboxSent: (input: { outboxId: string; status: "sent" | "failed"; providerMessageId?: string }, bindings?: Bindings) => Promise<{ updated: boolean }>;
  reserveUsage: (input: UsageReservationBatch, bindings?: Bindings) => Promise<{ allowed: boolean; blockingMetric?: UsageMetric }>;
  recordActualUsage: (input: { usageEntryId: string; idempotencyKey: string; operationId: string; merchantId: string; metric: UsageMetric; quantity: number; evidenceRef: string; occurredAt: number }, bindings?: Bindings) => Promise<{ inserted: boolean }>;
};

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const liveEvidenceBoundary: EvidenceBoundary = {
  acknowledge: async (token, convexUrl) => {
    if (!convexUrl) throw new Error("CONVEX_URL is not configured");
    const client = new ConvexHttpClient(convexUrl);
    return client.action(api.oracle.acknowledgeBooking, { token });
  },
};

const liveStudioVerifierBoundary: StudioVerifierBoundary = {
  run: async ({ verifierUrl, ...job }) => {
    const endpoint = new URL("/verify", verifierUrl);
    if (endpoint.protocol !== "https:") throw new Error("Studio verifier must use HTTPS");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(job),
    });
    if (!response.ok) throw new Error(`Studio verifier failed with HTTP ${response.status}`);
    const result = await response.json() as { accepted?: unknown; passed?: unknown; blockers?: unknown; runId?: unknown };
    if (typeof result.accepted !== "boolean" || typeof result.passed !== "boolean" || !Array.isArray(result.blockers) || result.blockers.some((item) => typeof item !== "string") || typeof result.runId !== "string") {
      throw new Error("Studio verifier returned an invalid result");
    }
    return { accepted: result.accepted, passed: result.passed, blockers: result.blockers as string[], runId: result.runId };
  },
};

function cleanDimension(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.trim().slice(0, 100);
  return /^[a-zA-Z0-9 _.-]+$/.test(cleaned) ? cleaned : undefined;
}

async function workflowIdForProviderMessage(providerMessageId: string): Promise<string> {
  return `workflow-${(await sha256(providerMessageId)).slice(0, 32)}`;
}

function ordinaryMetaMessages(payload: unknown): Array<{ senderWaId: string; providerMessageId: string }> {
  const result: Array<{ senderWaId: string; providerMessageId: string }> = [];
  for (const entry of (payload as any)?.entry ?? []) for (const change of entry?.changes ?? []) for (const message of change?.value?.messages ?? []) {
    if (typeof message?.from === "string" && /^\d{8,15}$/.test(message.from) && typeof message.id === "string" && message.id.length >= 3 && message.id.length <= 256) {
      result.push({ senderWaId: message.from, providerMessageId: message.id });
    }
  }
  return result;
}

async function sha256Bytes(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(Array.from(value)).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const MAX_ASSET_BYTES = 16 * 1024 * 1024;
const STUDIO_RESPONSIVE_CSS = "h1{font-size:clamp(2.8rem,7vw,5.5rem);text-wrap:balance}.mode-card{min-width:0}@media(min-width:851px){.three{grid-template-columns:repeat(3,minmax(0,1fr))}}";
const STUDIO_ACCOUNT_CSS = ".account-panel{display:grid;grid-template-columns:1fr auto;gap:18px;border:1px solid var(--line);border-radius:18px;padding:18px;margin:24px 0;background:#fbfaf7}.saved-work{grid-column:1/-1;border-top:1px solid var(--line);padding-top:14px}.project-list{display:flex;gap:10px;overflow-x:auto;padding-top:10px}.project-chip{min-width:210px;text-align:left;display:block}.project-chip small{display:block;color:var(--muted);font-weight:500}@media(max-width:850px){.account-panel{grid-template-columns:1fr}.saved-work{grid-column:1}.project-list{display:grid}}";

function asciiAt(value: Uint8Array, offset: number, expected: string): boolean {
  if (value.byteLength < offset + expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (value[offset + index] !== expected.charCodeAt(index)) return false;
  }
  return true;
}

function hasValidAssetSignature(contentType: string, body: Uint8Array): boolean {
  if (contentType === "image/jpeg") return body.byteLength >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  if (contentType === "image/png") return body.byteLength >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => body[index] === byte);
  if (contentType === "image/webp") return asciiAt(body, 0, "RIFF") && asciiAt(body, 8, "WEBP");
  if (contentType === "video/mp4") return asciiAt(body, 4, "ftyp");
  if (contentType === "audio/ogg") return asciiAt(body, 0, "OggS");
  if (contentType === "audio/mpeg") return asciiAt(body, 0, "ID3") || (body.byteLength >= 2 && body[0] === 0xff && (body[1]! & 0xe0) === 0xe0);
  return false;
}

function sessionIdFromCookie(cookie: string | undefined): string | null {
  const match = /(?:^|;\s*)pgsid=([a-zA-Z0-9-]{8,64})(?:;|$)/.exec(cookie ?? "");
  return match?.[1] ?? null;
}

function cookieValue(cookie: string | undefined, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)(?:;|$)`).exec(cookie ?? "");
  return match?.[1] ?? null;
}

function randomStudioCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

async function studioLinkRateLimit(headers: Headers, bindings?: Bindings): Promise<{ allowed: true } | { allowed: false; retryAfter: number }> {
  const address = headers.get("cf-connecting-ip");
  if (!address || !bindings?.PROOFGATE_CONFIG || !bindings.PROOFGATE_SERVICE_SECRET) return { allowed: true };
  const windowMs = 10 * 60_000;
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const key = `rl:studio-link:${await sha256(`${bindings.PROOFGATE_SERVICE_SECRET}:${address}:${bucket}`)}`;
  let count = 0;
  try {
    const stored = await bindings.PROOFGATE_CONFIG.get(key);
    if (stored) count = Number.parseInt(stored, 10) || 0;
  } catch {
    return { allowed: true };
  }
  const retryAfter = Math.max(1, Math.ceil(((bucket + 1) * windowMs - now) / 1000));
  if (count >= 5) return { allowed: false, retryAfter };
  await bindings.PROOFGATE_CONFIG.put(key, String(count + 1), { expirationTtl: Math.max(60, retryAfter + 60) });
  return { allowed: true };
}

const liveGrowthBoundary: GrowthBoundary = {
  getPublishedSite: async (slug, bindings) => {
    if (!bindings?.CONVEX_URL) return null;
    const client = new ConvexHttpClient(bindings.CONVEX_URL);
    const result = await client.query((api as any).growth.getPublishedSite, { slug });
    if (!result) return null;
    return { ...result, spec: SiteSpecV2Schema.parse(JSON.parse(result.specJson)) };
  },
  appendEvent: async (event, bindings) => {
    if (!bindings?.CONVEX_URL) throw new Error("CONVEX_URL is not configured");
    const client = new ConvexHttpClient(bindings.CONVEX_URL);
    await client.mutation((api as any).growth.appendEvent, event);
  },
  resolveApproval: async (tap, bindings) => {
    if (!bindings?.CONVEX_URL) throw new Error("CONVEX_URL is not configured");
    const client = new ConvexHttpClient(bindings.CONVEX_URL);
    return client.mutation((api as any).growth.resolveApprovalTap, {
      approvalId: tap.approvalId,
      decision: tap.decision,
      senderWaIdHash: await sha256(tap.senderWaId),
      providerMessageId: tap.providerMessageId,
    });
  },
  ingestVapiReport: async (payload, bindings) => {
    if (!bindings?.CONVEX_URL) throw new Error("CONVEX_URL is not configured");
    const client = new ConvexHttpClient(bindings.CONVEX_URL);
    return client.mutation((api as any).growth.ingestVapiReport, { payloadJson: JSON.stringify(payload) });
  },
  forwardToHermes: async (body, headers, bindings) => {
    const origin = bindings?.HERMES_ORIGIN_URL ?? await bindings?.PROOFGATE_CONFIG?.get("hermes_origin");
    if (!origin || !bindings?.HERMES_PROXY_SECRET) throw new Error("Hermes origin is not configured");
    const forwarded = new Headers({ "content-type": headers.get("content-type") ?? "application/json", "x-proofgate-proxy": bindings.HERMES_PROXY_SECRET });
    const metaSignature = headers.get("x-hub-signature-256");
    if (metaSignature) forwarded.set("x-hub-signature-256", metaSignature);
    return fetch(`${origin.replace(/\/$/, "")}/whatsapp/webhook`, { method: "POST", headers: forwarded, body: new Uint8Array(Array.from(body)).buffer });
  },
  getAsset: async (assetId, bindings) => {
    if (!bindings?.CONVEX_URL) return null;
    const selected = await new ConvexHttpClient(bindings.CONVEX_URL).query((api as any).growth.getPublicAsset, { assetId }) as null | { storageBackend: "r2" | "convex"; objectKey?: string; storageUrl?: string; contentType: string; sha256: string };
    if (!selected) return null;
    if (selected.storageBackend === "r2") {
      if (!bindings.PROOFGATE_ASSETS || !selected.objectKey) return null;
      const object = await bindings.PROOFGATE_ASSETS.get(selected.objectKey);
      if (!object) return null;
      const body = new Uint8Array(await object.arrayBuffer());
      if (await sha256Bytes(body) !== selected.sha256) throw new Error("asset integrity check failed");
      return { body, contentType: selected.contentType, etag: selected.sha256 };
    }
    if (!selected.storageUrl) return null;
    const response = await fetch(selected.storageUrl);
    if (!response.ok) return null;
    const body = new Uint8Array(await response.arrayBuffer());
    if (await sha256Bytes(body) !== selected.sha256) throw new Error("asset integrity check failed");
    return {
      body,
      contentType: selected.contentType,
      etag: selected.sha256,
    };
  },
  submitVerification: async (input, bindings) => {
    if (!bindings?.CONVEX_URL) throw new Error("CONVEX_URL is not configured");
    return new ConvexHttpClient(bindings.CONVEX_URL).mutation((api as any).growth.submitGrowthVerification, input);
  },
};

function adminClient(bindings?: Bindings): ConvexHttpClient {
  if (!bindings?.CONVEX_URL) throw new Error("CONVEX_URL is not configured");
  return new ConvexHttpClient(bindings.CONVEX_URL);
}

export function resolveConvexServiceSecret(bindings?: Bindings): string {
  const secret = bindings?.CONVEX_SERVICE_SECRET ?? bindings?.PROOFGATE_SERVICE_SECRET;
  if (!secret) throw new Error("CONVEX_SERVICE_SECRET is not configured");
  return secret;
}

function serviceSecret(bindings?: Bindings): string {
  return resolveConvexServiceSecret(bindings);
}

const liveAdminBoundary: GrowthAdminBoundary = {
  upsertMerchant: (brief, encryptedOrderNumber, bindings) => adminClient(bindings).action((api as any).growth.adminUpsertMerchant, { serviceSecret: serviceSecret(bindings), merchantId: brief.merchantId, ownerWaIdHash: brief.ownerWaIdHash, name: brief.businessName, timezone: brief.timezone, orderWhatsAppNumberCiphertext: encryptedOrderNumber, createdAt: Date.now() }),
  createCandidate: (input, bindings) => adminClient(bindings).action((api as any).growth.adminCreateCandidate, { serviceSecret: serviceSecret(bindings), merchantId: input.spec.business.merchantId, slug: input.spec.siteId, versionId: input.versionId, parentVersionId: input.parentVersionId, specJson: JSON.stringify(input.spec), specHash: input.specHash, actor: input.actor, createdAt: Date.now() }),
  getPreviewSite: async (siteId, versionId, specHash, bindings) => {
    const result = await adminClient(bindings).query((api as any).growth.adminGetPreviewSite, {
      serviceSecret: serviceSecret(bindings), siteId, versionId, specHash,
    }) as null | { specJson: string; versionId: string; specHash: string };
    return result ? { ...result, spec: SiteSpecV2Schema.parse(JSON.parse(result.specJson)) } : null;
  },
  registerLead: (merchantId, consent, bindings) => adminClient(bindings).action((api as any).growth.adminRegisterLead, { serviceSecret: serviceSecret(bindings), merchantId, leadId: consent.leadId, phoneCiphertext: consent.phoneCiphertext, phoneHash: consent.phoneHash, country: consent.country, purpose: consent.purpose, source: consent.source, evidenceHash: consent.evidenceHash, grantedAt: consent.grantedAt, revokedAt: consent.revokedAt, localTimezone: consent.localTimezone, callWindowStartHour: consent.callWindow.startHour, callWindowEndHour: consent.callWindow.endHour, createdAt: Date.now() }),
  createApproval: (input, bindings) => adminClient(bindings).action((api as any).growth.adminCreateApproval, { serviceSecret: serviceSecret(bindings), ...input, providerMessageId: "pending", createdAt: Date.now() }),
  listMerchantApprovals: (merchantId, bindings) => adminClient(bindings).action((api as any).growth.adminListMerchantApprovals, { serviceSecret: serviceSecret(bindings), merchantId }),
  resolveStudioApproval: (input, bindings) => adminClient(bindings).action((api as any).growth.adminResolveStudioApproval, { serviceSecret: serviceSecret(bindings), ...input, now: Date.now() }),
  attachApprovalMessage: (approvalId, providerMessageId, bindings) => adminClient(bindings).action((api as any).growth.adminAttachApprovalMessage, { serviceSecret: serviceSecret(bindings), approvalId, providerMessageId }),
  createCallBatch: (batch, approvalId, bindings) => adminClient(bindings).action((api as any).growth.adminCreateCallBatch, { serviceSecret: serviceSecret(bindings), ...batch, approvalId, createdAt: Date.now() }),
  registerReel: (plan, planHash, approvalId, bindings) => adminClient(bindings).action((api as any).growth.adminRegisterReel, { serviceSecret: serviceSecret(bindings), reelId: plan.reelId, merchantId: plan.merchantId, planJson: JSON.stringify(plan), planHash, approvalId, status: "draft", createdAt: Date.now() }),
  registerSocialCampaign: ({ campaign, approvalId }, bindings) => adminClient(bindings).action((api as any).growth.adminRegisterSocialCampaign, {
    serviceSecret: serviceSecret(bindings), campaignId: campaign.campaignId, merchantId: campaign.merchantId,
    campaignJson: JSON.stringify(campaign), scopeHash: campaign.scopeHash, approvalId, createdAt: Date.now(),
  }),
  registerAsset: (input, bindings) => adminClient(bindings).action((api as any).growth.adminRegisterAsset, { serviceSecret: serviceSecret(bindings), ...input, createdAt: Date.now() }),
  uploadAsset: async (input, bindings) => {
    const client = adminClient(bindings);
    const prepared = await client.mutation((api as any).growth.adminPrepareAssetUpload, {
      serviceSecret: serviceSecret(bindings), assetId: input.assetId, merchantId: input.merchantId, sha256: input.sha256,
    }) as { existing: true } | { existing: false; uploadUrl: string };
    if (prepared.existing) return { inserted: false, storageBackend: "convex" };
    const upload = await fetch(prepared.uploadUrl, {
      method: "POST", headers: { "content-type": input.contentType }, body: new Uint8Array(Array.from(input.body)).buffer,
    });
    if (!upload.ok) throw new Error(`Convex asset upload failed with HTTP ${upload.status}`);
    const uploaded = await upload.json() as { storageId?: unknown };
    if (typeof uploaded.storageId !== "string" || uploaded.storageId.length < 10) throw new Error("Convex asset upload returned an invalid storage ID");
    const result = await client.action((api as any).growth.adminRegisterAsset, {
      serviceSecret: serviceSecret(bindings), assetId: input.assetId, merchantId: input.merchantId,
      storageBackend: "convex", convexStorageId: uploaded.storageId, sha256: input.sha256,
      contentType: input.contentType, byteLength: input.byteLength,
      sourceProviderMessageId: input.sourceProviderMessageId, createdAt: Date.now(),
    }) as { inserted: boolean };
    return { inserted: result.inserted, storageBackend: "convex" };
  },
  getPrivateAsset: async (assetId, bindings) => {
    const selected = await adminClient(bindings).query((api as any).growth.adminGetAssetForDelivery, {
      serviceSecret: serviceSecret(bindings), assetId,
    }) as null | { storageBackend: "r2" | "convex"; objectKey?: string; storageUrl?: string; contentType: string; sha256: string };
    if (!selected) return null;
    if (selected.storageBackend === "r2") {
      if (!bindings?.PROOFGATE_ASSETS || !selected.objectKey) return null;
      const object = await bindings.PROOFGATE_ASSETS.get(selected.objectKey);
      if (!object) return null;
      const body = new Uint8Array(await object.arrayBuffer());
      if (await sha256Bytes(body) !== selected.sha256) throw new Error("asset integrity check failed");
      return { body, contentType: selected.contentType, etag: selected.sha256 };
    }
    if (!selected.storageUrl) return null;
    const response = await fetch(selected.storageUrl);
    if (!response.ok) return null;
    const body = new Uint8Array(await response.arrayBuffer());
    if (await sha256Bytes(body) !== selected.sha256) throw new Error("asset integrity check failed");
    return { body, contentType: selected.contentType, etag: selected.sha256 };
  },
  getPrivateAssetForMerchant: async (assetId, merchantId, bindings) => {
    const selected = await adminClient(bindings).query((api as any).growth.adminGetAssetForDelivery, {
      serviceSecret: serviceSecret(bindings), assetId, merchantId,
    }) as null | { storageBackend: "r2" | "convex"; objectKey?: string; storageUrl?: string; contentType: string; sha256: string };
    if (!selected) return null;
    if (selected.storageBackend === "r2") {
      if (!bindings?.PROOFGATE_ASSETS || !selected.objectKey) return null;
      const object = await bindings.PROOFGATE_ASSETS.get(selected.objectKey);
      if (!object) return null;
      const body = new Uint8Array(await object.arrayBuffer());
      if (await sha256Bytes(body) !== selected.sha256) throw new Error("asset integrity check failed");
      return { body, contentType: selected.contentType, etag: selected.sha256 };
    }
    if (!selected.storageUrl) return null;
    const response = await fetch(selected.storageUrl);
    if (!response.ok) return null;
    const body = new Uint8Array(await response.arrayBuffer());
    if (await sha256Bytes(body) !== selected.sha256) throw new Error("asset integrity check failed");
    return { body, contentType: selected.contentType, etag: selected.sha256 };
  },
  metrics: (siteId, merchantId, since, bindings) => adminClient(bindings).query((api as any).growth.metricsSummary, { serviceSecret: serviceSecret(bindings), siteId, merchantId, since }),
  claimCallBatch: (bindings) => adminClient(bindings).action((api as any).growth.adminClaimApprovedCallBatch, { serviceSecret: serviceSecret(bindings), now: Date.now() }),
  updateCallAttempt: (input, bindings) => adminClient(bindings).action((api as any).growth.adminUpdateCallAttempt, { serviceSecret: serviceSecret(bindings), ...input, now: Date.now() }),
  registerCallArtifact: (input, bindings) => adminClient(bindings).action((api as any).growth.adminRegisterCallArtifact, { serviceSecret: serviceSecret(bindings), ...input }),
  claimReel: (bindings) => adminClient(bindings).action((api as any).growth.adminClaimApprovedReel, { serviceSecret: serviceSecret(bindings), now: Date.now() }),
  completeReel: (input, bindings) => adminClient(bindings).action((api as any).growth.adminCompleteReel, { serviceSecret: serviceSecret(bindings), ...input }),
  beginReelDelivery: (input, bindings) => adminClient(bindings).action((api as any).growth.adminBeginReelDelivery, { serviceSecret: serviceSecret(bindings), ...input, now: Date.now() }),
  finishReelDelivery: (input, bindings) => adminClient(bindings).action((api as any).growth.adminFinishReelDelivery, { serviceSecret: serviceSecret(bindings), ...input, now: Date.now() }),
  getReelStatus: (reelId, merchantId, bindings) => adminClient(bindings).query((api as any).growth.adminGetReelStatus, { serviceSecret: serviceSecret(bindings), reelId, merchantId }),
  mintVerification: (input, bindings) => adminClient(bindings).action((api as any).growth.adminMintVerificationCapability, { serviceSecret: serviceSecret(bindings), ...input, createdAt: Date.now() }),
  createReleaseRequest: (input, bindings) => adminClient(bindings).action((api as any).growth.adminCreateGrowthReleaseRequest, { serviceSecret: serviceSecret(bindings), ...input, createdAt: Date.now() }),
  promoteRelease: (bindings) => adminClient(bindings).action((api as any).growth.adminPromoteApprovedGrowthRelease, { serviceSecret: serviceSecret(bindings), now: Date.now() }),
  saveDecisionPolicy: ({ policy, policyHash }, bindings) => adminClient(bindings).action((api as any).growth.adminAppendDecisionPolicy, {
    serviceSecret: serviceSecret(bindings), policyId: policy.policyId, merchantId: policy.merchantId,
    ownerWaIdHash: policy.ownerWaIdHash, policyJson: JSON.stringify(policy), policyHash,
    supersedesPolicyId: policy.supersedesPolicyId, createdAt: policy.createdAt,
  }),
  getDecisionPolicy: async (merchantId, bindings) => {
    const result = await adminClient(bindings).query((api as any).growth.adminGetActiveDecisionPolicy, {
      serviceSecret: serviceSecret(bindings), merchantId,
    }) as null | { policyJson: string };
    return result ? DecisionPolicySchema.parse(JSON.parse(result.policyJson)) : null;
  },
  createStudioLink: (input, bindings) => adminClient(bindings).action((api as any).growth.adminCreateStudioLink, {
    serviceSecret: serviceSecret(bindings), ...input, createdAt: Date.now(),
  }),
  claimStudioLink: (input, bindings) => adminClient(bindings).action((api as any).growth.adminClaimStudioLink, {
    serviceSecret: serviceSecret(bindings), ...input, now: Date.now(),
  }),
  completeStudioLink: (input, bindings) => adminClient(bindings).action((api as any).growth.adminCompleteStudioLink, {
    serviceSecret: serviceSecret(bindings), ...input, now: Date.now(),
  }),
  getStudioSession: (sessionHash, bindings) => adminClient(bindings).query((api as any).growth.adminGetStudioSession, {
    serviceSecret: serviceSecret(bindings), sessionHash, now: Date.now(),
  }),
  revokeStudioSession: (sessionHash, bindings) => adminClient(bindings).action((api as any).growth.adminRevokeStudioSession, {
    serviceSecret: serviceSecret(bindings), sessionHash, now: Date.now(),
  }),
  listStudioSessions: (merchantId, currentSessionHash, bindings) => adminClient(bindings).query((api as any).growth.adminListStudioSessions, {
    serviceSecret: serviceSecret(bindings), merchantId, currentSessionHash, now: Date.now(),
  }),
  revokeStudioDevice: (input, bindings) => adminClient(bindings).action((api as any).growth.adminRevokeStudioDevice, {
    serviceSecret: serviceSecret(bindings), ...input, now: Date.now(),
  }),
  createStudioDataRequest: (input, bindings) => adminClient(bindings).action((api as any).growth.adminCreateStudioDataRequest, {
    serviceSecret: serviceSecret(bindings), ...input, createdAt: Date.now(),
  }),
  purgeMerchantContent: (input, bindings) => adminClient(bindings).action((api as any).growth.adminPurgeMerchantContent, {
    serviceSecret: serviceSecret(bindings), ...input,
  }),
  saveStudioProject: (input, bindings) => adminClient(bindings).action((api as any).growth.adminSaveStudioProject, {
    serviceSecret: serviceSecret(bindings), projectId: input.projectId, revisionId: input.revisionId,
    parentRevisionId: input.parentRevisionId, merchantId: input.merchantId, intent: input.intent, source: input.source,
    projectJson: JSON.stringify(input.project), createdAt: Date.now(),
  }),
  listStudioProjects: async (merchantId, bindings) => {
    const projects = await adminClient(bindings).query((api as any).growth.adminListStudioProjects, {
      serviceSecret: serviceSecret(bindings), merchantId,
    }) as Array<{ projectId: string; revisionId: string; parentRevisionId?: string; intent: StudioIntent; source: "whatsapp" | "studio"; projectJson: string; createdAt: number }>;
    return projects.map((project) => ({ ...project, project: StudioProjectInputSchema.parse(JSON.parse(project.projectJson)) }));
  },
  listStudioProjectChanges: async (merchantId, cursor, limit, bindings) => {
    const projects = await adminClient(bindings).query((api as any).growth.adminListStudioProjectChanges, {
      serviceSecret: serviceSecret(bindings), merchantId, afterCreatedAt: cursor?.createdAt ?? 0,
      afterProjectId: cursor?.projectId ?? "---", afterRevisionId: cursor?.revisionId ?? "---", limit,
    }) as Array<{ projectId: string; revisionId: string; parentRevisionId?: string; intent: StudioIntent; source: "whatsapp" | "studio"; projectJson: string; createdAt: number }>;
    return projects.map((project) => ({ ...project, project: StudioProjectInputSchema.parse(JSON.parse(project.projectJson)) }));
  },
  beginInboundWorkflow: (input, bindings) => adminClient(bindings).action((api as any).growth.adminBeginInboundWorkflow, {
    serviceSecret: serviceSecret(bindings), ...input, createdAt: Date.now(),
  }),
  recordWorkflowProgress: (input, bindings) => adminClient(bindings).action((api as any).growth.adminRecordWorkflowProgress, {
    serviceSecret: serviceSecret(bindings), ...input, createdAt: Date.now(),
  }),
  enqueueCustomerOutbox: (input, bindings) => {
    const message = CustomerOutboxMessageSchema.parse({ schemaVersion: 1, ...input, createdAt: Date.now() });
    return adminClient(bindings).action((api as any).growth.adminEnqueueCustomerOutbox, {
      serviceSecret: serviceSecret(bindings), outboxId: message.outboxId, workflowId: message.workflowId,
      merchantId: message.merchantId, kind: message.kind, body: message.body, dedupeKey: message.dedupeKey, createdAt: message.createdAt,
    });
  },
  markCustomerOutboxSent: (input, bindings) => adminClient(bindings).action((api as any).growth.adminMarkCustomerOutboxSent, {
    serviceSecret: serviceSecret(bindings), ...input, updatedAt: Date.now(),
  }),
  reserveUsage: (input, bindings) => adminClient(bindings).action((api as any).growth.adminReserveUsage, {
    serviceSecret: serviceSecret(bindings), ...input,
  }),
  recordActualUsage: (input, bindings) => adminClient(bindings).action((api as any).growth.adminRecordActualUsage, {
    serviceSecret: serviceSecret(bindings), ...input,
  }),
};

function adminAuthorized(authorization: string | undefined, bindings?: Bindings): boolean {
  const expected = bindings?.PROOFGATE_SERVICE_SECRET;
  const actual = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!expected || actual.length !== expected.length) return false;
  let different = 0;
  for (let index = 0; index < expected.length; index += 1) different |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  return different === 0;
}

type PreviewClaims = { siteId: string; versionId: string; specHash: string; expiresAt: number };

function base64UrlEncode(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function previewSignature(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

async function createPreviewToken(claims: PreviewClaims, secret: string): Promise<string> {
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(claims)));
  return `pgp_${payload}.${await previewSignature(payload, secret)}`;
}

async function verifyPreviewToken(token: string, secret: string): Promise<PreviewClaims | null> {
  const match = /^pgp_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(token);
  if (!match) return null;
  const expected = await previewSignature(match[1]!, secret);
  const actual = match[2]!;
  if (actual.length !== expected.length) return null;
  let different = 0;
  for (let index = 0; index < expected.length; index += 1) different |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  if (different !== 0) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(match[1]!))) as PreviewClaims;
    if (!claims || typeof claims.siteId !== "string" || typeof claims.versionId !== "string" || !/^[a-f0-9]{64}$/.test(claims.specHash) || !Number.isFinite(claims.expiresAt) || claims.expiresAt < Date.now()) return null;
    return claims;
  } catch { return null; }
}

function selectedPreviewAssetIds(spec: SiteSpecV2): Set<string> {
  return new Set([spec.hero.imageAssetId, spec.seo.socialImageAssetId, ...spec.catalog.map((item) => item.imageAssetId)]);
}

async function tenantFromHermesHeader(value: string | undefined) {
  if (!value) return null;
  try { return await deriveTenantIdentity(value); } catch { return null; }
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function encryptSensitive(value: string, encodedKey: string | undefined): Promise<string> {
  if (!encodedKey) throw new Error("PROOFGATE_DATA_KEY is not configured");
  const rawKey = decodeBase64(encodedKey);
  if (rawKey.byteLength !== 32) throw new Error("PROOFGATE_DATA_KEY must contain exactly 32 bytes");
  const key = await crypto.subtle.importKey("raw", new Uint8Array(Array.from(rawKey)).buffer, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value)));
  return `aesgcm:v1:${encodeBase64(iv)}:${encodeBase64(ciphertext)}`;
}

async function decryptSensitive(value: string, encodedKey: string | undefined): Promise<string> {
  if (!encodedKey) throw new Error("PROOFGATE_DATA_KEY is not configured");
  const [prefix, version, encodedIv, encodedCiphertext] = value.split(":");
  if (prefix !== "aesgcm" || version !== "v1" || !encodedIv || !encodedCiphertext) throw new Error("unsupported encrypted value");
  const rawKey = decodeBase64(encodedKey);
  if (rawKey.byteLength !== 32) throw new Error("PROOFGATE_DATA_KEY must contain exactly 32 bytes");
  const key = await crypto.subtle.importKey("raw", new Uint8Array(Array.from(rawKey)).buffer, "AES-GCM", false, ["decrypt"]);
  const iv = new Uint8Array(Array.from(decodeBase64(encodedIv))).buffer;
  const ciphertext = new Uint8Array(Array.from(decodeBase64(encodedCiphertext))).buffer;
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

export function createApp(evidenceBoundary: EvidenceBoundary = liveEvidenceBoundary, growthBoundary: GrowthBoundary = liveGrowthBoundary, adminBoundary: GrowthAdminBoundary = liveAdminBoundary, studioVerifierBoundary: StudioVerifierBoundary = liveStudioVerifierBoundary): Hono<{ Bindings: Bindings }> {
  const app = new Hono<{ Bindings: Bindings }>();
  const reserveOutboundMessage = (merchantId: string, operationId: string, bindings?: Bindings) => adminBoundary.reserveUsage({
    merchantId, operationId, idempotencyKey: `reserve:${operationId}`, requestedAt: Date.now(), reservations: [{ metric: "whatsapp_messages", quantity: 1 }],
  }, bindings);
  const recordOutboundMessage = (merchantId: string, operationId: string, providerMessageId: string, bindings?: Bindings) => adminBoundary.recordActualUsage({
    usageEntryId: `actual:${operationId}`, idempotencyKey: `actual:${operationId}`, operationId, merchantId,
    metric: "whatsapp_messages", quantity: 1, evidenceRef: `meta:${providerMessageId}`, occurredAt: Date.now(),
  }, bindings);
  /**
   * Sends one merchant-facing message exactly once and records the outcome.
   *
   * `customerOutbox` previously had an enqueue and no consumer, so a queued message was never
   * delivered. Enqueueing still provides the dedupe ledger — a repeated dedupeKey means the
   * message already went out — but the send happens inline and the row is closed out.
   */
  const deliverCustomerMessage = async (input: {
    workflowId: string; merchantId: string; recipientWaId: string;
    kind: "progress" | "missing_facts" | "approval" | "completion" | "retry";
    body: string; dedupeKey: string;
  }, bindings?: Bindings): Promise<{ delivered: boolean; reason?: string; providerMessageId?: string }> => {
    if (!bindings?.META_PHONE_NUMBER_ID || !bindings.META_ACCESS_TOKEN) return { delivered: false, reason: "meta_not_configured" };
    const queued = await adminBoundary.enqueueCustomerOutbox({
      outboxId: input.dedupeKey, workflowId: input.workflowId, merchantId: input.merchantId,
      kind: input.kind, body: input.body, dedupeKey: input.dedupeKey,
    }, bindings);
    if (!queued.inserted) return { delivered: false, reason: "duplicate" };
    const operationId = `wa-out:${input.dedupeKey}`;
    if (!(await reserveOutboundMessage(input.merchantId, operationId, bindings)).allowed) {
      await adminBoundary.markCustomerOutboxSent({ outboxId: queued.outboxId, status: "failed" }, bindings);
      return { delivered: false, reason: "usage_limit" };
    }
    try {
      const receipt = await sendTextMessage({
        graphApiVersion: bindings.META_GRAPH_API_VERSION ?? "v20.0", phoneNumberId: bindings.META_PHONE_NUMBER_ID,
        accessToken: bindings.META_ACCESS_TOKEN, recipientWaId: input.recipientWaId, body: input.body,
      });
      await recordOutboundMessage(input.merchantId, operationId, receipt.providerMessageId, bindings);
      await adminBoundary.markCustomerOutboxSent({ outboxId: queued.outboxId, status: "sent", providerMessageId: receipt.providerMessageId }, bindings);
      return { delivered: true, providerMessageId: receipt.providerMessageId };
    } catch {
      await adminBoundary.markCustomerOutboxSent({ outboxId: queued.outboxId, status: "failed" }, bindings);
      return { delivered: false, reason: "send_failed" };
    }
  };
  app.get("/", (context) => context.html(renderProductHome(), 200, {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  }));
  app.get("/demo", (context) => context.html(renderDemoSandbox(), 200, {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  }));
  app.get("/studio", (context) => context.html(renderStudio(context.env?.AXCAS_WHATSAPP_NUMBER), 200, {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "referrer-policy": "no-referrer", "x-content-type-options": "nosniff",
  }));
  app.get("/studio.css", (context) => context.body(`${renderStudioCss()}${STUDIO_RESPONSIVE_CSS}${STUDIO_ACCOUNT_CSS}`, 200, { "content-type": "text/css; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }));
  app.get("/studio.js", (context) => context.body(renderStudioClientJs(), 200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }));
  app.post("/api/studio/link", async (context) => {
    let intent: StudioIntent;
    try { intent = StudioIntentSchema.parse((await context.req.json() as { intent?: unknown }).intent); } catch { return context.text("Choose website, reels, or both", 400); }
    const rateLimit = await studioLinkRateLimit(context.req.raw.headers, context.env);
    if (!rateLimit.allowed) return context.text("Too many sign-in links. Try again shortly.", 429, { "retry-after": String(rateLimit.retryAfter) });
    const linkId = `link-${crypto.randomUUID()}`;
    const code = randomStudioCode();
    const browserNonce = base64UrlEncode(crypto.getRandomValues(new Uint8Array(24)));
    const expiresAt = Date.now() + 10 * 60_000;
    await adminBoundary.createStudioLink({ linkId, codeHash: await sha256(code), browserNonceHash: await sha256(browserNonce), intent, expiresAt }, context.env);
    const number = (context.env?.AXCAS_WHATSAPP_NUMBER ?? "919180499647").replace(/\D/g, "");
    return context.json({ whatsappUrl: `https://wa.me/${number}?text=${encodeURIComponent(`AXCAS LINK ${code}`)}`, expiresAt }, 201, {
      "cache-control": "no-store",
      "set-cookie": `axcas_link=${linkId}.${browserNonce}; Path=/api/studio; Max-Age=600; Secure; HttpOnly; SameSite=Lax`,
    });
  });
  app.post("/api/studio/link/status", async (context) => {
    const linkCookie = cookieValue(context.req.header("cookie"), "axcas_link");
    const separator = linkCookie?.indexOf(".") ?? -1;
    if (!linkCookie || separator < 6) return context.text("Studio link is missing", 401);
    const linkId = linkCookie.slice(0, separator);
    const browserNonce = linkCookie.slice(separator + 1);
    if (!/^link-[0-9a-f-]{36}$/.test(linkId) || !/^[A-Za-z0-9_-]{20,64}$/.test(browserNonce)) return context.text("Studio link is invalid", 401);
    const rawSession = await previewSignature(`${linkId}.${browserNonce}`, serviceSecret(context.env));
    const sessionExpiresAt = Date.now() + 30 * 86_400_000;
    const result = await adminBoundary.completeStudioLink({
      linkId, browserNonceHash: await sha256(browserNonce), sessionHash: await sha256(rawSession), sessionExpiresAt,
    }, context.env);
    if (result.status === "pending") return context.json({ status: "pending" }, 202, { "cache-control": "no-store" });
    if (result.status !== "authenticated") return context.text("Studio link expired", 410);
    return context.json({ status: "authenticated", intent: result.intent }, 200, {
      "cache-control": "no-store",
      "set-cookie": `axcas_session=${rawSession}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax`,
    });
  });
  async function studioSession(cookie: string | undefined, bindings?: Bindings) {
    const raw = cookieValue(cookie, "axcas_session");
    if (!raw || !/^[A-Za-z0-9_-]{30,100}$/.test(raw)) return null;
    return adminBoundary.getStudioSession(await sha256(raw), bindings);
  }
  app.get("/api/studio/me", async (context) => {
    const session = await studioSession(context.req.header("cookie"), context.env);
    if (!session) return context.text("Unauthorized", 401);
    const projects = await adminBoundary.listStudioProjects(session.merchantId, context.env);
    const displayName = projects[0]?.project.businessName ?? "Your Axcas workspace";
    return context.json({
      authenticated: true,
      account: { method: "whatsapp", verified: true, displayName, sessionExpiresAt: session.expiresAt },
      projects: projects.map((project) => ({ ...project, source: project.source ?? (project.projectId.startsWith("project-whatsapp-") ? "whatsapp" : "studio") })),
    }, 200, { "cache-control": "no-store" });
  });
  app.post("/api/studio/logout", async (context) => {
    const raw = cookieValue(context.req.header("cookie"), "axcas_session");
    if (raw && /^[A-Za-z0-9_-]{30,100}$/.test(raw)) await adminBoundary.revokeStudioSession(await sha256(raw), context.env);
    return context.body(null, 204, {
      "cache-control": "no-store",
      "set-cookie": "axcas_session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax",
    });
  });
  app.get("/api/studio/sessions", async (context) => {
    const raw = cookieValue(context.req.header("cookie"), "axcas_session");
    if (!raw || !/^[A-Za-z0-9_-]{30,100}$/.test(raw)) return context.text("Unauthorized", 401);
    const currentSessionHash = await sha256(raw);
    const session = await adminBoundary.getStudioSession(currentSessionHash, context.env);
    if (!session) return context.text("Unauthorized", 401);
    const sessions = await adminBoundary.listStudioSessions(session.merchantId, currentSessionHash, context.env);
    return context.json({ sessions }, 200, { "cache-control": "no-store" });
  });
  app.delete("/api/studio/sessions/:deviceId", async (context) => {
    const raw = cookieValue(context.req.header("cookie"), "axcas_session");
    if (!raw || !/^[A-Za-z0-9_-]{30,100}$/.test(raw)) return context.text("Unauthorized", 401);
    const currentSessionHash = await sha256(raw);
    const session = await adminBoundary.getStudioSession(currentSessionHash, context.env);
    if (!session) return context.text("Unauthorized", 401);
    const deviceId = context.req.param("deviceId");
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(deviceId)) return context.text("Invalid browser", 400);
    const result = await adminBoundary.revokeStudioDevice({ merchantId: session.merchantId, deviceId }, context.env);
    if (!result.revoked) return context.text("Browser not found", 404);
    const current = currentSessionHash.startsWith(deviceId);
    return context.json({ revoked: true, current }, 200, {
      "cache-control": "no-store",
      ...(current ? { "set-cookie": "axcas_session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax" } : {}),
    });
  });
  app.post("/api/studio/account/export", async (context) => {
    const session = await studioSession(context.req.header("cookie"), context.env);
    if (!session) return context.text("Unauthorized", 401);
    const requestId = `data-request-${crypto.randomUUID()}`;
    const exportedAt = Date.now();
    await adminBoundary.createStudioDataRequest({ requestId, merchantId: session.merchantId, type: "export", dueBy: exportedAt }, context.env);
    const projects = await adminBoundary.listStudioProjects(session.merchantId, context.env);
    return context.json({
      schemaVersion: 1,
      exportedAt,
      account: { method: "whatsapp", verified: true },
      projects,
    }, 200, {
      "cache-control": "private, no-store",
      "content-disposition": 'attachment; filename="axcas-account-export.json"',
      "x-content-type-options": "nosniff",
    });
  });
  app.post("/api/studio/account/deletion", async (context) => {
    const session = await studioSession(context.req.header("cookie"), context.env);
    if (!session) return context.text("Unauthorized", 401);
    let confirmation: unknown;
    try { confirmation = (await context.req.json() as { confirmation?: unknown }).confirmation; }
    catch { return context.text("Confirm the deletion request", 400); }
    if (confirmation !== "DELETE MY DATA") return context.text("Confirm the deletion request", 400);
    const requestId = `data-request-${crypto.randomUUID()}`;
    const dueBy = Date.now() + 30 * 86_400_000;
    const result = await adminBoundary.createStudioDataRequest({ requestId, merchantId: session.merchantId, type: "deletion", dueBy }, context.env);
    // The request used to be recorded and never acted on, so the 30-day promise had nothing
    // behind it. Carry the deletion out now and report what was actually removed.
    const purge = await adminBoundary.purgeMerchantContent({ merchantId: session.merchantId, requestId: result.requestId }, context.env);
    return context.json({
      status: purge.complete ? "completed" : "in_progress",
      requestId: result.requestId,
      deletedRecords: purge.deleted,
      unpublishedSites: purge.unpublished,
      ...(purge.complete ? {} : { dueBy: result.dueBy ?? dueBy }),
    }, purge.complete ? 200 : 202, {
      "cache-control": "no-store",
      ...(purge.complete ? { "set-cookie": "axcas_session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax" } : {}),
    });
  });
  app.get("/api/studio/projects", async (context) => {
    const session = await studioSession(context.req.header("cookie"), context.env);
    if (!session) return context.text("Unauthorized", 401);
    return context.json({ projects: await adminBoundary.listStudioProjects(session.merchantId, context.env) }, 200, { "cache-control": "no-store" });
  });
  app.get("/api/studio/projects/changes", async (context) => {
    const session = await studioSession(context.req.header("cookie"), context.env);
    if (!session) return context.text("Unauthorized", 401);
    let cursor: ProjectSyncCursor | undefined;
    try { cursor = decodeProjectCursor(context.req.query("cursor")); } catch { return context.text("Invalid sync cursor", 400); }
    const changes = await adminBoundary.listStudioProjectChanges(session.merchantId, cursor, 100, context.env);
    let nextCursor = cursor;
    for (const change of changes) nextCursor = nextProjectCursor(nextCursor, { createdAt: change.createdAt, projectId: change.projectId, revisionId: change.revisionId });
    return context.json({ changes, cursor: nextCursor ? encodeProjectCursor(nextCursor) : undefined }, 200, {
      "cache-control": "no-store",
    });
  });
  app.post("/api/studio/projects", async (context) => {
    const session = await studioSession(context.req.header("cookie"), context.env);
    if (!session) return context.text("Unauthorized", 401);
    let project: StudioProjectInput;
    try { project = StudioProjectInputSchema.parse(await context.req.json()); } catch { return context.text("Project details are invalid", 400); }
    const projectId = project.projectId ?? `project-${crypto.randomUUID()}`;
    const revisionId = `revision-${crypto.randomUUID()}`;
    const stored = StudioProjectInputSchema.parse({ ...project, projectId });
    const result = await adminBoundary.saveStudioProject({ projectId, revisionId, parentRevisionId: stored.parentRevisionId, merchantId: session.merchantId, intent: stored.intent, source: "studio", project: stored }, context.env);
    if (result.conflict) return context.json({
      conflict: true, projectId, submittedParentRevisionId: stored.parentRevisionId, currentHeadRevisionId: result.headRevisionId,
    }, 409, { "cache-control": "no-store" });
    return context.json({ projectId, revisionId, result }, 201, { "cache-control": "no-store" });
  });
  app.post("/api/studio/projects/:projectId/build", async (context) => {
    const session = await studioSession(context.req.header("cookie"), context.env);
    if (!session) return context.text("Unauthorized", 401);
    const projectId = context.req.param("projectId");
    const stored = (await adminBoundary.listStudioProjects(session.merchantId, context.env)).find((entry) => entry.projectId === projectId);
    if (!stored) return context.text("Project not found", 404);

    let built: ReturnType<typeof buildStudioWebsite>;
    try {
      built = buildStudioWebsite(stored.project, { merchantId: session.merchantId, ownerWaIdHash: session.ownerWaIdHash });
    } catch (error) {
      if (error instanceof MissingStudioFactsError) return context.json({ stage: "needs_input", missing: error.missing }, 409, { "cache-control": "no-store" });
      if (error instanceof Error && error.message === "reels-only projects do not contain a website") return context.json({ stage: "reel_project", message: "This project does not include a website." }, 409, { "cache-control": "no-store" });
      throw error;
    }

    await adminBoundary.upsertMerchant(built.brief, await encryptSensitive(built.brief.orderWhatsAppNumber, context.env?.PROOFGATE_DATA_KEY), context.env);
    const versionId = `site-${stored.revisionId}`;
    const specHash = await sha256(canonicalize(built.spec));
    await adminBoundary.createCandidate({ spec: built.spec, versionId, specHash, actor: `studio:${session.ownerWaIdHash}` }, context.env);
    const previewExpiresAt = Date.now() + 24 * 60 * 60_000;
    const previewToken = await createPreviewToken({ siteId: built.spec.siteId, versionId, specHash, expiresAt: previewExpiresAt }, serviceSecret(context.env));
    const origin = new URL(context.req.url).origin;
    const previewUrl = `${origin}/preview/${previewToken}`;
    if (!context.env?.SITE_VERIFIER_URL) {
      return context.json({ stage: "verification_pending", siteId: built.spec.siteId, versionId, specHash, previewUrl, previewExpiresAt }, 202, { "cache-control": "no-store" });
    }

    const verificationToken = `pgv_${crypto.randomUUID().replace(/-/g, "")}`;
    const verificationExpiresAt = Date.now() + 30 * 60_000;
    await adminBoundary.mintVerification({ tokenHash: await sha256(verificationToken), merchantId: session.merchantId, siteId: built.spec.siteId, versionId, specHash, expiresAt: verificationExpiresAt }, context.env);
    const verification = await studioVerifierBoundary.run({
      verifierUrl: context.env.SITE_VERIFIER_URL,
      previewUrl,
      evidenceUrl: `${origin}/verification/${verificationToken}`,
      siteId: built.spec.siteId,
      versionId,
      specHash,
    });
    if (!verification.accepted || !verification.passed || verification.blockers.length) {
      return context.json({ stage: "verification_failed", siteId: built.spec.siteId, versionId, specHash, previewUrl, blockers: verification.blockers }, 422, { "cache-control": "no-store" });
    }

    const scopeHash = await sha256(canonicalize({ siteId: built.spec.siteId, versionId, specHash }));
    const approvalId = `approval-${crypto.randomUUID()}`;
    const requestId = `release-${crypto.randomUUID()}`;
    await adminBoundary.createReleaseRequest({ requestId, siteId: built.spec.siteId, merchantId: session.merchantId, versionId, specHash, scopeHash, approvalId }, context.env);
    const releaseChecklist = formatApprovalChecklist({
      type: "release", subject: `${built.spec.business.name} website`,
      details: ["Private preview is ready", "Independent checks passed", "Only your supplied details and selected media will publish"],
    });
    await adminBoundary.createApproval({ approvalId, merchantId: session.merchantId, type: "release", scopeHash, expiresAt: Date.now() + 86_400_000, checklist: releaseChecklist }, context.env);
    return context.json({
      stage: "approval_required", siteId: built.spec.siteId, versionId, specHash, previewUrl, previewExpiresAt,
      approval: {
        approvalId,
        checklist: releaseChecklist,
      },
    }, 201, { "cache-control": "no-store" });
  });
  app.post("/api/studio/projects/:projectId/reel", async (context) => {
    const session = await studioSession(context.req.header("cookie"), context.env);
    if (!session) return context.text("Unauthorized", 401);
    const stored = (await adminBoundary.listStudioProjects(session.merchantId, context.env)).find((entry) => entry.projectId === context.req.param("projectId"));
    if (!stored) return context.text("Project not found", 404);
    let built: ReturnType<typeof buildStudioReelPlan>;
    try { built = buildStudioReelPlan(stored.project, { merchantId: session.merchantId, ownerWaIdHash: session.ownerWaIdHash }); }
    catch (error) {
      if (error instanceof MissingStudioFactsError) return context.json({ stage: "needs_input", missing: error.missing }, 409);
      return context.text("Reel project is incomplete", 409);
    }
    const planHash = await sha256(canonicalize(built.plan));
    const usage = await adminBoundary.reserveUsage({
      merchantId: session.merchantId, operationId: `reel:${built.plan.reelId}`, idempotencyKey: `reserve:reel:${planHash}`,
      requestedAt: Date.now(), reservations: [
        { metric: "render_seconds", quantity: Math.ceil(built.plan.scenes.reduce((total, scene) => total + scene.durationMs, 0) / 1000) },
        { metric: "polly_characters", quantity: built.plan.voiceover.length },
      ],
    }, context.env);
    if (!usage.allowed) return context.json({ stage: "usage_limit", message: quotaExceededCustomerMessage(usage.blockingMetric ?? "render_seconds") }, 429, { "cache-control": "no-store" });
    const approvalId = `approval-${crypto.randomUUID()}`;
    await adminBoundary.registerReel(built.plan, planHash, approvalId, context.env);
    const reelChecklist = formatApprovalChecklist({
      type: "reel", subject: reelAngleLabel(built.plan.angle),
      details: ["Uses only your selected photos", "15 seconds, full-screen vertical", "Your own hook, proof, and call to action", "Sent back to you privately — never posted"],
    });
    await adminBoundary.createApproval({ approvalId, merchantId: session.merchantId, type: "reel", scopeHash: planHash, expiresAt: Date.now() + 86_400_000, checklist: reelChecklist }, context.env);
    return context.json({
      stage: "approval_required", reelId: built.plan.reelId, recommendations: built.recommendations,
      approval: { approvalId, checklist: reelChecklist },
    }, 201, { "cache-control": "no-store" });
  });
  app.get("/api/studio/approvals", async (context) => {
    const session = await studioSession(context.req.header("cookie"), context.env);
    if (!session) return context.text("Unauthorized", 401);
    return context.json({ approvals: await adminBoundary.listMerchantApprovals(session.merchantId, context.env) }, 200, { "cache-control": "no-store" });
  });
  app.post("/api/studio/approvals/:approvalId", async (context) => {
    const session = await studioSession(context.req.header("cookie"), context.env);
    if (!session) return context.text("Unauthorized", 401);
    const approvalId = context.req.param("approvalId");
    if (!/^approval-[a-zA-Z0-9_-]{8,128}$/.test(approvalId)) return context.text("Invalid approval", 400);
    let decision: "approved" | "denied";
    try {
      const value = (await context.req.json() as { decision?: unknown }).decision;
      if (value !== "approved" && value !== "denied") throw new Error("invalid decision");
      decision = value;
    } catch { return context.text("Choose approve or decline", 400); }
    const resolved = await adminBoundary.resolveStudioApproval({
      approvalId, merchantId: session.merchantId, ownerWaIdHash: session.ownerWaIdHash, decision,
      providerMessageId: `studio:${crypto.randomUUID()}`,
    }, context.env);
    if (!resolved.accepted) return context.text("Approval is invalid, expired, or already used", 409);
    if (decision === "denied") return context.json({ stage: "declined" }, 200, { "cache-control": "no-store" });
    if (resolved.type === "reel" && resolved.reelId) return context.json({ stage: "rendering", reelId: resolved.reelId }, 202, { "cache-control": "no-store" });
    const promoted = await adminBoundary.promoteRelease(context.env) as { promoted?: boolean; siteId?: string; versionId?: string };
    if (!promoted.promoted || !promoted.siteId) return context.json({ stage: "publication_pending" }, 202, { "cache-control": "no-store" });
    return context.json({ stage: "published", siteId: promoted.siteId, versionId: promoted.versionId, siteUrl: `${new URL(context.req.url).origin}/s/${promoted.siteId}` }, 200, { "cache-control": "no-store" });
  });
  app.get("/api/studio/reels/:reelId", async (context) => {
    const session = await studioSession(context.req.header("cookie"), context.env);
    if (!session) return context.text("Unauthorized", 401);
    const reelId = context.req.param("reelId");
    if (!/^[a-z0-9-]{3,64}$/.test(reelId)) return context.text("Invalid reel", 400);
    const reel = await adminBoundary.getReelStatus(reelId, session.merchantId, context.env);
    if (!reel) return context.notFound();
    return context.json({ status: reel.status, ...(reel.renderedAssetId && ["rendered", "delivering", "delivered", "delivery_failed"].includes(reel.status) ? { mediaUrl: `/api/studio/reels/${reelId}/media` } : {}) }, 200, { "cache-control": "no-store" });
  });
  app.get("/api/studio/reels/:reelId/media", async (context) => {
    const session = await studioSession(context.req.header("cookie"), context.env);
    if (!session) return context.text("Unauthorized", 401);
    const reelId = context.req.param("reelId");
    if (!/^[a-z0-9-]{3,64}$/.test(reelId)) return context.text("Invalid reel", 400);
    const reel = await adminBoundary.getReelStatus(reelId, session.merchantId, context.env);
    if (!reel?.renderedAssetId || !["rendered", "delivering", "delivered", "delivery_failed"].includes(reel.status)) return context.notFound();
    const media = await adminBoundary.getPrivateAsset(reel.renderedAssetId, context.env);
    if (!media || media.contentType !== "video/mp4") return context.notFound();
    return new Response(media.body as BodyInit, { headers: { "content-type": "video/mp4", "cache-control": "private, no-store", "content-disposition": `attachment; filename="${reelId}.mp4"`, "x-content-type-options": "nosniff" } });
  });
  app.put("/api/studio/assets/:localAssetId", async (context) => {
    const session = await studioSession(context.req.header("cookie"), context.env);
    if (!session) return context.text("Unauthorized", 401);
    const projectId = context.req.header("x-axcas-project-id");
    if (!projectId || !(await adminBoundary.listStudioProjects(session.merchantId, context.env)).some((project) => project.projectId === projectId)) return context.text("Project not found", 404);
    const localAssetId = context.req.param("localAssetId");
    const contentType = context.req.header("content-type") ?? "application/octet-stream";
    if (!/^[a-zA-Z0-9_-]{3,100}$/.test(localAssetId)) return context.text("Invalid asset metadata", 400);
    if (!/^image\/(jpeg|png|webp)$/.test(contentType) && contentType !== "video/mp4") return context.text("Unsupported asset type", 415);
    const body = new Uint8Array(await context.req.arrayBuffer());
    if (body.byteLength === 0 || body.byteLength > MAX_ASSET_BYTES) return context.text("Asset size is invalid", 413);
    if (!hasValidAssetSignature(contentType, body)) return context.text("Asset content does not match its declared type", 415);
    const assetId = tenantScopedAssetId(session, localAssetId);
    const digest = await sha256Bytes(body);
    const operationId = `asset:${assetId}:${digest}`;
    const usage = await adminBoundary.reserveUsage({ merchantId: session.merchantId, operationId, idempotencyKey: `reserve:${operationId}`, requestedAt: Date.now(), reservations: [{ metric: "storage_bytes", quantity: body.byteLength }] }, context.env);
    if (!usage.allowed) return context.json({ stage: "usage_limit", message: quotaExceededCustomerMessage("storage_bytes") }, 429, { "cache-control": "no-store" });
    const result = await adminBoundary.uploadAsset({
      assetId, merchantId: session.merchantId, sha256: digest, contentType, byteLength: body.byteLength,
      sourceProviderMessageId: `studio:${projectId}:${crypto.randomUUID()}`, body,
    }, context.env);
    await adminBoundary.recordActualUsage({ usageEntryId: `actual:${operationId}`, idempotencyKey: `actual:${operationId}`, operationId, merchantId: session.merchantId, metric: "storage_bytes", quantity: body.byteLength, evidenceRef: `sha256:${digest}`, occurredAt: Date.now() }, context.env);
    return context.json({ accepted: true, assetId, storageBackend: result.storageBackend }, 201);
  });
  const legalHeaders = {
    "cache-control": "public, max-age=3600",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  } as const;
  app.get("/privacy", (context) => context.html(renderPrivacyPolicy(), 200, legalHeaders));
  app.get("/data-deletion", (context) => context.html(renderDataDeletion(), 200, legalHeaders));
  app.get("/terms", (context) => context.html(renderTermsOfService(), 200, legalHeaders));
  app.get("/health", (context) => context.json({ service: "proofgate-edge", phase: "whatsapp-growth-p0", status: "ok" }));
  app.get("/preview/:token/assets/:assetId", async (context) => {
    const secret = context.env?.PROOFGATE_SERVICE_SECRET;
    if (!secret) return context.text("Preview service unavailable", 503);
    const claims = await verifyPreviewToken(context.req.param("token"), secret);
    if (!claims) return context.text("Preview link is invalid or expired", 403);
    const site = await adminBoundary.getPreviewSite(claims.siteId, claims.versionId, claims.specHash, context.env);
    const assetId = context.req.param("assetId");
    if (!site || !selectedPreviewAssetIds(site.spec).has(assetId)) return context.notFound();
    const asset = await adminBoundary.getPrivateAsset(assetId, context.env);
    if (!asset) return context.notFound();
    return new Response(asset.body as BodyInit, { headers: {
      "content-type": asset.contentType, etag: asset.etag, "cache-control": "private, no-store",
      "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow",
    } });
  });
  app.get("/preview/:token", async (context) => {
    const secret = context.env?.PROOFGATE_SERVICE_SECRET;
    if (!secret) return context.text("Preview service unavailable", 503);
    const token = context.req.param("token");
    const claims = await verifyPreviewToken(token, secret);
    if (!claims) return context.text("Preview link is invalid or expired", 403);
    const site = await adminBoundary.getPreviewSite(claims.siteId, claims.versionId, claims.specHash, context.env);
    if (!site) return context.text("Preview is no longer current", 410);
    return context.html(renderBusinessSite(site.spec, site, { assetBasePath: `/preview/${token}/assets`, preview: true }), 200, {
      "cache-control": "private, no-store",
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow",
      "x-proofgate-spec-hash": site.specHash, "x-proofgate-version-id": site.versionId,
    });
  });
  app.get("/s/:slug", async (context) => {
    const slug = context.req.param("slug");
    const growthSite = await growthBoundary.getPublishedSite(slug, context.env);
    if (growthSite) {
      const sessionId = sessionIdFromCookie(context.req.header("cookie")) ?? crypto.randomUUID();
      await growthBoundary.appendEvent({
        eventId: crypto.randomUUID(), type: "page_view", siteId: slug, versionId: growthSite.versionId,
        specHash: growthSite.specHash, sessionHash: await sha256(sessionId), occurredAt: Date.now(),
      }, context.env);
      return context.html(renderBusinessSite(growthSite.spec, growthSite), 200, {
        "cache-control": "no-store",
        "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "x-proofgate-spec-hash": growthSite.specHash,
        "x-proofgate-version-id": growthSite.versionId,
        "set-cookie": `pgsid=${sessionId}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax`,
      });
    }
    if (slug !== initialSpikeSiteSpec.siteId) return context.notFound();
    const spec = SiteSpecSchema.parse(initialSpikeSiteSpec);
    const specHash = await sha256(canonicalize(spec));
    return context.html(renderSite(spec), 200, {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-proofgate-spec-hash": specHash,
      "x-proofgate-version-id": "spike-a-v1",
    });
  });
  app.get("/r/whatsapp/:siteId/:itemId", async (context) => {
    const site = await growthBoundary.getPublishedSite(context.req.param("siteId"), context.env);
    if (!site) return context.notFound();
    const itemId = context.req.param("itemId");
    const item = site.spec.catalog.find((candidate) => candidate.id === itemId);
    if (itemId !== "general" && (!item || !item.available)) return context.notFound();
    const sessionId = sessionIdFromCookie(context.req.header("cookie")) ?? crypto.randomUUID();
    await growthBoundary.appendEvent({
      eventId: crypto.randomUUID(), type: "whatsapp_cta_click", siteId: site.spec.siteId, versionId: site.versionId,
      specHash: site.specHash, sessionHash: await sha256(sessionId), itemId,
      source: cleanDimension(context.req.query("source")), campaign: cleanDimension(context.req.query("campaign")), occurredAt: Date.now(),
    }, context.env);
    const number = site.spec.business.orderWhatsAppNumber.replace(/\D/g, "");
    const message = item?.whatsappMessage ?? site.spec.whatsappCta.defaultMessage;
    const encodedMessage = encodeURIComponent(message).replace(/'/g, "%27");
    return context.redirect(`https://wa.me/${number}?text=${encodedMessage}`, 302);
  });
  app.get("/assets/:assetId", async (context) => {
    const assetId = context.req.param("assetId");
    if (!/^[a-zA-Z0-9_-]{3,128}$/.test(assetId)) return context.notFound();
    const asset = await growthBoundary.getAsset(assetId, context.env);
    if (!asset) return context.notFound();
    return new Response(asset.body as BodyInit, { headers: { "content-type": asset.contentType, etag: asset.etag, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
  });
  app.get("/whatsapp/webhook", (context) => {
    const mode = context.req.query("hub.mode");
    const token = context.req.query("hub.verify_token");
    const challenge = context.req.query("hub.challenge");
    if (mode !== "subscribe" || !challenge || token !== context.env?.META_VERIFY_TOKEN) return context.text("Forbidden", 403);
    return context.text(challenge, 200);
  });
  app.post("/whatsapp/webhook", async (context) => {
    const rawBody = new Uint8Array(await context.req.arrayBuffer());
    const body = new TextDecoder().decode(rawBody);
    if (!context.env?.META_APP_SECRET || !await verifyMetaWebhookSignature(body, context.req.header("x-hub-signature-256"), context.env.META_APP_SECRET)) {
      return context.text("Invalid Meta signature", 401);
    }
    let payload: unknown;
    try { payload = JSON.parse(body); } catch { return context.text("Invalid JSON", 400); }
    const approval = extractProofGateApproval(payload);
    if (approval) {
      const result = await growthBoundary.resolveApproval(approval, context.env);
      return context.json(result, result.accepted ? 200 : 409);
    }
    const studioLink = extractStudioLinkMessage(payload);
    if (studioLink) {
      const tenant = await deriveTenantIdentity(studioLink.senderWaId);
      const result = await adminBoundary.claimStudioLink({
        codeHash: await sha256(studioLink.code), merchantId: tenant.merchantId,
        ownerWaIdHash: tenant.ownerWaIdHash, providerMessageId: studioLink.providerMessageId,
      }, context.env);
      if (!result.linked) return context.json({ linked: false }, 409);
      if (context.env?.META_PHONE_NUMBER_ID && context.env.META_ACCESS_TOKEN) {
        const operationId = `wa-out:studio-link:${studioLink.providerMessageId}`;
        const messageUsage = await reserveOutboundMessage(tenant.merchantId, operationId, context.env);
        if (!messageUsage.allowed) return context.json({ linked: true, delivery: "usage_limit", message: quotaExceededCustomerMessage("whatsapp_messages") }, 200);
        const receipt = await sendTextMessage({
          graphApiVersion: context.env.META_GRAPH_API_VERSION ?? "v20.0", phoneNumberId: context.env.META_PHONE_NUMBER_ID,
          accessToken: context.env.META_ACCESS_TOKEN, recipientWaId: studioLink.senderWaId,
          body: `✅ Your browser is connected. You can carry on here in WhatsApp, or pick up the same projects at ${new URL(context.req.url).origin}/studio`,
        });
        await recordOutboundMessage(tenant.merchantId, operationId, receipt.providerMessageId, context.env);
      }
      return context.json({ linked: true }, 200);
    }
    const inbound = ordinaryMetaMessages(payload);
    if (!inbound.length) return growthBoundary.forwardToHermes(rawBody, context.req.raw.headers, context.env);
    const workflows = await Promise.all(inbound.map(async (message) => {
      const tenant = await deriveTenantIdentity(message.senderWaId);
      const workflowId = await workflowIdForProviderMessage(message.providerMessageId);
      const result = await adminBoundary.beginInboundWorkflow({
        workflowId, merchantId: tenant.merchantId, ownerWaIdHash: tenant.ownerWaIdHash,
        channel: "whatsapp_cloud", providerMessageId: message.providerMessageId,
      }, context.env);
      return { ...result, workflowId };
    }));
    const created = workflows.filter((workflow) => workflow.created);
    if (!created.length) return context.json({ accepted: true, duplicate: true, workflowIds: workflows.map((workflow) => workflow.workflowId) }, 200);
    const createdById = new Set(created.map(({ workflowId }) => workflowId));
    const newMessages = (await Promise.all(inbound.map(async (message) => {
      const workflowId = await workflowIdForProviderMessage(message.providerMessageId);
      if (!createdById.has(workflowId)) return null;
      const tenant = await deriveTenantIdentity(message.senderWaId);
      await adminBoundary.recordActualUsage({
        usageEntryId: `actual:wa-in:${message.providerMessageId}`, idempotencyKey: `actual:wa-in:${message.providerMessageId}`,
        operationId: `wa-in:${message.providerMessageId}`, merchantId: tenant.merchantId, metric: "whatsapp_messages", quantity: 1,
        evidenceRef: `meta:${message.providerMessageId}`, occurredAt: Date.now(),
      }, context.env);
      const usage = await adminBoundary.reserveUsage({
        merchantId: tenant.merchantId, operationId: `model-turn:${message.providerMessageId}`,
        idempotencyKey: `reserve:model-turn:${message.providerMessageId}`, requestedAt: Date.now(), reservations: [{ metric: "model_turns", quantity: 1 }],
      }, context.env);
      return { workflowId, tenant, usage, senderWaId: message.senderWaId };
    }))).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const blocked = newMessages.filter(({ usage }) => !usage.allowed);
    if (blocked.length) {
      await Promise.all(blocked.flatMap(({ workflowId, tenant, usage, senderWaId }) => [
        adminBoundary.recordWorkflowProgress({ workflowId, eventId: `${workflowId}:usage-limit`, status: "retrying", progress: "temporary_retry" }, context.env),
        deliverCustomerMessage({
          workflowId, merchantId: tenant.merchantId, recipientWaId: senderWaId, kind: "retry",
          body: quotaExceededCustomerMessage(usage.blockingMetric ?? "model_turns"), dedupeKey: `${workflowId}:usage-limit`,
        }, context.env),
      ]));
      return context.json({ accepted: true, stage: "usage_limit", message: quotaExceededCustomerMessage(blocked[0]!.usage.blockingMetric ?? "model_turns") }, 200);
    }
    const forwarded = await growthBoundary.forwardToHermes(rawBody, context.req.raw.headers, context.env);
    const status = WorkflowStatusSchema.parse(forwarded.ok ? "processing" : "retrying");
    const progress = WorkflowProgressSchema.parse(forwarded.ok ? "message_received" : "temporary_retry");
    await Promise.all(created.map((workflow) => adminBoundary.recordWorkflowProgress({
      workflowId: workflow.workflowId, eventId: `${workflow.workflowId}:${forwarded.ok ? "forwarded" : "retrying"}`, status, progress,
    }, context.env)));
    const receiptCopy = customerProgressMessage(progress);
    if (receiptCopy) {
      await Promise.all(newMessages.map(({ workflowId, tenant, senderWaId }) => deliverCustomerMessage({
        workflowId, merchantId: tenant.merchantId, recipientWaId: senderWaId,
        kind: forwarded.ok ? "progress" : "retry", body: receiptCopy, dedupeKey: `${workflowId}:${progress}`,
      }, context.env)));
    }
    return forwarded;
  });
  app.post("/webhooks/vapi", async (context) => {
    const body = await context.req.text();
    const authenticated = context.env?.VAPI_WEBHOOK_SECRET && await authenticateVapiWebhook(body, {
      timestamp: context.req.header("x-vapi-timestamp"), signature: context.req.header("x-vapi-signature"),
    }, context.env.VAPI_WEBHOOK_SECRET);
    if (!authenticated) return context.text("Invalid Vapi signature", 401);
    let payload: unknown;
    try { payload = JSON.parse(body); } catch { return context.text("Invalid JSON", 400); }
    return context.json(await growthBoundary.ingestVapiReport(payload, context.env), 200);
  });
  app.post("/verification/:token", async (context) => {
    const token = context.req.param("token");
    if (!/^pgv_[a-zA-Z0-9_-]{20,128}$/.test(token)) return context.text("Invalid verification capability", 400);
    const payload = await context.req.json() as { evidenceId?: string; siteId?: string; versionId?: string; specHash?: string; runId?: string; passed?: boolean; blockers?: unknown; observedAt?: number; report?: unknown };
    if (!payload.evidenceId || !payload.siteId || !payload.versionId || !payload.specHash || !payload.runId || typeof payload.passed !== "boolean" || !Array.isArray(payload.blockers) || payload.blockers.some((item) => typeof item !== "string") || !Number.isFinite(payload.observedAt)) return context.text("Invalid verification evidence", 400);
    const result = await growthBoundary.submitVerification({
      tokenHash: await sha256(token), evidenceId: payload.evidenceId, siteId: payload.siteId, versionId: payload.versionId,
      specHash: payload.specHash, runId: payload.runId, reportHash: await sha256(canonicalize(payload.report)),
      passed: payload.passed, blockers: payload.blockers.slice(0, 50) as string[], observedAt: payload.observedAt!,
    }, context.env);
    return context.json(result, result.accepted ? 201 : 409);
  });
  app.post("/internal/intake", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const hermesUserId = context.req.header("x-hermes-user-id");
    if (!hermesUserId) return context.text("Authenticated WhatsApp sender is required", 400);
    let identity;
    try { identity = await deriveTenantIdentity(hermesUserId); } catch { return context.text("Invalid WhatsApp sender identity", 400); }
    const submitted = await context.req.json() as Record<string, unknown>;
    if ((submitted.merchantId && submitted.merchantId !== identity.merchantId) || (submitted.ownerWaIdHash && submitted.ownerWaIdHash !== identity.ownerWaIdHash)) {
      return context.text("Hermes owner identity mismatch", 403);
    }
    const { merchantId: _merchantId, ownerWaIdHash: _ownerWaIdHash, ...merchantInput } = submitted;
    const intake = StudioIntakeInputSchema.parse(merchantInput);
    const { projectId: requestedProjectId, projectIntent = "website", ...briefInput } = intake;
    const brief = BusinessBriefSchema.parse({ ...BusinessBriefInputSchema.parse(briefInput), ...identity });
    const result = await adminBoundary.upsertMerchant(brief, await encryptSensitive(brief.orderWhatsAppNumber, context.env?.PROOFGATE_DATA_KEY), context.env);
    const project = studioProjectFromBusinessBrief(brief, { intent: projectIntent, projectId: requestedProjectId });
    const revisionId = `revision-whatsapp-${(await sha256(canonicalize({ brief, projectId: project.projectId, intent: project.intent }))).slice(0, 32)}`;
    const existing = (await adminBoundary.listStudioProjects(brief.merchantId, context.env)).find((entry) => entry.projectId === project.projectId);
    const studioResult = await adminBoundary.saveStudioProject({
      projectId: project.projectId!, revisionId, parentRevisionId: existing?.revisionId,
      merchantId: brief.merchantId, intent: project.intent, source: "whatsapp",
      project: existing ? StudioProjectInputSchema.parse({ ...project, parentRevisionId: existing.revisionId }) : project,
    }, context.env);
    if (studioResult.conflict) return context.json({ accepted: false, conflict: true, projectId: project.projectId, currentHeadRevisionId: studioResult.headRevisionId }, 409);
    const providerMessageId = context.req.header("x-hermes-message-id");
    if (providerMessageId) {
      const workflowId = await workflowIdForProviderMessage(providerMessageId);
      await adminBoundary.recordWorkflowProgress({
        workflowId, eventId: `${workflowId}:brief-saved:${revisionId}`, status: "processing", progress: "brief_saved",
        projectId: project.projectId, intent: project.intent,
      }, context.env);
    }
    return context.json({ accepted: true, merchantId: brief.merchantId, result, studio: { projectId: project.projectId, revisionId, intent: project.intent, result: studioResult } }, 201);
  });
  app.post("/internal/policy", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const policy = DecisionPolicySchema.parse(await context.req.json());
    const tenant = await tenantFromHermesHeader(context.req.header("x-hermes-user-id"));
    if (!tenant) return context.text("Authenticated WhatsApp sender is required", 400);
    if (tenant.ownerWaIdHash !== policy.ownerWaIdHash || tenant.merchantId !== policy.merchantId) return context.text("Hermes owner identity mismatch", 403);
    const policyHash = await sha256(canonicalize(policy));
    const result = await adminBoundary.saveDecisionPolicy({ policy, policyHash }, context.env);
    return context.json({ accepted: true, policyId: policy.policyId, policyHash, result }, 201);
  });
  app.post("/internal/decision", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const request = DecisionRequestSchema.parse(await context.req.json());
    const tenant = await tenantFromHermesHeader(context.req.header("x-hermes-user-id"));
    if (!tenant) return context.text("Authenticated WhatsApp sender is required", 400);
    if (tenant.merchantId !== request.merchantId) return context.text("Hermes tenant identity mismatch", 403);
    const policy = await adminBoundary.getDecisionPolicy(request.merchantId, context.env);
    if (!policy) return context.json({ decision: "require_policy", reason: "merchant_policy_not_configured" }, 409);
    return context.json(evaluateDecision(policy, request), 200);
  });
  app.post("/internal/candidate", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const payload = await context.req.json() as { spec?: unknown; versionId?: string; parentVersionId?: string };
    const spec = SiteSpecV2Schema.parse(payload.spec);
    const tenant = await tenantFromHermesHeader(context.req.header("x-hermes-user-id"));
    if (!tenant) return context.text("Authenticated WhatsApp sender is required", 400);
    if (tenant.merchantId !== spec.business.merchantId) return context.text("Hermes tenant identity mismatch", 403);
    if (!payload.versionId || !/^[a-zA-Z0-9_-]{3,128}$/.test(payload.versionId)) return context.text("Invalid version ID", 400);
    const specHash = await sha256(canonicalize(spec));
    const result = await adminBoundary.createCandidate({ spec, versionId: payload.versionId, parentVersionId: payload.parentVersionId, specHash, actor: `hermes:${tenant.ownerWaIdHash}` }, context.env);
    const previewExpiresAt = Date.now() + 24 * 60 * 60_000;
    const previewToken = await createPreviewToken({ siteId: spec.siteId, versionId: payload.versionId, specHash, expiresAt: previewExpiresAt }, serviceSecret(context.env));
    const previewUrl = `${new URL(context.req.url).origin}/preview/${previewToken}`;
    return context.json({ accepted: true, specHash, previewUrl, previewExpiresAt, result }, 201);
  });
  app.post("/internal/verification-capability", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const payload = await context.req.json() as { siteId?: string; merchantId?: string; versionId?: string; specHash?: string };
    const tenant = await tenantFromHermesHeader(context.req.header("x-hermes-user-id"));
    if (!tenant) return context.text("Authenticated WhatsApp sender is required", 400);
    if (!payload.siteId || !payload.versionId || !/^[a-f0-9]{64}$/.test(payload.specHash ?? "")) return context.text("Invalid candidate scope", 400);
    if (payload.merchantId !== tenant.merchantId) return context.text("Hermes tenant identity mismatch", 403);
    const token = `pgv_${crypto.randomUUID().replace(/-/g, "")}`;
    const expiresAt = Date.now() + 30 * 60_000;
    await adminBoundary.mintVerification({ tokenHash: await sha256(token), merchantId: tenant.merchantId, siteId: payload.siteId, versionId: payload.versionId, specHash: payload.specHash!, expiresAt }, context.env);
    return context.json({ token, expiresAt, evidenceUrl: `/verification/${token}` }, 201);
  });
  app.post("/internal/release", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const payload = await context.req.json() as { siteId?: string; merchantId?: string; versionId?: string; specHash?: string };
    if (!payload.siteId || !payload.merchantId || !payload.versionId || !/^[a-f0-9]{64}$/.test(payload.specHash ?? "")) return context.text("Invalid release scope", 400);
    const tenant = await tenantFromHermesHeader(context.req.header("x-hermes-user-id"));
    if (!tenant) return context.text("Authenticated WhatsApp sender is required", 400);
    if (payload.merchantId !== tenant.merchantId) return context.text("Hermes tenant identity mismatch", 403);
    const scopeHash = await sha256(canonicalize({ siteId: payload.siteId, versionId: payload.versionId, specHash: payload.specHash }));
    const approvalId = `approval-${crypto.randomUUID()}`;
    const requestId = `release-${crypto.randomUUID()}`;
    await adminBoundary.createReleaseRequest({ requestId, siteId: payload.siteId, merchantId: payload.merchantId, versionId: payload.versionId, specHash: payload.specHash!, scopeHash, approvalId }, context.env);
    const releaseChecklist = formatApprovalChecklist({
      type: "release", subject: `${siteDisplayName(payload.siteId)} website`, details: ["You reviewed the private preview", "Checked on a phone, including the WhatsApp button", "Only your own words, prices, and photos"],
    });
    await adminBoundary.createApproval({ approvalId, merchantId: payload.merchantId, type: "release", scopeHash, expiresAt: Date.now() + 86_400_000, checklist: releaseChecklist }, context.env);
    const recipientWaId = context.req.header("x-hermes-user-id")?.replace(/\D/g, "");
    if (!recipientWaId || !context.env?.META_PHONE_NUMBER_ID || !context.env.META_ACCESS_TOKEN) return context.json({ accepted: true, requestId, approvalId, scopeHash, delivery: "blocked_missing_meta_configuration" }, 202);
    const releaseMessageOperation = `wa-out:approval:${approvalId}`;
    if (!(await reserveOutboundMessage(payload.merchantId, releaseMessageOperation, context.env)).allowed) return context.json({ accepted: true, requestId, approvalId, scopeHash, delivery: "usage_limit", message: quotaExceededCustomerMessage("whatsapp_messages") }, 202);
    const receipt = await sendApprovalButtons({ graphApiVersion: context.env.META_GRAPH_API_VERSION ?? "v20.0", phoneNumberId: context.env.META_PHONE_NUMBER_ID, accessToken: context.env.META_ACCESS_TOKEN, recipientWaId, approvalId, body: releaseChecklist });
    await recordOutboundMessage(payload.merchantId, releaseMessageOperation, receipt.providerMessageId, context.env);
    await adminBoundary.attachApprovalMessage(approvalId, receipt.providerMessageId, context.env);
    return context.json({ accepted: true, requestId, approvalId, scopeHash, providerMessageId: receipt.providerMessageId }, 201);
  });
  app.post("/internal/lead", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const payload = await context.req.json() as { merchantId?: string; consent?: unknown };
    if (!payload.merchantId) return context.text("merchantId is required", 400);
    const tenant = await tenantFromHermesHeader(context.req.header("x-hermes-user-id"));
    if (!tenant) return context.text("Authenticated WhatsApp sender is required", 400);
    if (payload.merchantId !== tenant.merchantId) return context.text("Hermes tenant identity mismatch", 403);
    const consent = LeadConsentSchema.parse(payload.consent);
    return context.json({ accepted: true, result: await adminBoundary.registerLead(payload.merchantId, consent, context.env) }, 201);
  });
  app.post("/internal/call-batch", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const submitted = await context.req.json() as CallBatch;
    const { scopeHash: submittedScopeHash, ...batchInput } = submitted;
    const batch = await createCallBatch(batchInput);
    if (submittedScopeHash !== batch.scopeHash) return context.text("Call batch scope hash mismatch", 409);
    const tenant = await tenantFromHermesHeader(context.req.header("x-hermes-user-id"));
    if (!tenant) return context.text("Authenticated WhatsApp sender is required", 400);
    if (batch.merchantId !== tenant.merchantId) return context.text("Hermes tenant identity mismatch", 403);
    const callUsage = await adminBoundary.reserveUsage({
      merchantId: batch.merchantId, operationId: `call-batch:${batch.batchId}`, idempotencyKey: `reserve:call-batch:${batch.scopeHash}`,
      requestedAt: Date.now(), reservations: [{ metric: "call_cost_microusd", quantity: Math.ceil(batch.costCapUsd * 1_000_000) }],
    }, context.env);
    if (!callUsage.allowed) return context.json({ accepted: false, stage: "usage_limit", message: quotaExceededCustomerMessage("call_cost_microusd") }, 429);
    const approvalId = `approval-${crypto.randomUUID()}`;
    await adminBoundary.createCallBatch(batch, approvalId, context.env);
    const callChecklist = formatApprovalChecklist({
      type: "call_batch", subject: `${batch.leadIds.length} customer call${batch.leadIds.length === 1 ? "" : "s"}`,
      details: ["Only people who agreed to be contacted", "One call each — nobody is called twice", `Total spend will not go above $${batch.costCapUsd.toFixed(2)}`, "Recording starts only if they say yes"],
    });
    await adminBoundary.createApproval({ approvalId, merchantId: batch.merchantId, type: "call_batch", scopeHash: batch.scopeHash, expiresAt: Date.now() + 86_400_000, checklist: callChecklist }, context.env);
    const recipientWaId = context.req.header("x-hermes-user-id")?.replace(/\D/g, "");
    if (!recipientWaId || !context.env?.META_PHONE_NUMBER_ID || !context.env?.META_ACCESS_TOKEN) return context.json({ accepted: true, approvalId, delivery: "blocked_missing_meta_configuration" }, 202);
    const callMessageOperation = `wa-out:approval:${approvalId}`;
    if (!(await reserveOutboundMessage(batch.merchantId, callMessageOperation, context.env)).allowed) return context.json({ accepted: true, approvalId, delivery: "usage_limit", message: quotaExceededCustomerMessage("whatsapp_messages") }, 202);
    const receipt = await sendApprovalButtons({ graphApiVersion: context.env.META_GRAPH_API_VERSION ?? "v20.0", phoneNumberId: context.env.META_PHONE_NUMBER_ID, accessToken: context.env.META_ACCESS_TOKEN, recipientWaId, approvalId, body: callChecklist });
    await recordOutboundMessage(batch.merchantId, callMessageOperation, receipt.providerMessageId, context.env);
    await adminBoundary.attachApprovalMessage(approvalId, receipt.providerMessageId, context.env);
    return context.json({ accepted: true, approvalId, providerMessageId: receipt.providerMessageId }, 201);
  });
  app.post("/internal/reel", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const plan = ReelPlanSchema.parse(await context.req.json());
    const tenant = await tenantFromHermesHeader(context.req.header("x-hermes-user-id"));
    if (!tenant) return context.text("Authenticated WhatsApp sender is required", 400);
    if (plan.merchantId !== tenant.merchantId) return context.text("Hermes tenant identity mismatch", 403);
    const planHash = await sha256(canonicalize(plan));
    const reelUsage = await adminBoundary.reserveUsage({
      merchantId: plan.merchantId, operationId: `reel:${plan.reelId}`, idempotencyKey: `reserve:reel:${planHash}`,
      requestedAt: Date.now(), reservations: [
        { metric: "render_seconds", quantity: Math.ceil(plan.scenes.reduce((total, scene) => total + scene.durationMs, 0) / 1000) },
        { metric: "polly_characters", quantity: plan.voiceover.length },
      ],
    }, context.env);
    if (!reelUsage.allowed) return context.json({ accepted: false, stage: "usage_limit", message: quotaExceededCustomerMessage(reelUsage.blockingMetric ?? "render_seconds") }, 429);
    const approvalId = `approval-${crypto.randomUUID()}`;
    await adminBoundary.registerReel(plan, planHash, approvalId, context.env);
    const whatsappReelChecklist = formatApprovalChecklist({
      type: "reel", subject: reelAngleLabel(plan.angle), details: ["Uses only the photos you chose", "Says only what you told me", "Full-screen vertical, with text kept clear of the edges", "Sent back to you here — never posted for you"],
    });
    await adminBoundary.createApproval({ approvalId, merchantId: plan.merchantId, type: "reel", scopeHash: planHash, expiresAt: Date.now() + 86_400_000, checklist: whatsappReelChecklist }, context.env);
    const recipientWaId = context.req.header("x-hermes-user-id")?.replace(/\D/g, "");
    if (!recipientWaId || !context.env?.META_PHONE_NUMBER_ID || !context.env?.META_ACCESS_TOKEN) return context.json({ accepted: true, approvalId, planHash, delivery: "blocked_missing_meta_configuration" }, 202);
    const reelMessageOperation = `wa-out:approval:${approvalId}`;
    if (!(await reserveOutboundMessage(plan.merchantId, reelMessageOperation, context.env)).allowed) return context.json({ accepted: true, approvalId, planHash, delivery: "usage_limit", message: quotaExceededCustomerMessage("whatsapp_messages") }, 202);
    const receipt = await sendApprovalButtons({ graphApiVersion: context.env.META_GRAPH_API_VERSION ?? "v20.0", phoneNumberId: context.env.META_PHONE_NUMBER_ID, accessToken: context.env.META_ACCESS_TOKEN, recipientWaId, approvalId, body: whatsappReelChecklist });
    await recordOutboundMessage(plan.merchantId, reelMessageOperation, receipt.providerMessageId, context.env);
    await adminBoundary.attachApprovalMessage(approvalId, receipt.providerMessageId, context.env);
    return context.json({ accepted: true, approvalId, planHash, providerMessageId: receipt.providerMessageId }, 201);
  });
  app.post("/internal/social-campaign", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const submitted = await context.req.json() as SocialCampaign;
    const { scopeHash: submittedScopeHash, ...campaignInput } = submitted;
    const campaign = await createSocialCampaign(campaignInput);
    if (submittedScopeHash !== campaign.scopeHash) return context.text("Social campaign scope hash mismatch", 409);
    const tenant = await tenantFromHermesHeader(context.req.header("x-hermes-user-id"));
    if (!tenant) return context.text("Authenticated WhatsApp sender is required", 400);
    if (campaign.merchantId !== tenant.merchantId) return context.text("Hermes tenant identity mismatch", 403);
    const approvalId = `approval-${crypto.randomUUID()}`;
    await adminBoundary.registerSocialCampaign({ campaign, approvalId }, context.env);
    const campaignChecklist = formatApprovalChecklist({
      type: "social_campaign", subject: "three Instagram posts",
      details: ["Exactly the three reels you approved", "Captions and posting times are fixed", "I check how they do after 2 hours, 1 day, and 3 days", "No extra posts and no silent changes"],
    });
    await adminBoundary.createApproval({
      approvalId, merchantId: campaign.merchantId, type: "social_campaign", scopeHash: campaign.scopeHash,
      expiresAt: Date.now() + 86_400_000, checklist: campaignChecklist,
    }, context.env);
    const recipientWaId = context.req.header("x-hermes-user-id")?.replace(/\D/g, "");
    if (!recipientWaId || !context.env?.META_PHONE_NUMBER_ID || !context.env.META_ACCESS_TOKEN) {
      return context.json({ accepted: true, approvalId, scopeHash: campaign.scopeHash, delivery: "blocked_missing_meta_configuration" }, 202);
    }
    const campaignMessageOperation = `wa-out:approval:${approvalId}`;
    if (!(await reserveOutboundMessage(campaign.merchantId, campaignMessageOperation, context.env)).allowed) return context.json({ accepted: true, approvalId, scopeHash: campaign.scopeHash, delivery: "usage_limit", message: quotaExceededCustomerMessage("whatsapp_messages") }, 202);
    const receipt = await sendApprovalButtons({
      graphApiVersion: context.env.META_GRAPH_API_VERSION ?? "v20.0", phoneNumberId: context.env.META_PHONE_NUMBER_ID,
      accessToken: context.env.META_ACCESS_TOKEN, recipientWaId, approvalId,
      body: campaignChecklist,
    });
    await recordOutboundMessage(campaign.merchantId, campaignMessageOperation, receipt.providerMessageId, context.env);
    await adminBoundary.attachApprovalMessage(approvalId, receipt.providerMessageId, context.env);
    return context.json({ accepted: true, approvalId, scopeHash: campaign.scopeHash, providerMessageId: receipt.providerMessageId }, 201);
  });
  app.put("/internal/assets/:assetId", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const localAssetId = context.req.param("assetId");
    const merchantId = context.req.header("x-proofgate-merchant-id");
    const sourceProviderMessageId = context.req.header("x-proofgate-source-message-id");
    const contentType = context.req.header("content-type") ?? "application/octet-stream";
    if (!/^[a-zA-Z0-9_-]{3,100}$/.test(localAssetId) || !sourceProviderMessageId) return context.text("Invalid asset metadata", 400);
    const tenant = await tenantFromHermesHeader(context.req.header("x-hermes-user-id"));
    if (!tenant) return context.text("Authenticated WhatsApp sender is required", 400);
    if (merchantId && merchantId !== tenant.merchantId) return context.text("Hermes tenant identity mismatch", 403);
    const boundMerchantId = tenant.merchantId;
    const assetId = tenantScopedAssetId(tenant, localAssetId);
    if (!/^image\/(jpeg|png|webp)$/.test(contentType) && contentType !== "video/mp4" && !/^audio\/(mpeg|ogg)$/.test(contentType)) return context.text("Unsupported asset type", 415);
    const body = new Uint8Array(await context.req.arrayBuffer());
    if (body.byteLength === 0 || body.byteLength > MAX_ASSET_BYTES) return context.text("Asset size is invalid", 413);
    if (!hasValidAssetSignature(contentType, body)) return context.text("Asset content does not match its declared type", 415);
    const digest = await sha256Bytes(body);
    const operationId = `asset:${assetId}:${digest}`;
    const assetUsage = await adminBoundary.reserveUsage({ merchantId: boundMerchantId, operationId, idempotencyKey: `reserve:${operationId}`, requestedAt: Date.now(), reservations: [{ metric: "storage_bytes", quantity: body.byteLength }] }, context.env);
    if (!assetUsage.allowed) return context.json({ accepted: false, stage: "usage_limit", message: quotaExceededCustomerMessage("storage_bytes") }, 429);
    if (!context.env?.PROOFGATE_ASSETS) {
      const result = await adminBoundary.uploadAsset({ assetId, merchantId: boundMerchantId, sha256: digest, contentType, byteLength: body.byteLength, sourceProviderMessageId, body }, context.env);
      await adminBoundary.recordActualUsage({ usageEntryId: `actual:${operationId}`, idempotencyKey: `actual:${operationId}`, operationId, merchantId: boundMerchantId, metric: "storage_bytes", quantity: body.byteLength, evidenceRef: `sha256:${digest}`, occurredAt: Date.now() }, context.env);
      return context.json({ accepted: true, localAssetId, assetId, sha256: digest, storageBackend: "convex", result }, 201);
    }
    const objectKey = `assets/${tenant.merchantId}/${assetId}/${digest}`;
    await context.env.PROOFGATE_ASSETS.put(objectKey, body, { httpMetadata: { contentType }, customMetadata: { sha256: digest, merchantId: boundMerchantId } });
    const result = await adminBoundary.registerAsset({ assetId, merchantId: boundMerchantId, storageBackend: "r2", objectKey, sha256: digest, contentType, byteLength: body.byteLength, sourceProviderMessageId }, context.env);
    await adminBoundary.recordActualUsage({ usageEntryId: `actual:${operationId}`, idempotencyKey: `actual:${operationId}`, operationId, merchantId: boundMerchantId, metric: "storage_bytes", quantity: body.byteLength, evidenceRef: `sha256:${digest}`, occurredAt: Date.now() }, context.env);
    return context.json({ accepted: true, localAssetId, assetId, sha256: digest, storageBackend: "r2", result }, 201);
  });
  app.get("/internal/render-assets/:assetId", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const assetId = context.req.param("assetId");
    const merchantId = context.req.header("x-proofgate-merchant-id");
    if (!/^[a-zA-Z0-9_-]{3,128}$/.test(assetId) || !merchantId || !/^[a-z0-9-]{3,64}$/.test(merchantId)) return context.text("Invalid asset scope", 400);
    const asset = await adminBoundary.getPrivateAssetForMerchant(assetId, merchantId, context.env);
    if (!asset || !asset.contentType.startsWith("image/")) return context.notFound();
    return new Response(asset.body as BodyInit, { headers: { "content-type": asset.contentType, etag: asset.etag, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  });
  app.put("/internal/rendered-assets/:localAssetId", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const localAssetId = context.req.param("localAssetId");
    const merchantId = context.req.header("x-proofgate-merchant-id");
    const sourceProviderMessageId = context.req.header("x-proofgate-source-message-id");
    if (!/^[a-zA-Z0-9_-]{3,100}$/.test(localAssetId) || !merchantId || !/^[a-z0-9-]{3,64}$/.test(merchantId) || !sourceProviderMessageId) return context.text("Invalid rendered asset scope", 400);
    const body = new Uint8Array(await context.req.arrayBuffer());
    if (body.byteLength === 0 || body.byteLength > MAX_ASSET_BYTES) return context.text("Asset size is invalid", 413);
    if (!hasValidAssetSignature("video/mp4", body)) return context.text("Rendered asset must be an MP4", 415);
    const assetId = `rendered-${merchantId.slice(-12)}-${localAssetId}`;
    const digest = await sha256Bytes(body);
    const operationId = `asset:${assetId}:${digest}`;
    const assetUsage = await adminBoundary.reserveUsage({ merchantId, operationId, idempotencyKey: `reserve:${operationId}`, requestedAt: Date.now(), reservations: [{ metric: "storage_bytes", quantity: body.byteLength }] }, context.env);
    if (!assetUsage.allowed) return context.json({ accepted: false, stage: "usage_limit", message: quotaExceededCustomerMessage("storage_bytes") }, 429);
    const result = await adminBoundary.uploadAsset({ assetId, merchantId, sha256: digest, contentType: "video/mp4", byteLength: body.byteLength, sourceProviderMessageId, body }, context.env);
    await adminBoundary.recordActualUsage({ usageEntryId: `actual:${operationId}`, idempotencyKey: `actual:${operationId}`, operationId, merchantId, metric: "storage_bytes", quantity: body.byteLength, evidenceRef: `sha256:${digest}`, occurredAt: Date.now() }, context.env);
    return context.json({ accepted: true, assetId, storageBackend: result.storageBackend }, 201);
  });
  app.post("/internal/guardian", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const payload = await context.req.json().catch(() => ({})) as { kind?: string };
    if (payload.kind === "reel") {
      const job = await adminBoundary.claimReel(context.env);
      return context.json({ claimed: Boolean(job), job });
    }
    if (payload.kind === "release") return context.json(await adminBoundary.promoteRelease(context.env));
    if (payload.kind !== "calls") return context.text("kind must be calls, reel, or release", 400);
    if (context.env?.CALLING_LIVE_ENABLED !== "true") return context.json({ claimed: false, blocked: "calling_feature_not_live" }, 503);
    if (!context.env?.VAPI_API_KEY || !context.env.VAPI_PHONE_NUMBER_ID || !context.env.VAPI_SQUAD_ID || !context.env.PROOFGATE_DATA_KEY) {
      return context.json({ claimed: false, blocked: "missing_vapi_or_data_key_configuration" }, 503);
    }
    const job = await adminBoundary.claimCallBatch(context.env);
    if (!job) return context.json({ claimed: false });
    try {
      const call = await createQualificationCall({
        apiKey: context.env.VAPI_API_KEY,
        phoneNumberId: context.env.VAPI_PHONE_NUMBER_ID,
        squadId: context.env.VAPI_SQUAD_ID,
        batchId: job.batchId,
        attemptId: job.attemptId,
        earliestAt: new Date(job.earliestAt).toISOString(),
        lead: { leadId: job.leadId, number: await decryptSensitive(job.phoneCiphertext, context.env.PROOFGATE_DATA_KEY) },
      });
      await adminBoundary.updateCallAttempt({ attemptId: job.attemptId, status: "provider_created", providerCallId: call.callId }, context.env);
      return context.json({ claimed: true, attemptId: job.attemptId, batchId: job.batchId, call }, 201);
    } catch (error) {
      await adminBoundary.updateCallAttempt({ attemptId: job.attemptId, status: "failed", failureCode: "provider_request_failed" }, context.env).catch(() => undefined);
      return context.json({ claimed: true, attemptId: job.attemptId, batchId: job.batchId, dispatched: false, error: error instanceof Error ? error.message : "provider failure" }, 502);
    }
  });
  app.post("/internal/call-artifact", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    let receipt;
    try { receipt = CallArtifactCopyReceiptSchema.parse(await context.req.json()); }
    catch { return context.text("Invalid consented recording copy receipt", 400); }
    const { schemaVersion: _schemaVersion, recordingConsent: _recordingConsent, ...record } = receipt;
    return context.json(await adminBoundary.registerCallArtifact(record, context.env), 201);
  });
  app.post("/internal/reel-result", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const payload = await context.req.json() as { reelId?: string; status?: string; renderedAssetId?: string; evidence?: unknown; failureCode?: string };
    if (!payload.reelId || !/^[a-zA-Z0-9_-]{3,128}$/.test(payload.reelId) || (payload.status !== "rendered" && payload.status !== "delivery_failed")) return context.text("Invalid reel result", 400);
    if (payload.status === "delivery_failed") {
      if (!payload.failureCode || !/^[a-z0-9_:-]{3,80}$/.test(payload.failureCode)) return context.text("failureCode is required", 400);
      return context.json(await adminBoundary.completeReel({ reelId: payload.reelId, status: "delivery_failed", failureCode: payload.failureCode }, context.env));
    }
    if (!payload.renderedAssetId) return context.text("renderedAssetId is required", 400);
    let evidence: ReelRenderEvidence;
    try { evidence = ReelRenderEvidenceSchema.parse(payload.evidence); }
    catch { return context.text("Verified FFprobe and Polly evidence is required", 400); }
    const renderEvidenceJson = canonicalize(evidence);
    const renderEvidenceHash = await sha256(renderEvidenceJson);
    const result = await adminBoundary.completeReel({
      reelId: payload.reelId, status: "rendered", renderedAssetId: payload.renderedAssetId,
      renderEvidenceJson, renderEvidenceHash,
    }, context.env);
    const occurredAt = Date.now();
    await adminBoundary.recordActualUsage({
      usageEntryId: `actual:render:${payload.reelId}`, idempotencyKey: `actual:render:${payload.reelId}`,
      operationId: `reel:${payload.reelId}`, merchantId: result.merchantId, metric: "render_seconds", quantity: Math.ceil(evidence.ffprobe.durationSeconds),
      evidenceRef: `reel-render:${renderEvidenceHash}:ffprobe`, occurredAt,
    }, context.env);
    await adminBoundary.recordActualUsage({
      usageEntryId: `actual:polly:${payload.reelId}`, idempotencyKey: `actual:polly:${payload.reelId}`,
      operationId: `reel:${payload.reelId}`, merchantId: result.merchantId, metric: "polly_characters", quantity: evidence.polly.characters,
      evidenceRef: `reel-render:${renderEvidenceHash}:polly`, occurredAt,
    }, context.env);
    return context.json({ completed: result.completed, status: result.status });
  });
  app.post("/internal/reel-delivery", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const payload = await context.req.json() as { reelId?: string; renderedAssetId?: string; recipientWaId?: string; caption?: string };
    if (!payload.reelId || !/^[a-zA-Z0-9_-]{3,128}$/.test(payload.reelId) || !payload.renderedAssetId || !/^[a-zA-Z0-9_-]{3,128}$/.test(payload.renderedAssetId)) return context.text("Invalid reel delivery scope", 400);
    if (!payload.recipientWaId || !/^\d{8,15}$/.test(payload.recipientWaId) || (payload.caption?.length ?? 0) > 1024) return context.text("Invalid reel recipient or caption", 400);
    if (!context.env?.META_PHONE_NUMBER_ID || !context.env.META_ACCESS_TOKEN) return context.text("Meta is not configured", 503);
    const recipientTenant = await deriveTenantIdentity(payload.recipientWaId);
    const deliveryOperation = `wa-out:reel:${payload.reelId}`;
    if (!(await reserveOutboundMessage(recipientTenant.merchantId, deliveryOperation, context.env)).allowed) return context.json({ delivered: false, stage: "usage_limit", message: quotaExceededCustomerMessage("whatsapp_messages") }, 429);
    const object = await adminBoundary.getPrivateAsset(payload.renderedAssetId, context.env);
    if (!object) return context.text("Rendered reel asset not found", 404);
    const contentType = object.contentType;
    if (contentType !== "video/mp4") return context.text("Rendered asset is not an MP4", 409);
    const claim = await adminBoundary.beginReelDelivery({
      reelId: payload.reelId, merchantId: recipientTenant.merchantId,
      renderedAssetId: payload.renderedAssetId, recipientHash: recipientTenant.ownerWaIdHash,
    }, context.env);
    if (!claim.claimed) {
      if (claim.status === "delivered") return context.json({ delivered: true, replay: true, reelId: payload.reelId, renderedAssetId: payload.renderedAssetId, providerMessageId: claim.providerMessageId }, 200);
      if (claim.status === "delivering") return context.json({ delivered: false, replay: true, stage: "delivery_in_progress" }, 202);
      return context.json({ delivered: false, replay: true, stage: "delivery_failed" }, 409);
    }
    try {
      const media = await uploadMetaMedia({
        graphApiVersion: context.env.META_GRAPH_API_VERSION ?? "v20.0", phoneNumberId: context.env.META_PHONE_NUMBER_ID,
        accessToken: context.env.META_ACCESS_TOKEN, bytes: object.body, contentType, filename: `${payload.reelId}.mp4`,
      });
      const receipt = await sendVideoByMediaId({
        graphApiVersion: context.env.META_GRAPH_API_VERSION ?? "v20.0", phoneNumberId: context.env.META_PHONE_NUMBER_ID,
        accessToken: context.env.META_ACCESS_TOKEN, recipientWaId: payload.recipientWaId, mediaId: media.mediaId, caption: payload.caption,
      });
      await recordOutboundMessage(recipientTenant.merchantId, deliveryOperation, receipt.providerMessageId, context.env);
      await adminBoundary.finishReelDelivery({ reelId: payload.reelId, status: "delivered", providerMessageId: receipt.providerMessageId }, context.env);
      return context.json({ delivered: true, reelId: payload.reelId, renderedAssetId: payload.renderedAssetId, providerMessageId: receipt.providerMessageId }, 201);
    } catch {
      await adminBoundary.finishReelDelivery({ reelId: payload.reelId, status: "delivery_failed", failureCode: "meta_provider_failure" }, context.env);
      return context.json({ delivered: false, stage: "delivery_failed" }, 502);
    }
  });
  app.post("/internal/action-required", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const payload = await context.req.json() as { recipientWaId?: string; requestId?: string };
    if (!payload.recipientWaId || !/^\d{8,15}$/.test(payload.recipientWaId) || !payload.requestId || !/^[a-zA-Z0-9_.:-]{3,128}$/.test(payload.requestId)) return context.text("Invalid recipient or request ID", 400);
    if (!context.env?.META_PHONE_NUMBER_ID || !context.env.META_ACCESS_TOKEN || !context.env.META_ACTION_REQUIRED_TEMPLATE) return context.text("Meta template is not configured", 503);
    const recipientTenant = await deriveTenantIdentity(payload.recipientWaId);
    const operationId = `wa-out:action-required:${payload.requestId}`;
    if (!(await reserveOutboundMessage(recipientTenant.merchantId, operationId, context.env)).allowed) return context.json({ sent: false, stage: "usage_limit", message: quotaExceededCustomerMessage("whatsapp_messages") }, 429);
    const receipt = await sendActionRequiredTemplate({ graphApiVersion: context.env.META_GRAPH_API_VERSION ?? "v20.0", phoneNumberId: context.env.META_PHONE_NUMBER_ID, accessToken: context.env.META_ACCESS_TOKEN, recipientWaId: payload.recipientWaId, templateName: context.env.META_ACTION_REQUIRED_TEMPLATE });
    await recordOutboundMessage(recipientTenant.merchantId, operationId, receipt.providerMessageId, context.env);
    return context.json(receipt, 201);
  });
  app.get("/internal/metrics/:siteId", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const tenant = await tenantFromHermesHeader(context.req.header("x-hermes-user-id"));
    if (!tenant) return context.text("Authenticated WhatsApp sender is required", 400);
    const since = Number(context.req.query("since"));
    if (!Number.isFinite(since) || since < 0) return context.text("Invalid since value", 400);
    return context.json(await adminBoundary.metrics(context.req.param("siteId"), tenant.merchantId, since, context.env));
  });
  app.get("/ack", (context) => {
    const token = context.req.query("token");
    if (!token) return context.text("Missing acknowledgment capability", 400);
    return context.html(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Booking acknowledgment</title></head><body><main><h1>Saturday Sessions booking</h1><p>Please confirm that you received the request for exactly two seats.</p><form method="post" action="/ack" data-pg="ack-form"><input type="hidden" name="token" value="${token.replace(/[&<>"']/g, "")}"><button type="submit" data-pg="ack-button">Acknowledge two-seat booking</button></form></main></body></html>`, 200, {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
    });
  });
  app.post("/ack", async (context) => {
    const body = await context.req.parseBody();
    const token = typeof body.token === "string" ? body.token : "";
    if (!token) return context.text("Missing acknowledgment capability", 400);
    try {
      const result = await evidenceBoundary.acknowledge(token, context.env?.CONVEX_URL);
      return context.html(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Acknowledged</title></head><body><main data-pg="ack-confirmation"><h1>Acknowledgment recorded</h1><p>Passport state: ${result.passportState}</p></main></body></html>`, 200, {
        "cache-control": "no-store",
        "content-security-policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        "referrer-policy": "no-referrer",
      });
    } catch {
      return context.text("The acknowledgment capability is invalid or expired", 403);
    }
  });
  app.get("/proof/:slug", async (context) => {
    const site = await growthBoundary.getPublishedSite(context.req.param("slug"), context.env);
    if (site) return context.json({ site: context.req.param("slug"), versionId: site.versionId, specHash: site.specHash, state: site.passportState, statement: "State is derived from the exact published version and its release predicates." });
    return context.json({ site: context.req.param("slug"), state: "gray", statement: "Development spike only. No external witness or production certification exists." });
  });
  return app;
}

export default createApp();
