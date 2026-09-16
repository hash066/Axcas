import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sites: defineTable({
    slug: v.string(),
    merchantId: v.optional(v.string()),
    canaryVersionId: v.optional(v.string()),
    productionVersionId: v.optional(v.string()),
    previousCertifiedVersionId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_merchant_slug", ["merchantId", "slug"]),

  siteVersions: defineTable({
    siteId: v.id("sites"),
    versionId: v.string(),
    parentVersionId: v.optional(v.string()),
    specJson: v.string(),
    specHash: v.string(),
    actor: v.string(),
    createdAt: v.number(),
  })
    .index("by_site_version", ["siteId", "versionId"])
    .index("by_site_created", ["siteId", "createdAt"]),

  releases: defineTable({
    siteId: v.id("sites"),
    versionId: v.string(),
    specHash: v.string(),
    decision: v.union(v.literal("promote"), v.literal("rollback")),
    previousVersionId: v.optional(v.string()),
    reason: v.string(),
    createdAt: v.number(),
  }).index("by_site_created", ["siteId", "createdAt"]),

  bookingSessions: defineTable({
    nonceHash: v.string(),
    siteId: v.string(),
    versionId: v.string(),
    specHash: v.string(),
    contractId: v.string(),
    runId: v.string(),
    expectedQuantity: v.number(),
    csrfIdentityHash: v.string(),
    issuedAt: v.number(),
    expiresAt: v.number(),
    submittedAt: v.optional(v.number()),
    consumedAt: v.optional(v.number()),
  })
    .index("by_nonce_hash", ["nonceHash"])
    .index("by_site_version", ["siteId", "versionId"]),

  externalEvents: defineTable({
    providerEventId: v.string(),
    provider: v.union(v.literal("proofgate-edge"), v.literal("telegram"), v.literal("dodo")),
    level: v.union(v.literal("submitted"), v.literal("dispatched"), v.literal("acknowledged")),
    siteId: v.string(),
    versionId: v.string(),
    specHash: v.string(),
    contractId: v.string(),
    runId: v.string(),
    correlationNonceHash: v.string(),
    quantity: v.number(),
    verificationMethod: v.union(v.literal("provider_signature"), v.literal("edge_hmac"), v.literal("merchant_ack"), v.literal("buyer_ack")),
    actorClass: v.union(v.literal("external_human"), v.literal("system"), v.literal("team"), v.literal("test"), v.literal("synthetic_verifier")),
    verifiedAt: v.number(),
    verifierIdentity: v.string(),
    environment: v.string(),
    redactedPayload: v.string(),
    payloadHash: v.string(),
    occurredAt: v.number(),
  })
    .index("by_provider_event_id", ["provider", "providerEventId"])
    .index("by_correlation", ["correlationNonceHash"])
    .index("by_run", ["runId"]),

  passportSubjects: defineTable({
    siteId: v.string(),
    versionId: v.string(),
    specHash: v.string(),
    contractId: v.string(),
    runId: v.string(),
    bookingSessionId: v.id("bookingSessions"),
    createdAt: v.number(),
  }).index("by_site", ["siteId"]),

  merchants: defineTable({
    merchantId: v.string(),
    ownerWaIdHash: v.string(),
    name: v.string(),
    timezone: v.string(),
    orderWhatsAppNumberCiphertext: v.string(),
    createdAt: v.number(),
  })
    .index("by_merchant_id", ["merchantId"])
    .index("by_owner_wa_hash", ["ownerWaIdHash"]),

  studioLinkRequests: defineTable({
    linkId: v.string(),
    codeHash: v.string(),
    browserNonceHash: v.string(),
    intent: v.union(v.literal("website"), v.literal("reels"), v.literal("both")),
    status: v.union(v.literal("pending"), v.literal("claimed"), v.literal("consumed")),
    merchantId: v.optional(v.string()),
    ownerWaIdHash: v.optional(v.string()),
    providerMessageId: v.optional(v.string()),
    expiresAt: v.number(),
    claimedAt: v.optional(v.number()),
    consumedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_link_id", ["linkId"])
    .index("by_code_hash", ["codeHash"]),

  studioSessions: defineTable({
    sessionHash: v.string(),
    merchantId: v.string(),
    ownerWaIdHash: v.string(),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_session_hash", ["sessionHash"])
    .index("by_merchant", ["merchantId"]),

  studioDataRequests: defineTable({
    requestId: v.string(),
    merchantId: v.string(),
    type: v.union(v.literal("export"), v.literal("deletion")),
    // "requested" was the only permitted value while nothing processed these rows. A deletion
    // request is now carried out at the edge, so it needs a terminal state to move into.
    status: v.union(v.literal("requested"), v.literal("completed")),
    dueBy: v.number(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    deletedRecords: v.optional(v.number()),
  })
    .index("by_request_id", ["requestId"])
    .index("by_merchant_type", ["merchantId", "type"]),

  studioProjects: defineTable({
    projectId: v.string(),
    revisionId: v.string(),
    parentRevisionId: v.optional(v.string()),
    merchantId: v.string(),
    intent: v.union(v.literal("website"), v.literal("reels"), v.literal("both")),
    source: v.optional(v.union(v.literal("whatsapp"), v.literal("studio"))),
    projectJson: v.string(),
    createdAt: v.number(),
  })
    .index("by_project_revision", ["projectId", "revisionId"])
    .index("by_merchant_created", ["merchantId", "createdAt"]),

  studioProjectHeads: defineTable({
    projectId: v.string(),
    merchantId: v.string(),
    headRevisionId: v.string(),
    intent: v.union(v.literal("website"), v.literal("reels"), v.literal("both")),
    source: v.union(v.literal("whatsapp"), v.literal("studio")),
    updatedAt: v.number(),
  })
    .index("by_project_id", ["projectId"])
    .index("by_merchant_updated", ["merchantId", "updatedAt"]),

  inboundWorkflows: defineTable({
    workflowId: v.string(),
    merchantId: v.string(),
    ownerWaIdHash: v.string(),
    channel: v.literal("whatsapp_cloud"),
    providerMessageId: v.string(),
    projectId: v.optional(v.string()),
    intent: v.optional(v.union(v.literal("website"), v.literal("reels"), v.literal("both"))),
    status: v.union(
      v.literal("received"), v.literal("processing"), v.literal("awaiting_input"),
      v.literal("awaiting_approval"), v.literal("retrying"), v.literal("completed"), v.literal("failed"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workflow_id", ["workflowId"])
    .index("by_provider_message", ["channel", "providerMessageId"])
    .index("by_merchant_updated", ["merchantId", "updatedAt"]),

  workflowEvents: defineTable({
    eventId: v.string(),
    workflowId: v.string(),
    merchantId: v.string(),
    progress: v.union(
      v.literal("message_received"), v.literal("brief_saved"), v.literal("media_saved"),
      v.literal("building"), v.literal("checking"), v.literal("preview_ready"),
      v.literal("approval_requested"), v.literal("published"), v.literal("reel_ready"), v.literal("temporary_retry"),
    ),
    status: v.union(
      v.literal("received"), v.literal("processing"), v.literal("awaiting_input"),
      v.literal("awaiting_approval"), v.literal("retrying"), v.literal("completed"), v.literal("failed"),
    ),
    projectId: v.optional(v.string()),
    intent: v.optional(v.union(v.literal("website"), v.literal("reels"), v.literal("both"))),
    createdAt: v.number(),
  })
    .index("by_event_id", ["eventId"])
    .index("by_workflow_created", ["workflowId", "createdAt"]),

  customerOutbox: defineTable({
    outboxId: v.string(),
    workflowId: v.string(),
    merchantId: v.string(),
    kind: v.union(v.literal("progress"), v.literal("missing_facts"), v.literal("approval"), v.literal("completion"), v.literal("retry")),
    body: v.string(),
    dedupeKey: v.string(),
    status: v.union(v.literal("pending"), v.literal("sending"), v.literal("sent"), v.literal("failed")),
    attempts: v.number(),
    providerMessageId: v.optional(v.string()),
    nextAttemptAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_outbox_id", ["outboxId"])
    .index("by_dedupe_key", ["dedupeKey"])
    .index("by_status_next_attempt", ["status", "nextAttemptAt"]),

  decisionPolicies: defineTable({
    policyId: v.string(),
    merchantId: v.string(),
    ownerWaIdHash: v.string(),
    policyJson: v.string(),
    policyHash: v.string(),
    supersedesPolicyId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_policy_id", ["policyId"])
    .index("by_merchant_created", ["merchantId", "createdAt"]),

  mediaAssets: defineTable({
    assetId: v.string(),
    merchantId: v.string(),
    storageBackend: v.optional(v.union(v.literal("r2"), v.literal("convex"))),
    objectKey: v.optional(v.string()),
    convexStorageId: v.optional(v.id("_storage")),
    sha256: v.string(),
    contentType: v.string(),
    byteLength: v.number(),
    sourceProviderMessageId: v.string(),
    publicApprovedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_asset_id", ["assetId"])
    .index("by_merchant", ["merchantId"]),

  growthEvents: defineTable({
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
  })
    .index("by_event_id", ["eventId"])
    .index("by_site_time", ["siteId", "occurredAt"])
    .index("by_site_version", ["siteId", "versionId"]),

  verificationCapabilities: defineTable({
    tokenHash: v.string(),
    merchantId: v.optional(v.string()),
    siteId: v.string(),
    versionId: v.string(),
    specHash: v.string(),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_token_hash", ["tokenHash"]),

  growthVerifications: defineTable({
    evidenceId: v.string(),
    siteId: v.string(),
    versionId: v.string(),
    specHash: v.string(),
    runId: v.string(),
    reportHash: v.string(),
    passed: v.boolean(),
    blockers: v.array(v.string()),
    observedAt: v.number(),
  })
    .index("by_evidence_id", ["evidenceId"])
    .index("by_site_version", ["siteId", "versionId"]),

  approvals: defineTable({
    approvalId: v.string(),
    merchantId: v.string(),
    type: v.union(v.literal("release"), v.literal("call_batch"), v.literal("reel"), v.literal("social_campaign")),
    scopeHash: v.string(),
    ownerWaIdHash: v.string(),
    providerMessageId: v.string(),
    // The merchant-facing checklist exactly as it was sent on WhatsApp, so the mobile approval
    // inbox shows the same words rather than reconstructing them from the approval type.
    checklist: v.optional(v.string()),
    decision: v.union(v.literal("pending"), v.literal("approved"), v.literal("denied")),
    decidedAt: v.optional(v.number()),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_approval_id", ["approvalId"])
    .index("by_merchant", ["merchantId"]),

  leadConsents: defineTable({
    leadId: v.string(),
    merchantId: v.string(),
    phoneCiphertext: v.string(),
    phoneHash: v.string(),
    country: v.union(v.literal("IN"), v.literal("US")),
    purpose: v.literal("ai_qualification_call"),
    source: v.string(),
    evidenceHash: v.string(),
    grantedAt: v.number(),
    revokedAt: v.optional(v.number()),
    localTimezone: v.string(),
    callWindowStartHour: v.number(),
    callWindowEndHour: v.number(),
    createdAt: v.number(),
  })
    .index("by_lead_id", ["leadId"])
    .index("by_phone_hash", ["phoneHash"])
    .index("by_merchant", ["merchantId"]),

  callBatches: defineTable({
    batchId: v.string(),
    merchantId: v.string(),
    scopeHash: v.string(),
    leadIds: v.array(v.string()),
    countries: v.array(v.union(v.literal("IN"), v.literal("US"))),
    scriptVersion: v.string(),
    earliestAt: v.number(),
    latestAt: v.number(),
    maxAttemptsPerLead: v.number(),
    costCapUsd: v.number(),
    approvalId: v.string(),
    dispatchedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_batch_id", ["batchId"])
    .index("by_merchant", ["merchantId"]),

  callAttempts: defineTable({
    attemptId: v.string(), batchId: v.string(), merchantId: v.string(), leadId: v.string(),
    status: v.union(v.literal("pending"), v.literal("claimed"), v.literal("provider_created"), v.literal("completed"), v.literal("failed")),
    providerCallId: v.optional(v.string()), failureCode: v.optional(v.string()), claimedAt: v.optional(v.number()), completedAt: v.optional(v.number()), createdAt: v.number(),
  })
    .index("by_attempt_id", ["attemptId"])
    .index("by_provider_call_id", ["providerCallId"])
    .index("by_batch", ["batchId"])
    .index("by_batch_lead", ["batchId", "leadId"]),

  callOutcomes: defineTable({
    providerCallId: v.string(),
    attemptId: v.string(),
    batchId: v.string(),
    leadId: v.string(),
    recordingConsent: v.union(v.literal("granted"), v.literal("declined"), v.literal("not_reached")),
    outcome: v.union(v.literal("qualified"), v.literal("not_interested"), v.literal("no_answer"), v.literal("failed"), v.literal("do_not_call")),
    interest: v.optional(v.string()),
    timing: v.optional(v.string()),
    product: v.optional(v.string()),
    objection: v.optional(v.string()),
    followUpRequested: v.boolean(),
    doNotCall: v.boolean(),
    costUsd: v.number(),
    artifactRef: v.optional(v.string()),
    completedAt: v.number(),
  })
    .index("by_provider_call_id", ["providerCallId"])
    .index("by_batch", ["batchId"]),

  callRecordingArtifacts: defineTable({
    artifactId: v.string(), attemptId: v.string(), providerCallId: v.string(), merchantId: v.string(),
    bucketKey: v.string(), sha256: v.string(), byteLength: v.number(), copiedAt: v.number(), expiresAt: v.number(),
  })
    .index("by_artifact_id", ["artifactId"])
    .index("by_provider_call_id", ["providerCallId"]),

  growthReleaseRequests: defineTable({
    requestId: v.string(),
    siteId: v.string(),
    merchantId: v.string(),
    versionId: v.string(),
    specHash: v.string(),
    scopeHash: v.string(),
    verificationRunId: v.string(),
    approvalId: v.string(),
    status: v.union(v.literal("pending"), v.literal("promoted"), v.literal("blocked")),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_request_id", ["requestId"])
    .index("by_site", ["siteId"]),

  reelPlans: defineTable({
    reelId: v.string(),
    merchantId: v.string(),
    planJson: v.string(),
    planHash: v.string(),
    approvalId: v.optional(v.string()),
    renderedAssetId: v.optional(v.string()),
    renderEvidenceJson: v.optional(v.string()),
    renderEvidenceHash: v.optional(v.string()),
    deliveredProviderMessageId: v.optional(v.string()),
    deliveryRecipientHash: v.optional(v.string()),
    deliveryFailureCode: v.optional(v.string()),
    deliveryStartedAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
    status: v.union(
      v.literal("draft"), v.literal("approved"), v.literal("rendering"), v.literal("rendered"),
      v.literal("delivering"), v.literal("delivered"), v.literal("delivery_failed"),
    ),
    createdAt: v.number(),
  })
    .index("by_reel_id", ["reelId"])
    .index("by_merchant", ["merchantId"]),

  socialCampaigns: defineTable({
    campaignId: v.string(),
    merchantId: v.string(),
    campaignJson: v.string(),
    scopeHash: v.string(),
    approvalId: v.string(),
    status: v.union(v.literal("pending_approval"), v.literal("approved"), v.literal("running"), v.literal("complete"), v.literal("failed")),
    createdAt: v.number(),
  })
    .index("by_campaign_id", ["campaignId"])
    .index("by_merchant", ["merchantId"]),

  tenantPlanAssignments: defineTable({
    assignmentId: v.string(),
    merchantId: v.string(),
    planCode: v.string(),
    modelTurnsLimit: v.number(),
    whatsappMessagesLimit: v.number(),
    storageBytesLimit: v.number(),
    renderSecondsLimit: v.number(),
    pollyCharactersLimit: v.number(),
    callCostMicrousdLimit: v.number(),
    effectiveAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_assignment_id", ["assignmentId"])
    .index("by_merchant_effective", ["merchantId", "effectiveAt"]),

  usageEntries: defineTable({
    usageEntryId: v.string(),
    idempotencyKey: v.string(),
    operationId: v.string(),
    merchantId: v.string(),
    metric: v.union(
      v.literal("model_turns"), v.literal("whatsapp_messages"), v.literal("storage_bytes"),
      v.literal("render_seconds"), v.literal("polly_characters"), v.literal("call_cost_microusd"),
    ),
    quantity: v.number(),
    basis: v.union(v.literal("reserved"), v.literal("actual")),
    periodStart: v.number(),
    evidenceRef: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_usage_entry_id", ["usageEntryId"])
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_merchant_metric_period", ["merchantId", "metric", "periodStart"])
    .index("by_merchant_operation", ["merchantId", "operationId"]),

  usageQuotaChecks: defineTable({
    checkId: v.string(),
    idempotencyKey: v.string(),
    merchantId: v.string(),
    operationId: v.string(),
    requestsJson: v.string(),
    allowed: v.boolean(),
    blockingMetric: v.optional(v.union(
      v.literal("model_turns"), v.literal("whatsapp_messages"), v.literal("storage_bytes"),
      v.literal("render_seconds"), v.literal("polly_characters"), v.literal("call_cost_microusd"),
    )),
    createdAt: v.number(),
  })
    .index("by_check_id", ["checkId"])
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_merchant_created", ["merchantId", "createdAt"]),
});
