import { describe, expect, it, vi } from "vitest";

import { createAwsControlPlaneApp } from "../../apps/aws-control-plane/src/app";
import { metaSignatureForTest } from "../../packages/whatsapp-io/src/meta-webhook";

const ordinaryPayload = {
  object: "whatsapp_business_account",
  entry: [{ changes: [{ value: { messages: [{ from: "919999888877", id: "wamid.ordinary", type: "text", text: { body: "START AXCAS" } }] } }] }],
};

describe("AWS-native control-plane ingress", () => {
  it("handles Meta verification without exposing the token", async () => {
    const app = createAwsControlPlaneApp({ metaAppSecret: "app-secret", metaVerifyToken: "verify-secret", enqueue: vi.fn(), resolveApproval: vi.fn() });
    const response = await app.request("https://api.example/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-secret&hub.challenge=challenge-1");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("challenge-1");
  });

  it("rejects invalid signatures before parsing or queueing", async () => {
    const enqueue = vi.fn();
    const app = createAwsControlPlaneApp({ metaAppSecret: "app-secret", metaVerifyToken: "verify-secret", enqueue, resolveApproval: vi.fn() });
    const response = await app.request("https://api.example/whatsapp/webhook", { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=bad" }, body: JSON.stringify(ordinaryPayload) });
    expect(response.status).toBe(401);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("queues the unchanged raw body for an ordinary merchant message", async () => {
    const enqueue = vi.fn(async () => ({ messageId: "sqs-1" }));
    const body = JSON.stringify(ordinaryPayload);
    const app = createAwsControlPlaneApp({ metaAppSecret: "app-secret", metaVerifyToken: "verify-secret", enqueue, resolveApproval: vi.fn() });
    const response = await app.request("https://api.example/whatsapp/webhook", { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": await metaSignatureForTest(body, "app-secret") }, body });
    expect(response.status).toBe(200);
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ rawBody: body, senderWaId: "919999888877", providerMessageId: "wamid.ordinary", metaSignature: await metaSignatureForTest(body, "app-secret") }));
    expect(await response.json()).toEqual({ accepted: true });
  });

  it("intercepts an authenticated campaign approval instead of forwarding it to an agent", async () => {
    const enqueue = vi.fn();
    const resolveApproval = vi.fn(async () => ({ accepted: true }));
    const payload = { object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: [{ from: "919999888877", id: "wamid.approval", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "pg:approval-maya-launch:approve" } } }] } }] }] };
    const body = JSON.stringify(payload);
    const app = createAwsControlPlaneApp({ metaAppSecret: "app-secret", metaVerifyToken: "verify-secret", enqueue, resolveApproval });
    const response = await app.request("https://api.example/whatsapp/webhook", { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": await metaSignatureForTest(body, "app-secret") }, body });
    expect(response.status).toBe(200);
    expect(resolveApproval).toHaveBeenCalledWith({ approvalId: "approval-maya-launch", decision: "approved", senderWaId: "919999888877", providerMessageId: "wamid.approval" });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("starts authenticated Meta OAuth and completes through the signed callback", async () => {
    const startMetaOAuth = vi.fn(async () => ({ authorizationUrl: "https://www.facebook.com/v26.0/dialog/oauth?state=signed" }));
    const completeMetaOAuth = vi.fn(async () => ({ returnPath: "/studio/projects/maya?meta=connected" }));
    const app = createAwsControlPlaneApp({ metaAppSecret: "app-secret", metaVerifyToken: "verify-secret", enqueue: vi.fn(), resolveApproval: vi.fn(), startMetaOAuth, completeMetaOAuth });
    expect((await app.request("/oauth/meta/start")).status).toBe(401);
    const start = await app.request("/oauth/meta/start?return=/studio/projects/maya", { headers: { "x-axcas-auth-sub": "cognito-sub-123" } });
    expect(start.status).toBe(302);
    expect(start.headers.get("location")).toContain("facebook.com");
    expect(startMetaOAuth).toHaveBeenCalledWith({ authSubject: "cognito-sub-123", returnPath: "/studio/projects/maya" });
    const callback = await app.request("/oauth/meta/callback?code=one-time-code&state=signed-state");
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/studio/projects/maya?meta=connected");
  });

  it("starts a private media upload only for an authenticated Studio user", async () => {
    const beginMediaUpload = vi.fn(async () => ({ assetId: "asset-one", uploadId: "upload-one", partCount: 2 }));
    const app = createAwsControlPlaneApp({ metaAppSecret: "app-secret", metaVerifyToken: "verify-secret", enqueue: vi.fn(), resolveApproval: vi.fn(), beginMediaUpload });
    expect((await app.request("/studio/media/uploads", { method: "POST", body: "{}" })).status).toBe(401);
    const response = await app.request("/studio/media/uploads", { method: "POST", headers: { "x-axcas-auth-sub": "cognito-sub-123", "content-type": "application/json" }, body: JSON.stringify({ fileName: "reel.mp4" }) });
    expect(response.status).toBe(201);
    expect(beginMediaUpload).toHaveBeenCalledWith({ authSubject: "cognito-sub-123", request: { fileName: "reel.mp4" } });
  });
});
