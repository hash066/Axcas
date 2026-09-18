import { describe, expect, it, vi } from "vitest";

import { buildMetaBusinessLoginUrl, createMetaOAuthState, discoverMetaBusinessAssets, exchangeMetaAuthorizationCode, verifyMetaOAuthState } from "../../packages/social/src/meta-oauth";

describe("Meta merchant OAuth", () => {
  it("binds a short-lived state to one merchant and safe Studio return path", async () => {
    const state = await createMetaOAuthState({ merchantId: "merchant-maya", ownerWaIdHash: "a".repeat(64), returnPath: "/studio/projects/maya", issuedAt: 1_800_000_000_000, expiresAt: 1_800_000_600_000, nonce: "nonce-maya-123" }, "state-secret-at-least-32-characters");
    await expect(verifyMetaOAuthState(state, "state-secret-at-least-32-characters", 1_800_000_100_000)).resolves.toMatchObject({ merchantId: "merchant-maya", returnPath: "/studio/projects/maya" });
    await expect(verifyMetaOAuthState(`${state}x`, "state-secret-at-least-32-characters", 1_800_000_100_000)).rejects.toThrow(/state/i);
    await expect(verifyMetaOAuthState(state, "state-secret-at-least-32-characters", 1_800_000_700_000)).rejects.toThrow(/expired/i);
  });

  it("requests only merchant-owned publishing, insights, and ads permissions", () => {
    const url = new URL(buildMetaBusinessLoginUrl({ graphApiVersion: "v26.0", appId: "123456789", redirectUri: "https://api.example/oauth/meta/callback", state: "signed-state" }));
    expect(url.origin).toBe("https://www.facebook.com");
    expect(url.searchParams.get("scope")?.split(",")).toEqual(expect.arrayContaining(["instagram_basic", "instagram_content_publish", "pages_show_list", "pages_read_engagement", "read_insights", "ads_management", "ads_read", "business_management"]));
  });

  it("exchanges the one-time code only at the server boundary", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ access_token: "provider-secret-token", token_type: "bearer", expires_in: 5_184_000 }), { status: 200 }));
    await expect(exchangeMetaAuthorizationCode({ graphApiVersion: "v26.0", appId: "123456789", appSecret: "app-secret", redirectUri: "https://api.example/oauth/meta/callback", code: "one-time-code", fetcher })).resolves.toMatchObject({ accessToken: "provider-secret-token", expiresInSeconds: 5_184_000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("discovers connected Instagram/Page and active Ad Account choices without returning the token", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("/me/accounts")) return new Response(JSON.stringify({ data: [{ id: "190000001", name: "Maya Page", instagram_business_account: { id: "178900001", username: "maya" } }] }), { status: 200 });
      return new Response(JSON.stringify({ data: [{ id: "act_123456789", name: "Maya Ads", account_status: 1 }, { id: "act_987654321", name: "Disabled", account_status: 2 }] }), { status: 200 });
    });
    const result = await discoverMetaBusinessAssets({ graphApiVersion: "v26.0", accessToken: "secret-token-value", fetcher });
    expect(result).toEqual({ pages: [{ pageId: "190000001", pageName: "Maya Page", instagramAccountId: "178900001", instagramUsername: "maya" }], adAccounts: [{ adAccountId: "act_123456789", name: "Maya Ads" }] });
    expect(JSON.stringify(result)).not.toContain("secret-token-value");
  });
});
