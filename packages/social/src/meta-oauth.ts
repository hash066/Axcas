import { z } from "zod";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const OAuthStateSchema = z.object({
  merchantId: z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/),
  ownerWaIdHash: z.string().regex(/^[a-f0-9]{64}$/),
  returnPath: z.string().regex(/^\/studio(?:\/[a-zA-Z0-9/_-]*)?$/),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
}).strict().superRefine((state, context) => {
  if (state.expiresAt <= state.issuedAt || state.expiresAt - state.issuedAt > 600_000) context.addIssue({ code: "custom", path: ["expiresAt"], message: "OAuth state lifetime must not exceed ten minutes" });
});

type OAuthState = z.infer<typeof OAuthStateSchema>;

const exchangeResponse = z.object({ access_token: z.string().min(16).max(4096), token_type: z.string().optional(), expires_in: z.number().int().positive().optional() });
const pagesResponse = z.object({ data: z.array(z.object({
  id: z.string().regex(/^\d{3,32}$/),
  name: z.string().trim().min(1).max(200),
  instagram_business_account: z.object({ id: z.string().regex(/^\d{3,32}$/), username: z.string().trim().min(1).max(100).optional() }).optional(),
}).passthrough()).max(100) });
const adAccountsResponse = z.object({ data: z.array(z.object({
  id: z.string().regex(/^act_\d{3,32}$/),
  name: z.string().trim().min(1).max(200),
  account_status: z.number().int(),
}).passthrough()).max(100) });

const metaScopes = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
  "read_insights",
  "ads_management",
  "ads_read",
  "business_management",
] as const;

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function base64UrlText(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

async function sign(value: string, secret: string): Promise<string> {
  if (secret.length < 32) throw new Error("OAuth state secret is too short");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function createMetaOAuthState(input: OAuthState, secret: string): Promise<string> {
  const state = OAuthStateSchema.parse(input);
  const payload = base64UrlText(JSON.stringify(state));
  return `${payload}.${await sign(payload, secret)}`;
}

export async function verifyMetaOAuthState(value: string, secret: string, now: number): Promise<OAuthState> {
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra || !constantTimeEqual(signature, await sign(payload, secret))) throw new Error("Meta OAuth state is invalid");
  let decoded: unknown;
  try { decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); }
  catch { throw new Error("Meta OAuth state is invalid"); }
  const state = OAuthStateSchema.parse(decoded);
  if (state.expiresAt < now) throw new Error("Meta OAuth state expired");
  return state;
}

export function buildMetaBusinessLoginUrl(input: { graphApiVersion: string; appId: string; redirectUri: string; state: string }): string {
  if (!/^v\d+\.\d+$/.test(input.graphApiVersion) || !/^\d{3,32}$/.test(input.appId)) throw new Error("Meta app configuration is invalid");
  const redirect = new URL(input.redirectUri);
  if (redirect.protocol !== "https:") throw new Error("Meta OAuth redirect must use HTTPS");
  if (!/^[A-Za-z0-9._-]{8,4096}$/.test(input.state)) throw new Error("Meta OAuth state is invalid");
  const url = new URL(`https://www.facebook.com/${input.graphApiVersion}/dialog/oauth`);
  url.search = new URLSearchParams({ client_id: input.appId, redirect_uri: redirect.toString(), response_type: "code", state: input.state, scope: metaScopes.join(",") }).toString();
  return url.toString();
}

export async function exchangeMetaAuthorizationCode(input: { graphApiVersion: string; appId: string; appSecret: string; redirectUri: string; code: string; fetcher?: Fetcher }): Promise<{ accessToken: string; expiresInSeconds: number }> {
  if (!/^v\d+\.\d+$/.test(input.graphApiVersion) || !/^\d{3,32}$/.test(input.appId) || !input.appSecret || !/^[A-Za-z0-9._-]{3,2048}$/.test(input.code)) throw new Error("Meta OAuth exchange input is invalid");
  const redirect = new URL(input.redirectUri);
  if (redirect.protocol !== "https:") throw new Error("Meta OAuth redirect must use HTTPS");
  const url = new URL(`https://graph.facebook.com/${input.graphApiVersion}/oauth/access_token`);
  url.search = new URLSearchParams({ client_id: input.appId, client_secret: input.appSecret, redirect_uri: redirect.toString(), code: input.code }).toString();
  const response = await (input.fetcher ?? fetch)(url.toString(), { method: "GET", headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Meta OAuth exchange failed with HTTP ${response.status}`);
  const token = exchangeResponse.parse(await response.json());
  return { accessToken: token.access_token, expiresInSeconds: token.expires_in ?? 5_184_000 };
}

export async function discoverMetaBusinessAssets(input: { graphApiVersion: string; accessToken: string; fetcher?: Fetcher }): Promise<{
  pages: Array<{ pageId: string; pageName: string; instagramAccountId: string; instagramUsername?: string }>;
  adAccounts: Array<{ adAccountId: string; name: string }>;
}> {
  if (!/^v\d+\.\d+$/.test(input.graphApiVersion) || input.accessToken.length < 16) throw new Error("Meta discovery input is invalid");
  const fetcher = input.fetcher ?? fetch;
  const headers = { authorization: `Bearer ${input.accessToken}`, accept: "application/json" };
  const [pagesResult, adsResult] = await Promise.all([
    fetcher(`https://graph.facebook.com/${input.graphApiVersion}/me/accounts?fields=id,name,instagram_business_account%7Bid,username%7D&limit=100`, { headers }),
    fetcher(`https://graph.facebook.com/${input.graphApiVersion}/me/adaccounts?fields=id,name,account_status&limit=100`, { headers }),
  ]);
  if (!pagesResult.ok || !adsResult.ok) throw new Error("Meta business asset discovery failed");
  const pages = pagesResponse.parse(await pagesResult.json()).data
    .filter((page) => page.instagram_business_account)
    .map((page) => ({
      pageId: page.id,
      pageName: page.name,
      instagramAccountId: page.instagram_business_account!.id,
      ...(page.instagram_business_account!.username ? { instagramUsername: page.instagram_business_account!.username } : {}),
    }));
  const adAccounts = adAccountsResponse.parse(await adsResult.json()).data
    .filter((account) => account.account_status === 1)
    .map((account) => ({ adAccountId: account.id, name: account.name }));
  return { pages, adAccounts };
}
