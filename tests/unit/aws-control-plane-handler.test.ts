import { afterEach, describe, expect, it } from "vitest";

import { handler } from "../../apps/aws-control-plane/src/handler";

const providerSecretArn = process.env.AXCAS_PROVIDER_SECRET_ARN;

afterEach(() => {
  if (providerSecretArn === undefined) delete process.env.AXCAS_PROVIDER_SECRET_ARN;
  else process.env.AXCAS_PROVIDER_SECRET_ARN = providerSecretArn;
});

describe("AWS control-plane Lambda boundary", () => {
  it("serves the public health check without loading provider credentials", async () => {
    delete process.env.AXCAS_PROVIDER_SECRET_ARN;

    const response = await handler({
      rawPath: "/health",
      requestContext: { http: { method: "GET" } },
      headers: {},
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: "ok" });
    expect(response.headers["cache-control"]).toBe("no-store");
  });
});
