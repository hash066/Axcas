import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { assertImmutableAssetRegistration, validateStoredAssetMetadata } from "./asset_policy";
import { FOUNDING_BETA_PLAN, aggregateBillableUsage, evaluateQuota, usagePeriodStart, type UsageEntry, type UsageMetric } from "../packages/domain/src/usage";
import { mustRevokeLead, recordingConsentFromVapi } from "../packages/calls/src/attempts";
import { transitionReelLifecycle, type ReelLifecycleStatus } from "../packages/domain/src/reel-lifecycle";

function requireServiceSecret(value: string) {
  const expected = process.env.PROOFGATE_SERVICE_SECRET;
  if (!expected || value.length !== expected.length) throw new Error("unauthorized ProofGate service call");
  let different = 0;
  for (let index = 0; index < expected.length; index += 1) different |= expected.charCodeAt(index) ^ value.charCodeAt(index);
  if (different !== 0) throw new Error("unauthorized ProofGate service call");
}

export const createStudioLinkInternal = internalMutation({
  args: {
    linkId: v.string(), codeHash: v.string(), browserNonceHash: v.string(),
    intent: v.union(v.literal("website"), v.literal("reels"), v.literal("both")),
    expiresAt: v.number(), createdAt: v.number(),
  },
  handler: async (context, args) => {
    const existingLink = await context.db.query("studioLinkRequests").withIndex("by_link_id", (range) => range.eq("linkId", args.linkId)).unique();
    const existingCode = await context.db.query("studioLinkRequests").withIndex("by_code_hash", (range) => range.eq("codeHash", args.codeHash)).unique();
    if (existingLink || existingCode) throw new Error("studio link collision");
    await context.db.insert("studioLinkRequests", { ...args, status: "pending" });
    return { created: true };
  },
});

export const adminCreateStudioLink = action({
  args: {
    serviceSecret: v.string(), linkId: v.string(), codeHash: v.string(), browserNonceHash: v.string(),
    intent: v.union(v.literal("website"), v.literal("reels"), v.literal("both")),
    expiresAt: v.number(), createdAt: v.number(),
  },
  handler: async (context, args): Promise<{ created: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.createStudioLinkInternal, record);
  },
});

export const claimStudioLinkInternal = internalMutation({
  args: { codeHash: v.string(), merchantId: v.string(), ownerWaIdHash: v.string(), providerMessageId: v.string(), now: v.number() },
  handler: async (context, args) => {
    const link = await context.db.query("studioLinkRequests").withIndex("by_code_hash", (range) => range.eq("codeHash", args.codeHash)).unique();
    if (!link || link.expiresAt < args.now || link.status === "consumed") return { linked: false as const };
    if (link.status === "claimed") {
      return { linked: link.merchantId === args.merchantId && link.ownerWaIdHash === args.ownerWaIdHash };
    }
    await context.db.patch(link._id, {
      status: "claimed", merchantId: args.merchantId, ownerWaIdHash: args.ownerWaIdHash,
      providerMessageId: args.providerMessageId, claimedAt: args.now,
    });
    return { linked: true as const };
  },
});

export const adminClaimStudioLink = action({
  args: { serviceSecret: v.string(), codeHash: v.string(), merchantId: v.string(), ownerWaIdHash: v.string(), providerMessageId: v.string(), now: v.number() },
  handler: async (context, args): Promise<{ linked: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.claimStudioLinkInternal, record);
  },
});

export const completeStudioLinkInternal = internalMutation({
  args: { linkId: v.string(), browserNonceHash: v.string(), sessionHash: v.string(), sessionExpiresAt: v.number(), now: v.number() },
  handler: async (context, args) => {
    const link = await context.db.query("studioLinkRequests").withIndex("by_link_id", (range) => range.eq("linkId", args.linkId)).unique();
    if (!link || link.browserNonceHash !== args.browserNonceHash || link.expiresAt < args.now) return { status: "expired" as const };
    if (link.status === "consumed") {
      const existingSession = await context.db.query("studioSessions").withIndex("by_session_hash", (range) => range.eq("sessionHash", args.sessionHash)).unique();
      return existingSession && existingSession.merchantId === link.merchantId
        ? { status: "authenticated" as const, merchantId: link.merchantId!, ownerWaIdHash: link.ownerWaIdHash!, intent: link.intent }
        : { status: "expired" as const };
    }
    if (link.status === "pending" || !link.merchantId || !link.ownerWaIdHash) return { status: "pending" as const };
    const existingSession = await context.db.query("studioSessions").withIndex("by_session_hash", (range) => range.eq("sessionHash", args.sessionHash)).unique();
    if (existingSession) throw new Error("studio session collision");
    await context.db.insert("studioSessions", {
      sessionHash: args.sessionHash, merchantId: link.merchantId, ownerWaIdHash: link.ownerWaIdHash,
      expiresAt: args.sessionExpiresAt, createdAt: args.now,
    });
    await context.db.patch(link._id, { status: "consumed", consumedAt: args.now });
    return { status: "authenticated" as const, merchantId: link.merchantId, ownerWaIdHash: link.ownerWaIdHash, intent: link.intent };
  },
});

export const adminCompleteStudioLink = action({
  args: { serviceSecret: v.string(), linkId: v.string(), browserNonceHash: v.string(), sessionHash: v.string(), sessionExpiresAt: v.number(), now: v.number() },
  handler: async (context, args): Promise<{ status: "pending" | "expired" | "authenticated"; merchantId?: string; ownerWaIdHash?: string; intent?: "website" | "reels" | "both" }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.completeStudioLinkInternal, record);
  },
});

export const adminGetStudioSession = query({
  args: { serviceSecret: v.string(), sessionHash: v.string(), now: v.number() },
  handler: async (context, args) => {
    requireServiceSecret(args.serviceSecret);
    const session = await context.db.query("studioSessions").withIndex("by_session_hash", (range) => range.eq("sessionHash", args.sessionHash)).unique();
    if (!session || session.revokedAt || session.expiresAt < args.now) return null;
    return { merchantId: session.merchantId, ownerWaIdHash: session.ownerWaIdHash, expiresAt: session.expiresAt };
  },
});

export const revokeStudioSessionInternal = internalMutation({
  args: { sessionHash: v.string(), now: v.number() },
  handler: async (context, args) => {
    const session = await context.db.query("studioSessions").withIndex("by_session_hash", (range) => range.eq("sessionHash", args.sessionHash)).unique();
    if (!session || session.revokedAt) return { revoked: false };
    await context.db.patch(session._id, { revokedAt: args.now });
    return { revoked: true };
  },
});

export const adminRevokeStudioSession = action({
  args: { serviceSecret: v.string(), sessionHash: v.string(), now: v.number() },
  handler: async (context, args): Promise<{ revoked: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    return context.runMutation(internal.growth.revokeStudioSessionInternal, { sessionHash: args.sessionHash, now: args.now });
  },
});

export const adminListStudioSessions = query({
  args: { serviceSecret: v.string(), merchantId: v.string(), currentSessionHash: v.string(), now: v.number() },
  handler: async (context, args) => {
    requireServiceSecret(args.serviceSecret);
    const sessions = await context.db.query("studioSessions").withIndex("by_merchant", (range) => range.eq("merchantId", args.merchantId)).collect();
    return sessions
      .filter((session) => !session.revokedAt && session.expiresAt >= args.now)
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((session) => ({
        deviceId: session.sessionHash.slice(0, 24),
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        current: session.sessionHash === args.currentSessionHash,
      }));
  },
});

export const revokeStudioDeviceInternal = internalMutation({
  args: { merchantId: v.string(), deviceId: v.string(), now: v.number() },
  handler: async (context, args) => {
    const sessions = await context.db.query("studioSessions").withIndex("by_merchant", (range) => range.eq("merchantId", args.merchantId)).collect();
    const matches = sessions.filter((session) => session.sessionHash.startsWith(args.deviceId));
    if (matches.length !== 1 || matches[0].revokedAt) return { revoked: false };
    await context.db.patch(matches[0]._id, { revokedAt: args.now });
    return { revoked: true };
  },
});

export const adminRevokeStudioDevice = action({
  args: { serviceSecret: v.string(), merchantId: v.string(), deviceId: v.string(), now: v.number() },
  handler: async (context, args): Promise<{ revoked: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    return context.runMutation(internal.growth.revokeStudioDeviceInternal, {
      merchantId: args.merchantId, deviceId: args.deviceId, now: args.now,
    });
  },
});

export const createStudioDataRequestInternal = internalMutation({
  args: {
    requestId: v.string(), merchantId: v.string(),
    type: v.union(v.literal("export"), v.literal("deletion")),
    dueBy: v.number(), createdAt: v.number(),
  },
  handler: async (context, args) => {
    const sameId = await context.db.query("studioDataRequests").withIndex("by_request_id", (range) => range.eq("requestId", args.requestId)).unique();
    if (sameId) {
      if (sameId.merchantId !== args.merchantId || sameId.type !== args.type || sameId.dueBy !== args.dueBy) throw new Error("immutable Studio data request conflict");
      return { requestId: sameId.requestId, status: sameId.status, dueBy: sameId.dueBy, created: false };
    }
    // Only an unfinished request blocks a new one. Matching on the latest row regardless of
    // status would let one completed deletion bar the merchant from ever requesting another.
    const open = (await context.db.query("studioDataRequests").withIndex("by_merchant_type", (range) => range.eq("merchantId", args.merchantId).eq("type", args.type)).order("desc").collect())
      .find((request) => request.status === "requested");
    if (open) return { requestId: open.requestId, status: open.status, dueBy: open.dueBy, created: false };
    await context.db.insert("studioDataRequests", { ...args, status: "requested" });
    return { requestId: args.requestId, status: "requested" as const, dueBy: args.dueBy, created: true };
  },
});

export const adminCreateStudioDataRequest = action({
  args: {
    serviceSecret: v.string(), requestId: v.string(), merchantId: v.string(),
    type: v.union(v.literal("export"), v.literal("deletion")),
    dueBy: v.number(), createdAt: v.number(),
  },
  handler: async (context, args): Promise<{ requestId: string; status: "requested" | "completed"; dueBy: number; created: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.createStudioDataRequestInternal, record);
  },
});

/**
 * Removes the merchant-controlled content behind a deletion request.
 *
 * Scope follows docs/privacy-and-consent.md: a takedown "removes the public site/media promptly
 * while preserving redacted append-only release and consent evidence where legally required".
 * So Studio projects, sessions, media, workflows, and drafts are erased; releases, approvals,
 * lead consents, call records, and usage entries are kept; and published sites are unpublished
 * rather than deleted, because the append-only release evidence still points at them.
 *
 * Work is budgeted per call so one mutation cannot exceed Convex limits. The caller repeats
 * until `complete` is true.
 */
