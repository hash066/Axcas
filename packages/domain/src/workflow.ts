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
