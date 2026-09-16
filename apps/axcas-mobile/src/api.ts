import { AXCAS_BASE_URL } from "./config";

/**
 * Client for the session-authenticated Studio routes.
 *
 * Authentication reuses the existing WhatsApp link flow rather than introducing a second
 * identity system: the Worker sets `axcas_link` and then `axcas_session` as HttpOnly cookies,
 * and React Native's native networking stack (NSURLSession on iOS, OkHttp on Android) persists
 * and replays them. Nothing here reads or stores a token itself.
 *
 * This app is a client. It holds no service secret and never calls an `/internal/*` route.
 */

export type StudioIntent = "website" | "reels" | "both";
export type ApprovalType = "release" | "call_batch" | "reel" | "social_campaign";

export type Account = {
  method: string;
  verified: boolean;
  displayName: string;
  sessionExpiresAt: number;
};

export type Project = {
  projectId: string;
  revisionId: string;
  intent: StudioIntent;
  source: "whatsapp" | "studio";
  createdAt: number;
  project: { businessName?: string; description?: string };
};

export type Approval = {
  approvalId: string;
  type: ApprovalType;
  checklist?: string;
  expiresAt: number;
  createdAt: number;
};

export class AxcasApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AxcasApiError";
    this.status = status;
  }
}

/** True when the server rejected the session and the app should return to sign-in. */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof AxcasApiError && error.status === 401;
}

/** Merchant-safe wording for failures the server did not describe in words they can act on. */
function fallbackMessage(status: number): string {
  if (status === 429) return "That was a lot of tries at once. Wait a moment, then try again.";
  if (status >= 500) return "Axcas is having trouble right now. Nothing you sent is lost — try again shortly.";
  return "That did not work. Try again.";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${AXCAS_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
    });
  } catch {
    throw new AxcasApiError(0, "Could not reach Axcas. Check your connection and try again.");
  }
  if (response.status === 401) throw new AxcasApiError(401, "Your session has ended. Sign in again to continue.");
  if (!response.ok) {
    // Only 4xx bodies are Worker-authored merchant-safe sentences ("Choose website, reels, or
    // both"). A 5xx body is platform text — Cloudflare answers "Internal Server Error" — and
    // showing it to a merchant is exactly the leak the WhatsApp guard exists to prevent.
    const detail = response.status < 500 ? (await response.text().catch(() => "")).trim() : "";
    throw new AxcasApiError(response.status, detail || fallbackMessage(response.status));
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function requestWhatsAppLink(intent: StudioIntent) {
  return request<{ whatsappUrl: string; expiresAt: number }>("/api/studio/link", {
    method: "POST",
    body: JSON.stringify({ intent }),
  });
}

/** Returns null while the merchant has not yet sent the WhatsApp message. */
export async function pollLinkStatus(): Promise<{ intent: StudioIntent } | null> {
  const response = await fetch(`${AXCAS_BASE_URL}/api/studio/link/status`, {
    method: "POST",
    credentials: "include",
    headers: { accept: "application/json" },
  });
  if (response.status === 202) return null;
  if (response.status === 410) throw new AxcasApiError(410, "That sign-in link expired. Start again.");
  if (!response.ok) throw new AxcasApiError(response.status, "Could not complete sign-in. Try again.");
  const body = (await response.json()) as { status: string; intent: StudioIntent };
  return body.status === "authenticated" ? { intent: body.intent } : null;
}

export function getAccount() {
  return request<{ authenticated: boolean; account: Account; projects: Project[] }>("/api/studio/me");
}

export function listApprovals() {
  return request<{ approvals: Approval[] }>("/api/studio/approvals");
}

export function decideApproval(approvalId: string, decision: "approved" | "denied") {
  return request<{ stage: string; siteUrl?: string; reelId?: string }>(`/api/studio/approvals/${approvalId}`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}

export function signOut() {
  return request<unknown>("/api/studio/logout", { method: "POST" });
}
