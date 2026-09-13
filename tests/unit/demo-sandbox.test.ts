import { describe, expect, it } from "vitest";

import { renderDemoSandbox } from "../../packages/renderer/src/render-demo-sandbox";
import { renderProductHome } from "../../packages/renderer/src/render-product-home";
import { createApp } from "../../apps/edge-runtime/src/index";

describe("public Axcas judge sandbox", () => {
  it("is explicitly a sample and exposes no authenticated product action", () => {
    const html = renderDemoSandbox();
    expect(html).toContain("Interactive product walkthrough");
    expect(html).toContain("Sample data · no WhatsApp messages sent");
    expect(html).toContain("Ready to publish — Maya Studio website");
    expect(html).toContain('href="/studio"');
    expect(html).not.toMatch(/<form|fetch\(|\/api\/|approvalId|specHash|merchantId/i);
    expect(renderProductHome()).toContain('data-pg="judge-demo" href="/demo"');
  });

  it("is available without weakening Studio authentication", async () => {
    const response = await createApp().request("https://axcas.test/demo");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toContain("This walkthrough never publishes");
  });
});
