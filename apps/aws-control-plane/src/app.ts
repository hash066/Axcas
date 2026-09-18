import { Hono } from "hono";

import { extractProofGateApproval, verifyMetaWebhookSignature } from "../../../packages/whatsapp-io/src/meta-webhook";
import {
  StudioApiError,
  StudioApprovalCreateRequestSchema,
  StudioProjectIdSchema,
  StudioProjectPatchRequestSchema,
  type StudioApprovalView,
  type StudioProjectRevision,
} from "./studio-api";

export type IngressMessage = {
  rawBody: string;
  metaSignature: string;
  senderWaId: string;
  providerMessageId: string;
  receivedAt: number;
};

export type AwsControlPlaneDependencies = {
  metaAppSecret: string;
  metaVerifyToken: string;
  enqueue: (message: IngressMessage) => Promise<{ messageId?: string }>;
  resolveApproval: (tap: { approvalId: string; decision: "approved" | "denied"; senderWaId: string; providerMessageId: string }) => Promise<{ accepted: boolean }>;
  startMetaOAuth?: (input: { authSubject: string; returnPath: string }) => Promise<{ authorizationUrl: string }>;
  completeMetaOAuth?: (input: { code: string; state: string }) => Promise<{ returnPath: string }>;
  beginMediaUpload?: (input: { authSubject: string; request: unknown }) => Promise<Record<string, unknown>>;
  signMediaPart?: (input: { authSubject: string; assetId: string; request: unknown }) => Promise<Record<string, unknown>>;
  completeMediaUpload?: (input: { authSubject: string; assetId: string; request: unknown }) => Promise<Record<string, unknown>>;
  getStudioAccount?: (input: { authSubject: string }) => Promise<Record<string, unknown>>;
  getStudioProject?: (input: { authSubject: string; projectId: string }) => Promise<StudioProjectRevision>;
  patchStudioProject?: (input: { authSubject: string; projectId: string; request: unknown }) => Promise<StudioProjectRevision>;
  listStudioApprovals?: (input: { authSubject: string }) => Promise<{ approvals: StudioApprovalView[] }>;
  createStudioApproval?: (input: { authSubject: string; projectId: string; request: unknown }) => Promise<StudioApprovalView>;
  recordPageView?: (input: { siteId: string; source: string; campaign?: string; cookie?: string }) => Promise<{ setCookie?: string }>;
  trackedRedirect?: (input: { siteId: string; itemId: string; source: string; campaign?: string; cookie?: string }) => Promise<{ location: string; setCookie?: string }>;
  now?: () => number;
};

function firstWhatsAppMessage(payload: unknown): { senderWaId: string; providerMessageId: string } | null {
  if (!payload || typeof payload !== "object") return null;
  const entries = (payload as { entry?: unknown }).entry;
  if (!Array.isArray(entries)) return null;
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const messages = (change as { value?: { messages?: unknown } })?.value?.messages;
      if (!Array.isArray(messages)) continue;
      for (const message of messages) {
        const value = message as { from?: unknown; id?: unknown };
        if (typeof value.from === "string" && /^\d{8,15}$/.test(value.from) && typeof value.id === "string" && value.id.length <= 256) {
          return { senderWaId: value.from, providerMessageId: value.id };
        }
      }
    }
  }
  return null;
}

