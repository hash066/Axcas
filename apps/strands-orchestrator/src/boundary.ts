import { z } from "zod";

import { prepareJsonCommand, submitCommand, type PreparedCommand } from "../../proofgate-cli/src/commands";
import {
  BoundaryResultSchema,
  MetricsSchema,
  VerificationResultSchema,
  type MerchantWorkflowInput,
  type VerificationResult,
} from "./schemas";
import type { AxcasBoundary, BoundaryAction } from "./workflow";

type Submit = (command: PreparedCommand, env: NodeJS.ProcessEnv) => Promise<unknown>;
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const VerificationCapabilitySchema = z.object({
  evidenceUrl: z.string().min(1),
  expiresAt: z.number().int().positive(),
}).passthrough();

function scopedEnvironment(env: NodeJS.ProcessEnv, context: MerchantWorkflowInput["context"]): NodeJS.ProcessEnv {
  return {
    ...env,
    HERMES_SESSION_PLATFORM: context.platform,
    HERMES_SESSION_USER_ID: context.userId,
    HERMES_SESSION_MESSAGE_ID: context.messageId,
  };
}

export function resolveAdminOrigin(env: NodeJS.ProcessEnv): URL {
  if (!env.PROOFGATE_ADMIN_URL) throw new Error("Axcas service origin is unavailable");
  const origin = new URL(env.PROOFGATE_ADMIN_URL);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("Axcas service origin is invalid");
  }
  const legacyWorker = origin.hostname.endsWith(".workers.dev");
  const allowlist = (env.AXCAS_ADMIN_ORIGIN_ALLOWLIST ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const allowed = new URL(value);
      if (allowed.protocol !== "https:" || allowed.username || allowed.password || allowed.pathname !== "/" || allowed.search || allowed.hash) {
        throw new Error("Axcas administrative origin allowlist is invalid");
      }
      return allowed.origin;
    });
  if (!legacyWorker && !allowlist.includes(origin.origin)) throw new Error("Axcas service origin is invalid");
  return origin;
}

function verifierEndpoint(env: NodeJS.ProcessEnv): URL {
  const configured = env.AXCAS_SITE_VERIFIER_URL ?? env.SITE_VERIFIER_URL;
  if (!configured) throw new Error("Axcas verifier is unavailable");
  const base = new URL(configured);
  if (base.protocol !== "https:" || base.username || base.password) throw new Error("Axcas verifier endpoint is invalid");
  return new URL("/verify", base);
}

export class ProofGateBoundary implements AxcasBoundary {
  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly submit: Submit = submitCommand,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async execute(action: BoundaryAction, payload: unknown, context: MerchantWorkflowInput["context"]): Promise<unknown> {
    const environment = scopedEnvironment(this.env, context);
    if (action === "metrics") {
      const metricsRequest = z.object({ siteId: z.string().regex(/^[a-z0-9-]{3,64}$/), days: z.number().int().min(1).max(90) }).strict().parse(payload);
      const command: PreparedCommand = {
        path: `/internal/metrics/${encodeURIComponent(metricsRequest.siteId)}?since=${Date.now() - metricsRequest.days * 86_400_000}`,
        method: "GET",
        contentType: "application/json",
      };
      const raw = await this.submit(command, environment);
      const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      const metrics = MetricsSchema.parse({
        qualifiedViews: value.qualifiedViews ?? value.views ?? 0,
        ctaClicks: value.ctaClicks ?? value.clicks ?? 0,
        since: value.since ?? Date.now() - metricsRequest.days * 86_400_000,
        until: value.until ?? Date.now(),
      });
      return BoundaryResultSchema.parse({ status: "accepted", metrics });
    }
    const commandName = action === "request_publish" ? "release" : action;
    const raw = await this.submit(await prepareJsonCommand(commandName, payload), environment);
    const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    if (action === "candidate") return BoundaryResultSchema.parse({ status: "preview_ready", ...value });
    if (action === "request_publish") return BoundaryResultSchema.parse({ status: "approval_sent", ...value });
    return BoundaryResultSchema.parse({ status: "accepted", ...value });
  }

  async dispatchVerification(scope: {
    merchantId: string;
    siteId: string;
    versionId: string;
    specHash: string;
    previewUrl: string;
    context: MerchantWorkflowInput["context"];
  }): Promise<VerificationResult> {
    const origin = resolveAdminOrigin(this.env);
    const preview = new URL(scope.previewUrl);
    if (preview.origin !== origin.origin) throw new Error("preview is outside the Axcas release origin");
    const command = await prepareJsonCommand("verification", {
      merchantId: scope.merchantId,
      siteId: scope.siteId,
      versionId: scope.versionId,
      specHash: scope.specHash,
    });
    const capability = VerificationCapabilitySchema.parse(await this.submit(command, scopedEnvironment(this.env, scope.context)));
    const evidenceUrl = new URL(capability.evidenceUrl, origin);
    if (evidenceUrl.origin !== origin.origin || !evidenceUrl.pathname.startsWith("/verification/")) throw new Error("invalid evidence capability origin");

    const response = await this.fetcher(verifierEndpoint(this.env), {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        previewUrl: preview.toString(),
        evidenceUrl: evidenceUrl.toString(),
        siteId: scope.siteId,
        versionId: scope.versionId,
        specHash: scope.specHash,
      }),
    });
    if (!response.ok) throw new Error("independent verification did not complete");
    return VerificationResultSchema.parse(await response.json());
  }

  async assertPublished(scope: { siteId: string; versionId: string; specHash: string }): Promise<void> {
    const origin = resolveAdminOrigin(this.env);
    const response = await this.fetcher(new URL(`/s/${encodeURIComponent(scope.siteId)}`, origin), {
      method: "GET",
      redirect: "error",
      headers: { accept: "text/html" },
    });
    if (!response.ok
      || response.headers.get("x-proofgate-version-id") !== scope.versionId
      || response.headers.get("x-proofgate-spec-hash") !== scope.specHash) {
      throw new Error("the exact candidate is not the current published version");
    }
  }
}
