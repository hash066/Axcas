import { Hono } from "hono";

import { extractProofGateApproval, verifyMetaWebhookSignature } from "../../../packages/whatsapp-io/src/meta-webhook";

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

  app.get("/health", (context) => context.json({ status: "ok" }, 200, { "cache-control": "no-store" }));

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
  app.onError((_error, context) => context.json({ accepted: false, error: "temporary_failure" }, 503, { "cache-control": "no-store" }));
  return app;
}