export const purgeMerchantContentInternal = internalMutation({
  args: { merchantId: v.string(), limit: v.number() },
  handler: async (context, { merchantId, limit }) => {
    let budget = Math.max(1, Math.min(limit, 400));
    let deleted = 0;

    const projects = await context.db.query("studioProjects").withIndex("by_merchant_created", (range) => range.eq("merchantId", merchantId)).take(budget);
    for (const row of projects) { await context.db.delete(row._id); deleted += 1; }
    budget -= projects.length;

    if (budget > 0) {
      const heads = await context.db.query("studioProjectHeads").withIndex("by_merchant_updated", (range) => range.eq("merchantId", merchantId)).take(budget);
      for (const row of heads) { await context.db.delete(row._id); deleted += 1; }
      budget -= heads.length;
    }

    if (budget > 0) {
      const sessions = await context.db.query("studioSessions").withIndex("by_merchant", (range) => range.eq("merchantId", merchantId)).take(budget);
      for (const row of sessions) { await context.db.delete(row._id); deleted += 1; }
      budget -= sessions.length;
    }

    if (budget > 0) {
      const assets = await context.db.query("mediaAssets").withIndex("by_merchant", (range) => range.eq("merchantId", merchantId)).take(budget);
      for (const row of assets) {
        if (row.convexStorageId) await context.storage.delete(row.convexStorageId);
        await context.db.delete(row._id);
        deleted += 1;
      }
      budget -= assets.length;
    }

    if (budget > 0) {
      const workflows = await context.db.query("inboundWorkflows").withIndex("by_merchant_updated", (range) => range.eq("merchantId", merchantId)).take(budget);
      for (const row of workflows) { await context.db.delete(row._id); deleted += 1; }
      budget -= workflows.length;
    }

    if (budget > 0) {
      const reels = await context.db.query("reelPlans").withIndex("by_merchant", (range) => range.eq("merchantId", merchantId)).take(budget);
      for (const row of reels) { await context.db.delete(row._id); deleted += 1; }
      budget -= reels.length;
    }

    if (budget > 0) {
      const campaigns = await context.db.query("socialCampaigns").withIndex("by_merchant", (range) => range.eq("merchantId", merchantId)).take(budget);
      for (const row of campaigns) { await context.db.delete(row._id); deleted += 1; }
      budget -= campaigns.length;
    }

    let unpublished = 0;
    if (budget > 0) {
      const sites = await context.db.query("sites").withIndex("by_merchant_slug", (range) => range.eq("merchantId", merchantId)).take(budget);
      for (const site of sites) {
        if (!site.productionVersionId && !site.canaryVersionId) continue;
        await context.db.patch(site._id, { productionVersionId: undefined, canaryVersionId: undefined, updatedAt: Date.now() });
        unpublished += 1;
      }
    }

    return { deleted, unpublished, complete: deleted === 0 && unpublished === 0 };
  },
});

export const completeStudioDataRequestInternal = internalMutation({
  args: { requestId: v.string(), completedAt: v.number(), deletedRecords: v.number() },
  handler: async (context, args) => {
    const row = await context.db.query("studioDataRequests").withIndex("by_request_id", (range) => range.eq("requestId", args.requestId)).unique();
    if (!row || row.status === "completed") return { updated: false };
    await context.db.patch(row._id, { status: "completed", completedAt: args.completedAt, deletedRecords: args.deletedRecords });
    return { updated: true };
  },
});

export const adminPurgeMerchantContent = action({
  args: { serviceSecret: v.string(), merchantId: v.string(), requestId: v.string() },
  handler: async (context, args): Promise<{ deleted: number; unpublished: number; complete: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    let deleted = 0;
    let unpublished = 0;
    let complete = false;
    for (let pass = 0; pass < 25 && !complete; pass += 1) {
      const result: { deleted: number; unpublished: number; complete: boolean } =
        await context.runMutation(internal.growth.purgeMerchantContentInternal, { merchantId: args.merchantId, limit: 400 });
      deleted += result.deleted;
      unpublished += result.unpublished;
      complete = result.complete;
    }
    if (complete) {
      await context.runMutation(internal.growth.completeStudioDataRequestInternal, {
        requestId: args.requestId, completedAt: Date.now(), deletedRecords: deleted,
      });
    }
    return { deleted, unpublished, complete };
  },
});

export const saveStudioProjectInternal = internalMutation({
  args: {
    projectId: v.string(), revisionId: v.string(), parentRevisionId: v.optional(v.string()), merchantId: v.string(),
    intent: v.union(v.literal("website"), v.literal("reels"), v.literal("both")),
    source: v.union(v.literal("whatsapp"), v.literal("studio")), projectJson: v.string(), createdAt: v.number(),
  },
  handler: async (context, args) => {
    const existingRevision = await context.db.query("studioProjects").withIndex("by_project_revision", (range) => range.eq("projectId", args.projectId).eq("revisionId", args.revisionId)).unique();
    if (existingRevision) {
      const identical = existingRevision.merchantId === args.merchantId && existingRevision.parentRevisionId === args.parentRevisionId
        && existingRevision.intent === args.intent && (existingRevision.source ?? (existingRevision.projectId.startsWith("project-whatsapp-") ? "whatsapp" : "studio")) === args.source
        && existingRevision.projectJson === args.projectJson;
      if (!identical) throw new Error("immutable studio revision conflict");
      const head = await context.db.query("studioProjectHeads").withIndex("by_project_id", (range) => range.eq("projectId", args.projectId)).unique();
      const legacyHead = head ? undefined : (await context.db.query("studioProjects")
        .withIndex("by_merchant_created", (range) => range.eq("merchantId", args.merchantId)).order("desc").collect())
        .find((entry) => entry.projectId === args.projectId);
      const headRevisionId = head?.headRevisionId ?? legacyHead?.revisionId ?? existingRevision.revisionId;
      return { inserted: false, conflict: headRevisionId !== existingRevision.revisionId, headRevisionId };
    }
    const explicitHead = await context.db.query("studioProjectHeads").withIndex("by_project_id", (range) => range.eq("projectId", args.projectId)).unique();
    if (explicitHead && explicitHead.merchantId !== args.merchantId) throw new Error("studio project tenant conflict");
    const legacyHead = explicitHead ? undefined : (await context.db.query("studioProjects")
      .withIndex("by_merchant_created", (range) => range.eq("merchantId", args.merchantId)).order("desc").collect())
      .find((entry) => entry.projectId === args.projectId);
    const currentHeadRevisionId = explicitHead?.headRevisionId ?? legacyHead?.revisionId;
    if (currentHeadRevisionId && args.parentRevisionId !== currentHeadRevisionId) {
      return { inserted: false, conflict: true, headRevisionId: currentHeadRevisionId };
    }
    if (!currentHeadRevisionId && args.parentRevisionId) {
      return { inserted: false, conflict: true, headRevisionId: undefined };
    }
    await context.db.insert("studioProjects", args);
    if (explicitHead) {
      await context.db.patch(explicitHead._id, { headRevisionId: args.revisionId, intent: args.intent, source: args.source, updatedAt: args.createdAt });
    } else {
      await context.db.insert("studioProjectHeads", {
        projectId: args.projectId, merchantId: args.merchantId, headRevisionId: args.revisionId,
        intent: args.intent, source: args.source, updatedAt: args.createdAt,
      });
    }
    return { inserted: true, conflict: false, headRevisionId: args.revisionId };
  },
});

export const adminSaveStudioProject = action({
  args: {
    serviceSecret: v.string(), projectId: v.string(), revisionId: v.string(), parentRevisionId: v.optional(v.string()), merchantId: v.string(),
    intent: v.union(v.literal("website"), v.literal("reels"), v.literal("both")),
    source: v.union(v.literal("whatsapp"), v.literal("studio")), projectJson: v.string(), createdAt: v.number(),
  },
  handler: async (context, args): Promise<{ inserted: boolean; conflict: boolean; headRevisionId?: string }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.saveStudioProjectInternal, record);
  },
});

export const adminListStudioProjects = query({
  args: { serviceSecret: v.string(), merchantId: v.string() },
  handler: async (context, args) => {
    requireServiceSecret(args.serviceSecret);
    const revisions = await context.db.query("studioProjects").withIndex("by_merchant_created", (range) => range.eq("merchantId", args.merchantId)).order("desc").collect();
    const heads = await context.db.query("studioProjectHeads").withIndex("by_merchant_updated", (range) => range.eq("merchantId", args.merchantId)).order("desc").collect();
    const byRevision = new Map(revisions.map((revision) => [`${revision.projectId}:${revision.revisionId}`, revision]));
    const latest = new Map<string, typeof revisions[number]>();
    for (const head of heads) {
      const revision = byRevision.get(`${head.projectId}:${head.headRevisionId}`);
      if (revision) latest.set(head.projectId, revision);
    }
    for (const revision of revisions) if (!latest.has(revision.projectId)) latest.set(revision.projectId, revision);
    return Array.from(latest.values()).map((entry) => ({
      projectId: entry.projectId, revisionId: entry.revisionId, parentRevisionId: entry.parentRevisionId,
      intent: entry.intent, source: entry.source ?? (entry.projectId.startsWith("project-whatsapp-") ? "whatsapp" : "studio"),
      projectJson: entry.projectJson, createdAt: entry.createdAt,
    }));
  },
});

export const adminListStudioProjectChanges = query({
  args: {
    serviceSecret: v.string(), merchantId: v.string(), afterCreatedAt: v.number(),
    afterProjectId: v.string(), afterRevisionId: v.string(), limit: v.number(),
  },
  handler: async (context, args) => {
    requireServiceSecret(args.serviceSecret);
    const limit = Math.max(1, Math.min(100, Math.trunc(args.limit)));
    const revisions = await context.db.query("studioProjects")
      .withIndex("by_merchant_created", (range) => range.eq("merchantId", args.merchantId).gte("createdAt", args.afterCreatedAt))
      .order("asc").collect();
    return revisions.filter((entry) => entry.createdAt > args.afterCreatedAt
      || entry.projectId > args.afterProjectId
      || (entry.projectId === args.afterProjectId && entry.revisionId > args.afterRevisionId))
      .sort((left, right) => left.createdAt - right.createdAt || left.projectId.localeCompare(right.projectId) || left.revisionId.localeCompare(right.revisionId))
      .slice(0, limit)
      .map((entry) => ({
        projectId: entry.projectId, revisionId: entry.revisionId, parentRevisionId: entry.parentRevisionId,
        intent: entry.intent, source: entry.source ?? (entry.projectId.startsWith("project-whatsapp-") ? "whatsapp" : "studio"),
        projectJson: entry.projectJson, createdAt: entry.createdAt,
      }));
  },
});

const workflowTransitions: Record<string, readonly string[]> = {
  received: ["processing", "retrying", "failed"],
  processing: ["awaiting_input", "awaiting_approval", "retrying", "completed", "failed"],
  awaiting_input: ["processing", "failed"], awaiting_approval: ["processing", "completed", "failed"],
  retrying: ["processing", "failed"], completed: [], failed: [],
};

export const beginInboundWorkflowInternal = internalMutation({
  args: {
    workflowId: v.string(), merchantId: v.string(), ownerWaIdHash: v.string(), channel: v.literal("whatsapp_cloud"),
    providerMessageId: v.string(), createdAt: v.number(),
  },
  handler: async (context, args) => {
    const existing = await context.db.query("inboundWorkflows").withIndex("by_provider_message", (range) => range.eq("channel", args.channel).eq("providerMessageId", args.providerMessageId)).unique();
    if (existing) {
      if (existing.merchantId !== args.merchantId || existing.ownerWaIdHash !== args.ownerWaIdHash) throw new Error("provider message tenant conflict");
      return { created: false, workflowId: existing.workflowId, status: existing.status };
    }
    await context.db.insert("inboundWorkflows", { ...args, status: "received", updatedAt: args.createdAt });
    await context.db.insert("workflowEvents", {
      eventId: `${args.workflowId}:received`, workflowId: args.workflowId, merchantId: args.merchantId,
      progress: "message_received", status: "received", createdAt: args.createdAt,
    });
    return { created: true, workflowId: args.workflowId, status: "received" as const };
  },
});

export const adminBeginInboundWorkflow = action({
  args: {
    serviceSecret: v.string(), workflowId: v.string(), merchantId: v.string(), ownerWaIdHash: v.string(),
    channel: v.literal("whatsapp_cloud"), providerMessageId: v.string(), createdAt: v.number(),
  },
  handler: async (context, args): Promise<{ created: boolean; workflowId: string; status: string }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.beginInboundWorkflowInternal, record);
  },
});

