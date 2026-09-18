import { z } from "zod";

const identifier = z.string().regex(/^[a-zA-Z0-9_.:-]{3,256}$/);
const merchantId = z.string().regex(/^[a-z0-9-]{3,64}$/);
const timestamp = z.number().int().nonnegative();
const customerText = z.string().trim().min(1).max(1_024).superRefine((value, context) => {
  const forbidden = [
    /```/,
    /command approval required/i,
    /\b(?:ProofGate|Convex|Cloudflare|Hermes|Vapi)\b/i,
    /(?:^|\W)(?:PROOFGATE|HERMES|META|VAPI|AWS)_[A-Z0-9_]+/,
    /(?:^|\s)(?:cd|export|execute_code|subprocess)\b/i,
    /\/opt\/proofgate/i,
    /\b[a-f0-9]{48,}\b/i,
    /(?:traceback|stack trace|exception at)\b/i,
    /(?:secret|token|password)\s*[=:]\s*[A-Za-z0-9_+\/-]{16,}/i,
  ];
  if (forbidden.some((pattern) => pattern.test(value))) {
    context.addIssue({ code: "custom", message: "customer messages may not contain internal commands or credentials" });
  }
});

export const WorkflowStatusSchema = z.enum([
  "received",
  "processing",
  "awaiting_input",
  "awaiting_approval",
  "retrying",
  "completed",
  "failed",
]);
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

export const WorkflowProgressSchema = z.enum([
  "message_received",
  "brief_saved",
  "media_saved",
  "building",
  "checking",
  "preview_ready",
  "approval_requested",
  "published",
  "reel_ready",
  "temporary_retry",
]);
export type WorkflowProgress = z.infer<typeof WorkflowProgressSchema>;

const customerProgressCopy: Partial<Record<WorkflowProgress, string>> = {
  message_received: "Got it — I’m building your draft now. I’ll message you when the checked preview is ready.",
  preview_ready: "Your checked preview is ready. Review the details, prices, and WhatsApp button.",
  published: "Your website is live. I’ll keep tracking visits and WhatsApp enquiries here.",
  reel_ready: "Your reel is ready and has been returned here privately.",
  temporary_retry: "I’ve saved everything you sent. I’m reconnecting and will continue automatically—you do not need to resend anything.",
};

/**
 * Converts durable workflow state into deliberately sparse customer updates.
 * Missing entries are internal milestones and must not create WhatsApp noise.
 */
export function customerProgressMessage(progress: WorkflowProgress): string | null {
  const parsed = WorkflowProgressSchema.parse(progress);
  return customerProgressCopy[parsed] ?? null;
}

export const InboundWorkflowSchema = z.object({
  schemaVersion: z.literal(1),
  workflowId: identifier,
  merchantId,
  channel: z.literal("whatsapp_cloud"),
  providerMessageId: identifier,
  projectId: identifier.optional(),
  intent: z.enum(["website", "reels", "both"]).optional(),
  status: WorkflowStatusSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict();
export type InboundWorkflow = z.infer<typeof InboundWorkflowSchema>;

const transitions: Record<WorkflowStatus, readonly WorkflowStatus[]> = {
  received: ["processing", "retrying", "failed"],
  processing: ["awaiting_input", "awaiting_approval", "retrying", "completed", "failed"],
  awaiting_input: ["processing", "failed"],
  awaiting_approval: ["processing", "completed", "failed"],
  retrying: ["processing", "failed"],
  completed: [],
  failed: [],
};

export function advanceWorkflow(input: InboundWorkflow, status: WorkflowStatus, now: number): InboundWorkflow {
  const workflow = InboundWorkflowSchema.parse(input);
  WorkflowStatusSchema.parse(status);
  if (status === workflow.status) return InboundWorkflowSchema.parse({ ...workflow, updatedAt: now });
  if (!transitions[workflow.status].includes(status)) {
    throw new Error(`invalid workflow transition: ${workflow.status} -> ${status}`);
  }
  return InboundWorkflowSchema.parse({ ...workflow, status, updatedAt: now });
}

export const CustomerOutboxMessageSchema = z.object({
  schemaVersion: z.literal(1),
  outboxId: identifier,
  workflowId: identifier,
  merchantId,
  kind: z.enum(["progress", "missing_facts", "approval", "completion", "retry"]),
  body: customerText,
  dedupeKey: identifier,
  createdAt: timestamp,
}).strict();
export type CustomerOutboxMessage = z.infer<typeof CustomerOutboxMessageSchema>;

const waIdHash = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * A WhatsApp client commonly uploads a voice note and each photo as separate provider
 * messages. This state groups those messages without asking the merchant to press a
 * special "done" button. It contains references only; media bytes remain in private storage.
 */
export const WhatsAppBundlePartSchema = z.object({
  bundleId: identifier,
  merchantId,
  senderWaIdHash: waIdHash,
  providerMessageId: identifier,
  kind: z.enum(["text", "image", "voice", "video", "document"]),
  receivedAt: timestamp,
}).strict();
export type WhatsAppBundlePart = z.infer<typeof WhatsAppBundlePartSchema>;

export const WhatsAppBundleSchema = z.object({
  schemaVersion: z.literal(1),
  bundleId: identifier,
  merchantId,
  senderWaIdHash: waIdHash,
  parts: z.array(WhatsAppBundlePartSchema).min(1).max(64),
  firstReceivedAt: timestamp,
  lastReceivedAt: timestamp,
  readyAt: timestamp,
  missingQuestionAskedAt: timestamp.optional(),
  forwardedAt: timestamp.optional(),
}).strict();
export type WhatsAppBundle = z.infer<typeof WhatsAppBundleSchema>;

export const WHATSAPP_BUNDLE_DEBOUNCE_MS = 8_000;
export const WHATSAPP_BUNDLE_MAX_WAIT_MS = 45_000;

/** Adds one provider message exactly once and extends the short collection window. */
export function appendWhatsAppBundlePart(current: WhatsAppBundle | undefined, input: WhatsAppBundlePart): WhatsAppBundle {
  const part = WhatsAppBundlePartSchema.parse(input);
  if (!current) {
    return WhatsAppBundleSchema.parse({
      schemaVersion: 1,
      bundleId: part.bundleId,
      merchantId: part.merchantId,
      senderWaIdHash: part.senderWaIdHash,
      parts: [part],
      firstReceivedAt: part.receivedAt,
      lastReceivedAt: part.receivedAt,
      readyAt: part.receivedAt + WHATSAPP_BUNDLE_DEBOUNCE_MS,
    });
  }
  const bundle = WhatsAppBundleSchema.parse(current);
  if (bundle.bundleId !== part.bundleId || bundle.merchantId !== part.merchantId || bundle.senderWaIdHash !== part.senderWaIdHash) {
    throw new Error("WhatsApp bundle identity mismatch");
  }
  if (bundle.forwardedAt !== undefined) throw new Error("forwarded WhatsApp bundle is immutable");
  if (bundle.parts.some((existing) => existing.providerMessageId === part.providerMessageId)) return bundle;
  if (part.receivedAt < bundle.firstReceivedAt) throw new Error("WhatsApp bundle part predates the bundle");
  const lastReceivedAt = Math.max(bundle.lastReceivedAt, part.receivedAt);
  const readyAt = Math.min(
    bundle.firstReceivedAt + WHATSAPP_BUNDLE_MAX_WAIT_MS,
    lastReceivedAt + WHATSAPP_BUNDLE_DEBOUNCE_MS,
  );
  return WhatsAppBundleSchema.parse({ ...bundle, parts: [...bundle.parts, part], lastReceivedAt, readyAt });
}

export function isWhatsAppBundleReady(input: WhatsAppBundle, now: number): boolean {
  const bundle = WhatsAppBundleSchema.parse(input);
  return bundle.forwardedAt === undefined && now >= bundle.readyAt;
}

export const MissingMerchantFactSchema = z.enum([
  "business_name",
  "description",
  "fulfillment_area",
  "lead_time",
  "offerings",
  "prices",
  "order_whatsapp_number",
]);
export type MissingMerchantFact = z.infer<typeof MissingMerchantFactSchema>;

const missingFactQuestion: Record<MissingMerchantFact, string> = {
  business_name: "what is your business name",
  description: "what should customers know about your business",
  fulfillment_area: "what area do you serve",
  lead_time: "how much notice do you need",
  offerings: "what products or services should I include",
  prices: "what are your prices",
  order_whatsapp_number: "which WhatsApp number should receive customer enquiries",
};

/** Returns one plain-language question for every missing fact, and never asks twice. */
export function consolidatedMissingFactsQuestion(
  input: WhatsAppBundle,
  missing: readonly MissingMerchantFact[],
  now: number,
): { bundle: WhatsAppBundle; message: string | null } {
  const bundle = WhatsAppBundleSchema.parse(input);
  const facts = [...new Set(missing.map((fact) => MissingMerchantFactSchema.parse(fact)))];
  if (!facts.length || bundle.missingQuestionAskedAt !== undefined) return { bundle, message: null };
  const clauses = facts.map((fact) => missingFactQuestion[fact]);
  const joined = clauses.length === 1
    ? clauses[0]!
    : clauses.length === 2
      ? `${clauses[0]}, and ${clauses[1]}`
      : `${clauses.slice(0, -1).join(", ")}, and ${clauses.at(-1)}`;
  const message = customerText.parse(`One quick question before I build it: ${joined}?`);
  return { bundle: WhatsAppBundleSchema.parse({ ...bundle, missingQuestionAskedAt: now }), message };
}

export const CustomerOutboxDeliverySchema = z.object({
  schemaVersion: z.literal(1),
  outboxId: identifier,
  dedupeKey: identifier,
  status: z.enum(["pending", "sending", "retrying", "sent", "exhausted"]),
  attempts: z.number().int().min(0).max(4),
  nextAttemptAt: timestamp,
  leaseUntil: timestamp.optional(),
  providerMessageId: identifier.optional(),
  updatedAt: timestamp,
}).strict();
export type CustomerOutboxDelivery = z.infer<typeof CustomerOutboxDeliverySchema>;

const outboundRetryDelayMs = [5_000, 30_000, 300_000] as const;

/** Claims a due row once. Concurrent or terminal claims are no-ops. */
export function claimCustomerOutboxDelivery(input: CustomerOutboxDelivery, now: number): CustomerOutboxDelivery | null {
  const delivery = CustomerOutboxDeliverySchema.parse(input);
  if (!["pending", "retrying"].includes(delivery.status) || now < delivery.nextAttemptAt || delivery.attempts >= 4) return null;
  return CustomerOutboxDeliverySchema.parse({
    ...delivery,
    status: "sending",
    attempts: delivery.attempts + 1,
    leaseUntil: now + 30_000,
    updatedAt: now,
  });
}

/** Records the provider result while preserving sent as an idempotent terminal state. */
export function settleCustomerOutboxDelivery(
  input: CustomerOutboxDelivery,
  result: { delivered: true; providerMessageId: string; now: number } | { delivered: false; now: number },
): CustomerOutboxDelivery {
  const delivery = CustomerOutboxDeliverySchema.parse(input);
  if (delivery.status === "sent") return delivery;
  if (delivery.status !== "sending") throw new Error("outbox delivery must be claimed before it is settled");
  if (result.delivered) {
    return CustomerOutboxDeliverySchema.parse({
      ...delivery,
      status: "sent",
      providerMessageId: result.providerMessageId,
      nextAttemptAt: result.now,
      leaseUntil: undefined,
      updatedAt: result.now,
    });
  }
  if (delivery.attempts >= 4) {
    return CustomerOutboxDeliverySchema.parse({ ...delivery, status: "exhausted", nextAttemptAt: result.now, leaseUntil: undefined, updatedAt: result.now });
  }
  const delay = outboundRetryDelayMs[Math.min(delivery.attempts - 1, outboundRetryDelayMs.length - 1)]!;
  return CustomerOutboxDeliverySchema.parse({
    ...delivery,
    status: "retrying",
    nextAttemptAt: result.now + delay,
    leaseUntil: undefined,
    updatedAt: result.now,
  });
}

export const ProjectSyncCursorSchema = z.object({
  createdAt: timestamp,
  projectId: identifier,
  revisionId: identifier,
}).strict();
export type ProjectSyncCursor = z.infer<typeof ProjectSyncCursorSchema>;

function cursorKey(cursor: ProjectSyncCursor): [number, string, string] {
  return [cursor.createdAt, cursor.projectId, cursor.revisionId];
}

export function compareProjectCursors(left: ProjectSyncCursor, right: ProjectSyncCursor): number {
  const leftKey = cursorKey(ProjectSyncCursorSchema.parse(left));
  const rightKey = cursorKey(ProjectSyncCursorSchema.parse(right));
  return leftKey[0] - rightKey[0] || leftKey[1].localeCompare(rightKey[1]) || leftKey[2].localeCompare(rightKey[2]);
}

export function nextProjectCursor(current: ProjectSyncCursor | undefined, change: ProjectSyncCursor): ProjectSyncCursor {
  const candidate = ProjectSyncCursorSchema.parse(change);
  if (!current) return candidate;
  const parsed = ProjectSyncCursorSchema.parse(current);
  return compareProjectCursors(candidate, parsed) > 0 ? candidate : parsed;
}

export function encodeProjectCursor(cursor: ProjectSyncCursor): string {
  const parsed = ProjectSyncCursorSchema.parse(cursor);
  return `${parsed.createdAt}:${encodeURIComponent(parsed.projectId)}:${encodeURIComponent(parsed.revisionId)}`;
}

export function decodeProjectCursor(value: string | undefined): ProjectSyncCursor | undefined {
  if (!value) return undefined;
  const match = /^(\d{1,16}):([^:]{3,384}):([^:]{3,384})$/.exec(value);
  if (!match) throw new Error("invalid project sync cursor");
  return ProjectSyncCursorSchema.parse({ createdAt: Number(match[1]), projectId: decodeURIComponent(match[2]), revisionId: decodeURIComponent(match[3]) });
}
