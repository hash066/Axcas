import { describe, expect, it, vi } from "vitest";

import { createSiteSpecV3Hash } from "../../packages/domain/src/production-redesign";
import { publishVerifiedSiteV3 } from "../../apps/aws-control-plane/src/site-publisher";

const spec = {
  schemaVersion: 3 as const, siteId: "maya-studio", merchantId: "merchant-maya", businessType: "tailor" as const, layoutPreset: "editorial" as const,
  sectionOrder: ["hero", "offerings", "proof", "contact"], theme: { accent: "#c54f34", surface: "#fffaf4", text: "#201915", headingFont: "serif" as const, bodyFont: "sans" as const },
  business: { name: "Maya Studio", description: "Custom blouse stitching in Bengaluru", timezone: "Asia/Kolkata", locale: "en-IN" as const }, hero: { headline: "Blouses fitted for you", subheadline: "Custom stitching and alterations", assetId: "asset-maya-hero" },
  offerings: [{ itemId: "custom-blouse", name: "Custom blouse", description: "Made to your measurements", price: { currency: "INR" as const, amountMinor: 150000 }, availability: "available" as const }], proof: [],
  contact: { orderWhatsAppNumber: "+919180499647", fulfillmentArea: "Bengaluru", leadTime: "3–5 days", ctaLabel: "Message to book a fitting" }, seo: { title: "Maya Studio Bengaluru", description: "Custom blouse stitching and alterations in Bengaluru" }, publishedAssetIds: ["asset-maya-hero"],
};

describe("deterministic AWS site publisher", () => {
  it("writes immutable and current objects only after exact approval and verification", async () => {
    const specHash = await createSiteSpecV3Hash(spec);
    const putObject = vi.fn(async (_input: { key: string; body: string; contentType: "text/html; charset=utf-8"; cacheControl: string; metadata: Record<string, string> }) => ({ versionId: "s3-version-1", etag: "etag-1" }));
    const result = await publishVerifiedSiteV3({
      spec, versionId: "maya-studio-v1", specHash,
      verification: { runId: "verification-maya-v1", specHash, passed: true, blockers: [] },
      approval: { approvalId: "approval-maya-v1", merchantId: "merchant-maya", ownerWaIdHash: "a".repeat(64), scopeHash: specHash, decision: "approved", expiresAt: 1_900_000_000_000 },
      now: 1_800_000_000_000,
      mediaUrl: (assetId) => `https://media.example/${assetId}`,
      putObject,
    });
    expect(putObject.mock.calls.map(([call]) => call.key)).toEqual(["sites/maya-studio/versions/maya-studio-v1/index.html", "s/maya-studio/index.html"]);
    expect(result).toMatchObject({ siteId: "maya-studio", versionId: "maya-studio-v1", specHash });
  });

  it("does not write when approval or verification scope differs", async () => {
    const specHash = await createSiteSpecV3Hash(spec);
    const putObject = vi.fn();
    await expect(publishVerifiedSiteV3({
      spec, versionId: "maya-studio-v1", specHash,
      verification: { runId: "verification-maya-v1", specHash: "b".repeat(64), passed: true, blockers: [] },
      approval: { approvalId: "approval-maya-v1", merchantId: "merchant-maya", ownerWaIdHash: "a".repeat(64), scopeHash: specHash, decision: "approved", expiresAt: 1_900_000_000_000 },
      now: 1_800_000_000_000, mediaUrl: () => "https://media.example/asset", putObject,
    })).rejects.toThrow(/verification/i);
    expect(putObject).not.toHaveBeenCalled();
  });
});
