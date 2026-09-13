import { describe, expect, it } from "vitest";

import {
  REEL_FORMATS,
  ReelStyleProfileSchema,
  StudioProjectInputSchema,
  formatApprovalChecklist,
} from "../../packages/domain/src/studio";

describe("Axcas studio domain", () => {
  it("offers website, reels, or both without making merchants configure infrastructure", () => {
    expect(StudioProjectInputSchema.parse({
      intent: "both",
      businessName: "Maya Studio",
      description: "Custom tailoring and alterations in Bengaluru",
      siteStyle: "editorial",
      reelTemplate: "split_explainer",
      referenceAssetIds: ["merchant-photo-1"],
      layerOverrides: { hook: "Watch this fit transform", proof: "Real client alteration", cta: "Message for a fitting", accent: "#d95d39", pacing: "fast" },
    })).toMatchObject({ intent: "both", siteStyle: "editorial", reelTemplate: "split_explainer" });

    expect(() => StudioProjectInputSchema.parse({
      intent: "website",
      businessName: "Maya Studio",
      description: "Custom tailoring",
      apiKey: "customer-secret",
    })).toThrow();
  });

  it("recommends human-led, original reel formats rather than AI as a creative style", () => {
    expect(REEL_FORMATS.map((format) => format.id)).toEqual([
      "kinetic_type",
      "split_explainer",
      "talking_half",
      "full_infographic",
      "post_highlight",
    ]);
    expect(REEL_FORMATS.every((format) => format.humanLed && !/ai.generated/i.test(`${format.name} ${format.description}`))).toBe(true);
  });

  it("stores an immutable-style reel profile as safe layers over supplied references", () => {
    const profile = ReelStyleProfileSchema.parse({
      schemaVersion: 1,
      profileId: "profile-maya-1",
      merchantId: "merchant-maya",
      name: "Warm editorial",
      templateId: "post_highlight",
      referenceAssetIds: ["reference-reel-1"],
      palette: ["#221a16", "#f4c6a8"],
      layers: [
        { id: "hook", kind: "text", text: "Three fit mistakes", startMs: 0, endMs: 2500, x: 0.08, y: 0.08, width: 0.84, height: 0.2 },
        { id: "clip", kind: "video", sourceAssetId: "reference-reel-1", startMs: 0, endMs: 8000, x: 0, y: 0.3, width: 1, height: 0.7 },
      ],
    });
    expect(profile.layers).toHaveLength(2);
    expect(() => ReelStyleProfileSchema.parse({ ...profile, name: "<script>alert(1)</script>" })).toThrow();
  });

  it("formats one plain-language checklist per exact approval scope", () => {
    const release = formatApprovalChecklist({ type: "release", subject: "Maya Studio website", details: ["Preview checked", "WhatsApp enquiry buttons checked", "Only supplied claims and photos"] });
    expect(release).toContain("Ready to publish — Maya Studio website");
    expect(release).toContain("✓ Preview checked");
    expect(release).toContain("Approve publishes only this version");
    expect(release).not.toMatch(/hash|credential|provider|command/i);
    expect(release.length).toBeLessThanOrEqual(1024);
  });
});
