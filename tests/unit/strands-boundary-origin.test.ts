import { describe, expect, it } from "vitest";

import { resolveAdminOrigin } from "../../apps/strands-orchestrator/src/boundary";

describe("Strands administrative origin boundary", () => {
  it("accepts the legacy Worker and an explicit AWS API origin", () => {
    expect(resolveAdminOrigin({ PROOFGATE_ADMIN_URL: "https://proofgate.example.workers.dev" }).hostname).toBe("proofgate.example.workers.dev");
    expect(resolveAdminOrigin({
      PROOFGATE_ADMIN_URL: "https://abc123.execute-api.ap-south-1.amazonaws.com",
      AXCAS_ADMIN_ORIGIN_ALLOWLIST: "https://abc123.execute-api.ap-south-1.amazonaws.com",
    }).hostname).toBe("abc123.execute-api.ap-south-1.amazonaws.com");
  });

  it("rejects lookalikes, credentials, paths and unlisted AWS origins", () => {
    for (const url of [
      "https://proofgate.example.workers.dev.evil.test",
      "https://user:pass@proofgate.example.workers.dev",
      "https://proofgate.example.workers.dev/internal",
      "https://abc123.execute-api.ap-south-1.amazonaws.com",
    ]) expect(() => resolveAdminOrigin({ PROOFGATE_ADMIN_URL: url })).toThrow();
  });
});
