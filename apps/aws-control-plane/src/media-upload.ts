import { z } from "zod";

export const FREE_BETA_MEDIA_QUOTA_BYTES = 1_073_741_824;
export const MULTIPART_PART_SIZE_BYTES = 8_388_608;

const UploadRequestSchema = z.object({
  merchantId: z.string().regex(/^[a-z0-9-]{3,64}$/),
  fileName: z.string().trim().min(1).max(160).refine((value) => !/[\x00-\x1f]/.test(value)),
  contentType: z.enum([
    "image/jpeg", "image/png", "image/webp",
    "video/mp4", "video/quicktime",
    "audio/mpeg", "audio/mp4", "audio/ogg", "audio/webm",
  ]),
  bytes: z.number().int().positive().max(FREE_BETA_MEDIA_QUOTA_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

const identifier = z.string().regex(/^[a-zA-Z0-9_-]{3,128}$/);
const uploadId = z.string().min(8).max(1024).refine((value) => !/[\x00-\x1f]/.test(value));
const checksumSha256 = z.string().regex(/^[A-Za-z0-9+/]{43}=$/);

export const UploadPartRequestSchema = z.object({
  uploadId,
  partNumber: z.number().int().min(1).max(10_000),
  checksumSha256,
}).strict();

export const CompleteUploadRequestSchema = z.object({
  uploadId,
  parts: z.array(z.object({
    partNumber: z.number().int().min(1).max(10_000),
    eTag: z.string().trim().min(1).max(256).refine((value) => !/[\x00-\x1f<>]/.test(value)),
    checksumSha256,
  }).strict()).min(1).max(128),
}).strict().refine((value) => new Set(value.parts.map((part) => part.partNumber)).size === value.parts.length, { path: ["parts"], message: "part numbers must be unique" });

type UploadDependencies = {
  reserveQuota: (merchantId: string, bytes: number, assetId: string) => Promise<boolean>;
  releaseQuota?: (merchantId: string, bytes: number, assetId: string) => Promise<void>;
  createMultipart: (input: {
    key: string;
    contentType: z.infer<typeof UploadRequestSchema>["contentType"];
    checksumAlgorithm: "SHA256";
    metadata: Record<string, string>;
  }) => Promise<{ uploadId: string }>;
  newAssetId: () => string;
  now?: () => number;
};

export function tenantAssetKey(merchantIdValue: string, assetIdValue: string): string {
  const merchantId = UploadRequestSchema.shape.merchantId.parse(merchantIdValue);
  const assetId = identifier.parse(assetIdValue);
  return `private/${merchantId}/${assetId}/source`;
}

export async function initiateTenantUpload(requestValue: unknown, dependencies: UploadDependencies) {
  const request = UploadRequestSchema.parse(requestValue);
  const assetId = identifier.parse(dependencies.newAssetId());
  const reserved = await dependencies.reserveQuota(request.merchantId, request.bytes, assetId);
  if (!reserved) throw new Error("free beta media quota exceeded");
  try {
    const key = tenantAssetKey(request.merchantId, assetId);
    const multipart = await dependencies.createMultipart({
      key,
      contentType: request.contentType,
      checksumAlgorithm: "SHA256",
      metadata: {
        merchantid: request.merchantId,
        assetid: assetId,
        sourcesha256: request.sha256,
        declaredbytes: String(request.bytes),
        originalfilename: encodeURIComponent(request.fileName),
      },
    });
    const uploadId = z.string().min(1).max(1024).parse(multipart.uploadId);
    return {
      assetId,
      uploadId,
      key,
      partSize: MULTIPART_PART_SIZE_BYTES,
      partCount: Math.ceil(request.bytes / MULTIPART_PART_SIZE_BYTES),
      declaredBytes: request.bytes,
      expiresInSeconds: 900,
      createdAt: (dependencies.now ?? Date.now)(),
    };
  } catch (error) {
    await dependencies.releaseQuota?.(request.merchantId, request.bytes, assetId);
    throw error;
  }
}