export const recordWorkflowProgressInternal = internalMutation({
  args: {
    workflowId: v.string(), eventId: v.string(), status: v.string(), progress: v.string(),
    projectId: v.optional(v.string()), intent: v.optional(v.union(v.literal("website"), v.literal("reels"), v.literal("both"))), createdAt: v.number(),
  },
  handler: async (context, args) => {
    const duplicate = await context.db.query("workflowEvents").withIndex("by_event_id", (range) => range.eq("eventId", args.eventId)).unique();
    if (duplicate) return { inserted: false, status: duplicate.status };
    const workflow = await context.db.query("inboundWorkflows").withIndex("by_workflow_id", (range) => range.eq("workflowId", args.workflowId)).unique();
    if (!workflow) return { inserted: false, status: "missing" };
    if (args.status !== workflow.status && !workflowTransitions[workflow.status]?.includes(args.status)) throw new Error("invalid workflow transition");
    await context.db.insert("workflowEvents", {
      eventId: args.eventId, workflowId: args.workflowId, merchantId: workflow.merchantId,
      progress: args.progress as any, status: args.status as any, projectId: args.projectId, intent: args.intent, createdAt: args.createdAt,
    });
    await context.db.patch(workflow._id, {
      status: args.status as any, updatedAt: args.createdAt,
      ...(args.projectId ? { projectId: args.projectId } : {}), ...(args.intent ? { intent: args.intent } : {}),
    });
    return { inserted: true, status: args.status };
  },
});

export const adminRecordWorkflowProgress = action({
  args: {
    serviceSecret: v.string(), workflowId: v.string(), eventId: v.string(), status: v.string(), progress: v.string(),
    projectId: v.optional(v.string()), intent: v.optional(v.union(v.literal("website"), v.literal("reels"), v.literal("both"))), createdAt: v.number(),
  },
  handler: async (context, args): Promise<{ inserted: boolean; status: string }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.recordWorkflowProgressInternal, record);
  },
});

export const enqueueCustomerOutboxInternal = internalMutation({
  args: {
    outboxId: v.string(), workflowId: v.string(), merchantId: v.string(),
    kind: v.union(v.literal("progress"), v.literal("missing_facts"), v.literal("approval"), v.literal("completion"), v.literal("retry")),
    body: v.string(), dedupeKey: v.string(), createdAt: v.number(),
  },
  handler: async (context, args) => {
    const duplicate = await context.db.query("customerOutbox").withIndex("by_dedupe_key", (range) => range.eq("dedupeKey", args.dedupeKey)).unique();
    if (duplicate) return { inserted: false, outboxId: duplicate.outboxId };
    const workflow = await context.db.query("inboundWorkflows").withIndex("by_workflow_id", (range) => range.eq("workflowId", args.workflowId)).unique();
    if (!workflow || workflow.merchantId !== args.merchantId) throw new Error("outbox workflow tenant mismatch");
    await context.db.insert("customerOutbox", { ...args, status: "pending", attempts: 0, nextAttemptAt: args.createdAt, updatedAt: args.createdAt });
    return { inserted: true, outboxId: args.outboxId };
  },
});

export const adminEnqueueCustomerOutbox = action({
  args: {
    serviceSecret: v.string(), outboxId: v.string(), workflowId: v.string(), merchantId: v.string(),
    kind: v.union(v.literal("progress"), v.literal("missing_facts"), v.literal("approval"), v.literal("completion"), v.literal("retry")),
    body: v.string(), dedupeKey: v.string(), createdAt: v.number(),
  },
  handler: async (context, args): Promise<{ inserted: boolean; outboxId: string }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.enqueueCustomerOutboxInternal, record);
  },
});

/**
 * Closes out one outbox row after the edge has attempted delivery.
 *
 * `customerOutbox` previously had an enqueue and no consumer, so every row stayed "pending"
 * for ever and the message was never sent. The edge now sends inline and reports the outcome
 * here, so a row's status reflects what actually reached the merchant.
 */
export const markCustomerOutboxSentInternal = internalMutation({
  args: {
    outboxId: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    providerMessageId: v.optional(v.string()),
    updatedAt: v.number(),
  },
  handler: async (context, args) => {
    const row = await context.db.query("customerOutbox").withIndex("by_outbox_id", (range) => range.eq("outboxId", args.outboxId)).unique();
    if (!row || row.status === "sent") return { updated: false };
    await context.db.patch(row._id, {
      status: args.status,
      attempts: row.attempts + 1,
      updatedAt: args.updatedAt,
      ...(args.providerMessageId ? { providerMessageId: args.providerMessageId } : {}),
    });
    return { updated: true };
  },
});

export const adminMarkCustomerOutboxSent = action({
  args: {
    serviceSecret: v.string(), outboxId: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    providerMessageId: v.optional(v.string()), updatedAt: v.number(),
  },
  handler: async (context, args): Promise<{ updated: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.markCustomerOutboxSentInternal, record);
  },
});

export const getPublishedSite = query({
  args: { slug: v.string() },
  handler: async (context, { slug }) => {
    const site = await context.db.query("sites").withIndex("by_slug", (range) => range.eq("slug", slug)).unique();
    if (!site?.productionVersionId) return null;
    const version = await context.db
      .query("siteVersions")
      .withIndex("by_site_version", (range) => range.eq("siteId", site._id).eq("versionId", site.productionVersionId!))
      .unique();
    if (!version) throw new Error("production pointer references a missing immutable version");
    const release = await context.db
      .query("releases")
      .withIndex("by_site_created", (range) => range.eq("siteId", site._id))
      .order("desc")
      .first();
    const passportState = release?.decision === "promote" && release.versionId === version.versionId && release.specHash === version.specHash ? "green" : "gray";
    return { specJson: version.specJson, versionId: version.versionId, specHash: version.specHash, passportState };
  },
});

export const getPublicAsset = query({
  args: { assetId: v.string() },
  handler: async (context, { assetId }) => {
    const asset = await context.db.query("mediaAssets").withIndex("by_asset_id", (range) => range.eq("assetId", assetId)).unique();
    if (!asset) return null;
    const sites = await context.db.query("sites").collect();
    for (const site of sites) {
      if (!site.productionVersionId) continue;
      const version = await context.db.query("siteVersions").withIndex("by_site_version", (range) => range.eq("siteId", site._id).eq("versionId", site.productionVersionId!)).unique();
      if (!version) continue;
      const spec = JSON.parse(version.specJson) as { hero?: { imageAssetId?: string }; seo?: { socialImageAssetId?: string }; catalog?: Array<{ imageAssetId?: string }> };
      const selected = new Set([spec.hero?.imageAssetId, spec.seo?.socialImageAssetId, ...(spec.catalog ?? []).map((item) => item.imageAssetId)]);
      if (selected.has(assetId)) {
        const storageBackend = asset.storageBackend ?? "r2";
        const storageUrl = storageBackend === "convex" && asset.convexStorageId ? await context.storage.getUrl(asset.convexStorageId) : undefined;
        return { storageBackend, objectKey: asset.objectKey, storageUrl: storageUrl ?? undefined, contentType: asset.contentType, sha256: asset.sha256 };
      }
    }
    return null;
  },
});

export const appendEvent = mutation({
  args: {
    eventId: v.string(),
    type: v.union(v.literal("page_view"), v.literal("whatsapp_cta_click")),
    siteId: v.string(),
    versionId: v.string(),
    specHash: v.string(),
    sessionHash: v.string(),
    itemId: v.optional(v.string()),
    source: v.optional(v.string()),
    campaign: v.optional(v.string()),
    occurredAt: v.number(),
  },
  handler: async (context, args) => {
    const existing = await context.db.query("growthEvents").withIndex("by_event_id", (range) => range.eq("eventId", args.eventId)).unique();
    if (existing) return { inserted: false };
    await context.db.insert("growthEvents", args);
    return { inserted: true };
  },
});

export const resolveApprovalTap = mutation({
  args: {
    approvalId: v.string(),
    decision: v.union(v.literal("approved"), v.literal("denied")),
    senderWaIdHash: v.string(),
    providerMessageId: v.string(),
  },
  handler: async (context, args) => {
    const approval = await context.db.query("approvals").withIndex("by_approval_id", (range) => range.eq("approvalId", args.approvalId)).unique();
    if (!approval || approval.expiresAt < Date.now()) return { accepted: false };
    if (approval.ownerWaIdHash !== args.senderWaIdHash) return { accepted: false };
    const release = approval.type === "release"
      ? (await context.db.query("growthReleaseRequests").collect()).find((entry) => entry.approvalId === approval.approvalId)
      : undefined;
    const reel = approval.type === "reel"
      ? (await context.db.query("reelPlans").collect()).find((entry) => entry.approvalId === approval.approvalId)
      : undefined;
    const result = {
      accepted: true as const,
      type: approval.type,
      decision: args.decision,
      approvalId: approval.approvalId,
      merchantId: approval.merchantId,
      scopeHash: approval.scopeHash,
      ...(release ? { release: { requestId: release.requestId, siteId: release.siteId, versionId: release.versionId, specHash: release.specHash } } : {}),
      ...(reel ? { reel: { reelId: reel.reelId, planHash: reel.planHash } } : {}),
    };
    if (approval.decision !== "pending") {
      return approval.decision === args.decision ? { ...result, replay: true as const } : { accepted: false as const };
    }
    await context.db.patch(approval._id, { decision: args.decision, decidedAt: Date.now(), providerMessageId: args.providerMessageId });
    if (reel && args.decision === "approved") {
      const transition = transitionReelLifecycle(reel.status as ReelLifecycleStatus, "approve");
      if (transition.applied) await context.db.patch(reel._id, { status: transition.status });
    }
    return result;
  },
});

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= 500 ? value : undefined;
}

export const ingestVapiReport = mutation({
  args: { payloadJson: v.string() },
  handler: async (context, { payloadJson }) => {
    const payload = JSON.parse(payloadJson) as any;
    const message = payload?.message;
    if (message?.type !== "end-of-call-report") return { accepted: true };
    const providerCallId = optionalString(message.call?.id);
    const batchId = optionalString(message.call?.metadata?.batchId);
    const leadId = optionalString(message.call?.metadata?.leadId);
    const attemptId = optionalString(message.call?.metadata?.attemptId);
    if (!providerCallId || !batchId || !leadId || !attemptId) return { accepted: false };
    const batch = await context.db.query("callBatches").withIndex("by_batch_id", (range) => range.eq("batchId", batchId)).unique();
    if (!batch || !batch.leadIds.includes(leadId)) return { accepted: false };
    const attempt = await context.db.query("callAttempts").withIndex("by_attempt_id", (range) => range.eq("attemptId", attemptId)).unique();
    if (!attempt || !["provider_created", "completed"].includes(attempt.status) || attempt.batchId !== batchId || attempt.leadId !== leadId || attempt.providerCallId !== providerCallId) return { accepted: false };
    const existing = await context.db.query("callOutcomes").withIndex("by_provider_call_id", (range) => range.eq("providerCallId", providerCallId)).unique();
    if (existing) return { accepted: existing.attemptId === attemptId && existing.batchId === batchId && existing.leadId === leadId };
    const structured = message.analysis?.structuredData ?? {};
    const consent = recordingConsentFromVapi({ grantedAt: message.compliance?.recordingConsent?.grantedAt, structuredConsent: structured.recordingConsent });
    const outcomeValues = new Set(["qualified", "not_interested", "no_answer", "failed", "do_not_call"]);
    const outcome = outcomeValues.has(structured.outcome) ? structured.outcome : "failed";
    const doNotCall = mustRevokeLead({ outcome, doNotCall: structured.doNotCall });
    const costUsd = typeof message.cost === "number" && message.cost >= 0 ? message.cost : 0;
    const completedAt = Number.isFinite(Date.parse(message.endedAt)) ? Date.parse(message.endedAt) : Date.now();
    await context.db.insert("callOutcomes", {
      providerCallId, attemptId, batchId, leadId, recordingConsent: consent, outcome,
      interest: optionalString(structured.interest), timing: optionalString(structured.timing), product: optionalString(structured.product),
      objection: optionalString(structured.objection), followUpRequested: Boolean(structured.followUpRequested), doNotCall,
      costUsd,
      completedAt,
    });
    await context.db.patch(attempt._id, { status: "completed", completedAt });
    const outcomes = await context.db.query("callOutcomes").withIndex("by_batch", (range) => range.eq("batchId", batchId)).collect();
    const completedLeadIds = new Set(outcomes.map((entry) => entry.leadId));
    if (batch.leadIds.every((id) => completedLeadIds.has(id))) {
      const usageIdempotencyKey = `actual:call-batch:${batchId}`;
      const recorded = await context.db.query("usageEntries").withIndex("by_idempotency_key", (range) => range.eq("idempotencyKey", usageIdempotencyKey)).unique();
      if (!recorded) {
        const totalMicrousd = outcomes.reduce((sum, entry) => sum + Math.round(entry.costUsd * 1_000_000), 0);
        await context.db.insert("usageEntries", {
          usageEntryId: usageIdempotencyKey, idempotencyKey: usageIdempotencyKey,
          operationId: `call-batch:${batchId}`, merchantId: batch.merchantId, metric: "call_cost_microusd",
          quantity: totalMicrousd, basis: "actual", periodStart: usagePeriodStart("call_cost_microusd", completedAt),
          evidenceRef: `vapi-batch:${outcomes.map((entry) => entry.providerCallId).sort().join(",")}`, createdAt: completedAt,
        });
      }
    }
    if (doNotCall) {
      const lead = await context.db.query("leadConsents").withIndex("by_lead_id", (range) => range.eq("leadId", leadId)).unique();
      if (lead && !lead.revokedAt) await context.db.patch(lead._id, { revokedAt: Date.now() });
    }
    return { accepted: true };
  },
});

