import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

import { prepareJsonCommand, submitCommand, type PreparedCommand } from "../../proofgate-cli/src/commands";
import {
  MerchantWorkflowInputSchema,
  ProofGateBoundary,
  runDeterministicStrandsWorkflow,
  type MerchantWorkflowInput,
} from "../../strands-orchestrator/src";
import { assertMerchantSafeText } from "../../../packages/whatsapp-io/src/merchant-language";
import { StudioIntakeInputSchema } from "../../../packages/domain/src/studio";
import { createWorkflowDraftStore, type WorkflowDraftStore } from "./draft-store";

export const SAFE_RETRY_MESSAGE = "I couldn’t complete this step just now. Please reply RETRY; you won’t need to retype your business details.";

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
  "asset",
  "retry",
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
  assetIds?: string[];
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

const AssetPayloadSchema = z.object({
  localAssetId: z.string().regex(/^[a-zA-Z0-9_-]{3,100}$/),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteLength: z.number().int().min(1).max(16 * 1024 * 1024),
  dataBase64: z.string().min(4).max(23 * 1024 * 1024),
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
  const parsed = SparseBuildPayloadSchema.safeParse(payload);
  if (!parsed.success) return normalizeLegacyIntakeBuildInput(payload, context);
  const value = parsed.data;
  return MerchantWorkflowInputSchema.parse({
    ...value,
    schemaVersion: 1,
    workflowId: value.workflowId ?? stableId("workflow-wa", `${context.platform}:${context.userId}`),
    projectId: value.projectId ?? stableId("project-wa", `${context.platform}:${context.userId}`),
    intent: value.intent ?? "website",
    context,
    assetIds: value.assetIds ?? [],
    now: value.now ?? Date.now(),
    improvementRequested: value.improvementRequested ?? false,
  });
}

function mergeWorkflowInput(previous: MerchantWorkflowInput | undefined, incoming: MerchantWorkflowInput): MerchantWorkflowInput {
  if (!previous) return incoming;
  const transcript = Array.from(new Set([previous.transcript.trim(), incoming.transcript.trim()].filter(Boolean))).join("\n").slice(0, 10_000);
  return MerchantWorkflowInputSchema.parse({
    ...previous,
    context: incoming.context,
    transcript,
    assetIds: Array.from(new Set([...previous.assetIds, ...incoming.assetIds])).slice(0, 24),
    intent: previous.intent === "both" || incoming.intent === "both" ? "both" : "website",
    now: incoming.now,
    improvementRequested: previous.improvementRequested || incoming.improvementRequested,
  });
}

function normalizeLegacyIntakeBuildInput(payload: unknown, context: BridgeRequest["context"]): MerchantWorkflowInput {
  const value = z.record(z.string(), z.unknown()).parse(payload);
  const catalog = Array.isArray(value.catalog) ? value.catalog : [];
  const catalogFacts = catalog.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const parts = [record.name, record.description]
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => entry.trim());
    if (typeof record.priceMinor === "number" && Number.isFinite(record.priceMinor)) {
      parts.push(`${record.currency === "USD" ? "USD" : "INR"} ${record.priceMinor / 100}`);
    }
    return parts;
  });
  const transcript = [
    value.transcript,
    value.businessName,
    value.description,
    value.fulfillmentArea,
    value.leadTime,
    ...catalogFacts,
  ].filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).join(". ").slice(0, 10_000);
  if (!transcript) throw new Error("sparse intake has no merchant facts");
  const explicitAssetIds = Array.isArray(value.assetIds) ? value.assetIds : [];
  const catalogAssetIds = catalog.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const imageAssetId = (item as Record<string, unknown>).imageAssetId;
    return typeof imageAssetId === "string" ? [imageAssetId] : [];
  });
  const assetIds = Array.from(new Set([...explicitAssetIds, ...catalogAssetIds])).filter(
    (entry): entry is string => typeof entry === "string" && /^[a-zA-Z0-9_-]{3,128}$/.test(entry),
  ).slice(0, 24);
  const intent = value.intent === "both" || value.projectIntent === "both" ? "both" : "website";
  return normalizeBuildInput({ transcript, assetIds, intent }, context);
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
  if (request.action === "asset") {
    const asset = AssetPayloadSchema.parse(request.payload);
    const body = new Uint8Array(Buffer.from(asset.dataBase64, "base64"));
    if (body.byteLength !== asset.byteLength || createHash("sha256").update(body).digest("hex") !== asset.sha256) {
      throw new Error("asset digest mismatch");
    }
    return {
      path: `/internal/assets/${asset.localAssetId}`,
      method: "PUT",
      body,
      contentType: asset.contentType,
      extraHeaders: { "x-proofgate-source-message-id": request.context.messageId },
    };
  }
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
  if (action === "asset" && typeof value.assetId === "string") {
    return { status: "accepted", customerMessage: "", notifyCustomer: false, assetIds: [value.assetId] };
  }
  if (action === "candidate" && typeof value.previewUrl === "string" && /^https:\/\//.test(value.previewUrl)) {
    return {
      status: "preview_ready",
      customerMessage: `Your website preview is ready: ${value.previewUrl}\n\nCheck the business details, prices, and WhatsApp button.`,
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
    const views = typeof value.qualifiedViews === "number" && Number.isFinite(value.qualifiedViews)
      ? Math.max(0, Math.trunc(value.qualifiedViews))
      : typeof value.views === "number" && Number.isFinite(value.views)
        ? Math.max(0, Math.trunc(value.views))
        : 0;
    const clicks = typeof value.ctaClicks === "number" && Number.isFinite(value.ctaClicks)
      ? Math.max(0, Math.trunc(value.ctaClicks))
      : typeof value.clicks === "number" && Number.isFinite(value.clicks)
        ? Math.max(0, Math.trunc(value.clicks))
        : 0;
    const clickRate = views > 0 ? `${((clicks / views) * 100).toFixed(1)}%` : "not enough views yet";
    return {
      status: "accepted",
      customerMessage: `Your website has ${views} qualified view${views === 1 ? "" : "s"} and ${clicks} WhatsApp click${clicks === 1 ? "" : "s"}. Click rate: ${clickRate}.`,
      notifyCustomer: true,
    };
  }
  return {
    status: "accepted",
    customerMessage: "",
    notifyCustomer: false,
    merchantId: action === "intake" && typeof value.merchantId === "string" ? value.merchantId : undefined,
  };
}

