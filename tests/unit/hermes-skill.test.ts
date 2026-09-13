import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Axcas Hermes merchant experience", () => {
  it("uses typed tools and never exposes runtime setup to merchants", async () => {
    const skill = await readFile("hermes/skills/proofgate/SKILL.md", "utf8");

    expect(skill).toContain("`axcas_continue`");
    expect(skill).toContain("`axcas_status`");
    expect(skill).toContain("I’ve saved everything you sent");
    expect(skill).toContain("Never show environment-variable names");
    expect(skill).toContain("`notifyCustomer: false`");
    expect(skill).toContain("send no reply for that tool result");
    expect(skill).not.toContain("npm run proofgate");
    expect(skill).not.toContain("PROOFGATE_SERVICE_SECRET");
  });

  it("sends a real preview link and asks once for site publication", async () => {
    const skill = await readFile("hermes/skills/proofgate/SKILL.md", "utf8");
    expect(skill).toContain("exactly one approval prompt");
    expect(skill).toContain("previewUrl");
    expect(skill).toContain("Never send raw HTML");
    expect(skill).toContain("merchant supplies none of them");
  });

  it("keeps the linked Studio account synchronized after WhatsApp changes", async () => {
    const skill = await readFile("hermes/skills/proofgate/SKILL.md", "utf8");
    expect(skill).toContain("submit a fresh `intake` after every accepted business-detail change");
    expect(skill).toContain("linked Studio workspace refreshes automatically");
  });
});
