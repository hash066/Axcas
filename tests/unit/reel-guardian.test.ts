import { describe, expect, it, vi } from "vitest";

import { runReelGuardianOnce } from "../../apps/reel-guardian/src/worker";

describe("AWS reel guardian", () => {
  it("claims only an approved job, downloads its exact assets, uploads the verified MP4, and completes it", async () => {
    const plan = {
      schemaVersion: 1, reelId: "reel-project-1", merchantId: "merchant-1234567890abcdef", angle: "Process + proof", hook: "See the change",
      scenes: [1, 2, 3].map((index) => ({ assetId: `asset-photo-${index}`, overlay: `Scene ${index}`, durationMs: 5000 })),
      voiceover: "See the change. Real work. Message us.", caption: "Real work. Message us.", cta: "Message us", claims: [], status: "draft",
    };
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); const method = init?.method ?? "GET"; calls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
      if (url.endsWith("/internal/guardian")) return Response.json({ claimed: true, job: { reelId: plan.reelId, planJson: JSON.stringify(plan), planHash: "a".repeat(64) } });
      if (url.includes("/internal/render-assets/")) return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { "content-type": "image/jpeg" } });
      if (url.includes("/internal/rendered-assets/")) return Response.json({ accepted: true, assetId: "rendered-asset-1" }, { status: 201 });
      if (url.endsWith("/internal/reel-result")) return Response.json({ completed: true });
      if (url.endsWith("/internal/reel-delivery")) return Response.json({ delivered: true }, { status: 201 });
      return new Response("not found", { status: 404 });
    });
    const render = vi.fn(async () => ({
      bytes: new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 1, 2, 3]),
      evidence: {
        ffprobe: { width: 1080 as const, height: 1920 as const, videoCodec: "h264" as const, audioCodec: "aac" as const, durationSeconds: 15 },
        polly: { voiceId: "Kajal" as const, engine: "generative" as const, characters: plan.voiceover.length },
      },
    }));
    const result = await runReelGuardianOnce({ adminUrl: "https://axcas.example", serviceSecret: "s".repeat(64), fetcher, render });
    expect(result).toEqual({ claimed: true, reelId: plan.reelId, renderedAssetId: "rendered-asset-1" });
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ status: "rendering" }), expect.objectContaining({ "asset-photo-1": expect.any(Uint8Array) }));
    expect(calls.filter((call) => call.url.includes("/internal/render-assets/")).length).toBe(3);
    const completion = calls.find((call) => call.url.endsWith("/internal/reel-result") && call.body?.includes('"rendered"'))!;
    expect(JSON.parse(completion.body!)).toMatchObject({
      status: "rendered",
      evidence: { ffprobe: { width: 1080, height: 1920, durationSeconds: 15 }, polly: { voiceId: "Kajal", characters: plan.voiceover.length } },
    });
    expect(calls.at(-1)).toMatchObject({ url: "https://axcas.example/internal/reel-delivery", method: "POST" });
    expect(JSON.parse(calls.at(-1)!.body!)).toMatchObject({ reelId: plan.reelId, renderedAssetId: "rendered-asset-1", caption: plan.caption });
  });
});
