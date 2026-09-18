import { describe, expect, it } from "vitest";

import { renderSiteSpecV3 } from "../../packages/renderer/src/render-site-v3";

const spec = {
  schemaVersion: 3 as const, siteId: "maya-studio", merchantId: "merchant-maya", businessType: "tailor" as const, layoutPreset: "editorial" as const,
  sectionOrder: ["hero", "offerings", "proof", "contact"] as const,
  theme: { accent: "#c54f34", surface: "#fffaf4", text: "#201915", headingFont: "serif" as const, bodyFont: "sans" as const },
  business: { name: "Maya Studio", description: "Custom blouse stitching in Bengaluru", timezone: "Asia/Kolkata", locale: "en-IN" as const },
  hero: { headline: "Blouses fitted for you", subheadline: "Custom stitching and alterations", assetId: "asset-maya-hero" },
  offerings: [{ itemId: "custom-blouse", name: "Custom blouse", description: "Made to your measurements", price: { currency: "INR" as const, amountMinor: 150000 }, availability: "available" as const }],
  proof: [{ label: "Local fittings", detail: "Appointments in Bengaluru" }],
  contact: { orderWhatsAppNumber: "+919180499647", fulfillmentArea: "Bengaluru", leadTime: "3–5 days", ctaLabel: "Message to book a fitting" },
  seo: { title: "Maya Studio Bengaluru", description: "Custom blouse stitching and alterations in Bengaluru" }, publishedAssetIds: ["asset-maya-hero"],
};

describe("SiteSpec V3 renderer", () => {
  it("renders a complete deterministic SME site with tracked CTAs", () => {
    const html = renderSiteSpecV3(spec, { mediaUrl: (assetId) => `https://media.example/${assetId}` });
    expect(html).toContain('data-pg="site-v3"');
    expect(html).toContain('data-pg="offering-custom-blouse"');
    expect(html).toContain('/r/whatsapp/maya-studio/custom-blouse?source=site');
    expect(html).toContain('/e/view/maya-studio?source=site');
    expect(html).toContain("₹1,500");
    expect(html).toContain("https://media.example/asset-maya-hero");
  });

  it("escapes all merchant content and rejects unsafe media URLs", () => {
    const html = renderSiteSpecV3({ ...spec, business: { ...spec.business, name: "Maya & Friends" } }, { mediaUrl: () => "https://media.example/hero" });
    expect(html).toContain("Maya &amp; Friends");
    expect(() => renderSiteSpecV3(spec, { mediaUrl: () => "javascript:alert(1)" })).toThrow(/media URL/i);
  });
});