export const registerCallArtifactInternal = internalMutation({
  args: { artifactId: v.string(), attemptId: v.string(), providerCallId: v.string(), bucketKey: v.string(), sha256: v.string(), byteLength: v.number(), copiedAt: v.number(), expiresAt: v.number() },
  handler: async (context, args) => {
    const existing = await context.db.query("callRecordingArtifacts").withIndex("by_artifact_id", (range) => range.eq("artifactId", args.artifactId)).unique();
    if (existing) {
      if (!Object.entries(args).every(([key, value]) => (existing as any)[key] === value)) throw new Error("recording artifact receipt is immutable");
      return { inserted: false };
    }
    const attempt = await context.db.query("callAttempts").withIndex("by_attempt_id", (range) => range.eq("attemptId", args.attemptId)).unique();
    const outcome = await context.db.query("callOutcomes").withIndex("by_provider_call_id", (range) => range.eq("providerCallId", args.providerCallId)).unique();
    if (!attempt || !outcome || attempt.providerCallId !== args.providerCallId || outcome.attemptId !== args.attemptId || outcome.recordingConsent !== "granted") throw new Error("recording artifact requires granted consent and exact call binding");
    if (!args.bucketKey.startsWith(`calls/${attempt.merchantId}/`) || !/^[a-f0-9]{64}$/.test(args.sha256) || !Number.isSafeInteger(args.byteLength) || args.byteLength <= 0 || args.expiresAt <= args.copiedAt || args.expiresAt - args.copiedAt > 30 * 86_400_000) throw new Error("invalid private recording copy receipt");
    await context.db.insert("callRecordingArtifacts", { ...args, merchantId: attempt.merchantId });
    return { inserted: true };
  },
});

export const adminRegisterCallArtifact = action({
  args: { serviceSecret: v.string(), artifactId: v.string(), attemptId: v.string(), providerCallId: v.string(), bucketKey: v.string(), sha256: v.string(), byteLength: v.number(), copiedAt: v.number(), expiresAt: v.number() },
  handler: async (context, args): Promise<{ inserted: boolean }> => { requireServiceSecret(args.serviceSecret); const { serviceSecret: _secret, ...record } = args; return context.runMutation(internal.growth.registerCallArtifactInternal, record); },
});

export const metricsSummary = query({
  args: { serviceSecret: v.string(), merchantId: v.string(), siteId: v.string(), since: v.number() },
  handler: async (context, args) => {
    requireServiceSecret(args.serviceSecret);
    const site = await context.db.query("sites").withIndex("by_slug", (range) => range.eq("slug", args.siteId)).unique();
    if (!site || site.merchantId !== args.merchantId) throw new Error("site tenant mismatch");
    const events = await context.db.query("growthEvents").withIndex("by_site_time", (range) => range.eq("siteId", args.siteId).gte("occurredAt", args.since)).collect();
    const views = events.filter((event) => event.type === "page_view").length;
    const clicks = events.filter((event) => event.type === "whatsapp_cta_click").length;
    return { views, clicks, clickThroughRate: views === 0 ? 0 : clicks / views, since: args.since, through: Date.now() };
  },
});

export const upsertMerchantInternal = internalMutation({
  args: { merchantId: v.string(), ownerWaIdHash: v.string(), name: v.string(), timezone: v.string(), orderWhatsAppNumberCiphertext: v.string(), createdAt: v.number() },
  handler: async (context, args) => {
    const existing = await context.db.query("merchants").withIndex("by_merchant_id", (range) => range.eq("merchantId", args.merchantId)).unique();
    if (existing) {
      if (existing.ownerWaIdHash !== args.ownerWaIdHash) throw new Error("merchant owner identity is immutable");
      return { merchantId: existing._id, inserted: false };
    }
    return { merchantId: await context.db.insert("merchants", args), inserted: true };
  },
});

export const adminUpsertMerchant = action({
  args: { serviceSecret: v.string(), merchantId: v.string(), ownerWaIdHash: v.string(), name: v.string(), timezone: v.string(), orderWhatsAppNumberCiphertext: v.string(), createdAt: v.number() },
  handler: async (context, args): Promise<{ inserted: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    const result = await context.runMutation(internal.growth.upsertMerchantInternal, record);
    return { inserted: result.inserted };
  },
});

export const appendDecisionPolicyInternal = internalMutation({
  args: {
    policyId: v.string(), merchantId: v.string(), ownerWaIdHash: v.string(), policyJson: v.string(),
    policyHash: v.string(), supersedesPolicyId: v.optional(v.string()), createdAt: v.number(),
  },
  handler: async (context, args) => {
    const merchant = await context.db.query("merchants").withIndex("by_merchant_id", (range) => range.eq("merchantId", args.merchantId)).unique();
    if (!merchant || merchant.ownerWaIdHash !== args.ownerWaIdHash) throw new Error("decision policy owner does not match merchant");
    const duplicate = await context.db.query("decisionPolicies").withIndex("by_policy_id", (range) => range.eq("policyId", args.policyId)).unique();
    if (duplicate) {
      if (duplicate.policyHash !== args.policyHash) throw new Error("immutable decision policy conflict");
      return { inserted: false };
    }
    const active = await context.db.query("decisionPolicies").withIndex("by_merchant_created", (range) => range.eq("merchantId", args.merchantId)).order("desc").first();
    if (active && args.supersedesPolicyId !== active.policyId) throw new Error("new policy must supersede the active policy");
    if (!active && args.supersedesPolicyId) throw new Error("first policy cannot supersede a missing policy");
    if (active && args.createdAt <= active.createdAt) throw new Error("new policy timestamp must follow the active policy");
    await context.db.insert("decisionPolicies", args);
    return { inserted: true };
  },
});

export const adminAppendDecisionPolicy = action({
  args: {
    serviceSecret: v.string(), policyId: v.string(), merchantId: v.string(), ownerWaIdHash: v.string(),
    policyJson: v.string(), policyHash: v.string(), supersedesPolicyId: v.optional(v.string()), createdAt: v.number(),
  },
  handler: async (context, args): Promise<{ inserted: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.appendDecisionPolicyInternal, record);
  },
});

export const adminGetActiveDecisionPolicy = query({
  args: { serviceSecret: v.string(), merchantId: v.string() },
  handler: async (context, args) => {
    requireServiceSecret(args.serviceSecret);
    const policy = await context.db.query("decisionPolicies").withIndex("by_merchant_created", (range) => range.eq("merchantId", args.merchantId)).order("desc").first();
    return policy ? { policyJson: policy.policyJson, policyHash: policy.policyHash } : null;
  },
});

export const adminGetPreviewSite = query({
  args: { serviceSecret: v.string(), siteId: v.string(), versionId: v.string(), specHash: v.string() },
  handler: async (context, args) => {
    requireServiceSecret(args.serviceSecret);
    const site = await context.db.query("sites").withIndex("by_slug", (range) => range.eq("slug", args.siteId)).unique();
    if (!site || site.canaryVersionId !== args.versionId) return null;
    const version = await context.db.query("siteVersions").withIndex("by_site_version", (range) => range.eq("siteId", site._id).eq("versionId", args.versionId)).unique();
    if (!version || version.specHash !== args.specHash) return null;
    return { specJson: version.specJson, versionId: version.versionId, specHash: version.specHash };
  },
});

export const createCandidateInternal = internalMutation({
  args: { merchantId: v.string(), slug: v.string(), versionId: v.string(), parentVersionId: v.optional(v.string()), specJson: v.string(), specHash: v.string(), actor: v.string(), createdAt: v.number() },
  handler: async (context, args) => {
    const merchant = await context.db.query("merchants").withIndex("by_merchant_id", (range) => range.eq("merchantId", args.merchantId)).unique();
    if (!merchant) throw new Error("merchant does not exist");
    let site = await context.db.query("sites").withIndex("by_slug", (range) => range.eq("slug", args.slug)).unique();
    if (!site) {
      const siteId = await context.db.insert("sites", { merchantId: args.merchantId, slug: args.slug, createdAt: args.createdAt, updatedAt: args.createdAt });
      site = await context.db.get(siteId);
    }
    if (!site) throw new Error("site creation failed");
    if (site.merchantId !== args.merchantId) throw new Error("site slug belongs to another merchant");
    const existing = await context.db.query("siteVersions").withIndex("by_site_version", (range) => range.eq("siteId", site!._id).eq("versionId", args.versionId)).unique();
    // The version ID is the workflow's immutable candidate identity. A retry
    // may produce different presentation copy, but it must resume the first
    // candidate rather than mutate it or fail the merchant journey.
    if (existing) {
      await context.db.patch(site._id, { canaryVersionId: existing.versionId, updatedAt: args.createdAt });
      return { siteId: site._id, siteVersionId: existing._id, inserted: false, replayed: true, specHash: existing.specHash };
    }
    const siteVersionId = await context.db.insert("siteVersions", { siteId: site._id, versionId: args.versionId, parentVersionId: args.parentVersionId, specJson: args.specJson, specHash: args.specHash, actor: args.actor, createdAt: args.createdAt });
    await context.db.patch(site._id, { canaryVersionId: args.versionId, updatedAt: args.createdAt });
    return { siteId: site._id, siteVersionId, inserted: true, replayed: false, specHash: args.specHash };
  },
});

export const adminCreateCandidate = action({
  args: { serviceSecret: v.string(), merchantId: v.string(), slug: v.string(), versionId: v.string(), parentVersionId: v.optional(v.string()), specJson: v.string(), specHash: v.string(), actor: v.string(), createdAt: v.number() },
  handler: async (context, args): Promise<{ inserted: boolean; replayed: boolean; specHash: string }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    const result = await context.runMutation(internal.growth.createCandidateInternal, record);
    return { inserted: result.inserted, replayed: result.replayed, specHash: result.specHash };
  },
});

