import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifyMediaBytes } from "../../apps/aws-control-plane/src/media-verifier";

async function* chunks() {
  yield Buffer.from("real merchant ");
  yield Buffer.from("media");
}

describe("AWS uploaded-media verifier", () => {
  it("streams the object and matches both immutable checksum and declared length", async () => {
    const expected = createHash("sha256").update("real merchant media").digest("hex");
    await expect(verifyMediaBytes(chunks(), { expectedSha256: expected, expectedBytes: 19 })).resolves.toEqual({ sha256: expected, bytes: 19, verified: true });
    await expect(verifyMediaBytes(chunks(), { expectedSha256: "a".repeat(64), expectedBytes: 19 })).resolves.toMatchObject({ verified: false });
  });
});
