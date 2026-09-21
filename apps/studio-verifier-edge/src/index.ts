import { Hono } from "hono";
import { z } from "zod";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z.string().regex(/^[a-zA-Z0-9_-]{3,128}$/);
const VerificationJobSchema = z.object({
  previewUrl: z.string().url(),
  evidenceUrl: z.string().url(),
  siteId: identifier,
  versionId: identifier,
  specHash: sha256,
}).strict();

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Bindings = { AXCAS_EDGE?: { fetch: Fetcher } };

function validateJobUrls(previewValue: string, evidenceValue: string): { preview: URL; evidence: URL } {
  const preview = new URL(previewValue);
  const evidence = new URL(evidenceValue);
  if (preview.protocol !== "https:" || evidence.protocol !== "https:") throw new Error("verification URLs must use HTTPS");
  if (preview.origin !== evidence.origin) throw new Error("preview and evidence capabilities must share one origin");
  if (preview.username || preview.password || evidence.username || evidence.password) throw new Error("URL credentials are not allowed");
  const hostname = preview.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "0.0.0.0" || /^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) throw new Error("private verification targets are not allowed");
  if (!/^\/preview\/pgp_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(preview.pathname)) throw new Error("invalid preview capability");
  if (!/^\/verification\/pgv_[A-Za-z0-9_-]{20,128}$/.test(evidence.pathname)) throw new Error("invalid evidence capability");
  return { preview, evidence };
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function inspectMarkup(html: string, response: Response, versionId: string, specHash: string): string[] {
  const blockers: string[] = [];
  if (response.headers.get("x-proofgate-version-id") !== versionId) blockers.push("version_header_mismatch");
  if (response.headers.get("x-proofgate-spec-hash") !== specHash) blockers.push("spec_hash_header_mismatch");
  const csp = response.headers.get("content-security-policy") ?? "";
  if (!csp.includes("default-src 'none'") || !csp.includes("form-action 'none'")) blockers.push("unsafe_content_security_policy");
  for (const handle of ["preview-banner", "catalog", "primary-cta"]) {
    const matches = html.match(new RegExp(`data-pg=["']${handle}["']`, "g"))?.length ?? 0;
    if (matches !== 1) blockers.push(`handle_${handle}_${matches === 0 ? "missing" : "duplicated"}`);
  }
  if (/<script\b|\son[a-z]+\s*=|javascript:/i.test(html)) blockers.push("unsafe_executable_markup");
  if (!html.includes(`data-pg-version="${versionId}"`) || !html.includes(`data-pg-hash="${specHash}"`)) blockers.push("immutable_body_binding_mismatch");
  return blockers;
}

export function createVerifierApp(fetcher?: Fetcher): Hono<{ Bindings: Bindings }> {
  const app = new Hono<{ Bindings: Bindings }>();
  app.get("/health", (context) => context.json({ service: "axcas-site-verifier", status: "ok", credentials: "none" }));
  app.post("/verify", async (context) => {
    const transport: Fetcher = fetcher ?? (context.env?.AXCAS_EDGE?.fetch
      ? (input, init) => context.env.AXCAS_EDGE!.fetch(input, init)
      : fetch);
    let parsed: z.infer<typeof VerificationJobSchema>;
    let urls: ReturnType<typeof validateJobUrls>;
    try {
      parsed = VerificationJobSchema.parse(await context.req.json());
      urls = validateJobUrls(parsed.previewUrl, parsed.evidenceUrl);
    } catch {
      return context.json({ error: "invalid_verification_job" }, 400);
    }

    const runId = `studio-verify-${crypto.randomUUID()}`;
    const evidenceId = `studio-evidence-${crypto.randomUUID()}`;
    const observedAt = Date.now();
    const blockers: string[] = [];
    let html = "";
    try {
      const previewResponse = await transport(urls.preview, { method: "GET", redirect: "error", headers: { accept: "text/html" } });
      if (!previewResponse.ok || !(previewResponse.headers.get("content-type") ?? "").startsWith("text/html")) {
        blockers.push("preview_unreachable");
      } else {
        html = await previewResponse.text();
        blockers.push(...inspectMarkup(html, previewResponse, parsed.versionId, parsed.specHash));
      }
    } catch {
      blockers.push("preview_unreachable");
    }

    if (!blockers.length) {
      const sources = Array.from(html.matchAll(/\bsrc=["']([^"']+)["']/gi), (match) => match[1]!);
      if (!sources.length) blockers.push("selected_media_missing");
      for (const source of sources) {
        try {
          const assetUrl = new URL(source, urls.preview.origin);
          if (assetUrl.origin !== urls.preview.origin || !assetUrl.pathname.startsWith(`${urls.preview.pathname}/assets/`)) {
            blockers.push("asset_scope_invalid");
            break;
          }
          const asset = await transport(assetUrl, { method: "GET", redirect: "error" });
          if (!asset.ok || !(asset.headers.get("content-type") ?? "").match(/^(image|video)\//)) {
            blockers.push("selected_media_unavailable");
            break;
          }
        } catch {
          blockers.push("selected_media_unavailable");
          break;
        }
      }
    }

    const passed = blockers.length === 0;
    const reportHash = await digest(JSON.stringify({ siteId: parsed.siteId, versionId: parsed.versionId, specHash: parsed.specHash, runId, passed, blockers, observedAt }));
    let accepted = false;
    try {
      const evidenceResponse = await transport(urls.evidence, {
        method: "POST", redirect: "error", headers: { "content-type": "application/json" },
        body: JSON.stringify({ evidenceId, siteId: parsed.siteId, versionId: parsed.versionId, specHash: parsed.specHash, runId, reportHash, passed, blockers, observedAt }),
      });
      accepted = evidenceResponse.ok && Boolean((await evidenceResponse.json() as { accepted?: unknown }).accepted);
    } catch {
      accepted = false;
    }
    return context.json({ accepted, passed, blockers, runId }, accepted ? 200 : 502, { "cache-control": "no-store" });
  });
  return app;
}

export default createVerifierApp();