export const registerLeadInternal = internalMutation({
  args: { merchantId: v.string(), leadId: v.string(), phoneCiphertext: v.string(), phoneHash: v.string(), country: v.union(v.literal("IN"), v.literal("US")), purpose: v.literal("ai_qualification_call"), source: v.string(), evidenceHash: v.string(), grantedAt: v.number(), revokedAt: v.optional(v.number()), localTimezone: v.string(), callWindowStartHour: v.number(), callWindowEndHour: v.number(), createdAt: v.number() },
  handler: async (context, args) => {
    const merchant = await context.db.query("merchants").withIndex("by_merchant_id", (range) => range.eq("merchantId", args.merchantId)).unique();
    if (!merchant) throw new Error("merchant does not exist");
    const existing = await context.db.query("leadConsents").withIndex("by_lead_id", (range) => range.eq("leadId", args.leadId)).unique();
    if (existing) {
      if (existing.evidenceHash !== args.evidenceHash || existing.phoneHash !== args.phoneHash) throw new Error("immutable lead consent conflict");
      return { inserted: false };
    }
    await context.db.insert("leadConsents", args);
    return { inserted: true };
  },
});

export const adminRegisterLead = action({
  args: { serviceSecret: v.string(), merchantId: v.string(), leadId: v.string(), phoneCiphertext: v.string(), phoneHash: v.string(), country: v.union(v.literal("IN"), v.literal("US")), purpose: v.literal("ai_qualification_call"), source: v.string(), evidenceHash: v.string(), grantedAt: v.number(), revokedAt: v.optional(v.number()), localTimezone: v.string(), callWindowStartHour: v.number(), callWindowEndHour: v.number(), createdAt: v.number() },
  handler: async (context, args): Promise<{ inserted: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.registerLeadInternal, record);
  },
});

export const createApprovalInternal = internalMutation({
  args: { approvalId: v.string(), merchantId: v.string(), type: v.union(v.literal("release"), v.literal("call_batch"), v.literal("reel"), v.literal("social_campaign")), scopeHash: v.string(), providerMessageId: v.string(), checklist: v.optional(v.string()), expiresAt: v.number(), createdAt: v.number() },
  handler: async (context, args) => {
    const merchant = await context.db.query("merchants").withIndex("by_merchant_id", (range) => range.eq("merchantId", args.merchantId)).unique();
    if (!merchant) throw new Error("merchant does not exist");
    const existing = await context.db.query("approvals").withIndex("by_approval_id", (range) => range.eq("approvalId", args.approvalId)).unique();
    if (existing) throw new Error("approval ID already exists");
    await context.db.insert("approvals", { ...args, ownerWaIdHash: merchant.ownerWaIdHash, decision: "pending" });
    return { ownerWaIdHash: merchant.ownerWaIdHash };
  },
});

export const attachApprovalMessageInternal = internalMutation({
  args: { approvalId: v.string(), providerMessageId: v.string() },
  handler: async (context, args) => {
    const approval = await context.db.query("approvals").withIndex("by_approval_id", (range) => range.eq("approvalId", args.approvalId)).unique();
    if (!approval || approval.decision !== "pending") throw new Error("pending approval not found");
    await context.db.patch(approval._id, { providerMessageId: args.providerMessageId });
  },
});

export const adminCreateApproval = action({
  args: { serviceSecret: v.string(), approvalId: v.string(), merchantId: v.string(), type: v.union(v.literal("release"), v.literal("call_batch"), v.literal("reel"), v.literal("social_campaign")), scopeHash: v.string(), providerMessageId: v.string(), checklist: v.optional(v.string()), expiresAt: v.number(), createdAt: v.number() },
  handler: async (context, args): Promise<{ ownerWaIdHash: string }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.createApprovalInternal, record);
  },
});

/**
 * Lists the approvals a merchant still has to decide.
 *
 * Only merchant-safe fields leave this query: the scope hash, owner hash, and provider message
 * ID stay server-side. The mobile approval inbox is a client and must never see them.
 */
export const listMerchantApprovalsInternal = internalQuery({
  args: { merchantId: v.string(), now: v.number() },
  handler: async (context, { merchantId, now }) => {
    const approvals = await context.db.query("approvals").withIndex("by_merchant", (range) => range.eq("merchantId", merchantId)).order("desc").take(50);
    return approvals
      .filter((approval) => approval.decision === "pending" && approval.expiresAt > now)
      .map((approval) => ({
        approvalId: approval.approvalId,
        type: approval.type,
        checklist: approval.checklist,
        expiresAt: approval.expiresAt,
        createdAt: approval.createdAt,
      }));
  },
});

export const adminListMerchantApprovals = action({
  args: { serviceSecret: v.string(), merchantId: v.string() },
  handler: async (context, args): Promise<Array<{ approvalId: string; type: "release" | "call_batch" | "reel" | "social_campaign"; checklist?: string; expiresAt: number; createdAt: number }>> => {
    requireServiceSecret(args.serviceSecret);
    return context.runQuery(internal.growth.listMerchantApprovalsInternal, { merchantId: args.merchantId, now: Date.now() });
  },
});

export const resolveStudioApprovalInternal = internalMutation({
  args: {
    approvalId: v.string(), merchantId: v.string(), ownerWaIdHash: v.string(),
    decision: v.union(v.literal("approved"), v.literal("denied")), providerMessageId: v.string(), now: v.number(),
  },
  handler: async (context, args) => {
    const approval = await context.db.query("approvals").withIndex("by_approval_id", (range) => range.eq("approvalId", args.approvalId)).unique();
    if (!approval || (approval.type !== "release" && approval.type !== "reel") || approval.decision !== "pending" || approval.expiresAt < args.now) return { accepted: false as const };
    if (approval.merchantId !== args.merchantId || approval.ownerWaIdHash !== args.ownerWaIdHash) return { accepted: false };
    await context.db.patch(approval._id, { decision: args.decision, decidedAt: args.now, providerMessageId: args.providerMessageId });
    const reel = approval.type === "reel" ? (await context.db.query("reelPlans").collect()).find((entry) => entry.approvalId === approval.approvalId) : undefined;
    if (reel && args.decision === "approved") {
      const transition = transitionReelLifecycle(reel.status as ReelLifecycleStatus, "approve");
      if (transition.applied) await context.db.patch(reel._id, { status: transition.status });
    }
    return { accepted: true as const, type: approval.type, reelId: reel?.reelId };
  },
});

export const adminResolveStudioApproval = action({
  args: {
    serviceSecret: v.string(), approvalId: v.string(), merchantId: v.string(), ownerWaIdHash: v.string(),
    decision: v.union(v.literal("approved"), v.literal("denied")), providerMessageId: v.string(), now: v.number(),
  },
  handler: async (context, args): Promise<{ accepted: boolean; type?: "release" | "reel"; reelId?: string }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.resolveStudioApprovalInternal, record);
  },
});

export const registerSocialCampaignInternal = internalMutation({
  args: { campaignId: v.string(), merchantId: v.string(), campaignJson: v.string(), scopeHash: v.string(), approvalId: v.string(), createdAt: v.number() },
  handler: async (context, args) => {
    const merchant = await context.db.query("merchants").withIndex("by_merchant_id", (range) => range.eq("merchantId", args.merchantId)).unique();
    if (!merchant) throw new Error("merchant does not exist");
    const existing = await context.db.query("socialCampaigns").withIndex("by_campaign_id", (range) => range.eq("campaignId", args.campaignId)).unique();
    if (existing) {
      if (existing.scopeHash !== args.scopeHash) throw new Error("immutable social campaign conflict");
      return { inserted: false };
    }
    await context.db.insert("socialCampaigns", { ...args, status: "pending_approval" });
    return { inserted: true };
  },
});

export const adminRegisterSocialCampaign = action({
  args: { serviceSecret: v.string(), campaignId: v.string(), merchantId: v.string(), campaignJson: v.string(), scopeHash: v.string(), approvalId: v.string(), createdAt: v.number() },
  handler: async (context, args): Promise<{ inserted: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.registerSocialCampaignInternal, record);
  },
});

export const adminAttachApprovalMessage = action({
  args: { serviceSecret: v.string(), approvalId: v.string(), providerMessageId: v.string() },
  handler: async (context, args): Promise<{ attached: true }> => {
    requireServiceSecret(args.serviceSecret);
    await context.runMutation(internal.growth.attachApprovalMessageInternal, { approvalId: args.approvalId, providerMessageId: args.providerMessageId });
    return { attached: true };
  },
});

export const createCallBatchInternal = internalMutation({
  args: { batchId: v.string(), merchantId: v.string(), scopeHash: v.string(), leadIds: v.array(v.string()), countries: v.array(v.union(v.literal("IN"), v.literal("US"))), scriptVersion: v.string(), earliestAt: v.number(), latestAt: v.number(), maxAttemptsPerLead: v.number(), costCapUsd: v.number(), approvalId: v.string(), createdAt: v.number() },
  handler: async (context, args) => {
    const existingBatch = await context.db.query("callBatches").withIndex("by_batch_id", (range) => range.eq("batchId", args.batchId)).unique();
    if (existingBatch) {
      if (existingBatch.scopeHash !== args.scopeHash) throw new Error("immutable call batch conflict");
      return { inserted: false };
    }
    for (const leadId of args.leadIds) {
      const lead = await context.db.query("leadConsents").withIndex("by_lead_id", (range) => range.eq("leadId", leadId)).unique();
      if (!lead || lead.merchantId !== args.merchantId || lead.revokedAt || !args.countries.includes(lead.country)) throw new Error(`lead ${leadId} is not eligible`);
    }
    await context.db.insert("callBatches", args);
    for (const leadId of args.leadIds) await context.db.insert("callAttempts", {
      attemptId: `attempt-${args.batchId}-${leadId}`, batchId: args.batchId, merchantId: args.merchantId, leadId,
      status: "pending", createdAt: args.createdAt,
    });
    return { inserted: true };
  },
});

export const adminCreateCallBatch = action({
  args: { serviceSecret: v.string(), batchId: v.string(), merchantId: v.string(), scopeHash: v.string(), leadIds: v.array(v.string()), countries: v.array(v.union(v.literal("IN"), v.literal("US"))), scriptVersion: v.string(), earliestAt: v.number(), latestAt: v.number(), maxAttemptsPerLead: v.number(), costCapUsd: v.number(), approvalId: v.string(), createdAt: v.number() },
  handler: async (context, args): Promise<{ inserted: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.createCallBatchInternal, record);
  },
});

export const registerReelInternal = internalMutation({
  args: { reelId: v.string(), merchantId: v.string(), planJson: v.string(), planHash: v.string(), approvalId: v.string(), deliveryRecipientCiphertext: v.optional(v.string()), status: v.literal("draft"), createdAt: v.number() },
  handler: async (context, args) => {
    const existing = await context.db.query("reelPlans").withIndex("by_reel_id", (range) => range.eq("reelId", args.reelId)).unique();
    if (existing) throw new Error("reel ID already exists");
    await context.db.insert("reelPlans", args);
    return { inserted: true };
  },
});

export const adminRegisterReel = action({
  args: { serviceSecret: v.string(), reelId: v.string(), merchantId: v.string(), planJson: v.string(), planHash: v.string(), approvalId: v.string(), deliveryRecipientCiphertext: v.optional(v.string()), status: v.literal("draft"), createdAt: v.number() },
  handler: async (context, args): Promise<{ inserted: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.registerReelInternal, record);
  },
});

export const registerReelOptionSetInternal = internalMutation({
  args: { optionSetId: v.string(), merchantId: v.string(), plansJson: v.string(), expiresAt: v.number(), createdAt: v.number() },
  handler: async (context, args) => {
    const existing = await context.db.query("reelOptionSets").withIndex("by_option_set_id", (range) => range.eq("optionSetId", args.optionSetId)).unique();
    if (existing) return { inserted: false };
    await context.db.insert("reelOptionSets", args);
    return { inserted: true };
  },
});

