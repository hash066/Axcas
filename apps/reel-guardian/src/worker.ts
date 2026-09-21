import { ReelPlanSchema, type ReelPlanV1 } from "../../../packages/domain/src/growth";
import { ReelRenderEvidenceSchema, type ReelRenderEvidence } from "../../../packages/domain/src/reel-evidence";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type RenderBoundary = (plan: ReelPlanV1, assets: Record<string, Uint8Array>) => Promise<{ bytes: Uint8Array; evidence: ReelRenderEvidence }>;

export type ReelGuardianOptions = { adminUrl: string; serviceSecret: string; fetcher?: Fetcher; render: RenderBoundary };

export async function runReelGuardianOnce(options: ReelGuardianOptions): Promise<{ claimed: false } | { claimed: true; reelId: string; renderedAssetId?: string; failed?: true }> {
  const origin = new URL(options.adminUrl);
  if (origin.protocol !== "https:" || options.serviceSecret.length < 32) throw new Error("reel guardian configuration is invalid");
  const fetcher = options.fetcher ?? fetch;
  const auth = { authorization: `Bearer ${options.serviceSecret}` };
  const claim = await fetcher(`${origin.origin}/internal/guardian`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ kind: "reel" }) });
  if (!claim.ok) throw new Error(`reel claim failed with HTTP ${claim.status}`);
  const claimed = await claim.json() as { claimed?: boolean; job?: { reelId?: string; planJson?: string; planHash?: string } };
  if (!claimed.claimed || !claimed.job) return { claimed: false };
  const plan = ReelPlanSchema.parse({ ...JSON.parse(claimed.job.planJson ?? "{}"), status: "rendering" });
  if (claimed.job.reelId !== plan.reelId || !/^[a-f0-9]{64}$/.test(claimed.job.planHash ?? "")) throw new Error("claimed reel scope is invalid");
  try {
    const assets: Record<string, Uint8Array> = {};
    for (const assetId of new Set(plan.scenes.map((scene) => scene.assetId))) {
      const response = await fetcher(`${origin.origin}/internal/render-assets/${encodeURIComponent(assetId)}`, { headers: { ...auth, "x-proofgate-merchant-id": plan.merchantId } });
      if (!response.ok || !(response.headers.get("content-type") ?? "").startsWith("image/")) throw new Error(`approved asset ${assetId} is unavailable`);
      assets[assetId] = new Uint8Array(await response.arrayBuffer());
    }
    const rendered = await options.render(plan, assets);
    const output = rendered.bytes;
    const evidence = ReelRenderEvidenceSchema.parse(rendered.evidence);
    if (output.byteLength === 0 || output.byteLength > 16 * 1024 * 1024) throw new Error("rendered reel size is invalid");
    const upload = await fetcher(`${origin.origin}/internal/rendered-assets/rendered-${plan.reelId}`, {
      method: "PUT", headers: { ...auth, "content-type": "video/mp4", "x-proofgate-merchant-id": plan.merchantId, "x-proofgate-source-message-id": `reel-guardian:${plan.reelId}` }, body: new Uint8Array(Array.from(output)).buffer,
    });
    if (!upload.ok) throw new Error(`render upload failed with HTTP ${upload.status}`);
    const uploaded = await upload.json() as { assetId?: string };
    if (!uploaded.assetId) throw new Error("render upload returned no asset ID");
    const completed = await fetcher(`${origin.origin}/internal/reel-result`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ reelId: plan.reelId, status: "rendered", renderedAssetId: uploaded.assetId, evidence }) });
    if (!completed.ok) throw new Error(`reel completion failed with HTTP ${completed.status}`);
    const delivered = await fetcher(`${origin.origin}/internal/reel-delivery`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ reelId: plan.reelId, renderedAssetId: uploaded.assetId, caption: plan.caption }),
    });
    if (!delivered.ok) throw new Error(`reel delivery failed with HTTP ${delivered.status}`);
    return { claimed: true, reelId: plan.reelId, renderedAssetId: uploaded.assetId };
  } catch (error) {
    await fetcher(`${origin.origin}/internal/reel-result`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ reelId: plan.reelId, status: "delivery_failed", failureCode: "render_pipeline_failed" }) }).catch(() => undefined);
    return { claimed: true, reelId: plan.reelId, failed: true };
  }
}
