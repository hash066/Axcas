import { describe, expect, it, vi } from "vitest";

import { CompleteUploadRequestSchema, UploadPartRequestSchema, initiateTenantUpload, tenantAssetKey } from "../../apps/aws-control-plane/src/media-upload";

describe("AWS tenant media upload", () => {
  it("creates a private immutable multipart upload inside the authenticated tenant", async () => {
    const createMultipart = vi.fn(async () => ({ uploadId: "upload-123" }));
    const reserveQuota = vi.fn(async () => true);
    const result = await initiateTenantUpload({
      merchantId: "merchant-demo",
      fileName: "bread reel.mp4",
      contentType: "video/mp4",
      bytes: 48_000_000,
      sha256: "a".repeat(64),
    }, { createMultipart, reserveQuota, newAssetId: () => "asset-immutable-1", now: () => 1_789_680_000_000 });

    expect(result).toMatchObject({ assetId: "asset-immutable-1", uploadId: "upload-123", partSize: 8_388_608, partCount: 6 });
    expect(createMultipart).toHaveBeenCalledWith(expect.objectContaining({
      key: "private/merchant-demo/asset-immutable-1/source",
      contentType: "video/mp4",
      checksumAlgorithm: "SHA256",
    }));
    expect(reserveQuota).toHaveBeenCalledWith("merchant-demo", 48_000_000, "asset-immutable-1");
  });

  it("rejects unsafe media, path injection, oversized files and exhausted quota", async () => {
    const deps = { createMultipart: vi.fn(), reserveQuota: vi.fn(async () => false), newAssetId: () => "asset-safe-1" };
    await expect(initiateTenantUpload({ merchantId: "merchant-demo", fileName: "x.exe", contentType: "application/x-msdownload", bytes: 20, sha256: "a".repeat(64) }, deps)).rejects.toThrow();
    await expect(initiateTenantUpload({ merchantId: "merchant-demo", fileName: "x.mp4", contentType: "video/mp4", bytes: 1_073_741_825, sha256: "a".repeat(64) }, deps)).rejects.toThrow();
    await expect(initiateTenantUpload({ merchantId: "merchant-demo", fileName: "x.mp4", contentType: "video/mp4", bytes: 20, sha256: "a".repeat(64) }, deps)).rejects.toThrow("quota");
    expect(() => tenantAssetKey("../other-tenant", "asset-safe-1")).toThrow();
  });

  it("validates resumable parts and rejects duplicate or malformed completion lists", () => {
    expect(UploadPartRequestSchema.parse({ uploadId: "upload-123", partNumber: 1, checksumSha256: `${"A".repeat(43)}=` })).toMatchObject({ partNumber: 1 });
    expect(CompleteUploadRequestSchema.parse({ uploadId: "upload-123", parts: [
      { partNumber: 1, eTag: "etag-one", checksumSha256: `${"A".repeat(43)}=` },
      { partNumber: 2, eTag: "etag-two", checksumSha256: `${"B".repeat(43)}=` },
    ] }).parts).toHaveLength(2);
    expect(() => CompleteUploadRequestSchema.parse({ uploadId: "upload-123", parts: [
      { partNumber: 1, eTag: "etag-one", checksumSha256: `${"A".repeat(43)}=` },
      { partNumber: 1, eTag: "etag-two", checksumSha256: `${"B".repeat(43)}=` },
    ] })).toThrow("unique");
  });
});