export const adminRegisterReelOptionSet = action({
  args: { serviceSecret: v.string(), optionSetId: v.string(), merchantId: v.string(), plansJson: v.string(), expiresAt: v.number(), createdAt: v.number() },
  handler: async (context, args): Promise<{ inserted: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.registerReelOptionSetInternal, record);
  },
});

export const selectReelOptionInternal = internalMutation({
  args: { merchantId: v.string(), selectedIndex: v.number(), approvalId: v.string(), now: v.number() },
  handler: async (context, args) => {
    const options = await context.db.query("reelOptionSets").withIndex("by_merchant_created", (range) => range.eq("merchantId", args.merchantId)).collect();
    const active = options.filter((entry) => entry.expiresAt >= args.now).sort((left, right) => right.createdAt - left.createdAt)[0];
    if (!active) return null;
    if (active.selectedIndex !== undefined) {
      return { replay: true, approvalId: active.approvalId, selectedIndex: active.selectedIndex, plansJson: active.plansJson };
    }
    if (!Number.isInteger(args.selectedIndex) || args.selectedIndex < 0 || args.selectedIndex > 2) throw new Error("invalid reel option");
    await context.db.patch(active._id, { selectedIndex: args.selectedIndex, approvalId: args.approvalId });
    return { replay: false, approvalId: args.approvalId, selectedIndex: args.selectedIndex, plansJson: active.plansJson };
  },
});

export const adminSelectReelOption = action({
  args: { serviceSecret: v.string(), merchantId: v.string(), selectedIndex: v.number(), approvalId: v.string(), now: v.number() },
  handler: async (context, args): Promise<null | { replay: boolean; approvalId?: string; selectedIndex: number; plansJson: string }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.selectReelOptionInternal, record);
  },
});

export const registerAssetInternal = internalMutation({
  args: { assetId: v.string(), merchantId: v.string(), storageBackend: v.union(v.literal("r2"), v.literal("convex")), objectKey: v.optional(v.string()), convexStorageId: v.optional(v.id("_storage")), sha256: v.string(), contentType: v.string(), byteLength: v.number(), sourceProviderMessageId: v.string(), createdAt: v.number() },
  handler: async (context, args) => {
    if (args.storageBackend === "r2" && !args.objectKey) throw new Error("R2 asset requires an object key");
    if (args.storageBackend === "convex" && !args.convexStorageId) throw new Error("Convex asset requires a storage ID");
    const existing = await context.db.query("mediaAssets").withIndex("by_asset_id", (range) => range.eq("assetId", args.assetId)).unique();
    const shouldInsert = assertImmutableAssetRegistration(existing, args);
    if (!shouldInsert) return { inserted: false };
    if (args.storageBackend === "convex") {
      const metadata = await context.db.system.get("_storage", args.convexStorageId!);
      validateStoredAssetMetadata(metadata, args);
    }
    await context.db.insert("mediaAssets", args);
    return { inserted: true };
  },
});

export const adminRegisterAsset = action({
  args: { serviceSecret: v.string(), assetId: v.string(), merchantId: v.string(), storageBackend: v.union(v.literal("r2"), v.literal("convex")), objectKey: v.optional(v.string()), convexStorageId: v.optional(v.id("_storage")), sha256: v.string(), contentType: v.string(), byteLength: v.number(), sourceProviderMessageId: v.string(), createdAt: v.number() },
  handler: async (context, args): Promise<{ inserted: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.registerAssetInternal, record);
  },
});

export const adminPrepareAssetUpload = mutation({
  args: { serviceSecret: v.string(), assetId: v.string(), merchantId: v.string(), sha256: v.string() },
  handler: async (context, args) => {
    requireServiceSecret(args.serviceSecret);
    const existing = await context.db.query("mediaAssets").withIndex("by_asset_id", (range) => range.eq("assetId", args.assetId)).unique();
    if (existing) {
      if (existing.sha256 !== args.sha256 || existing.merchantId !== args.merchantId || (existing.storageBackend ?? "r2") !== "convex") throw new Error("immutable asset conflict");
      return { existing: true as const };
    }
    return { existing: false as const, uploadUrl: await context.storage.generateUploadUrl() };
  },
});

export const adminGetAssetForDelivery = query({
  args: { serviceSecret: v.string(), assetId: v.string(), merchantId: v.optional(v.string()) },
  handler: async (context, args) => {
    requireServiceSecret(args.serviceSecret);
    const asset = await context.db.query("mediaAssets").withIndex("by_asset_id", (range) => range.eq("assetId", args.assetId)).unique();
    if (!asset || (args.merchantId && asset.merchantId !== args.merchantId)) return null;
    const storageBackend = asset.storageBackend ?? "r2";
    const storageUrl = storageBackend === "convex" && asset.convexStorageId ? await context.storage.getUrl(asset.convexStorageId) : undefined;
    return { storageBackend, objectKey: asset.objectKey, storageUrl: storageUrl ?? undefined, contentType: asset.contentType, sha256: asset.sha256 };
  },
});

export const mintVerificationCapabilityInternal = internalMutation({
  args: { tokenHash: v.string(), merchantId: v.string(), siteId: v.string(), versionId: v.string(), specHash: v.string(), expiresAt: v.number(), createdAt: v.number() },
  handler: async (context, args) => {
    const site = await context.db.query("sites").withIndex("by_slug", (range) => range.eq("slug", args.siteId)).unique();
    if (!site || site.canaryVersionId !== args.versionId) throw new Error("candidate is not the current canary");
    if (site.merchantId !== args.merchantId) throw new Error("site tenant mismatch");
    const version = await context.db.query("siteVersions").withIndex("by_site_version", (range) => range.eq("siteId", site._id).eq("versionId", args.versionId)).unique();
    if (!version || version.specHash !== args.specHash) throw new Error("candidate hash mismatch");
    await context.db.insert("verificationCapabilities", args);
    return { created: true };
  },
});

export const adminMintVerificationCapability = action({
  args: { serviceSecret: v.string(), tokenHash: v.string(), merchantId: v.string(), siteId: v.string(), versionId: v.string(), specHash: v.string(), expiresAt: v.number(), createdAt: v.number() },
  handler: async (context, args): Promise<{ created: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.mintVerificationCapabilityInternal, record);
  },
});

export const submitGrowthVerification = mutation({
  args: { tokenHash: v.string(), evidenceId: v.string(), siteId: v.string(), versionId: v.string(), specHash: v.string(), runId: v.string(), reportHash: v.string(), passed: v.boolean(), blockers: v.array(v.string()), observedAt: v.number() },
  handler: async (context, args) => {
    const capability = await context.db.query("verificationCapabilities").withIndex("by_token_hash", (range) => range.eq("tokenHash", args.tokenHash)).unique();
    if (!capability || capability.consumedAt || capability.expiresAt < Date.now()) return { accepted: false };
    if (capability.siteId !== args.siteId || capability.versionId !== args.versionId || capability.specHash !== args.specHash) return { accepted: false };
    const duplicate = await context.db.query("growthVerifications").withIndex("by_evidence_id", (range) => range.eq("evidenceId", args.evidenceId)).unique();
    if (duplicate) return { accepted: false };
    await context.db.patch(capability._id, { consumedAt: Date.now() });
    const { tokenHash: _token, ...evidence } = args;
    await context.db.insert("growthVerifications", evidence);
    return { accepted: true };
  },
});

export const createGrowthReleaseRequestInternal = internalMutation({
  args: { requestId: v.string(), siteId: v.string(), merchantId: v.string(), versionId: v.string(), specHash: v.string(), scopeHash: v.string(), approvalId: v.string(), createdAt: v.number() },
  handler: async (context, args) => {
    const site = await context.db.query("sites").withIndex("by_slug", (range) => range.eq("slug", args.siteId)).unique();
    if (!site || site.canaryVersionId !== args.versionId) throw new Error("candidate is not the current canary");
    if (site.merchantId !== args.merchantId) throw new Error("site tenant mismatch");
    const version = await context.db.query("siteVersions").withIndex("by_site_version", (range) => range.eq("siteId", site._id).eq("versionId", args.versionId)).unique();
    if (!version || version.specHash !== args.specHash) throw new Error("candidate hash mismatch");
    const verifications = await context.db.query("growthVerifications").withIndex("by_site_version", (range) => range.eq("siteId", args.siteId).eq("versionId", args.versionId)).order("desc").collect();
    const verification = verifications.find((entry) => entry.specHash === args.specHash && entry.passed && entry.blockers.length === 0);
    if (!verification) throw new Error("passing verification with no blockers is required");
    const spec = JSON.parse(version.specJson) as { business?: { merchantId?: string } };
    if (spec.business?.merchantId !== args.merchantId) throw new Error("candidate merchant mismatch");
    await context.db.insert("growthReleaseRequests", { ...args, verificationRunId: verification.runId, status: "pending" });
    return { verificationRunId: verification.runId };
  },
});

export const adminCreateGrowthReleaseRequest = action({
  args: { serviceSecret: v.string(), requestId: v.string(), siteId: v.string(), merchantId: v.string(), versionId: v.string(), specHash: v.string(), scopeHash: v.string(), approvalId: v.string(), createdAt: v.number() },
  handler: async (context, args): Promise<{ verificationRunId: string }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.createGrowthReleaseRequestInternal, record);
  },
});

export const promoteApprovedGrowthReleaseInternal = internalMutation({
  args: { now: v.number(), approvalId: v.optional(v.string()) },
  handler: async (context, { now, approvalId }) => {
    const requests = await context.db.query("growthReleaseRequests").order("asc").collect();
    for (const request of requests) {
      if (request.status !== "pending") continue;
      if (approvalId && request.approvalId !== approvalId) continue;
      const approval = await context.db.query("approvals").withIndex("by_approval_id", (range) => range.eq("approvalId", request.approvalId)).unique();
      if (!approval || approval.type !== "release" || approval.decision !== "approved" || approval.expiresAt < now || approval.scopeHash !== request.scopeHash || approval.merchantId !== request.merchantId) continue;
      const site = await context.db.query("sites").withIndex("by_slug", (range) => range.eq("slug", request.siteId)).unique();
      if (!site || site.canaryVersionId !== request.versionId) { await context.db.patch(request._id, { status: "blocked", completedAt: now }); continue; }
      const version = await context.db.query("siteVersions").withIndex("by_site_version", (range) => range.eq("siteId", site._id).eq("versionId", request.versionId)).unique();
      const verification = (await context.db.query("growthVerifications").withIndex("by_site_version", (range) => range.eq("siteId", request.siteId).eq("versionId", request.versionId)).collect()).find((entry) => entry.runId === request.verificationRunId);
      if (!version || version.specHash !== request.specHash || !verification?.passed || verification.blockers.length) { await context.db.patch(request._id, { status: "blocked", completedAt: now }); continue; }
      await context.db.patch(site._id, { previousCertifiedVersionId: site.productionVersionId, productionVersionId: request.versionId, updatedAt: now });
      await context.db.insert("releases", { siteId: site._id, versionId: request.versionId, specHash: request.specHash, decision: "promote", previousVersionId: site.productionVersionId, reason: `approved:${request.approvalId};verified:${request.verificationRunId}`, createdAt: now });
      await context.db.patch(request._id, { status: "promoted", completedAt: now });
      return { promoted: true, siteId: request.siteId, versionId: request.versionId };
    }
    return { promoted: false };
  },
});

export const adminPromoteApprovedGrowthRelease = action({
  args: { serviceSecret: v.string(), now: v.number(), approvalId: v.optional(v.string()) },
  handler: async (context, args): Promise<{ promoted: boolean; siteId?: string; versionId?: string }> => {
    requireServiceSecret(args.serviceSecret);
    return context.runMutation(internal.growth.promoteApprovedGrowthReleaseInternal, { now: args.now, approvalId: args.approvalId });
  },
});

