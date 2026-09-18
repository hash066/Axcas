import { describe, expect, it, vi } from "vitest";

import { createAwsControlPlaneApp } from "../../apps/aws-control-plane/src/app";
import {
  applyStudioSitePatch,
  createPendingStudioReleaseApproval,
  type StudioProjectRevision,
} from "../../apps/aws-control-plane/src/studio-api";
import { createSiteSpecV3Hash } from "../../packages/domain/src/production-redesign";

const spec = {
  schemaVersion: 3 as const,
  siteId: "maya-studio",
  merchantId: "merchant-maya",
  businessType: "tailor" as const,
  layoutPreset: "editorial" as const,
  sectionOrder: ["hero", "offerings", "proof", "contact"] as Array<"hero" | "offerings" | "proof" | "contact">,
  theme: { accent: "#c54f34", surface: "#fffaf4", text: "#201915", headingFont: "serif" as const, bodyFont: "sans" as const },
  business: { name: "Maya Studio", description: "Custom blouse stitching in Bengaluru", timezone: "Asia/Kolkata", locale: "en-IN" as const },
  hero: { headline: "Blouses fitted for you", subheadline: "Custom stitching and alterations", assetId: "asset-maya-hero" },
  offerings: [{ itemId: "custom-blouse", name: "Custom blouse", description: "Made to your measurements", price: { currency: "INR" as const, amountMinor: 150000 }, availability: "available" as const }],
  proof: [],
  contact: { orderWhatsAppNumber: "+919180499647", fulfillmentArea: "Bengaluru", leadTime: "3–5 days", ctaLabel: "Message to book a fitting" },
  seo: { title: "Maya Studio Bengaluru", description: "Custom blouse stitching and alterations in Bengaluru" },
  publishedAssetIds: ["asset-maya-hero"],
};

async function project(): Promise<StudioProjectRevision> {
  return {
    schemaVersion: 1,
    projectId: "maya-studio",
    merchantId: "merchant-maya",
    revision: 3,
    spec,
    specHash: await createSiteSpecV3Hash(spec),
    updatedAt: 1_800_000_000_000,
    updatedBy: "whatsapp",
  };
}