const missingFactCopy: Readonly<Record<string, string>> = {
  businessName: "what is your business name",
  description: "how would you describe the business",
  fulfillmentArea: "which area do you serve",
  serviceArea: "which area do you serve",
  leadTime: "how much advance notice do you need",
  offerings: "what do you sell or offer",
  prices: "what prices should I show",
  orderWhatsAppNumber: "which WhatsApp number should customers contact",
  photos: "can you send at least one real business photo",
  referenceAssetIds: "can you send at least one real business photo",
};

function naturalList(items: readonly string[]): string {
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

/**
 * Customer copy is deterministic and derived from the complete missing-fact set. Model-written
 * question fragments are never forwarded, which prevents both sequential questioning and
 * accidental diagnostic leakage.
 */
function consolidatedMissingFactsMessage(missingFacts: readonly string[]): string {
  const facts = Array.from(new Set(missingFacts.map((fact) => missingFactCopy[fact] ?? "what other essential detail is missing")));
  if (facts.length === 0) throw new Error("workflow requested input without naming a missing fact");
  const message = facts.length === 1 && facts[0] === missingFactCopy.photos
    ? "Please send at least one real business photo."
    : `One quick thing before I build: ${naturalList(facts)}?`;
  assertMerchantSafeText(message, "missing-information question");
  return message;
}

async function clearCompletedDraft(
  store: WorkflowDraftStore | null,
  context: MerchantWorkflowInput["context"],
  correlationId: string,
  action: "retry" | "orchestrate_build",
): Promise<void> {
  if (!store) return;
  try {
    await store.clear(context);
  } catch {
    // Approval delivery is an externally visible success. Cleanup must never replace
    // that result with a retry message or repeat the already-created approval.
    process.stderr.write(`${JSON.stringify({
      service: "axcas-tool-bridge",
      correlationId,
      action,
      stage: "draft_cleanup",
      failure: "dependency_unavailable",
      outcome: "approval_preserved",
    })}\n`);
  }
}

export async function executeBridgeRequest(
  input: unknown,
  submit: Submit = submitCommand,
  env: NodeJS.ProcessEnv = process.env,
  runBuildWorkflow: RunBuildWorkflow = runDeterministicStrandsWorkflow,
  draftStore: WorkflowDraftStore | null = createWorkflowDraftStore(env),
): Promise<BridgeResult> {
  const correlationId = randomUUID();
  let action: BridgeRequest["action"] | "unknown" = "unknown";
  let stage: DiagnosticStage = "request_validation";
  let retryInput: MerchantWorkflowInput | undefined;
  try {
    const request = parseBridgeRequest(input);
    action = request.action;
    stage = "configuration";
    validatedOrigin(env);
    if (request.action === "retry") {
      stage = "workflow_input";
      const saved = await draftStore?.load(request.context);
      if (!saved) return { status: "accepted", customerMessage: "There isn’t a paused step to retry. Send your business details, photos, prices, and say Website, Reels, or Both.", notifyCustomer: true };
      retryInput = saved.input;
      stage = "workflow_execution";
      const result = await runBuildWorkflow(saved.input, new ProofGateBoundary(env, submit));
      if (result.status === "awaiting_input") {
        await draftStore?.save(saved.input, { askedQuestion: true, checkpoint: saved.input.assetIds.length ? "assets_saved" : "received", operationIds: saved.operationIds });
        return { status: "accepted", customerMessage: saved.askedQuestion ? "I’ve kept your draft. Send the remaining business details or photos when you’re ready." : consolidatedMissingFactsMessage(result.missingFacts), notifyCustomer: true };
      }
      if (result.status === "verification_failed") {
        await draftStore?.save(saved.input, { askedQuestion: saved.askedQuestion, checkpoint: "candidate_ready", operationIds: saved.operationIds });
        return { status: "accepted", customerMessage: "I found an issue while checking the preview. I’ll keep the current draft private until it passes.", notifyCustomer: true };
      }
      await clearCompletedDraft(draftStore, request.context, correlationId, "retry");
      return { status: "approval_sent", customerMessage: `Your checked preview is ready: ${result.previewUrl}\n\nReview it, then use the single approval checklist I sent. Open Axcas Studio: ${new URL(env.PROOFGATE_ADMIN_URL!).origin}/studio`, previewUrl: result.previewUrl, specHash: result.specHash, notifyCustomer: true };
    }
    if (request.action === "orchestrate_build") {
      stage = "workflow_input";
      const existing = await draftStore?.load(request.context);
      const workflowInput = mergeWorkflowInput(existing?.input, normalizeBuildInput(request.payload, request.context));
      retryInput = workflowInput;
      stage = "workflow_execution";
      const result = await runBuildWorkflow(workflowInput, new ProofGateBoundary(env, submit));
      if (result.status === "awaiting_input") {
        await draftStore?.save(workflowInput, { askedQuestion: true, checkpoint: workflowInput.assetIds.length ? "assets_saved" : "received", operationIds: existing?.operationIds ?? [workflowInput.workflowId] });
        return { status: "accepted", customerMessage: existing?.askedQuestion ? "I’ve added that to your draft. Send the remaining details or photos when you’re ready." : consolidatedMissingFactsMessage(result.missingFacts), notifyCustomer: true };
      }
      if (result.status === "verification_failed") {
        await draftStore?.save(workflowInput, { askedQuestion: existing?.askedQuestion ?? false, checkpoint: "candidate_ready", operationIds: existing?.operationIds ?? [workflowInput.workflowId] });
        return { status: "accepted", customerMessage: "I found an issue while checking the preview. I’ll keep the current draft private until it passes.", notifyCustomer: true };
      }
      await clearCompletedDraft(draftStore, request.context, correlationId, "orchestrate_build");
      return {
        status: "approval_sent",
        customerMessage: `Your checked preview is ready: ${result.previewUrl}\n\nReview it, then use the single approval checklist I sent. Open Axcas Studio: ${new URL(env.PROOFGATE_ADMIN_URL!).origin}/studio`,
        previewUrl: result.previewUrl,
        specHash: result.specHash,
        notifyCustomer: true,
      };
    }
    if (request.action === "intake" && !StudioIntakeInputSchema.safeParse(request.payload).success) {
      stage = "workflow_input";
      const workflowInput = normalizeLegacyIntakeBuildInput(request.payload, request.context);
      retryInput = workflowInput;
      stage = "workflow_execution";
      const result = await runBuildWorkflow(workflowInput, new ProofGateBoundary(env, submit));
      if (result.status === "awaiting_input") {
        return { status: "accepted", customerMessage: consolidatedMissingFactsMessage(result.missingFacts), notifyCustomer: true };
      }
      if (result.status === "verification_failed") {
        return { status: "accepted", customerMessage: "I found an issue while checking the preview. I’ll keep the current draft private until it passes.", notifyCustomer: true };
      }
      return {
        status: "approval_sent",
        customerMessage: `Your checked preview is ready: ${result.previewUrl}\n\nReview it, then use the single approval checklist I sent. Open Axcas Studio: ${new URL(env.PROOFGATE_ADMIN_URL!).origin}/studio`,
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
    if (retryInput) await draftStore?.save(retryInput).catch(() => undefined);
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
