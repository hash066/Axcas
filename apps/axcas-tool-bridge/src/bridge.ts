import { randomUUID } from "node:crypto";
import { z } from "zod";

import { prepareJsonCommand, submitCommand, type PreparedCommand } from "../../proofgate-cli/src/commands";

export const SAFE_RETRY_MESSAGE = "Axcas hit a temporary connection problem. Your message is still in this chat, and I’ll continue automatically—you do not need to resend anything.";

const BridgeContextSchema = z.object({
  platform: z.enum(["whatsapp", "whatsapp_cloud"]),
  userId: z.string().regex(/^\d{8,15}$/),
  messageId: z.string().trim().min(1).max(512),
}).strict();

const BridgeActionSchema = z.enum([
  "intake",
  "policy",
  "decision",
  "candidate",
  "request_verification",
  "request_publish",
  "lead",
  "call_batch",
  "reel",
  "metrics",
]);

const BridgeRequestSchema = z.object({
  action: BridgeActionSchema,
  context: BridgeContextSchema,
  payload: z.unknown(),
}).strict();

export type BridgeRequest = z.infer<typeof BridgeRequestSchema>;
export type BridgeResult = {
  status: "accepted" | "preview_ready" | "approval_sent" | "temporarily_unavailable";
  customerMessage: string;
  notifyCustomer: boolean;
  merchantId?: string;
  previewUrl?: string;
  previewExpiresAt?: number;
  specHash?: string;
  decision?: string;
};

type Submit = (command: PreparedCommand, env: NodeJS.ProcessEnv) => Promise<unknown>;

export function parseBridgeRequest(value: unknown): BridgeRequest {
  return BridgeRequestSchema.parse(value);
}

function validatedOrigin(env: NodeJS.ProcessEnv): void {
  const value = env.PROOFGATE_ADMIN_URL;
  if (!value) throw new Error("bridge origin is unavailable");
  const origin = new URL(value);
  if (origin.protocol !== "https:" || !origin.hostname.endsWith(".workers.dev") || origin.pathname !== "/") {
    throw new Error("bridge origin is unavailable");
  }
  if (!env.PROOFGATE_SERVICE_SECRET || env.PROOFGATE_SERVICE_SECRET.length < 32) {
    throw new Error("bridge credential is unavailable");
  }
}

async function prepare(request: BridgeRequest): Promise<PreparedCommand> {
  if (request.action === "metrics") {
    const metrics = z.object({
      siteId: z.string().regex(/^[a-z0-9-]{3,64}$/),
      days: z.number().int().min(1).max(90).default(7),
    }).strict().parse(request.payload);
    return {
      path: `/internal/metrics/${encodeURIComponent(metrics.siteId)}?since=${Date.now() - metrics.days * 86_400_000}`,
      method: "GET",
      contentType: "application/json",
    };
  }
  const command = request.action === "request_verification"
    ? "verification"
    : request.action === "request_publish"
      ? "release"
      : request.action === "call_batch"
        ? "batch"
        : request.action;
  return prepareJsonCommand(command as Parameters<typeof prepareJsonCommand>[0], request.payload);
}

function safeResult(action: BridgeRequest["action"], raw: unknown): BridgeResult {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  if (action === "candidate" && typeof value.previewUrl === "string" && /^https:\/\//.test(value.previewUrl)) {
    return {
      status: "preview_ready",
      customerMessage: "Your website preview is ready. Check the business details, prices, and WhatsApp button.",
      notifyCustomer: true,
      previewUrl: value.previewUrl,
      previewExpiresAt: typeof value.previewExpiresAt === "number" ? value.previewExpiresAt : undefined,
      specHash: typeof value.specHash === "string" ? value.specHash : undefined,
    };
  }
  if (action === "request_publish" || action === "call_batch" || action === "reel") {
    // The Worker sends the signed native-button checklist directly. Echoing a
    // second Hermes acknowledgement would create approval spam.
    return { status: "approval_sent", customerMessage: "", notifyCustomer: false };
  }
  if (action === "decision") {
    return {
      status: "accepted",
      customerMessage: "",
      notifyCustomer: false,
      decision: typeof value.decision === "string" ? value.decision : undefined,
    };
  }
  if (action === "metrics") {
    return { status: "accepted", customerMessage: "Your activity summary is ready.", notifyCustomer: true };
  }
  return {
    status: "accepted",
    customerMessage: "",
    notifyCustomer: false,
    merchantId: action === "intake" && typeof value.merchantId === "string" ? value.merchantId : undefined,
  };
}

export async function executeBridgeRequest(
  input: unknown,
  submit: Submit = submitCommand,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BridgeResult> {
  const correlationId = randomUUID();
  try {
    const request = parseBridgeRequest(input);
    validatedOrigin(env);
    const command = await prepare(request);
    const scopedEnv: NodeJS.ProcessEnv = {
      ...env,
      HERMES_SESSION_PLATFORM: request.context.platform,
      HERMES_SESSION_USER_ID: request.context.userId,
      HERMES_SESSION_MESSAGE_ID: request.context.messageId,
    };
    const result = await submit(command, scopedEnv);
    return safeResult(request.action, result);
  } catch {
    process.stderr.write(`${JSON.stringify({ service: "axcas-tool-bridge", correlationId, outcome: "rejected_or_unavailable" })}\n`);
    return { status: "temporarily_unavailable", customerMessage: SAFE_RETRY_MESSAGE, notifyCustomer: true };
  }
}
