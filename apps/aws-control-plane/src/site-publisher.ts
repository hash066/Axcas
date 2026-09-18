import { z } from "zod";

import { createSiteSpecV3Hash, SiteSpecV3Schema } from "../../../packages/domain/src/production-redesign";
import { renderSiteSpecV3 } from "../../../packages/renderer/src/render-site-v3";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/);

const VerificationReceiptSchema = z.object({
  runId: z.string().min(3).max(128),
  specHash: sha256,
  passed: z.boolean(),
  blockers: z.array(z.string().min(1).max(300)).max(100),
}).strict();

const ReleaseApprovalSchema = z.object({
  approvalId: slug,
  merchantId: slug,
  ownerWaIdHash: sha256,
  scopeHash: sha256,
  decision: z.enum(["approved", "denied"]),
  expiresAt: z.number().int().nonnegative(),
}).strict();

type PutObject = (input: {
  key: string;
  body: string;
  contentType: "text/html; charset=utf-8";
  cacheControl: string;
  metadata: Record<string, string>;
}) => Promise<{ versionId?: string; etag?: string }>;

async function textSha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function publishVerifiedSiteV3(input: {
  spec: unknown;
  versionId: string;
  specHash: string;
  verification: unknown;
  approval: unknown;
  now: number;
  mediaUrl: (assetId: string) => string;
  putObject: PutObject;
}): Promise<{ siteId: string; versionId: string; specHash: string; artifactHash: string; immutableObjectVersionId?: string; currentObjectVersionId?: string }> {
  const spec = SiteSpecV3Schema.parse(input.spec);
  if (!/^[a-zA-Z0-9._-]{3,128}$/.test(input.versionId)) throw new Error("release version is invalid");
  const actualSpecHash = await createSiteSpecV3Hash(spec);
  if (input.specHash !== actualSpecHash) throw new Error("candidate spec hash mismatch");
  const verification = VerificationReceiptSchema.parse(input.verification);
  if (!verification.passed || verification.blockers.length > 0 || verification.specHash !== actualSpecHash) throw new Error("verification does not authorize this exact candidate");
  const approval = ReleaseApprovalSchema.parse(input.approval);
  if (approval.decision !== "approved" || approval.expiresAt < input.now || approval.merchantId !== spec.merchantId || approval.scopeHash !== actualSpecHash) throw new Error("approval does not authorize this exact release scope");

  const html = renderSiteSpecV3(spec, { mediaUrl: input.mediaUrl });
  const artifactHash = await textSha256(html);
  const metadata = { siteid: spec.siteId, versionid: input.versionId, spechash: actualSpecHash, artifacthash: artifactHash, verificationrunid: verification.runId, approvalid: approval.approvalId };
  const immutable = await input.putObject({
    key: `sites/${spec.siteId}/versions/${input.versionId}/index.html`, body: html,
    contentType: "text/html; charset=utf-8", cacheControl: "public, max-age=31536000, immutable", metadata,
  });
  // This mutable alias is written only by deterministic release code. S3 versioning makes every prior alias recoverable.
  const current = await input.putObject({
    key: `s/${spec.siteId}/index.html`, body: html,
    contentType: "text/html; charset=utf-8", cacheControl: "public, max-age=60, must-revalidate", metadata,
  });
  return { siteId: spec.siteId, versionId: input.versionId, specHash: actualSpecHash, artifactHash, immutableObjectVersionId: immutable.versionId, currentObjectVersionId: current.versionId };
}
