import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

import { prepareJsonCommand, submitCommand, type PreparedCommand } from "../../proofgate-cli/src/commands";
import {
  MerchantWorkflowInputSchema,
  ProofGateBoundary,
  runStrandsToolWorkflow,
  type MerchantWorkflowInput,
} from "../../strands-orchestrator/src";

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
  "orchestrate_build",
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
type BuildWorkflowOutcome =
  | { status: "awaiting_input"; missingFacts: string[]; customerMessages: string[] }
  | { status: "verification_failed"; previewUrl: string; blockers: string[] }
  | { status: "awaiting_approval"; approvalId?: string; previewUrl: string; specHash: string; verificationRunId: string };
type RunBuildWorkflow = (input: MerchantWorkflowInput, boundary: ProofGateBoundary) => Promise<BuildWorkflowOutcome>;
type DiagnosticStage = "request_validation" | "configuration" | "workflow_input" | "workflow_execution" | "command_preparation" | "boundary_request";

const SparseBuildPayloadSchema = MerchantWorkflowInputSchema.omit({ context: true }).partial({
  schemaVersion: true,
  workflowId: true,
  projectId: true,
  intent: true,
  assetIds: true,
  now: true,
  improvementRequested: true,
}).strict();

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

function stableId(prefix: "workflow-wa" | "project-wa", value: string): string {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function normalizeBuildInput(payload: unknown, context: BridgeRequest["context"]): MerchantWorkflowInput {
  const value = SparseBuildPayloadSchema.parse(payload);
  return MerchantWorkflowInputSchema.parse({
    ...value,
    schemaVersion: 1,
    workflowId: value.workflowId ?? stableId("workflow-wa", `${context.platform}:${context.userId}:${context.messageId}`),
    projectId: value.projectId ?? stableId("project-wa", `${context.platform}:${context.userId}`),
    intent: value.intent ?? "website",
    context,
    assetIds: value.assetIds ?? [],
    now: value.now ?? Date.now(),
    improvementRequested: value.improvementRequested ?? false,
  });
}

function failureClass(error: unknown, stage: DiagnosticStage): string {
  const hasZodFailure = (candidate: unknown, depth = 0): boolean => {
    if (candidate instanceof z.ZodError) return true;
    if (!candidate || typeof candidate !== "object" || depth >= 4) return false;
    const nested = candidate as { name?: unknown; cause?: unknown };
    if (nested.name === "ZodError") return true;
    return hasZodFailure(nested.cause, depth + 1);
  };
  if (hasZodFailure(error)) return stage === "workflow_execution" ? "invalid_model_tool_output" : "invalid_input";
  const value = error && typeof error === "object" ? error as { name?: unknown; code?: unknown; message?: unknown } : {};
  const identity = `${typeof value.name === "string" ? value.name : ""}:${typeof value.code === "string" ? value.code : ""}`;
  const message = typeof value.message === "string" ? value.message : "";
  if (stage === "workflow_execution" && message.startsWith("Strands workflow stopped before a safe terminal state")) return "incomplete_tool_workflow";
  if (stage === "boundary_request" && /failed \((?:401|403)\)/.test(message)) return "boundary_authentication";
  if (stage === "boundary_request" && /failed \(4\d\d\)/.test(message)) return "boundary_rejected";
  if (stage === "boundary_request" && /failed \(5\d\d\)/.test(message)) return "dependency_unavailable";
  if (/AccessDenied|Unauthorized|Forbidden/i.test(identity)) return "provider_permission";
  if (/Credential|ExpiredToken|InvalidClientToken|UnrecognizedClient/i.test(identity)) return "provider_authentication";
  if (/ValidationException|ResourceNotFound|ModelNotReady|ModelError/i.test(identity)) return "provider_configuration";
  if (/Timeout|Throttl|ECONN|ENOTFOUND|Fetch/i.test(identity)) return "dependency_unavailable";
  return "unexpected_failure";
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
  runBuildWorkflow: RunBuildWorkflow = runStrandsToolWorkflow,
): Promise<BridgeResult> {
  const correlationId = randomUUID();
  let action: BridgeRequest["action"] | "unknown" = "unknown";
  let stage: DiagnosticStage = "request_validation";
  try {
    const request = parseBridgeRequest(input);
    action = request.action;
    stage = "configuration";
    validatedOrigin(env);
    if (request.action === "orchestrate_build") {
      stage = "workflow_input";
      const workflowInput = normalizeBuildInput(request.payload, request.context);
      stage = "workflow_execution";
      const result = await runBuildWorkflow(workflowInput, new ProofGateBoundary(env, submit));
      if (result.status === "awaiting_input") {
        return { status: "accepted", customerMessage: result.customerMessages[0]!, notifyCustomer: true };
      }
      if (result.status === "verification_failed") {
        return { status: "accepted", customerMessage: "I found an issue while checking the preview. I’ll keep the current draft private until it passes.", notifyCustomer: true };
      }
      return {
        status: "approval_sent",
        customerMessage: "Your checked preview is ready. Review it, then use the single approval checklist I sent.",
        previewUrl: result.previewUrl,
        specHash: result.specHash,
        notifyCustomer: true,
      };
    }
    stage = "command_preparation";
    const command = await prepare(request);
    const scopedEnv: NodeJS.ProcessEnv = {
      ...env,
      HERMES_SESSION_PLATFORM: request.context.platform,
      HERMES_SESSION_USER_ID: request.context.userId,
      HERMES_SESSION_MESSAGE_ID: request.context.messageId,
    };
    stage = "boundary_request";
    const result = await submit(command, scopedEnv);
    return safeResult(request.action, result);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      service: "axcas-tool-bridge",
      correlationId,
      action,
      stage,
      failure: failureClass(error, stage),
      outcome: "rejected_or_unavailable",
    })}\n`);
    return { status: "temporarily_unavailable", customerMessage: SAFE_RETRY_MESSAGE, notifyCustomer: true };
  }
}