export const claimApprovedCallBatchInternal = internalMutation({
  args: { now: v.number() },
  handler: async (context, { now }) => {
    const batches = await context.db.query("callBatches").order("asc").collect();
    for (const batch of batches) {
      if (batch.earliestAt > now || batch.latestAt < now) continue;
      const approval = await context.db.query("approvals").withIndex("by_approval_id", (range) => range.eq("approvalId", batch.approvalId)).unique();
      if (!approval || approval.type !== "call_batch" || approval.decision !== "approved" || approval.expiresAt < now || approval.scopeHash !== batch.scopeHash) continue;
      const attempts = await context.db.query("callAttempts").withIndex("by_batch", (range) => range.eq("batchId", batch.batchId)).collect();
      // Legacy batches were marked dispatched before per-lead attempts existed; never replay them.
      if (batch.dispatchedAt && !attempts.length) continue;
      if (!attempts.length && batch.leadIds.length) {
        for (const leadId of batch.leadIds) await context.db.insert("callAttempts", { attemptId: `attempt-${batch.batchId}-${leadId}`, batchId: batch.batchId, merchantId: batch.merchantId, leadId, status: "pending", createdAt: now });
        continue;
      }
      if (attempts.some((attempt) => attempt.status === "claimed" || attempt.status === "provider_created")) continue;
      const spentMicrousd = (await context.db.query("callOutcomes").withIndex("by_batch", (range) => range.eq("batchId", batch.batchId)).collect()).reduce((sum, outcome) => sum + Math.round(outcome.costUsd * 1_000_000), 0);
      const remainingCostMicrousd = Math.max(0, Math.round(batch.costCapUsd * 1_000_000) - spentMicrousd);
      if (remainingCostMicrousd <= 0) continue;
      const attempt = attempts.find((entry) => entry.status === "pending");
      if (!attempt) {
        if (!batch.dispatchedAt && attempts.every((entry) => entry.status === "completed" || entry.status === "failed")) await context.db.patch(batch._id, { dispatchedAt: now });
        continue;
      }
      const lead = await context.db.query("leadConsents").withIndex("by_lead_id", (range) => range.eq("leadId", attempt.leadId)).unique();
      if (!lead || lead.merchantId !== batch.merchantId || lead.revokedAt || !batch.countries.includes(lead.country)) { await context.db.patch(attempt._id, { status: "failed", failureCode: "lead_ineligible", completedAt: now }); continue; }
      await context.db.patch(attempt._id, { status: "claimed", claimedAt: now });
      return { attemptId: attempt.attemptId, batchId: batch.batchId, earliestAt: batch.earliestAt, leadId: lead.leadId, phoneCiphertext: lead.phoneCiphertext, remainingCostMicrousd };
    }
    return null;
  },
});

export const adminClaimApprovedCallBatch = action({
  args: { serviceSecret: v.string(), now: v.number() },
  handler: async (context, args): Promise<null | { attemptId: string; batchId: string; earliestAt: number; leadId: string; phoneCiphertext: string; remainingCostMicrousd: number }> => {
    requireServiceSecret(args.serviceSecret);
    return context.runMutation(internal.growth.claimApprovedCallBatchInternal, { now: args.now });
  },
});

export const updateCallAttemptInternal = internalMutation({
  args: { attemptId: v.string(), providerCallId: v.optional(v.string()), status: v.union(v.literal("provider_created"), v.literal("failed")), failureCode: v.optional(v.string()), now: v.number() },
  handler: async (context, args) => {
    const attempt = await context.db.query("callAttempts").withIndex("by_attempt_id", (range) => range.eq("attemptId", args.attemptId)).unique();
    if (!attempt) throw new Error("call attempt not found");
    if (attempt.status === args.status && attempt.providerCallId === args.providerCallId) return { updated: false };
    if (attempt.status !== "claimed") throw new Error("call attempt is not claimable");
    if (args.status === "provider_created" && !args.providerCallId) throw new Error("provider call ID is required");
    if (args.providerCallId) {
      const bound = await context.db.query("callAttempts").withIndex("by_provider_call_id", (range) => range.eq("providerCallId", args.providerCallId)).unique();
      if (bound && bound.attemptId !== args.attemptId) throw new Error("provider call ID already bound");
    }
    await context.db.patch(attempt._id, { status: args.status, providerCallId: args.providerCallId, failureCode: args.failureCode, completedAt: args.status === "failed" ? args.now : undefined });
    return { updated: true };
  },
});

export const adminUpdateCallAttempt = action({
  args: { serviceSecret: v.string(), attemptId: v.string(), providerCallId: v.optional(v.string()), status: v.union(v.literal("provider_created"), v.literal("failed")), failureCode: v.optional(v.string()), now: v.number() },
  handler: async (context, args): Promise<{ updated: boolean }> => { requireServiceSecret(args.serviceSecret); const { serviceSecret: _secret, ...record } = args; return context.runMutation(internal.growth.updateCallAttemptInternal, record); },
});

export const claimApprovedReelInternal = internalMutation({
  args: { now: v.number() },
  handler: async (context, { now }) => {
    const reels = await context.db.query("reelPlans").order("asc").collect();
    for (const reel of reels) {
      if (reel.status !== "approved" || !reel.approvalId) continue;
      const approval = await context.db.query("approvals").withIndex("by_approval_id", (range) => range.eq("approvalId", reel.approvalId!)).unique();
      if (!approval || approval.type !== "reel" || approval.decision !== "approved" || approval.expiresAt < now || approval.scopeHash !== reel.planHash) continue;
      const transition = transitionReelLifecycle(reel.status, "claim_render");
      await context.db.patch(reel._id, { status: transition.status });
      return { reelId: reel.reelId, planJson: reel.planJson, planHash: reel.planHash };
    }
    return null;
  },
});

export const adminClaimApprovedReel = action({
  args: { serviceSecret: v.string(), now: v.number() },
  handler: async (context, args): Promise<null | { reelId: string; planJson: string; planHash: string }> => {
    requireServiceSecret(args.serviceSecret);
    return context.runMutation(internal.growth.claimApprovedReelInternal, { now: args.now });
  },
});

export const completeReelInternal = internalMutation({
  args: {
    reelId: v.string(), status: v.union(v.literal("rendered"), v.literal("delivery_failed")),
    renderedAssetId: v.optional(v.string()), renderEvidenceJson: v.optional(v.string()), renderEvidenceHash: v.optional(v.string()),
    failureCode: v.optional(v.string()),
  },
  handler: async (context, args) => {
    const reel = await context.db.query("reelPlans").withIndex("by_reel_id", (range) => range.eq("reelId", args.reelId)).unique();
    if (!reel) throw new Error("claimed reel not found");
    if (args.status === "rendered") {
      if (!args.renderedAssetId || !args.renderEvidenceJson || !args.renderEvidenceHash) throw new Error("rendered asset and evidence are required");
      if (["rendered", "delivering", "delivered", "delivery_failed"].includes(reel.status)) {
        if (reel.renderedAssetId !== args.renderedAssetId || reel.renderEvidenceHash !== args.renderEvidenceHash) throw new Error("immutable reel render receipt conflict");
        return { completed: false, status: reel.status, merchantId: reel.merchantId };
      }
      const asset = await context.db.query("mediaAssets").withIndex("by_asset_id", (range) => range.eq("assetId", args.renderedAssetId!)).unique();
      if (!asset || asset.merchantId !== reel.merchantId || asset.contentType !== "video/mp4") throw new Error("rendered reel asset is not tenant-owned MP4 media");
      const plan = JSON.parse(reel.planJson) as { voiceover?: string; scenes?: Array<{ durationMs?: number }> };
      const evidence = JSON.parse(args.renderEvidenceJson) as { ffprobe?: { durationSeconds?: number }; polly?: { characters?: number } };
      const plannedSeconds = plan.scenes?.reduce((total, scene) => total + (scene.durationMs ?? 0), 0) ?? 0;
      if (evidence.polly?.characters !== plan.voiceover?.length || Math.abs((evidence.ffprobe?.durationSeconds ?? -1) - plannedSeconds / 1000) > 0.75) {
        throw new Error("render evidence does not match the approved reel plan");
      }
      const transition = transitionReelLifecycle(reel.status as ReelLifecycleStatus, "render_succeeded");
      await context.db.patch(reel._id, {
        status: transition.status, renderedAssetId: args.renderedAssetId,
        renderEvidenceJson: args.renderEvidenceJson, renderEvidenceHash: args.renderEvidenceHash,
      });
      return { completed: true, status: transition.status, merchantId: reel.merchantId };
    }
    if (!args.failureCode) throw new Error("reel failure code is required");
    if (reel.status === "delivery_failed") return { completed: false, status: reel.status, merchantId: reel.merchantId };
    const transition = transitionReelLifecycle(reel.status as ReelLifecycleStatus, "delivery_failed");
    await context.db.patch(reel._id, { status: transition.status, deliveryFailureCode: args.failureCode });
    return { completed: true, status: transition.status, merchantId: reel.merchantId };
  },
});

export const adminCompleteReel = action({
  args: {
    serviceSecret: v.string(), reelId: v.string(), status: v.union(v.literal("rendered"), v.literal("delivery_failed")),
    renderedAssetId: v.optional(v.string()), renderEvidenceJson: v.optional(v.string()), renderEvidenceHash: v.optional(v.string()),
    failureCode: v.optional(v.string()),
  },
  handler: async (context, args): Promise<{ completed: boolean; status: string; merchantId: string }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.completeReelInternal, record);
  },
});

export const beginReelDeliveryInternal = internalMutation({
  args: { reelId: v.string(), merchantId: v.string(), renderedAssetId: v.string(), recipientHash: v.string(), now: v.number() },
  handler: async (context, args) => {
    const reel = await context.db.query("reelPlans").withIndex("by_reel_id", (range) => range.eq("reelId", args.reelId)).unique();
    if (!reel || reel.merchantId !== args.merchantId || reel.renderedAssetId !== args.renderedAssetId) throw new Error("rendered reel delivery scope mismatch");
    if (reel.status === "delivered" || reel.status === "delivering" || reel.status === "delivery_failed") {
      if (reel.deliveryRecipientHash !== args.recipientHash) throw new Error("immutable reel recipient conflict");
      return { claimed: false, status: reel.status, providerMessageId: reel.deliveredProviderMessageId };
    }
    const transition = transitionReelLifecycle(reel.status as ReelLifecycleStatus, "begin_delivery");
    await context.db.patch(reel._id, { status: transition.status, deliveryRecipientHash: args.recipientHash, deliveryStartedAt: args.now });
    return { claimed: true, status: transition.status };
  },
});

export const adminBeginReelDelivery = action({
  args: { serviceSecret: v.string(), reelId: v.string(), merchantId: v.string(), renderedAssetId: v.string(), recipientHash: v.string(), now: v.number() },
  handler: async (context, args): Promise<{ claimed: boolean; status: string; providerMessageId?: string }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.beginReelDeliveryInternal, record);
  },
});