describe("AWS Studio project boundary", () => {
  it("applies an allowlisted patch as a new fully validated immutable revision", async () => {
    const current = await project();
    const result = await applyStudioSitePatch(current, {
      expectedRevision: 3,
      patch: { hero: { headline: "A perfect fit, made locally" }, layoutPreset: "minimal" },
    }, { now: 1_800_000_100_000, updatedBy: "studio" });

    expect(result).toMatchObject({ revision: 4, updatedBy: "studio", spec: { layoutPreset: "minimal", hero: { headline: "A perfect fit, made locally", subheadline: spec.hero.subheadline } } });
    expect(result.specHash).toBe(await createSiteSpecV3Hash(result.spec));
    expect(current.spec.hero.headline).toBe("Blouses fitted for you");
  });

  it("rejects stale, identity-changing, unsafe and structurally invalid patches", async () => {
    const current = await project();
    await expect(applyStudioSitePatch(current, { expectedRevision: 2, patch: { hero: { headline: "New" } } }, { now: 1, updatedBy: "studio" })).rejects.toMatchObject({ code: "revision_conflict" });
    await expect(applyStudioSitePatch(current, { expectedRevision: 3, patch: { merchantId: "merchant-attacker" } }, { now: 1, updatedBy: "studio" })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(applyStudioSitePatch(current, { expectedRevision: 3, patch: { hero: { headline: "<script>alert(1)</script>" } } }, { now: 1, updatedBy: "studio" })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(applyStudioSitePatch(current, { expectedRevision: 3, patch: { publishedAssetIds: [] } }, { now: 1, updatedBy: "studio" })).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("creates a pending release approval for the exact current revision without release authority", async () => {
    const current = await project();
    const approval = await createPendingStudioReleaseApproval({
      project: current,
      ownerWaIdHash: "a".repeat(64),
      expectedRevision: 3,
      expiresAt: 1_800_086_400_000,
      now: 1_800_000_000_000,
      approvalId: "approval-maya-v3",
    });
    expect(approval).toEqual(expect.objectContaining({ decision: "pending", scopeHash: current.specHash, projectId: current.projectId, revision: 3 }));
    expect(approval).not.toHaveProperty("taskToken");
    await expect(createPendingStudioReleaseApproval({ ...approvalInput(current), expectedRevision: 2 })).rejects.toMatchObject({ code: "revision_conflict" });
  });
});

function approvalInput(current: StudioProjectRevision) {
  return { project: current, ownerWaIdHash: "a".repeat(64), expectedRevision: 3, expiresAt: 1_800_086_400_000, now: 1_800_000_000_000, approvalId: "approval-maya-v3" };
}

describe("AWS Studio HTTP API", () => {
  const base = { metaAppSecret: "secret", metaVerifyToken: "verify", enqueue: vi.fn(), resolveApproval: vi.fn() };

  it("requires Cognito authentication and binds reads to the authenticated subject", async () => {
    const getStudioProject = vi.fn(async () => project());
    const app = createAwsControlPlaneApp({ ...base, getStudioProject });
    expect((await app.request("/api/studio/projects/maya-studio")).status).toBe(401);
    const response = await app.request("/api/studio/projects/maya-studio", { headers: { "x-axcas-auth-sub": "cognito-sub-123" } });
    expect(response.status).toBe(200);
    expect(getStudioProject).toHaveBeenCalledWith({ authSubject: "cognito-sub-123", projectId: "maya-studio" });
    expect((await response.json() as { merchantId: string }).merchantId).toBe("merchant-maya");
  });

  it("validates patches before invoking the tenant-bound persistence boundary", async () => {
    const patchStudioProject = vi.fn(async () => project());
    const app = createAwsControlPlaneApp({ ...base, patchStudioProject });
    const bad = await app.request("/api/studio/projects/maya-studio", { method: "PATCH", headers: { "x-axcas-auth-sub": "cognito-sub-123", "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: 3, patch: { merchantId: "merchant-attacker" } }) });
    expect(bad.status).toBe(400);
    expect(patchStudioProject).not.toHaveBeenCalled();
    const goodBody = { expectedRevision: 3, patch: { business: { description: "Alterations and custom blouses in Bengaluru" } } };
    const good = await app.request("/api/studio/projects/maya-studio", { method: "PATCH", headers: { "x-axcas-auth-sub": "cognito-sub-123", "content-type": "application/json" }, body: JSON.stringify(goodBody) });
    expect(good.status).toBe(200);
    expect(patchStudioProject).toHaveBeenCalledWith({ authSubject: "cognito-sub-123", projectId: "maya-studio", request: goodBody });
  });

  it("returns authenticated project changes from an opaque revision cursor", async () => {
    const listStudioProjectChanges = vi.fn(async () => ({ changes: [await project()], cursor: "1800000000000:maya-studio:3" }));
    const app = createAwsControlPlaneApp({ ...base, listStudioProjectChanges });
    expect((await app.request("/api/studio/projects/changes?cursor=1800000000000%3Amaya-studio%3A2")).status).toBe(401);
    const response = await app.request("/api/studio/projects/changes?cursor=1800000000000%3Amaya-studio%3A2", { headers: { "x-axcas-auth-sub": "cognito-sub-123" } });
    expect(response.status).toBe(200);
    expect(listStudioProjectChanges).toHaveBeenCalledWith({ authSubject: "cognito-sub-123", cursor: "1800000000000:maya-studio:2" });
    expect(await response.json()).toMatchObject({ cursor: "1800000000000:maya-studio:3", changes: [{ projectId: "maya-studio", revision: 3 }] });
    expect((await app.request("/api/studio/projects/changes?cursor=not-a-cursor", { headers: { "x-axcas-auth-sub": "cognito-sub-123" } })).status).toBe(400);
  });

  it("surfaces revision conflicts without replacing the customer's draft", async () => {
    const patchStudioProject = vi.fn(async () => { throw new (await import("../../apps/aws-control-plane/src/studio-api")).StudioApiError("revision_conflict", 409); });
    const app = createAwsControlPlaneApp({ ...base, patchStudioProject });
    const response = await app.request("/api/studio/projects/maya-studio", {
      method: "PATCH",
      headers: { "x-axcas-auth-sub": "cognito-sub-123", "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: 2, patch: { hero: { headline: "My unsaved headline" } } }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "revision_conflict" });
  });

  it("lists and creates only pending hash-bound approvals for the authenticated tenant", async () => {
    const listStudioApprovals = vi.fn(async () => ({ approvals: [] }));
    const createStudioApproval = vi.fn(async () => ({ approvalId: "approval-maya-v3", type: "release" as const, projectId: "maya-studio", revision: 3, scopeHash: "a".repeat(64), expiresAt: 1_800_086_400_000, decision: "pending" as const, createdAt: 1_800_000_000_000 }));
    const app = createAwsControlPlaneApp({ ...base, listStudioApprovals, createStudioApproval });
    const headers = { "x-axcas-auth-sub": "cognito-sub-123", "content-type": "application/json" };
    expect((await app.request("/api/studio/approvals")).status).toBe(401);
    expect((await app.request("/api/studio/approvals", { headers })).status).toBe(200);
    expect(listStudioApprovals).toHaveBeenCalledWith({ authSubject: "cognito-sub-123" });
    const response = await app.request("/api/studio/projects/maya-studio/approvals", { method: "POST", headers, body: JSON.stringify({ type: "release", expectedRevision: 3, expiresAt: 1_800_086_400_000 }) });
    expect(response.status).toBe(201);
    expect(createStudioApproval).toHaveBeenCalledWith({ authSubject: "cognito-sub-123", projectId: "maya-studio", request: { type: "release", expectedRevision: 3, expiresAt: 1_800_086_400_000 } });
    expect(await response.json()).not.toHaveProperty("ownerWaIdHash");
  });
});
