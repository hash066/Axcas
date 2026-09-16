import { describe, expect, it, vi } from "vitest";

import { sendApprovalButtons, sendTextMessage, sendVideoByMediaId } from "../../packages/whatsapp-io/src/meta-client";
import { findMerchantLanguageViolations } from "../../packages/whatsapp-io/src/merchant-language";
import { formatApprovalChecklist, reelAngleLabel, siteDisplayName } from "../../packages/domain/src/studio";

const transport = { graphApiVersion: "v20.0", phoneNumberId: "123456789012345", accessToken: "token", recipientWaId: "919876543210" };

/** Any call to this fetcher means a blocked message escaped the guard and reached the network. */
function unreachableFetcher() {
  return vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.leaked" }] }), { status: 200 }));
}

function acceptingFetcher() {
  return vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.sent" }] }), { status: 200 }));
}

describe("merchant language guard", () => {
  it("names each rule an outbound message violates", () => {
    expect(findMerchantLanguageViolations("Ready to publish — maya-studio-3f9a2b website")).toEqual(["generated_slug"]);
    expect(findMerchantLanguageViolations("India/US policy checked")).toEqual(["policy_status"]);
    expect(findMerchantLanguageViolations("candidate created; verification requested")).toEqual(["pipeline_vocabulary"]);
    expect(findMerchantLanguageViolations("Open https://axcas.example/preview/pgp_eyJzaXRlSWQi")).toEqual(["preview_token"]);
  });

  it("allows merchant words that merely look technical", () => {
    expect(findMerchantLanguageViolations("Your cancellation policy is on the site.")).toEqual([]);
    expect(findMerchantLanguageViolations("Checked on a phone, including the WhatsApp button")).toEqual([]);
    expect(findMerchantLanguageViolations("a behind-the-scenes reel")).toEqual([]);
  });

  it("blocks a raw generated site identifier before it reaches Meta", async () => {
    const fetcher = unreachableFetcher();
    await expect(sendApprovalButtons({
      ...transport, approvalId: "approval-1", fetcher,
      body: formatApprovalChecklist({ type: "release", subject: "mayas-oven-3f9a2b website", details: ["You reviewed the private preview"] }),
    })).rejects.toThrow(/generated_slug/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("blocks internal pipeline vocabulary in a plain text message", async () => {
    const fetcher = unreachableFetcher();
    await expect(sendTextMessage({
      ...transport, fetcher, body: "Your candidate passed verification and is ready to promote.",
    })).rejects.toThrow(/pipeline_vocabulary/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("blocks internal vocabulary in a reel caption", async () => {
    const fetcher = unreachableFetcher();
    await expect(sendVideoByMediaId({
      ...transport, fetcher, mediaId: "meta-media-1", caption: "Rendered from SiteSpecV2 by Hermes",
    })).rejects.toThrow(/vendor_or_infrastructure|schema_vocabulary/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("delivers the production release checklist once the identifier is humanised", async () => {
    const fetcher = acceptingFetcher();
    const body = formatApprovalChecklist({
      type: "release",
      subject: `${siteDisplayName("mayas-oven-3f9a2b")} website`,
      details: ["You reviewed the private preview", "Checked on a phone, including the WhatsApp button", "Only your own words, prices, and photos"],
    });
    expect(body).toContain("Ready to publish — Mayas Oven website");
    expect(await sendApprovalButtons({ ...transport, approvalId: "approval-1", body, fetcher })).toEqual({ providerMessageId: "wamid.sent" });
  });

  it("delivers the production call and reel checklists", async () => {
    const calls = formatApprovalChecklist({
      type: "call_batch", subject: "3 customer calls",
      details: ["Only people who agreed to be contacted", "One call each — nobody is called twice", "Total spend will not go above $12.00", "Recording starts only if they say yes"],
    });
    const reel = formatApprovalChecklist({
      type: "reel", subject: reelAngleLabel("Process + proof"),
      details: ["Uses only the photos you chose", "Says only what you told me", "Full-screen vertical, with text kept clear of the edges", "Sent back to you here — never posted for you"],
    });
    expect(findMerchantLanguageViolations(calls)).toEqual([]);
    expect(findMerchantLanguageViolations(reel)).toEqual([]);
    expect(reel).toContain("Ready to make your reel — a behind-the-scenes reel");
  });

  it("humanises generated site identifiers and internal reel angles", () => {
    expect(siteDisplayName("mayas-oven-3f9a2b")).toBe("Mayas Oven");
    expect(siteDisplayName("tailor-hub-0a1b2c")).toBe("Tailor Hub");
    expect(siteDisplayName("bakery")).toBe("Bakery");
    expect(reelAngleLabel("Offer + urgency")).toBe("a short offer reel");
    expect(reelAngleLabel("something new")).toBe("a new reel");
  });
});
