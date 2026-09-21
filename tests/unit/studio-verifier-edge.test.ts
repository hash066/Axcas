import { describe, expect, it, vi } from "vitest";

import { createVerifierApp } from "../../apps/studio-verifier-edge/src/index";

describe("isolated Studio verifier Worker", () => {
  it("uses the private Axcas edge service binding for preview and evidence subrequests", async () => {
    const edge = {
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.redirect).toBe("manual");
        const url = String(input);
        if (url.includes("/preview/pgp_") && !url.includes("/assets/")) {
          return new Response('<!doctype html><body data-pg-version="site-revision-1" data-pg-hash="' + "a".repeat(64) + '"><div data-pg="preview-banner"></div><div data-pg="catalog"><img src="/preview/pgp_token.signature/assets/merchant-photo"></div><a data-pg="primary-cta" href="#preview-only"></a></body>', {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'",
              "x-proofgate-spec-hash": "a".repeat(64),
              "x-proofgate-version-id": "site-revision-1",
            },
          });
        }
        if (url.includes("/assets/merchant-photo")) return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200, headers: { "content-type": "image/jpeg" } });
        if (url.includes("/verification/pgv_")) return Response.json({ accepted: true });
        return new Response("not found", { status: 404 });
      }),
    };
    const response = await createVerifierApp().request("https://axcas-site-verifier.workers.dev/verify", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        previewUrl: "https://proofgate-whatsapp-growth.workers.dev/preview/pgp_token.signature",
        evidenceUrl: "https://proofgate-whatsapp-growth.workers.dev/verification/pgv_123456789012345678901234",
        siteId: "maya-studio-abcdef", versionId: "site-revision-1", specHash: "a".repeat(64),
      }),
    }, { AXCAS_EDGE: edge } as never);

    expect(response.status).toBe(200);
    expect(edge.fetch).toHaveBeenCalledTimes(3);
  });

  it("checks the immutable public preview and spends only its single-use evidence capability", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      const url = String(input);
      if (url.includes("/preview/pgp_") && !url.includes("/assets/")) {
        return new Response('<!doctype html><body data-pg-version="site-revision-1" data-pg-hash="' + "a".repeat(64) + '"><div data-pg="preview-banner"></div><div data-pg="catalog"><img src="/preview/pgp_token.signature/assets/merchant-photo"></div><a data-pg="primary-cta" href="#preview-only"></a></body>', {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'",
            "x-proofgate-spec-hash": "a".repeat(64),
            "x-proofgate-version-id": "site-revision-1",
          },
        });
      }
      if (url.includes("/assets/merchant-photo")) return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200, headers: { "content-type": "image/jpeg" } });
      if (url.includes("/verification/pgv_")) {
        expect(init?.method).toBe("POST");
        const evidence = JSON.parse(String(init?.body));
        expect(evidence).toMatchObject({ siteId: "maya-studio-abcdef", versionId: "site-revision-1", specHash: "a".repeat(64), passed: true, blockers: [] });
        expect(evidence.reportHash).toMatch(/^[a-f0-9]{64}$/);
        return Response.json({ accepted: true });
      }
      return new Response("not found", { status: 404 });
    });
    const response = await createVerifierApp(fetcher).request("https://proofgate-site-verifier.workers.dev/verify", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        previewUrl: "https://proofgate-whatsapp-growth.workers.dev/preview/pgp_token.signature",
        evidenceUrl: "https://proofgate-whatsapp-growth.workers.dev/verification/pgv_123456789012345678901234",
        siteId: "maya-studio-abcdef", versionId: "site-revision-1", specHash: "a".repeat(64),
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ accepted: true, passed: true, blockers: [], runId: expect.stringMatching(/^studio-verify-/) });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("fails closed on target confusion and never contacts the supplied URLs", async () => {
    const fetcher = vi.fn();
    const response = await createVerifierApp(fetcher).request("https://proofgate-site-verifier.workers.dev/verify", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        previewUrl: "http://127.0.0.1/preview/pgp_token.signature",
        evidenceUrl: "https://evil.example/verification/pgv_123456789012345678901234",
        siteId: "maya-studio-abcdef", versionId: "site-revision-1", specHash: "a".repeat(64),
      }),
    });
    expect(response.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