export function createAwsControlPlaneApp(dependencies: AwsControlPlaneDependencies): Hono {
  const app = new Hono();

  const authenticatedSubject = (value: string | undefined): string => {
    const subject = value ?? "";
    if (!/^[A-Za-z0-9:_-]{3,256}$/.test(subject)) throw new StudioApiError("authentication_required", 401);
    return subject;
  };

  const jsonBody = async (context: { req: { json: () => Promise<unknown> } }): Promise<unknown> => {
    try { return await context.req.json(); }
    catch { throw new StudioApiError("invalid_request", 400); }
  };

  app.get("/health", (context) => context.json({ status: "ok" }, 200, { "cache-control": "no-store" }));

  app.get("/api/studio/me", async (context) => {
    const authSubject = authenticatedSubject(context.req.header("x-axcas-auth-sub"));
    if (!dependencies.getStudioAccount) return context.json({ error: "temporarily_unavailable" }, 503, { "cache-control": "no-store" });
    return context.json(await dependencies.getStudioAccount({ authSubject }), 200, { "cache-control": "no-store" });
  });

  app.get("/api/studio/projects/:projectId", async (context) => {
    const authSubject = authenticatedSubject(context.req.header("x-axcas-auth-sub"));
    const projectId = StudioProjectIdSchema.safeParse(context.req.param("projectId"));
    if (!projectId.success) throw new StudioApiError("invalid_request", 400);
    if (!dependencies.getStudioProject) return context.json({ error: "temporarily_unavailable" }, 503, { "cache-control": "no-store" });
    return context.json(await dependencies.getStudioProject({ authSubject, projectId: projectId.data }), 200, { "cache-control": "no-store" });
  });

  app.patch("/api/studio/projects/:projectId", async (context) => {
    const authSubject = authenticatedSubject(context.req.header("x-axcas-auth-sub"));
    const projectId = StudioProjectIdSchema.safeParse(context.req.param("projectId"));
    const request = StudioProjectPatchRequestSchema.safeParse(await jsonBody(context));
    if (!projectId.success || !request.success) throw new StudioApiError("invalid_request", 400);
    if (!dependencies.patchStudioProject) return context.json({ error: "temporarily_unavailable" }, 503, { "cache-control": "no-store" });
    return context.json(await dependencies.patchStudioProject({ authSubject, projectId: projectId.data, request: request.data }), 200, { "cache-control": "no-store" });
  });

  app.get("/api/studio/approvals", async (context) => {
    const authSubject = authenticatedSubject(context.req.header("x-axcas-auth-sub"));
    if (!dependencies.listStudioApprovals) return context.json({ error: "temporarily_unavailable" }, 503, { "cache-control": "no-store" });
    return context.json(await dependencies.listStudioApprovals({ authSubject }), 200, { "cache-control": "no-store" });
  });

  app.post("/api/studio/projects/:projectId/approvals", async (context) => {
    const authSubject = authenticatedSubject(context.req.header("x-axcas-auth-sub"));
    const projectId = StudioProjectIdSchema.safeParse(context.req.param("projectId"));
    const request = StudioApprovalCreateRequestSchema.safeParse(await jsonBody(context));
    if (!projectId.success || !request.success) throw new StudioApiError("invalid_request", 400);
    if (!dependencies.createStudioApproval) return context.json({ error: "temporarily_unavailable" }, 503, { "cache-control": "no-store" });
    return context.json(await dependencies.createStudioApproval({ authSubject, projectId: projectId.data, request: request.data }), 201, { "cache-control": "no-store" });
  });

  app.get("/e/view/:siteId", async (context) => {
    const siteId = context.req.param("siteId");
    const source = context.req.query("source") ?? "site";
    const campaign = context.req.query("campaign");
    if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(siteId) || !/^[A-Za-z0-9_-]{1,64}$/.test(source) || (campaign && !/^[A-Za-z0-9_-]{1,128}$/.test(campaign))) return context.body(null, 404);
    if (!dependencies.recordPageView) return context.body(null, 503, { "cache-control": "no-store" });
    const result = await dependencies.recordPageView({ siteId, source, campaign, cookie: context.req.header("cookie") });
    return context.body(null, 204, { "cache-control": "no-store", ...(result.setCookie ? { "set-cookie": result.setCookie } : {}) });
  });

  app.get("/r/whatsapp/:siteId/:itemId", async (context) => {
    const siteId = context.req.param("siteId");
    const itemId = context.req.param("itemId");
    const source = context.req.query("source") ?? "site";
    const campaign = context.req.query("campaign");
    if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(siteId) || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(itemId) || !/^[A-Za-z0-9_-]{1,64}$/.test(source) || (campaign && !/^[A-Za-z0-9_-]{1,128}$/.test(campaign))) return context.json({ error: "not_found" }, 404, { "cache-control": "no-store" });
    if (!dependencies.trackedRedirect) return context.json({ error: "temporarily_unavailable" }, 503, { "cache-control": "no-store" });
    const result = await dependencies.trackedRedirect({ siteId, itemId, source, campaign, cookie: context.req.header("cookie") });
    const target = new URL(result.location);
    if (target.protocol !== "https:" || target.hostname !== "wa.me" || !/^\/\d{8,15}$/.test(target.pathname)) throw new Error("invalid tracked redirect target");
    return new Response(null, { status: 302, headers: { location: target.toString(), "cache-control": "no-store", ...(result.setCookie ? { "set-cookie": result.setCookie } : {}) } });
  });

  app.get("/oauth/meta/start", async (context) => {
    const authSubject = context.req.header("x-axcas-auth-sub") ?? "";
    if (!/^[A-Za-z0-9:_-]{3,256}$/.test(authSubject)) return context.json({ error: "authentication_required" }, 401, { "cache-control": "no-store" });
    if (!dependencies.startMetaOAuth) return context.json({ error: "temporarily_unavailable" }, 503, { "cache-control": "no-store" });
    const returnPath = context.req.query("return") ?? "/studio";
    if (!/^\/studio(?:\/[A-Za-z0-9/_-]*)?$/.test(returnPath)) return context.json({ error: "invalid_return_path" }, 400, { "cache-control": "no-store" });
    const result = await dependencies.startMetaOAuth({ authSubject, returnPath });
    const target = new URL(result.authorizationUrl);
    if (target.protocol !== "https:" || target.hostname !== "www.facebook.com") throw new Error("invalid OAuth authorization origin");
    return context.redirect(target.toString(), 302);
  });

  app.get("/oauth/meta/callback", async (context) => {
    if (!dependencies.completeMetaOAuth) return context.json({ error: "temporarily_unavailable" }, 503, { "cache-control": "no-store" });
    const code = context.req.query("code") ?? "";
    const state = context.req.query("state") ?? "";
    if (!/^[A-Za-z0-9._-]{3,2048}$/.test(code) || !/^[A-Za-z0-9._-]{8,4096}$/.test(state)) return context.json({ error: "invalid_callback" }, 400, { "cache-control": "no-store" });
    const result = await dependencies.completeMetaOAuth({ code, state });
    if (!/^\/studio(?:\/[A-Za-z0-9/_-]*)?(?:\?meta=(?:connected|no_instagram))?$/.test(result.returnPath)) throw new Error("invalid OAuth completion path");
    return context.redirect(result.returnPath, 302);
  });

  app.post("/studio/media/uploads", async (context) => {
    const authSubject = context.req.header("x-axcas-auth-sub") ?? "";
    if (!/^[A-Za-z0-9:_-]{3,256}$/.test(authSubject)) return context.json({ error: "authentication_required" }, 401, { "cache-control": "no-store" });
    if (!dependencies.beginMediaUpload) return context.json({ error: "temporarily_unavailable" }, 503, { "cache-control": "no-store" });
    let request: unknown;
    try { request = await context.req.json(); }
    catch { return context.json({ error: "invalid_request" }, 400, { "cache-control": "no-store" }); }
    return context.json(await dependencies.beginMediaUpload({ authSubject, request }), 201, { "cache-control": "no-store" });
  });

  app.post("/studio/media/uploads/:assetId/parts", async (context) => {
    const authSubject = context.req.header("x-axcas-auth-sub") ?? "";
    const assetId = context.req.param("assetId");
    if (!/^[A-Za-z0-9_-]{3,128}$/.test(authSubject) || !/^[A-Za-z0-9_-]{3,128}$/.test(assetId)) return context.json({ error: "authentication_required" }, 401, { "cache-control": "no-store" });
    if (!dependencies.signMediaPart) return context.json({ error: "temporarily_unavailable" }, 503, { "cache-control": "no-store" });
    let request: unknown;
    try { request = await context.req.json(); }
    catch { return context.json({ error: "invalid_request" }, 400, { "cache-control": "no-store" }); }
    return context.json(await dependencies.signMediaPart({ authSubject, assetId, request }), 200, { "cache-control": "no-store" });
  });

  app.post("/studio/media/uploads/:assetId/complete", async (context) => {
    const authSubject = context.req.header("x-axcas-auth-sub") ?? "";
    const assetId = context.req.param("assetId");
    if (!/^[A-Za-z0-9_-]{3,128}$/.test(authSubject) || !/^[A-Za-z0-9_-]{3,128}$/.test(assetId)) return context.json({ error: "authentication_required" }, 401, { "cache-control": "no-store" });
    if (!dependencies.completeMediaUpload) return context.json({ error: "temporarily_unavailable" }, 503, { "cache-control": "no-store" });
    let request: unknown;
    try { request = await context.req.json(); }
    catch { return context.json({ error: "invalid_request" }, 400, { "cache-control": "no-store" }); }
    return context.json(await dependencies.completeMediaUpload({ authSubject, assetId, request }), 202, { "cache-control": "no-store" });
  });

  app.get("/whatsapp/webhook", (context) => {
    const mode = context.req.query("hub.mode");
    const token = context.req.query("hub.verify_token");
    const challenge = context.req.query("hub.challenge");
    if (mode !== "subscribe" || token !== dependencies.metaVerifyToken || !challenge) return context.text("Forbidden", 403);
    return context.text(challenge, 200, { "cache-control": "no-store" });
  });

  app.post("/whatsapp/webhook", async (context) => {
    const rawBody = await context.req.text();
    const metaSignature = context.req.header("x-hub-signature-256") ?? "";
    if (!await verifyMetaWebhookSignature(rawBody, metaSignature, dependencies.metaAppSecret)) {
      return context.json({ accepted: false }, 401, { "cache-control": "no-store" });
    }
    let payload: unknown;
    try { payload = JSON.parse(rawBody); }
    catch { return context.json({ accepted: false }, 400, { "cache-control": "no-store" }); }

    const approval = extractProofGateApproval(payload);
    if (approval) {
      await dependencies.resolveApproval(approval);
      return context.json({ accepted: true }, 200, { "cache-control": "no-store" });
    }
    const message = firstWhatsAppMessage(payload);
    if (message) await dependencies.enqueue({ ...message, rawBody, metaSignature, receivedAt: (dependencies.now ?? Date.now)() });
    // Meta delivery/status callbacks are acknowledged without entering the merchant-agent queue.
    return context.json({ accepted: true }, 200, { "cache-control": "no-store" });
  });

  app.notFound((context) => context.json({ error: "not_found" }, 404));
  app.onError((error, context) => {
    if (error instanceof StudioApiError) return context.json({ error: error.code }, error.status, { "cache-control": "no-store" });
    return context.json({ accepted: false, error: "temporary_failure" }, 503, { "cache-control": "no-store" });
  });
  return app;
}