export const finishReelDeliveryInternal = internalMutation({
  args: {
    reelId: v.string(), status: v.union(v.literal("delivered"), v.literal("delivery_failed")),
    providerMessageId: v.optional(v.string()), failureCode: v.optional(v.string()), now: v.number(),
  },
  handler: async (context, args) => {
    const reel = await context.db.query("reelPlans").withIndex("by_reel_id", (range) => range.eq("reelId", args.reelId)).unique();
    if (!reel) throw new Error("reel delivery not found");
    if (args.status === "delivered") {
      if (!args.providerMessageId) throw new Error("provider message receipt is required");
      if (reel.status === "delivered") {
        if (reel.deliveredProviderMessageId !== args.providerMessageId) throw new Error("immutable reel delivery receipt conflict");
        return { completed: false, status: reel.status };
      }
      const transition = transitionReelLifecycle(reel.status as ReelLifecycleStatus, "delivery_succeeded");
      await context.db.patch(reel._id, { status: transition.status, deliveredProviderMessageId: args.providerMessageId, deliveredAt: args.now });
      return { completed: true, status: transition.status };
    }
    if (!args.failureCode) throw new Error("delivery failure code is required");
    if (reel.status === "delivery_failed") return { completed: false, status: reel.status };
    const transition = transitionReelLifecycle(reel.status as ReelLifecycleStatus, "delivery_failed");
    await context.db.patch(reel._id, { status: transition.status, deliveryFailureCode: args.failureCode });
    return { completed: true, status: transition.status };
  },
});

export const adminFinishReelDelivery = action({
  args: {
    serviceSecret: v.string(), reelId: v.string(), status: v.union(v.literal("delivered"), v.literal("delivery_failed")),
    providerMessageId: v.optional(v.string()), failureCode: v.optional(v.string()), now: v.number(),
  },
  handler: async (context, args): Promise<{ completed: boolean; status: string }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.finishReelDeliveryInternal, record);
  },
});

export const adminGetReelStatus = query({
  args: { serviceSecret: v.string(), reelId: v.string(), merchantId: v.string() },
  handler: async (context, args) => {
    requireServiceSecret(args.serviceSecret);
    const reel = await context.db.query("reelPlans").withIndex("by_reel_id", (range) => range.eq("reelId", args.reelId)).unique();
    if (!reel || reel.merchantId !== args.merchantId) return null;
    return { status: reel.status, renderedAssetId: reel.renderedAssetId, providerMessageId: reel.deliveredProviderMessageId };
  },
});

export const adminGetReelDeliveryTarget = query({
  args: { serviceSecret: v.string(), reelId: v.string() },
  handler: async (context, args) => {
    requireServiceSecret(args.serviceSecret);
    const reel = await context.db.query("reelPlans").withIndex("by_reel_id", (range) => range.eq("reelId", args.reelId)).unique();
    if (!reel?.deliveryRecipientCiphertext) return null;
    const plan = JSON.parse(reel.planJson) as { caption?: unknown };
    return {
      merchantId: reel.merchantId,
      recipientCiphertext: reel.deliveryRecipientCiphertext,
      caption: typeof plan.caption === "string" ? plan.caption : "Your approved Axcas reel",
    };
  },
});

const usageMetricValidator = v.union(
  v.literal("model_turns"), v.literal("whatsapp_messages"), v.literal("storage_bytes"),
  v.literal("render_seconds"), v.literal("polly_characters"), v.literal("call_cost_microusd"),
);

function assignmentLimit(assignment: any, metric: UsageMetric): number {
  if (!assignment) return FOUNDING_BETA_PLAN.limits[metric];
  const fields: Record<UsageMetric, string> = {
    model_turns: "modelTurnsLimit", whatsapp_messages: "whatsappMessagesLimit", storage_bytes: "storageBytesLimit",
    render_seconds: "renderSecondsLimit", polly_characters: "pollyCharactersLimit", call_cost_microusd: "callCostMicrousdLimit",
  };
  return assignment[fields[metric]];
}

export const assignTenantPlanInternal = internalMutation({
  args: {
    assignmentId: v.string(), merchantId: v.string(), planCode: v.string(), modelTurnsLimit: v.number(),
    whatsappMessagesLimit: v.number(), storageBytesLimit: v.number(), renderSecondsLimit: v.number(),
    pollyCharactersLimit: v.number(), callCostMicrousdLimit: v.number(), effectiveAt: v.number(), createdAt: v.number(),
  },
  handler: async (context, args) => {
    const limits = [args.modelTurnsLimit, args.whatsappMessagesLimit, args.storageBytesLimit, args.renderSecondsLimit, args.pollyCharactersLimit, args.callCostMicrousdLimit];
    if (limits.some((limit) => !Number.isSafeInteger(limit) || limit < 0)) throw new Error("tenant plan limits must be non-negative integers");
    const existing = await context.db.query("tenantPlanAssignments").withIndex("by_assignment_id", (range) => range.eq("assignmentId", args.assignmentId)).unique();
    if (existing) {
      const matches = Object.entries(args).every(([key, value]) => (existing as any)[key] === value);
      if (!matches) throw new Error("tenant plan assignment is immutable");
      return { inserted: false };
    }
    await context.db.insert("tenantPlanAssignments", args);
    return { inserted: true };
  },
});

export const adminAssignTenantPlan = action({
  args: {
    serviceSecret: v.string(), assignmentId: v.string(), merchantId: v.string(), planCode: v.string(), modelTurnsLimit: v.number(),
    whatsappMessagesLimit: v.number(), storageBytesLimit: v.number(), renderSecondsLimit: v.number(),
    pollyCharactersLimit: v.number(), callCostMicrousdLimit: v.number(), effectiveAt: v.number(), createdAt: v.number(),
  },
  handler: async (context, args): Promise<{ inserted: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.assignTenantPlanInternal, record);
  },
});

export const reserveUsageInternal = internalMutation({
  args: {
    merchantId: v.string(), operationId: v.string(), idempotencyKey: v.string(), requestedAt: v.number(),
    reservations: v.array(v.object({ metric: usageMetricValidator, quantity: v.number() })),
  },
  handler: async (context, args) => {
    if (!args.reservations.length || args.reservations.some(({ quantity }) => !Number.isSafeInteger(quantity) || quantity <= 0)) throw new Error("invalid usage reservation");
    if (new Set(args.reservations.map(({ metric }) => metric)).size !== args.reservations.length) throw new Error("duplicate usage metric");
    const requestsJson = JSON.stringify(args.reservations);
    const prior = await context.db.query("usageQuotaChecks").withIndex("by_idempotency_key", (range) => range.eq("idempotencyKey", args.idempotencyKey)).unique();
    if (prior) {
      if (prior.merchantId !== args.merchantId || prior.operationId !== args.operationId || prior.requestsJson !== requestsJson) throw new Error("usage idempotency conflict");
      return { allowed: prior.allowed, blockingMetric: prior.blockingMetric };
    }
    const assignments = await context.db.query("tenantPlanAssignments").withIndex("by_merchant_effective", (range) => range.eq("merchantId", args.merchantId).lte("effectiveAt", args.requestedAt)).collect();
    const assignment = assignments.sort((left, right) => right.effectiveAt - left.effectiveAt)[0];
    let blockingMetric: UsageMetric | undefined;
    for (const request of args.reservations) {
      const periodStart = usagePeriodStart(request.metric, args.requestedAt);
      const stored = await context.db.query("usageEntries").withIndex("by_merchant_metric_period", (range) => range.eq("merchantId", args.merchantId).eq("metric", request.metric).eq("periodStart", periodStart)).collect();
      const entries = stored.map((entry) => ({ schemaVersion: 1 as const, ...entry })) as unknown as UsageEntry[];
      const result = evaluateQuota({ used: aggregateBillableUsage(entries), requested: request.quantity, limit: assignmentLimit(assignment, request.metric) });
      if (!result.allowed) { blockingMetric = request.metric; break; }
    }
    const allowed = !blockingMetric;
    await context.db.insert("usageQuotaChecks", {
      checkId: `quota:${args.idempotencyKey}`, idempotencyKey: args.idempotencyKey, merchantId: args.merchantId,
      operationId: args.operationId, requestsJson, allowed, blockingMetric, createdAt: args.requestedAt,
    });
    if (allowed) {
      for (const request of args.reservations) {
        await context.db.insert("usageEntries", {
          usageEntryId: `usage:${args.idempotencyKey}:${request.metric}`, idempotencyKey: `${args.idempotencyKey}:${request.metric}`,
          operationId: args.operationId, merchantId: args.merchantId, metric: request.metric, quantity: request.quantity,
          basis: "reserved", periodStart: usagePeriodStart(request.metric, args.requestedAt), createdAt: args.requestedAt,
        });
      }
    }
    return { allowed, blockingMetric };
  },
});

export const adminReserveUsage = action({
  args: {
    serviceSecret: v.string(), merchantId: v.string(), operationId: v.string(), idempotencyKey: v.string(), requestedAt: v.number(),
    reservations: v.array(v.object({ metric: usageMetricValidator, quantity: v.number() })),
  },
  handler: async (context, args): Promise<{ allowed: boolean; blockingMetric?: UsageMetric }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.reserveUsageInternal, record);
  },
});

export const recordActualUsageInternal = internalMutation({
  args: {
    usageEntryId: v.string(), idempotencyKey: v.string(), operationId: v.string(), merchantId: v.string(),
    metric: usageMetricValidator, quantity: v.number(), evidenceRef: v.string(), occurredAt: v.number(),
  },
  handler: async (context, args) => {
    if (!Number.isSafeInteger(args.quantity) || args.quantity < 0 || !args.evidenceRef.trim()) throw new Error("actual usage requires a valid quantity and evidence");
    const prior = await context.db.query("usageEntries").withIndex("by_idempotency_key", (range) => range.eq("idempotencyKey", args.idempotencyKey)).unique();
    if (prior) {
      if (prior.merchantId !== args.merchantId || prior.operationId !== args.operationId || prior.metric !== args.metric || prior.quantity !== args.quantity || prior.evidenceRef !== args.evidenceRef || prior.basis !== "actual") throw new Error("usage idempotency conflict");
      return { inserted: false };
    }
    await context.db.insert("usageEntries", {
      usageEntryId: args.usageEntryId, idempotencyKey: args.idempotencyKey, operationId: args.operationId,
      merchantId: args.merchantId, metric: args.metric, quantity: args.quantity, basis: "actual",
      periodStart: usagePeriodStart(args.metric, args.occurredAt), evidenceRef: args.evidenceRef, createdAt: args.occurredAt,
    });
    return { inserted: true };
  },
});

export const adminRecordActualUsage = action({
  args: {
    serviceSecret: v.string(), usageEntryId: v.string(), idempotencyKey: v.string(), operationId: v.string(), merchantId: v.string(),
    metric: usageMetricValidator, quantity: v.number(), evidenceRef: v.string(), occurredAt: v.number(),
  },
  handler: async (context, args): Promise<{ inserted: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.recordActualUsageInternal, record);
  },
});

export const adminUsageSummary = query({
  args: { serviceSecret: v.string(), merchantId: v.string(), now: v.number() },
  handler: async (context, args) => {
    requireServiceSecret(args.serviceSecret);
    const assignments = await context.db.query("tenantPlanAssignments").withIndex("by_merchant_effective", (range) => range.eq("merchantId", args.merchantId).lte("effectiveAt", args.now)).collect();
    const assignment = assignments.sort((left, right) => right.effectiveAt - left.effectiveAt)[0];
    const metrics: UsageMetric[] = ["model_turns", "whatsapp_messages", "storage_bytes", "render_seconds", "polly_characters", "call_cost_microusd"];
    const usage: Record<string, { used: number; limit: number; remaining: number }> = {};
    for (const metric of metrics) {
      const periodStart = usagePeriodStart(metric, args.now);
      const stored = await context.db.query("usageEntries").withIndex("by_merchant_metric_period", (range) => range.eq("merchantId", args.merchantId).eq("metric", metric).eq("periodStart", periodStart)).collect();
      const used = aggregateBillableUsage(stored.map((entry) => ({ schemaVersion: 1 as const, ...entry })) as unknown as UsageEntry[]);
      const limit = assignmentLimit(assignment, metric);
      usage[metric] = { used, limit, remaining: Math.max(0, limit - used) };
    }
    return { merchantId: args.merchantId, planCode: assignment?.planCode ?? FOUNDING_BETA_PLAN.planCode, through: args.now, usage };
  },
});
