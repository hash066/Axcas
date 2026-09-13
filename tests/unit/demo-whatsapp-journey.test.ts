import { describe, expect, it } from "vitest";

import { buildWhatsAppDemoJourney } from "../../packages/domain/src/demo-journey";

describe("Axcas WhatsApp demo journey", () => {
  it("is concise, customer-safe, and contains one publish decision", () => {
    const journey = buildWhatsAppDemoJourney();
    const visible = journey.filter((beat) => beat.actor !== "system");
    const transcript = visible.map((beat) => beat.message).join("\n");

    expect(journey[0]).toMatchObject({ actor: "system", liveEvidence: false });
    expect(visible.filter((beat) => beat.kind === "approval")).toHaveLength(1);
    expect(transcript).toContain("Ready to publish");
    expect(transcript).toContain("[checked preview URL]");
    expect(transcript).toContain("[verified live site URL]");
    expect(transcript).not.toMatch(/ProofGate|Hermes|Convex|Cloudflare|Vapi|credential|provider|command|shell|```|specHash|approvalId/i);
  });

  it("does not show reversible processing milestones to the merchant", () => {
    const journey = buildWhatsAppDemoJourney();
    expect(journey.filter((beat) => beat.actor === "system").map((beat) => beat.kind)).toEqual([
      "disclaimer",
      "silent_work",
    ]);
    expect(journey.map((beat) => beat.message).join("\n")).not.toMatch(/brief saved|media saved|verification requested|policy applied/i);
  });
});
