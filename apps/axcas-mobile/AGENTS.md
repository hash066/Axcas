# AGENTS.md — Axcas mobile

The repository root `AGENTS.md` applies here in full: the non-negotiable architecture, the
capability separation, the evidence rules, and the prohibition on presenting mocks or local-only
results as live proof. Nothing in this file relaxes any of it.

## Expo

Expo 57 changed substantially. Read the exact versioned documentation at
https://docs.expo.dev/versions/v57.0.0/ before writing code here, and do not carry over patterns
from older SDKs from memory.

## Why this app exists

Shipaton's rules require that "Apps must be built for iOS, iPadOS, macOS, or Android". The Axcas
product is a Cloudflare Worker plus a WhatsApp webhook, which is ineligible on its own. This app
is the merchant-facing mobile surface — sign-in, projects, approvals, site preview — and it is
where the RevenueCat SDK gates paid capability.

## Boundaries

- This app is a client. It holds no service secret, never calls Convex directly, and never calls
  a `/internal/*` route. It talks only to the public and session-authenticated Worker routes.
- Authentication reuses the existing WhatsApp link flow (`POST /api/studio/link`, then
  `/api/studio/link/status`). Do not invent a second identity system.
- Approval buttons here carry the same weight as the WhatsApp ones: they approve one exact
  version. Never batch, pre-approve, or re-send an approval the merchant did not tap.
- Merchant-facing copy obeys the same rule as WhatsApp: no internal vocabulary, no raw
  identifiers, no slugs, no hashes. See `packages/whatsapp-io/src/merchant-language.ts`.
