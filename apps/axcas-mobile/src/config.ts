/**
 * The deployed Axcas Worker this app talks to.
 *
 * Kept as a plain constant rather than read from `app.json` so the value is obvious in the
 * repository and easy to point at a local `wrangler dev` tunnel while developing. It must stay
 * HTTPS: the session cookie is marked Secure, so a plain-http origin silently drops it.
 */
export const AXCAS_BASE_URL = "https://proofgate-whatsapp-growth.proofgate-harshita.workers.dev";

/** How often the sign-in screen asks whether the WhatsApp link has been claimed yet. */
export const LINK_POLL_INTERVAL_MS = 1_800;

/** The link code expires server-side after ten minutes; stop polling a little before that. */
export const LINK_POLL_TIMEOUT_MS = 9 * 60_000;
