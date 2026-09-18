# ProofGate Build Bible

Status: AWS-native production redesign in implementation; external acceptance incomplete
Primary track: AI as Agency  
Product category: self-verifying launch agency  
MVP vertical: one-page workshop, event, booking, or lead page  
Primary operator surface: WhatsApp Business Cloud through Hermes
Build window: continuous production hardening

## 2026-09-18 approved AWS-native production amendment

Axcas is India-first and uses production number `+91 91804 99647` after that unused SIM is
registered and OTP-verified in the Axcas WABA. Until Meta returns a production Phone Number ID
and an unallowlisted second-phone test succeeds, the number is configuration intent rather than
live evidence. Customers never provide provider API keys. They connect their own Instagram
Professional account, Facebook Page, and optional Ad Account through one server-side Meta OAuth
flow; Axcas stores only a KMS-encrypted token reference in durable product state.

The replacement control plane is AWS-native: API Gateway/WAF verifies public ingress, FIFO SQS
absorbs WhatsApp and campaign work, Step Functions owns durable workflow transitions, redundant
Fargate tasks run Hermes/Strands/FFmpeg, and deterministic Lambdas retain verification, approval,
release, rollback, posting, and spend authority. DynamoDB separates mutable tenant state from the
append-only ledger. KMS-encrypted S3 stores private assets, versioned static sites, renders, and
evidence; CloudFront serves published sites, Amplify serves Studio, Cognito provides WhatsApp-
backed passwordless identity, EventBridge schedules measurements, and CloudWatch/SNS report
operational failures. The existing Cloudflare/Convex service remains unchanged until this stack
passes acceptance and must not be called migrated before then.

`SiteSpecV3` adds structured section order and theme/layout tokens while preserving the rule that
agents never generate or patch page code. A deterministic renderer writes one immutable versioned
artifact and one S3-versioned current alias only after an independent verification receipt and an
authenticated exact-hash release approval agree. Studio remains a structured visual editor over
the same project revision stream, not a blank-canvas code editor.

Reel campaigns contain exactly three supplied-media variants testing hook, cover, and CTA. Drafting
and preview generation are reversible. One campaign approval binds the exact assets, captions,
schedule, target area, duration, placements, and optional INR 300–2,000 merchant-funded spend cap.
That approval may authorize deterministic scheduled publication and measurement; it never permits
unbounded autonomous posting. Instagram Trial Reels are enabled only after the connected account
passes an official provider capability test. Otherwise Axcas reports the limitation and publishes
a normal Reel if that was approved.

Paid campaigns are restricted to non-sensitive India beta businesses, adults 18+, a merchant-
selected 5–25 km area, automatic placements, and a three-day lifetime budget. Provider resources
are created paused. Deterministic code activates them only after approval and stops at the bound
ceiling. Raw organic/paid denominators are stored before scoring. A tenant-specific learning
artifact requires three adequate comparable variants; insufficient evidence never produces a
winner. The next draft may use the prior result with 10–20% exploration but requires a new approval
before any further post or spend.

The free beta provides one site, three Reel previews, one final organic/eligible Trial Reel post,
and one optional merchant-funded paid experiment under enforced usage quotas. Vapi remains disabled
for ordinary beta merchants until live recording-consent yes/no and do-not-call paths pass and
India calling readiness is independently cleared.

## 2026-08-18 approved Product Hunt scope amendment

### 2026-08-19 owner-authorized motion-template source

The owner explicitly authorized direct use of `gdpranavl/YouLeft_KumarKindaTemplates`.
Axcas pins source commit `ed8d037f7b35e0cc971521801df07e0edf69828c` and adapts its five
Remotion compositions behind the validated `ReelStyleProfileV1` boundary. Creator-specific
sample identity and placeholder B-roll are excluded. Render inputs resolve only to the
merchant assets selected in the immutable profile; agents still cannot emit or patch runtime
page or renderer code.

WhatsApp remains the fastest merchant surface, but it is no longer the only surface.
Axcas also provides a guided customer-facing web Studio that begins with exactly one
choice: Website, Reels, or Both. Studio access is passwordless and bound to a short-lived
browser nonce claimed by a Meta-signed WhatsApp sender; customers never provide cloud,
storage, model, or social-provider credentials. Project revisions and supplied reference
media stay tenant-scoped and private.

The Studio is not a free-form HTML/code generator or an operator dashboard. It edits
validated project data, one of five code-owned `SiteSpecV2` layouts, and structured reel
style profiles with bounded layers. Agents still never emit or patch page code. The five
initial reel formats are kinetic hook, split explainer, face + proof, visual breakdown,
and comment/review reveal. Recommendations must be human-led and based on dated platform,
category, merchant-media, or merchant-performance signals; “AI-generated” is not a
creative format. Reference reels may inform pacing, palette, and composition but never
authorize copying another creator's footage, face, voice, identity, branding, or exact
expression.

Every high-impact approval is presented as one plain-language checklist for the exact
immutable scope. Website publication remains one approval after verification. One final
reel render, one consented call batch, and one exact three-variation social experiment
remain separate approvals. Hosting, storage, rendering, and provider integrations are an
Axcas-operated package. Existing verifier, release, append-only, consent, and truthful-
evidence rules are unchanged; automatic social posting remains gated on its separate
provider acceptance.

## 2026-08-13 approved SME scope amendment

ProofGate serves English-speaking small businesses, starting with constrained types:
home bakery, tailor, tutor, salon, home service, retailer, and `other`. The merchant
does not select a template or complete a form. Hermes infers the type from one natural
WhatsApp bundle containing any available voice note, text, offerings, prices, area,
and real photos. It may ask at most one consolidated follow-up for all facts required
to publish; it must not run a one-question-at-a-time interview.

The merchant receives one verified preview and makes one exact release decision.
Routine reversible extraction, asset ingestion, drafting, verification, reporting,
and improvement analysis continue under the persisted decision policy. The existing
capability-separated release, evidence, consent, reel, and call rules remain unchanged.
This is a constrained SME site system, not a free-form website builder.

## 2026-08-06 approved scope amendment

The current P0 vertical is one English home bakery operated entirely through WhatsApp voice notes, photos, text, and signed approval buttons. Hermes `v0.18.2` performs multimodal intake, memory, structured content, reel strategy, and monitoring, but crosses into product state only through the typed `proofgate` command boundary. Cloudflare owns Meta webhook authentication, tracked public routes, private R2 delivery, and the `workers.dev` site; Convex remains durable state.

Merchant interaction uses one append-only `DecisionPolicyV1`, normally `fast_pilot`. Deterministic policy allows reversible intake, drafting, candidate creation, verification requests, reel-angle drafting, metrics, and improvement proposals without repeated confirmation. Release, final reel rendering, and each immutable call batch still require their exact signed approval. Lead scraping, payments, auto-posting, and synthetic product-media publication are always denied. A policy change appends a version that names the policy it supersedes.

The release path remains immutable and capability-separated. Builder output is `BusinessBriefV1`, `SiteSpecV2`, or an allowlisted candidate; it cannot set green. Merchant approval binds an exact hash. Calls are limited to supplied, non-revoked, purpose-consented India/US leads and one attempt per approved batch. A two-member Vapi squad asks recording consent before any recording. Reels use supplied assets, AWS Polly (Kajal, Aditi fallback), and FFmpeg; they are returned on WhatsApp and never auto-posted. No dashboard, payments, lead scraping, synthetic product imagery, or unapproved publishing is in P0.

Where later sections refer to Telegram booking, ElevenLabs, Dodo, or general verticals, this amendment governs implementation priority. The underlying verifier/release/evidence rules remain mandatory.

This document is both the product specification and the execution brief for Hermes. Treat MUST, MUST NOT, and Definition of Done statements as acceptance criteria. Build the smallest complete proof loop before adding polish.

---

## 0. Instruction to Hermes

Build ProofGate from the current repository, preserving correct completed work. Do not restart ideation and do not broaden the product into a generic website builder or generic on-call engineer.

Execution rules:

1. Inspect the installed Hermes version and available tools before coding. Map actual Hermes interfaces for Telegram, delegation, cron, browser, skills, messaging, and memory. Do not invent SDK calls.
2. Isolate Hermes-specific calls behind an adapter or project skill so the product domain does not depend on undocumented APIs.
3. Use one constrained, production-quality site renderer. Agents modify validated structured data only.
4. Use real Cloudflare URLs and real external events. A mock, sandbox-only surface, teammate payment, or fake webhook must never be presented as production evidence.
5. Separate builder, verifier, and release authority by capabilities, not merely by names.
6. Only deterministic policy code may turn a Proof Passport green.
7. Preserve failures. Never delete failed runs to improve the success rate.
8. Keep a live evidence ledger while building. Every rubric claim must point to an inspectable URL, database row, trace, provider request ID, or dashboard.
9. Make irreversible or high-risk actions explicit. Price, payment recipient, refund policy, public factual claims, and outbound calls require the appropriate guardrail.
10. If a provider is unavailable, use the truthful fallback documented here and mark the missing proof. Never simulate a partner integration.
11. Do not place PSTN calling on the critical path. Generated voice confirmations and asynchronous buyer voice notes are core; outbound calls are stretch.
12. Stop feature work when the Definition of Done passes across three real external runs.

Required working documents created during implementation:

- README.md
- .env.example
- EVIDENCE.md
- DEMO_RUNBOOK.md
- docs/architecture.md
- docs/privacy-and-consent.md
- docs/provider-evidence.md

---

## 1. Final product decision

### Name

ProofGate

### Category line

The independent release authority for AI-built buyer journeys.

### One-sentence pitch

A merchant sends a voice note and photographs; ProofGate builds the selling page, converts the merchant or buyer intention into an executable contract, and refuses to release the page until an independent verifier completes the journey and a real payment, booking, or delivered lead proves it works.

Confirmation delivery and acknowledgment may be required clauses inside any of those three contracts, but they are not a fourth top-level contract type.

### The continuing promise

After release, Hermes cron replays safe buyer contracts. A reproducible regression revokes the public Proof Passport and triggers a bounded repair or rollback. The passport returns to green only after exact replay succeeds again.

### What the customer buys

The customer is not buying generated HTML. The customer is buying an automated, evidence-backed launch and continued buyer-path monitoring.

### The atomic novelty

ProofGate compiles an open-ended buyer intention and an observed failure into a permanent executable transaction contract that governs future production releases.

Example intention:

> I need to book two Saturday seats on mobile, receive a confirmation in Telegram, and know the seller received the booking.

ProofGate turns that sentence into:

- A versioned browser journey
- Deterministic UI assertions
- An external event predicate
- A confirmation-delivery predicate
- A permanent regression case
- A release-blocking rule
- A redacted evidence chain on the Proof Passport

The builder cannot approve its own work. The verifier cannot change the page. The release authority cannot generate or repair content.

---

## 2. Why this wins and why it is not a wrapper

### It is not Website in WhatsApp

A chat website builder stops when the site exists. ProofGate treats generated site creation as the first ten percent of the job. The product is the release gate, exact replay, external witness, revocable passport, and continuing repair loop.

### It is not prompting Claude, GPT, v0, or Lovable

Those systems generate candidates. ProofGate owns durable production state, capability-separated verification, real provider events, version history, promotion policy, rollback, recurring monitors, consent, and a growing regression suite derived from real failures.

### It is not On-Call Autopilot

Generic on-call repair is unbounded and difficult to prove in eight hours. ProofGate operates only on sites produced by its controlled renderer and only through validated SiteSpec patches. It fixes business-semantic buyer failures, not arbitrary repositories.

### It is not a conversion claim

ProofGate does not claim statistically significant conversion uplift from one buyer. Its claim is narrower and objectively testable:

> This exact Buyer Contract passed against this exact site version at this time using this external event.

### It is not a decorative badge

The Proof Passport is derived from authoritative state. It can turn amber or red after release. No operator or model can manually assign green.

---

## 3. Product boundaries

### P0: must build

- Telegram merchant intake through Hermes
- Text, image, and voice-note brief
- One polished transactional page template
- Immutable SiteSpec versions
- Production and canary version pointers
- Restricted Buyer Contract DSL
- Deterministic Hermes-hosted Node/Playwright executor
- Builder, verifier, and release-authority separation
- One guaranteed failure family: QUANTITY_UNSUPPORTED
- Failure to incident to a predefined quantity-repair capability instance to validated patch
- Exact replay
- Signed booking session plus external merchant or buyer acknowledgment
- ElevenLabs generated voice confirmation
- Convex authoritative state, minimal trace, eval, evidence, and passport
- Cloudflare public site, preview, API, and passport
- Minimal operator controls: status, retry, pause, and rollback

### P1: build after the complete loop is green

- Linkup claim verification that changes publication behavior
- Hermes cron guardian
- Buyer voice-note feedback and complaint-to-contract flow
- Dodo live checkout for ProofGate Guardian product access; required for the planned Revenue bonus, optional for the core AI-as-Agency loop
- Automated day-two voice feedback request
- Search, run diff, and actual failure or cost alert
- A genuinely runtime-created specialist role absent at kickoff for the L5 organisation stretch
- Read-only analytics and referral attribution
- Full control room and judge evidence index
- Three real external runs and an honest success denominator
- One additional contract type beyond the first

### P2: last-priority stretch

- Exception-triggered Customer Witness phone call
- WhatsApp transport
- Multiple page themes
- Merchant-owned Dodo account onboarding
- Advanced role-builder UI

### Explicit non-goals

- Arbitrary website or repository repair
- Arbitrary HTML, JavaScript, CSS, or Worker code generation
- Multi-page sites
- CMS, blog, SEO suite, or custom domains
- General ecommerce or inventory
- Fifty-agent load-test theatre
- Customer acquisition automation
- Automatic phone calls after abandonment
- Automatic real purchases by agents
- Security, accessibility, or conversion certification beyond the exact tested contract

---

## 4. Voice Evidence Ladder

Voice is part of the proof loop, but each level has a different reliability and consent profile.

### Level 1: generated Voice Confirmation, core

After a verified payment, booking, or delivered lead, ProofGate creates a short ElevenLabs voice note using only confirmed event fields.

Example:

> Thanks, Aisha. Two seats for Saturday are confirmed. Your reference ends in 42K. Reply here if anything is wrong.

Rules:

- Maximum twenty seconds
- No invented facts
- No full payment identifiers
- No sensitive buyer details beyond what is necessary
- Store provider request ID, exact text, audio hash, duration, cost, and platform message ID
- Record sent or dispatched after the messaging API accepts it
- Record acknowledged only after an explicit reply or button action
- A failed required voice delivery keeps that assertion failed
- Linking Telegram is not consent. Before linking, obtain an affirmative transactional-voice opt-in against a stored disclosure version.

Telegram bots cannot initiate a conversation with an unknown user. The checkout or booking page must first ask the buyer to link the bot through a short-lived one-use deep link containing no PII.

### Level 2: asynchronous Buyer Voice Witness, core

An opted-in buyer can reply with a voice note explaining a failure or confirming a concern.

Flow:

1. Verify the witness token and consent purpose.
2. Present a separate voice-processing disclosure and obtain affirmative consent.
3. Receive a short voice note.
4. Transcribe it through the configured approved provider.
5. Extract intended outcome, observed behavior, expected behavior, and reproduction detail.
6. Separate machine-verifiable claims from subjective feedback.
7. Compile only supported, machine-verifiable claims into a Buyer Contract.
8. Store subjective feedback as insight, not as a release blocker.
9. Escalate disputes, safety issues, legal complaints, or unsupported requests.
10. Notify the customer after resolution only when follow-up consent permits.

### Level 3: scheduled Voice Feedback Ask, core after P0

Hermes cron sends a short generated voice note to opted-in prior buyers:

> Did your booking and confirmation work as expected? Reply by voice or text if anything was unclear.

Rules:

- Separate feedback consent from transactional confirmation consent
- Respect timezone and quiet hours
- Maximum one request per transaction
- Provide a clear stop or opt-out command
- Mark manual cron triggers as manual
- Preserve the scheduled-run ID and delivery result

### Level 4: outbound Customer Witness call, stretch only

Operator command:

    /call-witness customer=last_failed objective="why could they not complete checkout?"

The command is accepted only when:

- Explicit AI-call consent exists
- Recording consent exists when recording is enabled
- The buyer is an adult under the applicable policy
- Timezone and quiet hours permit contact
- No call has already occurred for the incident
- The buyer has not opted out
- Maximum duration is two minutes
- Maximum questions is three
- The call objective is tied to a real incident

The agent must disclose that it is AI and whether the call is recorded. A call can propose a Buyer Contract, but cannot itself mark a contract passed.

Do not contact a person merely because a checkout appears abandoned.

---

## 5. Core lifecycle and state machine

### Primary state flow

~~~text
INTAKE
→ BRIEF_READY
→ SPEC_CREATED
→ CANARY_READY
→ CONTRACTS_READY
→ VERIFYING

VERIFYING
→ PASSED
→ WAITING_EXTERNAL_EVENT
→ WAITING_REQUIRED_CONFIRMATION
→ PROMOTABLE
→ PRODUCTION
→ MONITORED

VERIFYING
→ FAILED
→ INCIDENT_OPEN
→ SPECIALIST_CREATED
→ PATCH_PROPOSED
→ PATCH_VALIDATED
→ CANARY_READY
→ VERIFYING

MONITORED
→ REGRESSION_SUSPECTED
→ CONFIRMATION_REPLAY
→ HEALTHY
   or
→ INCIDENT_OPEN
→ ROLLED_BACK
→ ROLLBACK_VERIFIED
~~~

### Product sequence

~~~mermaid
flowchart LR
    T["Telegram brief"] --> M["Hermes Launch Manager"]
    M --> B["Brief and claim processing"]
    B --> S["Immutable SiteSpec"]
    S --> C["Cloudflare canary"]
    M --> K["Buyer Contract compiler"]
    K --> V["Write-disabled verifier"]
    V -->|fail| I["Incident"]
    I --> R["Runtime specialist"]
    R --> P["Validated JSON patch"]
    P --> C
    V -->|pass| E["External witness"]
    E --> Q{"Confirmation required?"}
    Q -->|yes| VR["ElevenLabs voice confirmation"]
    VR --> TG["Telegram buyer message"]
    TG --> A["Deterministic release authority"]
    Q -->|no| A
    A --> L["Production"]
    L --> G["Hermes cron guardian"]
    G --> V
    A --> PP["Proof Passport"]
~~~

When the Buyer Contract requires voice or Telegram confirmation, the external event alone is insufficient: confirmation must be freshly generated and dispatched before promotion. When confirmation is not a blocker, release authority may promote after the other predicates pass and send the receipt as a post-release transactional message. The trace must show which policy applied.

### Passport states

- Gray: no certified production release
- Amber: canary proving, external witness pending, guardian stale, or first transient failure
- Green: current production version passed every blocker and the required external witness exists
- Red: confirmed production regression or blocker failure

Passport state is projected from underlying data. No write endpoint may set a color directly.

Projection precedence:

1. No production pointer: gray.
2. Confirmed blocker failure targeting the current production version: red.
3. Unconfirmed current-version failure, stale guardian, canary in progress, or witness pending: amber.
4. Every current blocker, required confirmation, approval, and witness predicate passes: green.

Incidents targeting superseded versions remain visible in history but do not keep a successfully restored current production version red.

---

## 6. Hard architecture decisions

1. Deploy one multi-tenant Cloudflare runtime, not one Pages project per merchant.
2. Store each merchant page as immutable structured SiteSpec data.
3. Model canary and production as atomic version pointers in Convex.
4. Render stable semantic handles such as data-pg attributes.
5. Compile buyer intentions into a restricted DSL, never free-form browser instructions.
6. Let agents propose patches only as allowlisted JSON Patch operations.
7. Validate, sanitize, hash, and persist every new version.
8. Use a deterministic policy function for promotion and rollback.
9. Use append-only trace events and evidence artifacts.
10. Never let a verifier receive deployment, mutation, payment, or promotion credentials.
11. Never let a builder submit verification evidence.
12. Pin every run to the exact manifest hash it evaluated.
13. Use real event signatures and idempotency; do not trust redirect parameters.
14. Treat payment, fulfillment, message dispatch, and customer acknowledgment as separate predicates.
15. Store business state in Convex. Use Hermes memory for compact operational lessons, not raw customer PII.

### Where the verifier runs

Playwright does not run inside the Cloudflare Worker.

The deterministic contract runner is a Node/Playwright process on the Hermes host:

1. The Launch Manager asks Convex for a one-time evidence token.
2. Hermes delegates a verifier task with no builder, deploy, payment, or release credentials.
3. The verifier receives only the public canary URL, validated contract, non-secret fixtures, and scoped evidence token, then invokes apps/verifier-runner.
4. The runner uploads typed step observations and evidence through the scoped token.
5. Convex derives assertion and run status server-side.
6. Cloudflare only serves the site, preview, proof page, and edge event endpoints.

Guardian cron invokes the same Hermes-hosted runner. If Playwright is unavailable, use the installed Hermes browser adapter through the same DSL and evidence contract; never move arbitrary browser execution into the Worker.

The verifier process receives no Convex admin credential, Cloudflare token, Dodo API key, patch capability, promotion capability, or generic production mutation secret.

---

## 7. Recommended stack and repository

### Technology

- TypeScript
- pnpm workspaces; use npm workspaces if pnpm is unavailable
- Convex
- Hono on Cloudflare Workers
- Vite and React for the control room
- Zod for all domain schemas
- RFC 6902 JSON Patch
- Vitest
- Playwright for the deterministic contract runner
- Hermes Telegram gateway, delegation, skills, cron, browser, messaging, and memory
- ElevenLabs for generated voice confirmation and optional approved voice processing
- Linkup for live public claim verification
- Dodo for ProofGate product checkout and signed webhook evidence
- Cloudflare R2 for merchant images, generated audio, and private evidence artifacts when available
- PostHog, Datafast, Plausible, or GA4 for read-only traffic evidence

### Repository layout

~~~text
proofgate/
├─ apps/
│  ├─ control-room/
│  │  ├─ src/pages/
│  │  ├─ src/components/
│  │  └─ src/lib/
│  ├─ edge-runtime/
│  │  ├─ src/index.ts
│  │  ├─ src/routes/site.ts
│  │  ├─ src/routes/preview.ts
│  │  ├─ src/routes/proof.ts
│  │  ├─ src/routes/events.ts
│  │  ├─ src/routes/checkout.ts
│  │  └─ src/render/
│  └─ verifier-runner/
│     ├─ src/cli.ts
│     ├─ src/execute-contract.ts
│     └─ src/upload-evidence.ts
├─ convex/
│  ├─ schema.ts
│  ├─ http.ts
│  ├─ sites.ts
│  ├─ versions.ts
│  ├─ contracts.ts
│  ├─ runs.ts
│  ├─ incidents.ts
│  ├─ releases.ts
│  ├─ passports.ts
│  ├─ guardian.ts
│  ├─ witnesses.ts
│  ├─ trace.ts
│  └─ providers/
├─ packages/
│  ├─ domain/
│  ├─ renderer/
│  ├─ contract-runner/
│  ├─ release-policy/
│  ├─ provider-adapters/
│  └─ agent-tools/
├─ hermes/
│  ├─ skills/proofgate/SKILL.md
│  ├─ agents/
│  └─ scripts/
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  ├─ e2e/
│  └─ fixtures/
├─ docs/
├─ EVIDENCE.md
├─ DEMO_RUNBOOK.md
├─ .env.example
├─ package.json
└─ README.md
~~~

### Cloudflare routes

- GET /s/:slug — render the current production manifest
- GET /preview/:token — render one immutable canary version
- GET /proof/:slug — public Proof Passport
- GET /judge — private or token-protected judge evidence index
- POST /events/:slug/lead — accept a signed buyer-session submission; this alone records submitted, not delivered or acknowledged
- POST /events/:slug/booking — accept a signed buyer-session submission; this alone records submitted, not delivered or acknowledged
- GET /checkout/:slug — create or resolve only a genuinely merchant-owned checkout reference
- GET /buy-guardian — create the separate ProofGate Guardian product checkout
- POST /api/evidence — append verifier evidence using a one-time scoped token

Booking and lead endpoints must use a short-lived buyer-session nonce bound to site, version, contract, allowed action, expiry, and CSRF/session identity. A public POST that merely creates a Convex row is not an external witness.

Lifecycle:

1. submitted — valid signed buyer-session request reached the server
2. delivered — the system sent the booking or lead to the merchant's previously bound Telegram identity and received a platform message ID
3. acknowledged — the merchant or buyer acted through a signed acknowledgment button or authenticated reply

The Buyer Contract must name the exact required level. Release policy may not treat submitted as delivered or acknowledged.

Cloudflare caching rules:

- Resolve mutable slug-to-production pointers with no-store or a very short TTL.
- Cache immutable manifests by version hash with a long immutable policy.
- Purge or invalidate the slug response on promotion and rollback.
- Preview tokens are signed, expiring, and bound to site, version, and spec hash.

### Convex HTTP routes

- POST /webhooks/dodo
- POST /webhooks/elevenlabs for call stretch only
- POST /edge/events using an HMAC from the Cloudflare Worker
- GET /edge/manifest using a server credential

Every webhook must verify the provider signature, deduplicate provider event IDs, tolerate retries and out-of-order delivery, store a redacted payload, store a payload hash, and correlate the event to a contract and site version.

---

## 8. Hermes integration

### Capability discovery spike

Before implementation, Hermes must record:

- Installed Hermes version
- Available Telegram gateway and configured home channel
- Whether incoming voice notes are transcribed and which provider is active
- Available delegation tool and concurrency
- Browser or terminal capabilities available to child agents
- Messaging method for sending a generated audio file
- Cron support and the exact skill/workdir configuration
- Built-in memory behavior
- Skill installation path or configured external skill directory

Save this matrix in docs/hermes-capabilities.md.

Time-box the Hermes boundary to thirty minutes. Use one thin hermes_io module plus the ProofGate skill scripts; do not build a generalized adapter framework. It only needs the concrete operations used by this product: receive intake, delegate a role, run the verifier, schedule guardian work, send a message or audio artifact, and append the resulting Hermes receipt.

### Project skill

Create a ProofGate skill in the repository and either:

- Install or symlink it into the active Hermes skills directory, or
- Add the repository skill directory to Hermes external skill directories.

The skill must teach Hermes:

- How to create and resume a mission
- How to read and write through typed ProofGate operations
- How to delegate restricted roles
- How to trigger verification
- How to interpret incidents
- How to propose structured patches
- How to request deterministic promotion
- How to send voice confirmations
- How to create and operate guardian cron
- Which actions require operator approval
- Which claims must never be made

### Delegation

The top-level Hermes Launch Manager owns all side effects. Child agents receive isolated context and the smallest toolset required.

Recommended child permissions:

- Brief Compiler: read brief and emit structured brief only
- Claim Verifier: web/Linkup access and claim-evidence append only
- Site Builder: SiteSpec proposal only
- Contract Compiler: renderer capability manifest and contract proposal only
- Verifier: browser or deterministic runner plus append-only evidence token
- Incident Analyst: read-only incident classification
- Runtime Specialist: one allowlisted patch proposal
- Customer Witness Agent: private transcript read and contract candidate output

No child agent may send customer messages, write shared Hermes memory, promote production, or access general service credentials.

### Dynamic role evidence

P0 instantiates a vetted quantity-repair capability after the failure. For the L5 organisation stretch, the manager must instead create a genuinely new role definition after the failure is discovered.

The role record contains:

- Runtime role name
- Creation timestamp after mission start
- Failure and incident that caused it
- Objective
- Allowed input artifacts
- Allowed patch paths
- Forbidden actions
- Model and prompt version
- Budget and maximum attempts
- Evidence required for completion

Example runtime role:

> two-seat-telegram-confirmation-specialist

This role is generated from the combined failure. It must not be a simple selection from a hardcoded role enum.

### Cron

Hermes cron sessions begin fresh. Attach the ProofGate guardian skill and explicitly set the repository workdir. Do not assume the current chat context or project instructions will be present.

Each guardian execution:

1. Queries due production sites.
2. Enqueues safe guardian-eligible contracts.
3. Runs a confirmation replay after the first failure.
4. Opens an incident only on a reproducible failure.
5. Sends an alert through the manager.
6. Never performs a real charge.
7. Records whether the trigger was scheduled or manual.

### Memory

Use three layers in product decisions:

- Now: current brief, contract, version, incident, evidence, and pending action
- User history: merchant brand, earlier edits, customer purchases, prior complaints, consent, and contact history
- Policy: claim rules, release requirements, spend limits, contact limits, risk approvals, and escalation rules

Convex is authoritative for these layers. Hermes memory may retain concise workflow lessons and environment facts. Never place raw transcripts, phone numbers, emails, or payment identifiers in global Hermes memory.

---

## 9. Domain model

### SiteSpec

Agents never emit page code. They create or patch this validated manifest:

~~~ts
type SiteSpec = {
  schemaVersion: 1;
  siteId: string;
  business: {
    name: string;
    tagline?: string;
    description: string;
    timezone: string;
    contact: {
      phone?: string;
      email?: string;
      telegram?: string;
    };
  };
  theme: {
    preset: "clean" | "warm" | "bold";
    accent: string;
    radius: "small" | "medium" | "large";
  };
  hero: {
    headline: string;
    subheadline: string;
    imageAssetId?: string;
  };
  cta: {
    label: string;
    enabled: boolean;
    stickyOnMobile: boolean;
    style: "solid" | "outline";
  };
  offer: OfferSpec;
  confirmation: {
    buyerChannels: Array<"email" | "telegram" | "whatsapp">;
    merchantChannels: Array<"email" | "telegram">;
    message: string;
    voiceRequired: boolean;
  };
  claims: Array<{
    text: string;
    category: "identity" | "hours" | "location" | "superlative" | "regulated" | "other";
    requiredForRelease: boolean;
    decision: "verified" | "merchant_supplied_allowed" | "rejected";
    sourceUrl?: string;
    sourceSnapshotHash?: string;
    verifiedAt?: number;
  }>;
  policies: {
    refund?: string;
    cancellation?: string;
    fulfillment?: string;
  };
  proofBadge: {
    enabled: boolean;
    passportSlug: string;
  };
};

type BaseOffer = {
  title: string;
  description: string;
  quantity: {
    enabled: boolean;
    min: number;
    max: number;
    default: number;
  };
  fields: Array<{
    id: string;
    label: string;
    type: "text" | "email" | "phone" | "select";
    required: boolean;
    options?: string[];
  }>;
};

type OfferSpec =
  | (BaseOffer & {
      kind: "booking";
      booking: {
        timezone: string;
        slots: Array<{ id: string; startsAt: string; capacity: number }>;
      };
    })
  | (BaseOffer & {
      kind: "lead";
      lead: {
        merchantDestinationRef: string;
        acknowledgmentRequired: boolean;
      };
    })
  | (BaseOffer & {
      kind: "payment";
      payment: {
        currency: "INR" | "USD";
        unitAmount: number;
        merchantOwnedProviderRef: string;
      };
    });
~~~

P0 permits only the booking branch. Lead and merchant-owned payment branches are P1 extensions. The ProofGate Guardian subscription is a separate product flow and is not stored in a merchant SiteSpec.

merchant_supplied_allowed is permitted only for safe self-reported facts such as a merchant's own description or stated preference. Superlatives, regulated claims, and release-critical public facts must be verified or removed.

### Stable renderer handles

The renderer must expose stable handles:

~~~html
<button data-pg="primary-cta">Book now</button>
<input data-pg="quantity" />
<input data-pg="buyer-name" />
<input data-pg="buyer-email" />
<a data-pg="telegram-link" />
<section data-pg="confirmation" />
~~~

Contracts reference handles, not CSS selectors or page text.

### Buyer Contract DSL

~~~ts
type BuyerContract = {
  schemaVersion: 1;
  siteId: string;
  objective: string;
  source: {
    kind:
      | "merchant_brief"
      | "operator"
      | "browser_failure"
      | "customer_voice_note"
      | "customer_call";
    refId: string;
  };
  severity: "blocker" | "warning";
  persona: {
    viewport: "mobile" | "desktop";
    locale: string;
  };
  steps: ContractStep[];
  assertions: ContractAssertion[];
  timeoutMs: number;
};
~~~

After validating a contract, deterministic server code derives a GuardianProfile containing only non-mutating steps and assertions. The compiler cannot label its own work guardian-eligible. Certification clauses may include human payment, booking, fulfillment, or acknowledgment; guardian clauses may only inspect current reachability and non-charge plumbing. Guardian results update health but never replace the original real witness or mark a certification contract newly passed.

Supported steps:

- Open a ProofGate-owned route
- Assert a known handle
- Fill a known handle with a fixture
- Select an allowlisted option
- Set quantity
- Click a known handle
- Await an allowlisted destination
- Await a correlated external event
- Pause at a declared human payment checkpoint

Supported assertions:

- Handle visible, enabled, equals, or contains
- Expected navigation reached
- Payment succeeded
- Booking created
- Lead delivered
- Confirmation dispatched
- Voice confirmation dispatched
- Customer acknowledged

Compiler rules:

- Reject unknown handles and operations
- Reject non-ProofGate origins and private network targets
- Reject unsupported goals
- Never invent selectors
- Never turn subjective feedback into a blocker
- Store the original intention beside the compiled contract
- Mark uncertainty as inconclusive and ask one clarification
- Version contracts immutably
- Prevent builders from deleting or weakening blocker contracts
- Never let the model choose guardian eligibility; server policy derives a safe probe subset

### Structured patch

~~~json
[
  {
    "op": "replace",
    "path": "/offer/quantity/enabled",
    "value": true
  },
  {
    "op": "replace",
    "path": "/offer/quantity/max",
    "value": 10
  },
  {
    "op": "add",
    "path": "/confirmation/buyerChannels/-",
    "value": "telegram"
  }
]
~~~

Patch service:

1. Verify role path permissions.
2. Apply patch to an immutable parent.
3. Validate the entire SiteSpec.
4. Sanitize text and URLs.
5. Enforce price and policy approval requirements.
6. Compute a canonical SHA-256 hash.
7. Persist a new candidate version.
8. Never overwrite a previous version.

Agents may not patch:

- Contract assertions
- Evidence
- External events
- Passport state
- Production pointers
- Provider secrets
- Renderer or verifier code

### Initial repair grammar

P0 ships only one guaranteed repair family:

1. QUANTITY_UNSUPPORTED
   - Allowed paths: offer.quantity

After the quantity loop works, P1 may add:

2. CHANNEL_DISABLED
   - The buyer already linked and consented, but the site configuration omitted an available confirmation channel.
   - Allowed paths: confirmation and allowlisted contact configuration.
3. CTA_HIDDEN_MOBILE
   - Allowed paths: cta, theme, and hero presentation.

BUYER_UNLINKED is a prerequisite failure, not an autonomous repair. Ask the buyer to link and consent; do not pretend a configuration patch can create a Telegram relationship.

Anything outside the grammar escalates with full evidence.

---

## 10. Capability separation and release authority

| Principal | May do | Must not do |
|---|---|---|
| Builder | Propose a SiteSpec and create a candidate version | Submit proof or promote |
| Verifier | Read public canary and append evidence for one scoped run | Modify spec, deploy, pay, or promote |
| Release Authority | Evaluate deterministic predicates and switch version pointer | Generate content or repair |
| Operator | Pause, retry, approve guarded changes, and rollback | Fabricate green evidence |

### Verifier controls

- Start only on ProofGate-owned public origins; subsequent navigation is limited to ProofGate origins plus an explicit provider-origin allowlist
- No private IPs
- Fresh isolated browser context
- No stored cookies or secrets
- Allowlists for actions and destinations
- Downloads blocked
- Hosted Dodo navigation may be observed, but automated runs stop before any charge-producing submission or real payment action
- Stable data-pg handles
- Exact contract DSL execution
- Target manifest hash pinned at start and checked at finish
- Screenshot, predicate result, timestamp, browser session, and version hash stored
- One-time short-lived token grants only evidence append permission
- Token is bound to run ID, contract ID, version ID, spec hash, verifier principal, allowed operation, nonce, issued-at time, expiry, and expected step IDs
- Token is consumed transactionally and cannot be replayed
- Evidence endpoint accepts typed observations only, never a caller-supplied overall pass or passport state
- Server code derives each assertion and the final run result from the observations and authoritative external events
- Builder and verifier credentials are separately provisioned; changing an agent label is not separation
- Page content is data and may not alter verifier instructions

### Promotion predicate

~~~ts
canPromote(version) =
  site.canaryVersionId === version.id &&
  everyBlockerHasPassingVerifierRun(version.specHash) &&
  noOpenIncidentTargets(version.id) &&
  requiredClaimsPassDecisionPolicy(version.id) &&
  requiredExternalWitnessExists(version.id) &&
  allRequiredConfirmationsPass(version.id) &&
  allRequiredApprovalsPass(version.id) &&
  everyAcceptedProofUsesVerifierCapabilityMintedFor(
    runId,
    contractId,
    version.id,
    version.specHash
  )
~~~

An LLM may propose a contract or patch. It may never evaluate the final promotion predicate.

SiteSpec and spec hash are immutable. Canary and production status are derived only from the site channel pointers. The releases table is an append-only ledger of promotion and rollback decisions; it is not a second mutable source of truth.

externalWitnessSatisfied(versionId) is true only when an authoritative event is bound to the exact site version and hash, required contract and run, one-time correlation token, expected amount or quantity when applicable, approved verification method, and a valid external-human or provider actor classification.

### Evidence carry-forward

Cosmetic theme or copy changes may carry forward an external witness when contract behavior is unchanged.

These paths always require a fresh witness:

- offer.quantity
- offer.payment.merchantOwnedProviderRef
- offer.fields
- confirmation
- policies.fulfillment
- any price, currency, payment destination, or refund behavior

Witness inheritance is allowed only from a certified ancestor after deterministic canonical-diff classification finds no critical path. Store witnessInheritedFromVersionId and the risk-classification record on the candidate version.

### Rollback

Rollback is an atomic pointer swap to the last certified version. After rollback, blocker contracts must replay before recovery is announced.

---

## 11. External event truth

### Truth table

| Observed fact | What may be claimed | What may not be claimed |
|---|---|---|
| Page returned HTTP 200 | Page responded | Buyer journey works |
| Hosted checkout opened | Checkout route is reachable | Payment succeeded |
| Success redirect appeared | Browser reached redirect | Payment cleared |
| Signed payment webhook matched | Payment predicate passed | Seller fulfilled |
| Message API returned success | Confirmation dispatched | Buyer read or acknowledged |
| Buyer replied or tapped acknowledgment | Buyer acknowledged | Buyer is satisfied |
| Signed booking form reached Convex | Booking submitted | Merchant received or accepted it |
| Bound merchant Telegram identity acknowledged | Merchant acknowledged booking | Payment or fulfillment occurred |
| Guardian reached hosted checkout | Current path remains reachable | A fresh real purchase occurred |
| Merchant page sold an item | Merchant revenue exists | ProofGate earned that revenue |

### Dodo requirements

- Create checkout sessions server-side.
- Attach contract ID, site version ID, expected quantity, expected amount, and correlation ID as supported metadata.
- Use a dedicated live webhook endpoint, live API client, and dedicated webhook secret.
- Verify the raw webhook body using the current official Dodo signature mechanism.
- Deduplicate using the provider event or webhook ID.
- Handle retries and out-of-order events.
- Do not trust an environment field supplied by the event. Trust the configured live endpoint, credential set, expected account/business identity, and a successful provider API retrieval.
- Retrieve the checkout or payment through the live Dodo API before green and match business/account, checkout or session, amount, currency, product, contract, and site version.
- Never trust query parameters, screenshots, page text, or model judgment.
- Keep payment and fulfillment predicates separate.
- Never allow the verifier to autonomously spend real money.
- A human external buyer completes a live payment.
- Describe a successful payment event as a processed live payment unless actual payout settlement is separately proven. It does not prove payout, seller receipt, entitlement delivery, or fulfillment.

For external merchants without their own integrated payment account, use a booking-created or lead-delivered witness. Do not route their revenue through the team's account and imply they received it.

For Revenue cross-track evidence, sell automated ProofGate Guardian product access. Do not count the merchant's own sale as ProofGate revenue.

The ProofGate Guardian product ID and correlation namespace must be distinct from every merchant Buyer Contract. A Guardian subscription payment can provision monitoring and prove ProofGate revenue; it cannot satisfy a contract such as buying two workshop seats.

---

## 12. Convex data model

### Identity and consent

- merchants
- customers
- consents
- contactLinks
- sessions

Consent record fields:

- Subject ID
- Purpose: transactional voice, feedback message, research call, recording
- Channel
- Granted or denied
- Source
- Disclosure version
- Timestamp
- Expiration when applicable
- Revocation timestamp

One consent purpose never implies another.

contactLinks contain only a token hash, site ID, version ID, customer ID, consent purpose, expiry, one-use flag, consumed timestamp, and the Telegram user ID after successful linking. Carry contactLinkId into booking or payment correlation. Never place PII inside the deep-link token.

### Site and release

- sites
- briefs
- mediaAssets
- siteVersions
- releases
- proofPassports
- guardianSchedules

Site fields include:

- Merchant
- Slug
- Status
- Canary version
- Production version
- Previous certified version
- Auto-repair setting
- Auto-rollback setting
- Created and updated timestamps

Site version fields include:

- Parent version
- Complete SiteSpec
- Canonical spec hash
- JSON Patch
- Risk class
- Actor and mission
- Created timestamp

### Contracts, runs, and incidents

- buyerContracts
- contractRuns
- runSteps
- incidents
- evalCases

buyerContracts are immutable executable definitions. evalCases reference a buyer-contract version and record addedAutomatically plus source failure. Every execution uses contractRuns with runKind certification, guardian, or eval. Do not create a second eval-run result model or a second denominator.

Every run records:

- Run and mission ID
- Run kind: certification, guardian, or eval
- Contract and version
- Site version and manifest hash
- Principal and browser session
- Correlation token
- Trigger: interactive, scheduled, or manual
- Status and failure code
- Start, end, and duration
- Tokens and cost
- Human intervention count
- Evidence IDs

### Agent and observability

- missions
- agentJobs
- runtimeRoles
- traceSpans
- alerts
- approvals
- promptVersions
- templateVersions

Every agent job and guardian run includes idempotencyKey, leaseOwner, leaseExpiresAt, heartbeatAt, attempt, and maxAttempts. Use a unique key shaped like siteId:versionId:operation:scheduleBucket so manual and scheduled triggers cannot duplicate repairs, receipts, events, or alerts.

Trace span fields:

- Event ID, run ID, parent ID
- Agent and runtime role
- Role, prompt, model, and template version
- Input and output summaries with private artifact references
- Start, end, duration, and status
- Input and output tokens
- Calculated cost
- Retry and error details
- Deployment, contract, payment, message, and call IDs

Approval records are site- and version-scoped, append-only, and include actor, permission, reason, field paths, expiry, and timestamp. Price, currency, payment recipient, refund or fulfillment policy, and risky or regulated claims require the configured approval before promotion.

### Events and evidence

- externalEvents
- evidenceArtifacts
- messages
- voiceConfirmations
- witnessSessions

External event fields:

- Provider
- Unique provider event ID
- Event type
- Site ID and required pre-release siteVersionId
- Nullable release ID, because the event usually arrives before promotion
- Contract, run, version hash, amount or quantity, and one-time correlation-token binding
- Verification method: provider_signature, edge_hmac, merchant_ack, or buyer_ack
- Verified timestamp and verifier identity
- Environment
- Actor class
- Redacted payload
- Full payload hash
- Occurred timestamp

actorClass external_human requires a previously bound non-team identity or a provider-verified purchaser identity. Team, test, synthetic verifier, duplicate, expired, and uncorrelated events cannot satisfy the real-witness predicate.

Evidence artifacts:

- Kind
- Private storage reference
- SHA-256 hash
- Redaction status
- Public summary
- Retention date

### Required indexes

- Merchant by Telegram user
- Site by slug and merchant
- Site versions by site and creation time
- Contracts by site and status
- Runs by site, contract, status, and correlation
- External events by provider event ID and correlation
- Incidents by site and state
- Agent jobs by status and priority
- Trace spans by mission and time
- Guardians by next run
- Customers by hashed contact, never public contact value

---

## 13. Agent organisation and contracts

### Launch Manager

Responsibilities:

- Read the exact merchant request
- Retrieve relevant memory and policy
- Generate a request-specific plan
- Delegate only necessary work
- Review outputs and request revisions
- Own all customer messaging and side effects
- Escalate blocked or risky actions with full context

Manager non-negotiables:

- Never allow builder self-certification
- Never promote from an LLM judgment
- Never convert subjective feedback into a release assertion
- Never exceed two repair cycles
- Never hide failed runs
- Never make a real charge

### Brief Compiler

Input:

- Merchant messages, transcript, images, identity, and prior brand memory

Output:

- Structured brief
- Missing fields
- Extracted public claims
- Risk flags

### Claim Verifier

Uses Linkup live search to:

- Verify public business facts when discoverable
- Attach source URL and timestamp
- Reject or soften unsupported superlatives
- Mark merchant-supplied facts honestly

The result must visibly change copy or publication status.

### Site Builder

Output:

- Complete SiteSpec
- Rationale
- Claimed capability list
- No page code

### Contract Compiler

Input:

- Original intention
- Current SiteSpec
- Renderer capability manifest
- Relevant policies

Output:

- Valid Buyer Contract DSL
- Unsupported clauses
- Clarification request when necessary
- No browser prose and no selectors outside the manifest

### Verifier

Input:

- Contract ID
- Immutable canary URL
- Version hash
- One-time evidence token

Output:

- Step results
- Screenshots
- External event observations
- Exact failing predicate
- No patch and no release recommendation

### Incident Analyst

Output:

- Deterministic failure family
- Evidence summary
- Repairable or escalate
- Proposed path permission envelope

### Runtime Specialist

Input:

- Incident
- Current SiteSpec
- Relevant memory
- Allowed patch paths
- One attempt budget

Output:

- One JSON Patch proposal
- Expected fixed assertions
- Risk class
- No direct mutation

### Customer Witness Agent

Input:

- Consented private transcript
- Browser evidence
- Existing contracts and customer history

Output:

- Exact intended outcome
- Machine-verifiable clauses
- Subjective observations
- Dispute or safety escalation
- Contract candidate or inconclusive

### Release Authority

This is deterministic code, not an agent.

---

## 14. Operator and user surfaces

Control-room mutations require authenticated merchant or operator identity and site-scoped authorization. Judge access is read-only, expiring, and separately scoped. Rate-limit public event, deep-link, preview, witness, and evidence endpoints. A public form submission never creates trusted proof by itself.

### Telegram merchant commands

- /launch
- /done
- /edit instruction
- /prove buyer intention
- /status
- /pause
- /resume
- /retry
- /rollback
- /feedback-now
- /call-witness customer and objective, stretch only
- /stop or /optout
- /forget

Natural-language equivalents should work, but commands provide a reliable demo path.

### Public merchant page

- Business identity
- Single offer
- Quantity when enabled
- Necessary customer fields
- Clear CTA
- Telegram receipt-link flow
- Booking, lead, or hosted checkout
- Confirmation surface
- ProofGate badge
- Accessibility basics and mobile-first rendering

### Proof Passport

Public:

- Merchant and live site
- Current state
- Release hash
- Tested buyer intentions
- Browser replay result
- Redacted external event type and time
- Last guardian time
- Failures discovered and repaired
- Before and after release diff
- Evidence hashes
- Referral CTA

Private control room:

- Full trace tree
- Inputs and outputs
- Screenshots and private evidence
- Costs and latency
- Search
- Passing versus failing run diff
- Alerts
- Consent records
- Pause, retry, guarded approval, and rollback
- Honest success denominator

### Judge page

The /judge page must map every rubric criterion to live evidence:

- Three prior production runs
- Current-version success denominator
- Runtime-created role
- Trace tree
- Run diff
- Search
- Actual alert
- Auto-created eval
- Memory use
- Cost and latency
- Provider IDs
- Read-only analytics
- Wispr evidence
- Cloudflare, Convex, ElevenLabs, Linkup, and Dodo proof

---

## 15. Observability, evaluation, and learning

### Observability acceptance

L3:

- Select a run and see every step

L4 committed:

- Cross-agent trace tree
- Tokens and cost per step
- Filter by merchant, task, agent, and status

L5 stretch:

- Diff a passing and failing run
- Search across runs
- Show an actual failure or cost-spike alert

Do not call a flat timeline L4.

### Closed-loop evaluation

Required pipeline:

1. Browser or voice witness produces a failed intention.
2. Failure automatically creates a versioned eval case.
3. The eval stores executable steps, assertions, and external oracle.
4. Every later canary runs every applicable blocker.
5. A regression blocks promotion.
6. Prompts, runtime roles, templates, and contracts are versioned.
7. Dashboard shows pass rate by version.
8. The original failing version and repaired passing version remain inspectable.

For L5 proof:

- Show a real failure with addedAutomatically true.
- Show its failing v1 and passing v2 results.
- Show a real blocked promotion.
- Show pass-rate trend across at least two versions.

### Memory proof

A second launch for the same merchant must:

- Reuse brand and contact data without asking again
- Apply earlier confirmed channel preference
- Respect prior contact and consent limits
- Reuse business policies
- Give every specialist the relevant memory bundle

A trace must identify the memory facts and policy that changed an action.

### Metrics

- End-to-end success rate with denominator
- First-pass contract rate
- Repair success rate
- Median time to green
- Cost per green release
- Contracts added from real failures
- Regression count
- Rollback recovery time
- Voice confirmation dispatch and acknowledgment rates
- Guardian freshness
- Human interventions per run

Never present improving metrics without raw run counts.

---

## 16. Security, privacy, consent, and truthfulness

### PII

- Minimize collected data.
- Encrypt private artifacts where available.
- Store contact hashes for indexes.
- Keep raw audio private and short-lived.
- Delete buyer-submitted raw audio within 72 hours after successful transcription unless a shorter user-requested deletion applies.
- Delete generated confirmation audio within seven days; retain only redacted text, provider ID, dispatch facts, and a content hash when audit retention is necessary.
- Never publish emails, phone numbers, full transcripts, transaction IDs, or recordings.
- Public evidence contains redacted summaries and hashes.
- Provide deletion and opt-out paths.

The /forget operation must revoke active consent, disable future messaging, delete or anonymize contact mappings, raw audio, and private transcripts, and retain only non-identifying hashes and append-only run facts required for audit. A scheduled retention purge enforces the same policy. It must not erase the existence of failed runs.

### Voice

- Transactional voice confirmation, feedback messaging, research calling, and recording are four separate purposes.
- Obtain appropriate consent before each purpose.
- State that the agent is AI.
- For recorded calls, obtain affirmative recording consent.
- Respect timezone, quiet hours, maximum attempts, and cooldowns.
- Do not call abandoned buyers merely because they entered contact details.

### Browser and content

- Sanitize all merchant text.
- Enforce CSP.
- Restrict external URLs and image types.
- Reject scripts and event-handler attributes.
- Prevent SSRF and private network navigation.
- Use a DSL rather than instructions extracted from page content.
- Treat all page text as untrusted.

### Payments and events

- Hosted checkout only.
- Never process card data.
- Verify signatures from raw body.
- Idempotency on every event and outgoing receipt.
- Store environment and account identity.
- Never let an agent charge a real card.
- Keep payment and fulfillment separate.

### Agent limits

- Maximum two repair cycles
- Maximum one patch proposal per specialist invocation
- Spend budget per mission
- Side-effect allowlist
- Risky-field approvals
- Explicit escalation state

### Claims language

Allowed:

> ProofGate verified Buyer Contract BC-104 against release hash 9ab3 at 14:32 using the linked booking and message events.

Not allowed:

- Proves conversion
- Guarantees revenue
- Customer approved, unless explicitly acknowledged
- Secure or accessible, based only on functional tests
- Repairs any website
- Fully autonomous, if every step is manually approved
- Real revenue, for test payments, teammates, friends, or merchant revenue
- Emergent organisation, for a hardcoded role
- Self-learning, when failures do not enter a versioned eval set automatically

---

## 17. Environment and provider configuration

### Pre-event provider readiness

Complete this before the eight-hour build clock. Provider administration is not product work and can consume the entire event if deferred.

- Hermes
  - Installed version and doctor check recorded
  - Telegram gateway paired
  - Browser, delegation, cron, messaging, skills, and memory visible
  - Session receipts enabled or otherwise preservable
- Cloudflare
  - Account ready
  - Worker subdomain or domain available
  - API token scoped to the required Worker and optional R2 resources
  - One harmless deployment already proven
- Convex
  - Account and project created
  - Development and production deployments understood
  - Deploy credentials ready
- ElevenLabs
  - Follow the event handbook's current Discord redemption flow for the Creator perk
  - Confirm the perk is active rather than merely requested
  - API key and selected voice ready
  - Generate one private health-check clip
- Linkup
  - Follow the event handbook's current Settings → Add Credits flow
  - Apply the HERMES code if it remains valid on the authoritative event page
  - API key ready and one live query confirmed
- Wispr Flow
  - Join through the event link
  - Confirm the statistics screen is visible
  - Do not pre-count words; the scoring requirement is 500 or more words dictated during the event
- Dodo
  - Retrieve the unique event perk code from the registered-email flow and apply it in Promotions
  - Complete every activation or verification step required for live mode
  - Begin activation immediately and do not assume live-mode review will complete during the build window
  - Create the distinct ProofGate Guardian product
  - Configure a dedicated live webhook and signing secret
  - Do not call Dodo ready until a live checkout can be opened and its webhook can be retrieved and verified
- Analytics
  - Project created
  - Team and test traffic exclusion decided
  - Read-only judge access method ready
- Participants
  - Three external merchant or buyer participants recruited
  - Two backups recruited
  - Telegram linking and each voice consent purpose explained separately

The handbook's redemption details can change. Re-check the authoritative event page and provider dashboard before using a code or claiming activation. Do not commit any provider secret.

Create .env.example with names only:

~~~text
APP_BASE_URL=
PUBLIC_SITE_BASE_URL=
PROOFGATE_SERVICE_SECRET=
PROOFGATE_EDGE_HMAC_SECRET=
PROOFGATE_EVIDENCE_SIGNING_SECRET=
PROOFGATE_EVIDENCE_TOKEN_TTL_SECONDS=
PROOFGATE_ALLOWED_PROVIDER_ORIGINS=
PROOFGATE_JUDGE_ACCESS_SECRET=

CONVEX_DEPLOYMENT=
CONVEX_URL=
VITE_CONVEX_URL=

CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_WORKER_NAME=
CLOUDFLARE_R2_BUCKET=

TELEGRAM_BOT_TOKEN=
TELEGRAM_HOME_CHANNEL=
TELEGRAM_DEEP_LINK_SIGNING_SECRET=

ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
ELEVENLABS_WEBHOOK_SECRET=

LINKUP_API_KEY=

DODO_API_KEY=
DODO_WEBHOOK_SECRET=
DODO_PRODUCT_ID=
DODO_ENVIRONMENT=
DODO_EXPECTED_BUSINESS_ID=
DODO_LIVE_API_BASE_URL=

ANALYTICS_PROVIDER=
ANALYTICS_SITE_ID=
~~~

Rules:

- Never commit credentials.
- Redact credentials from traces.
- Fail closed when a signing secret is missing.
- Record provider environment in evidence.
- Distinguish test and live mode in the UI.
- Build health checks for each required integration.

---

## 18. Eight-hour implementation plan

### Hour 0:00–0:20 — capability and credential gate

- Inspect Hermes version and tools.
- Confirm Telegram gateway.
- Confirm Cloudflare, Convex, ElevenLabs, Linkup, and Dodo credentials.
- Confirm a live-mode Dodo product or explicitly mark it blocked.
- Confirm the pre-recruited participants and backups.
- Start Wispr dictation immediately.
- Create EVIDENCE.md from the rubric map in this bible.

Exit gate:

- Exact capability matrix exists.
- Missing credentials are listed once, precisely.

### Hour 0:20–0:50 — Spike A: independent replay on a real surface

Build the thinnest real vertical slice using code that will remain in the product:

- Deploy the actual Cloudflare Worker shell with stable quantity, buyer-field, primary-CTA, and confirmation handles.
- Scaffold apps/verifier-runner on the Hermes host.
- Run a restricted Playwright contract that sets quantity, fills the booking fixture, submits the CTA, and reaches the non-payment confirmation state on the public Cloudflare URL.
- Execute the same replay three times in fresh browser contexts.
- Confirm the runner has no Convex admin, Cloudflare, Dodo, patch, or promotion credential.

Exit gate:

- Three consecutive reproducible browser results exist against the real public URL.
- Evidence is pinned to a URL and version hash.

Development spike results do not count as final judging output.

### Hour 0:50–1:20 — Spike B: external-oracle state transition

The mandatory spike is the external-oracle path, not Dodo specifically:

- Create the minimal Convex event and passport-projection tables.
- Issue a signed booking-session nonce.
- Record submitted, dispatched, and external merchant-acknowledged as separate events.
- Prove that only the acknowledged event can satisfy the test contract and change derived passport state.

If Dodo is already live-ready, time-box an additional Dodo spike:

- Open the distinct ProofGate Guardian checkout.
- Receive and verify the live webhook.
- Retrieve the payment through the live API.
- Correlate it to the Guardian entitlement, never to the merchant booking.

Oracle fallback ladder:

1. Matching live Dodo event for the exact supported product contract
2. Signed booking submitted, dispatched to the bound merchant, and acknowledged externally
3. Signed lead submitted, dispatched, and acknowledged externally

If Dodo is not live-ready at the end of this window, mark the Revenue bonus at risk and continue with booking. Do not let optional payment onboarding block the AI-as-Agency root parameter.

### Hour 1:20–2:00 — domain foundation and structured site

- Scaffold the remaining workspace.
- Define SiteSpec, Buyer Contract, trace, consent, and release schemas.
- Harden the Convex schema created in Spike B.
- Build one polished mobile-first booking template.
- Implement production and preview routes.
- Implement immutable manifests and version pointers.
- Implement manual promotion and rollback only in a local or development environment. The public environment must make manual promotion impossible and use deterministic release authority.
- Add all stable data-pg handles.

Exit gate:

- A Convex SiteSpec becomes a public canary and an atomic pointer change updates production.

### Hour 2:00–2:45 — Telegram and merchant intake

- Install ProofGate Hermes skill.
- Implement /launch, photo, voice note, /done, and /status.
- Persist brief and media.
- Compile a SiteSpec.
- Run Linkup verification on extracted public claims.
- Return the canary URL.

Exit gate:

- An external Telegram user sends a voice brief and receives a real Cloudflare canary.

### Hour 2:45–3:45 — contract and independent verifier

- Implement DSL validator.
- Implement deterministic runner.
- Create one-time evidence token.
- Restrict verifier capabilities.
- Capture screenshots and step results.
- Demonstrate a genuine quantity or confirmation failure.

Exit gate:

- Buy or book two fails for the exact expected reason and the evidence is stored.

### Hour 3:45–4:30 — incident and bounded repair

- Open incident automatically.
- Classify one supported failure family.
- Create runtime specialist role.
- Produce and validate one JSON Patch.
- Create new immutable canary.
- Replay exact contract.
- Stop after two failures.

Exit gate:

- No arbitrary code changes occur; failing contract passes on a new version.
- Run the first external quantity scenario immediately and retain the full trace.

### Hour 4:30–5:15 — external witness and deterministic promotion

- Implement booking or lead event first.
- Implement Dodo live checkout and signed webhook when credentials are available.
- Add correlation metadata and idempotency.
- Implement release authority.
- Automatically promote only when predicates pass.

Exit gate:

- A genuine external event turns an otherwise-passing canary promotable.
- Complete the second external run immediately.

### Hour 5:15–5:45 — generated Voice Confirmation

- Generate receipt text from verified event fields.
- Call ElevenLabs live.
- Store request ID, text, audio hash, duration, and cost.
- Send through Telegram to a linked opted-in buyer.
- Store platform message ID and dispatch result.
- Provide confirmation-page audio fallback without falsifying Telegram delivery.

Exit gate:

- A real event causes a fresh voice note and observable product-state change.

### Hour 5:45–6:30 — passport and control room

- Public passport.
- Trace tree.
- Cost and latency.
- Version diff.
- Pause, retry, rollback.
- Search and alert if time permits.
- Complete the third external run as soon as the minimal passport and trace are readable.

### Hour 6:30–7:00 — guardian and voice feedback

- Create skill-backed Hermes cron with repository workdir.
- Run safe production contracts without real charge.
- Implement first-failure amber and confirmation replay.
- Implement buyer feedback deep link and consent.
- Convert a machine-verifiable reply into a contract candidate.

### Hour 7:00–8:00 — proof, not features

- Freeze feature development.
- Record a final-version evaluation start timestamp and code/template/prompt versions before the first scored attempt.
- Include every attempt after that timestamp in the denominator.
- Run at least seven final-version attempts if possible.
- Obtain at least six successes for stronger 85 percent evidence.
- Ensure at least three distinct external runs.
- Keep failures visible.
- Test one rollback.
- Complete EVIDENCE.md and DEMO_RUNBOOK.md.
- Install analytics and launch referral loop.
- Verify Wispr word count.
- Add Customer Witness call only if every prior gate is green.

### Kill gates

- If Spike A cannot produce three repeatable public-URL replays by hour 0:50, stop all feature work and repair the runner or Cloudflare path.
- If Spike B cannot produce an authoritative booking acknowledgment state transition by hour 1:20, stop all feature work and repair the oracle path. Dodo may be cut; an external oracle may not.
- If Telegram to live canary is not working by hour 2:45, cut Linkup UI and all call work.
- If deterministic verifier is not working by hour 3:45, stop UI polish.
- If external-event correlation is not working by hour 5:15, prioritize booking or delivered lead before Dodo.
- If voice confirmation is not working by hour 5:45, keep text correct and continue; do not use prerecorded audio as live evidence.
- If the complete loop is not green by hour 6:30, cut feedback cron and all stretch work.

---

## 19. Test plan

### Unit tests

- SiteSpec rejects scripts, unsafe URLs, and invalid colors.
- Unknown handles are rejected.
- Unsupported DSL operations are rejected.
- Specialist patch outside allowed paths is rejected.
- Price or provider changes require guardrail.
- Previous versions are immutable.
- Builder cannot append verification proof.
- Verifier cannot mutate SiteSpec.
- Stale manifest hash is rejected.
- Duplicate external event is ignored.
- Invalid signature is rejected.
- Passport cannot be manually toggled.
- Payment-path changes require fresh external witness.
- Voice text uses only verified event fields.
- Consent purpose does not bleed into another purpose.
- Cron manual trigger is labeled manual.

### Integration scenario A: quantity

1. Initial page fixes quantity at one.
2. Buyer Contract requires two.
3. Verifier fails with QUANTITY_UNSUPPORTED.
4. Failure automatically creates an eval.
5. Runtime role is created.
6. Specialist enables quantity in an allowlisted patch.
7. New canary passes exact replay.

### Integration scenario B: confirmation

1. Booking succeeds.
2. Buyer confirmation channel is missing.
3. External booking event exists but contract fails.
4. Messaging specialist patches confirmation configuration.
5. Buyer links Telegram.
6. New booking triggers fresh generated voice confirmation.
7. Contract passes after message dispatch or acknowledgment according to its exact clause.

### Integration scenario C: guardian rollback

1. A previously healthy version-scoped external booking or confirmation dependency becomes unavailable after certification.
2. Guardian records first failure and turns passport amber.
3. Confirmation replay fails.
4. Incident opens and passport turns red.
5. Previous certified version, which references a still-healthy dependency, is restored.
6. Blocker replay passes.
7. Passport returns to green with the incident visible.

### Integration scenario D: witness feedback

1. Opted-in buyer submits voice note.
2. Transcript states a concrete quantity or confirmation failure.
3. Customer Witness Agent separates verifiable and subjective statements.
4. Supported clause creates a contract automatically.
5. Unsupported clause stays as private insight.
6. Contract participates in next canary gate.

### Payment tests

- Signed live webhook matches expected metadata.
- Wrong amount fails.
- Wrong currency fails.
- Wrong environment fails.
- Wrong business or product fails.
- Duplicate event is idempotent.
- Redirect without webhook remains pending.
- Payment success does not satisfy fulfillment.
- Automated verifier never creates a charge.

### Security tests

- Private network and non-ProofGate origins rejected.
- Prompt injection in merchant copy does not alter verifier behavior.
- Raw PII absent from passport.
- Evidence token cannot mutate site or release.
- Token expires and is single-use.
- Outbound call without each consent purpose is blocked.
- Repair loop stops after two attempts.

---

## 20. Definition of Done

The P0 product is complete only when an external user can:

1. Send a Telegram voice brief and images.
2. Receive a public Cloudflare canary.
3. Supply a buyer intention not already represented by the initial page.
4. Watch a capability-separated verifier fail the exact contract.
5. See that failure automatically become a versioned eval.
6. See a quantity-repair specialist job instantiated after the incident from the vetted P0 repair capability.
7. See a validated SiteSpec patch create a new immutable canary.
8. Watch the exact contract pass.
9. Produce a genuine payment, booking, or delivered-lead event.
10. Receive a fresh ElevenLabs-generated voice confirmation when it is a required contract clause and consent plus channel linkage permit.
11. See deterministic policy promote production only after every required confirmation predicate passes.
12. Open a green evidence-backed Proof Passport.
13. Trigger or observe a production regression.
14. See the guardian revoke green and either repair or roll back.
15. Inspect a complete trace with duration, cost, versions, events, and evidence.

Scoring readiness additionally requires:

- Three distinct external completed runs
- 85 percent or better success across the visible final-version denominator
- At least one real auto-created eval from a failure
- At least one request-specific plan and revision
- At least one genuinely new runtime role absent at kickoff if claiming L5 organisation
- A trace tree with cost and filters
- A non-engineer operating the control room after one walkthrough
- Five partner evidence items
- Read-only analytics

Buyer Voice Witness readiness additionally requires:

- Separate voice-processing consent
- Live buyer voice note
- Private audio artifact and provider-processing ID
- Transcript
- Machine-verifiable versus subjective split
- Contract candidate or explicit inconclusive result
- Trace link from voice evidence to the resulting decision

---

## 21. Demo runbook

### Pre-demo preparation

- Three successful external production runs are already visible.
- All failed attempts remain visible.
- Primary buyer and two backups are pre-linked to Telegram and have separately opted into transactional voice.
- A signed booking witness and merchant acknowledgment path are confirmed.
- Dodo live mode is confirmed only when claiming the planned Revenue bonus; it is not a dependency of the timed core demo.
- ElevenLabs health check passes.
- Linkup evidence is ready outside the timed core path.
- Cloudflare and Convex dashboards are open.
- Guardian cron evidence is ready outside the timed core path.
- One real alert has already fired and remains inspectable.
- Analytics dashboard is read-only and available.
- Wispr stats are captured.
- No PII is shown publicly.

### Four-minute demo

0:00–0:25  
Show three prior real runs and the honest success denominator.

0:25–0:55  
Merchant sends voice brief and image. Hermes returns a Cloudflare canary.

0:55–1:20  
Judge or buyer supplies: Buy two seats on mobile and receive Telegram confirmation.

1:20–1:45  
Verifier fails at the quantity or confirmation predicate. Passport turns red or remains amber. Failure becomes an eval automatically.

1:45–2:20  
Manager creates a failure-specific role. Specialist proposes an allowlisted patch. New canary appears.

2:20–2:45  
Write-disabled verifier replays the exact contract and passes machine predicates.

2:45–3:15  
The pre-linked external buyer submits the signed booking and the bound merchant acknowledges it. Submitted, delivered, and acknowledged events land separately in Convex.

3:15–3:35  
ElevenLabs generates a fresh event-derived voice confirmation and Telegram dispatches it. If voice confirmation is a blocker, its dispatch evidence completes the contract. Release authority then promotes production.

3:35–4:00  
Proof Passport turns green. Show trace tree, failing versus passing diff, cost, auto-created eval, and external event.

### Guardian coda

If time permits, run a controlled dependency drill. Make the current certified version's previously healthy booking or confirmation dependency unavailable while the previous certified version still references a healthy dependency:

- Guardian detects
- Passport turns amber
- Confirmation replay fails
- Rollback occurs
- Exact replay passes
- Passport returns green

Label this clearly as a controlled resilience drill, not the real merchant output proof and not an overflow task.

### Partner and Revenue coda

After the timed core demo, show:

- Linkup live claim query and the resulting copy decision
- Hermes scheduled guardian evidence
- Dodo live ProofGate Guardian product payment and automatic monitoring entitlement

Keep the Guardian product ID and event correlation separate from the merchant booking contract.

### Optional Witness coda

Only after the core demo:

- Judge asks to contact the last opted-in witness.
- Prefer a live Telegram voice note.
- Run outbound call only if consent and provider health are confirmed.
- The witness result must create a verifiable contract and production decision to matter.

---

## 22. Demo fallbacks that remain truthful

| Failure | Truthful fallback |
|---|---|
| Dodo webhook delayed | Keep passport amber; query provider status when allowed, then use a real booking or delivered-lead contract. Show a prior timestamped genuine Dodo event separately. |
| Dodo unavailable | Complete the booking or lead proof. Do not claim Dodo or revenue points for the live run. |
| ElevenLabs timeout | Send text confirmation and store VOICE_GENERATION_FAILED. Show prior live provider evidence separately. Do not pass a voice-required clause. |
| Telegram dispatch fails | Play fresh generated audio on the confirmation page. Keep Telegram predicate failed. |
| Browser crashes | Run deterministic API or DOM predicates and show a prior full replay. Do not call the current browser run passed. |
| Linkup fails | Remove or label the unsupported claim. Do not use cached search as a live integration. |
| Customer disappears | Use the judge or one of two pre-consented backups. |
| Cron does not fire | Invoke the same handler through authenticated manual trigger and label it manual. |
| Repair grammar does not cover failure | Keep the release blocked and escalate with evidence. |
| Cloudflare issue | Keep the last certified production pointer and do not announce promotion. |

A truthful blocked release is a valid demonstration of the gate. A fabricated green state destroys the product.

---

## 23. Rubric target and evidence

### AI as Agency

| Parameter | Target | Points | Evidence |
|---|---:|---:|---|
| Working real output | L5 | 80 | Three or more real external runs, 85 percent success, public URLs, external events, automatic promotion, exception-only escalation, and visible human-intervention count |
| Agent organisation | L4 committed, L5 stretch | 15–20 | Request-specific plans; runtime role created after incident for L5 |
| Observability | L4 committed, L5 stretch | 21–28 | Trace tree, cost, filters; plus diff, search, actual alert for L5 |
| Evaluation | L5 | 20 | Real failure automatically enters versioned eval and blocks release |
| Memory | L5 | 8 | Current task, user history, and business policy used across handoffs |
| Cost and latency | L4 target | 3 | No more than five minutes and no more than $0.50 for the complete representative run; the worse tier governs. L5 requires under one minute and under $0.10 together |
| Management UI | L4 target | 3 | Non-engineer operates pause, retry, rollback, search, and guardrails after one walkthrough |
| Core target |  | 150–162 | Claim 162 only when L5 org and observability tests pass live |

If three genuine live runs at 85 percent are not proven, real output falls to L4 and the score drops materially. Do not claim L5 from one curated demonstration.

### Overflow

After L5 is established, each additional complete autonomous real task during judging can add twenty points.

Define one task as:

- A complete verified launch, or
- A complete production guardian incident resolved and independently reverified

Do not count an agent step, browser probe, voice note, or internal eval as a task.

A controlled resilience drill, injected failure, or individual guardian probe does not count as overflow. A guardian recovery can qualify only when it is a complete autonomous task on a real external production surface with a genuine independently verified incident.

---

## 24. Partner power-ups

Use the five track-specific AI-as-Agency partners. Budget on plus 125.

### Wispr Flow: plus 25

- Dictate at least 500 words during the event.
- Use it for briefs, contract intentions, operator notes, and the public build log.
- Capture event-day stats screenshot.

### ElevenLabs: plus 25

- Generate a fresh event-derived voice confirmation during the demo.
- Store provider request ID, text, audio, cost, and resulting product state.
- Stronger proof: a buyer voice note changes a Buyer Contract and release.
- A prerecorded clip earns nothing.

Do not count ordinary Hermes voice-note intake as ElevenLabs evidence when Hermes transcribes it through local Whisper, OpenAI, Groq, or another provider. The canonical plus-25 proof is the fresh ElevenLabs TTS confirmation changing a required contract predicate and product state. ElevenLabs Scribe may additionally process intake or witness audio when deliberately configured and evidenced.

### Convex: plus 25

- Main backend for users, SiteSpecs, contracts, memory, trace, evals, releases, consent, evidence, and passport.
- Show live rows updating.

### Linkup: plus 25

- Run a live public claim query.
- Store cited evidence.
- Block, soften, or approve the claim based on the result.
- A result displayed but ignored earns nothing.

### Cloudflare: plus 25

- Public Worker-rendered merchant sites
- Canary and production routing
- Proof Passport
- Edge event capture
- Optional R2 evidence storage
- Show live URL and dashboard

### Dodo

The track-specific AI-as-Agency table lists five partners and plus 125. Treat Dodo as Revenue cross-track evidence unless the authoritative event-day page explicitly adds it as a sixth power-up.

Implement it anyway because it supplies:

- Live ProofGate Guardian checkout
- Signed payment event
- Product revenue evidence
- External oracle for a supported contract

---

## 25. Cross-track plan

Cross-track points are half-weight and capped at fifty. Do not double-count the same signup under Virality and Revenue.

### Realistic target: 42.5

| Evidence | Tier | Bonus |
|---|---:|---:|
| 6–25 external activated signups | Virality L2 | 12.5 |
| 51–250 unique visitors | Virality L3 | 10 |
| 11–25 organic reactions and comments | Virality L3 | 2 |
| Polished live product | Revenue L4 | 12 |
| Up to $25 legitimate product revenue | Revenue L2 | 6 |
| Total |  | 42.5 |

### Stretch target: fifty cap

- 26 or more external activated signups: 25
- 51 or more unique visitors: 10
- 11 or more reactions/comments: 2
- L4 live-product quality: 12
- Any legitimate completed live-mode product revenue up to $25: 6

Raw total is 55 and is capped at 50.

### Signup definition

Require:

- External non-team identity
- Email or account
- First-use event such as proof_run_started, site_created, or buyer_contract_created

A waitlist email alone is not an activated signup.

### Revenue definition

Sell:

> ₹199 ProofGate Guardian monitoring access

The payment must:

- Be completed in live mode and satisfy the rubric's real-money-moved requirement; do not claim payout settlement unless it is separately proven
- Come from outside the team and friend circle
- Buy automated product access
- Automatically provision monitoring after webhook
- Stop delivering value if the product disappears

Do not sell manual consulting or done-for-you services for revenue points.

### Viral loop

Every public site and passport includes:

> Verified by ProofGate — launch and prove yours.

Track:

- Source UTM
- Passport visit
- Signup
- First proof run
- Payment

Install analytics before launch and give mentors read-only access. Exclude team and test traffic. Keep impressions-to-visitors under the anti-spoof ceiling and explain direct-share traffic.

Preserve native launch-post impression evidence. Unless a verifiable direct-share source explains the difference:

- Unique visitors must remain at or below ten percent of weighted social impressions.
- Activated signups must remain at or below fifty percent of unique visitors.

For Revenue L4 product quality, record a cold non-team user reaching first value without narration, then surviving blank input, back navigation, and one invalid-input test. Compare the same job against the manual or generic-chat alternative and preserve the recording or judge-observable run.

### Expected total

- Core: 150–162
- Confirmed track power-ups: 125
- Realistic cross-track: 42.5
- Expected before overflow: 317.5–329.5
- With the full 50-point cross-track bonus: 325–337 depending on base
- Each valid overflow task: plus 20

---

## 26. Evidence ledger

EVIDENCE.md must contain one row per claim:

| Claim | Live proof | Backup | Status | Owner |
|---|---|---|---|---|
| Hermes eligibility | Gateway interaction, delegated run, cron or memory doing product work | Session receipt |  |  |
| Three real outputs | URLs and Convex run query | Screenshots |  |  |
| 85 percent success | Run denominator query | Export |  |  |
| Runtime role | Role row and trace event | JSON export |  |  |
| Trace tree | Control-room URL | Screenshot |  |  |
| Diff and search | Control-room URL | Recording |  |  |
| Actual alert | Telegram alert and alert row | Screenshot |  |  |
| Auto-created eval | Eval row linked to failure | Export |  |  |
| Memory used | Trace memory bundle | Screenshot |  |  |
| Cost and latency | Run totals | Provider dashboards |  |  |
| Non-engineer UI | Live operator demonstration | Short recording |  |  |
| Wispr | Stats screenshot | None |  |  |
| ElevenLabs | Request ID and fresh audio | Provider dashboard |  |  |
| Voice Witness chain | Consent, private audio ID, provider processing ID, transcript, split, contract candidate, trace | Redacted export |  |  |
| Convex | Live tables | Schema |  |  |
| Linkup | Adapter/code path, live query, stored citation, and resulting decision | Screenshot |  |  |
| Cloudflare | Public URL and dashboard | Deployment log |  |  |
| Dodo | Live payment and signed webhook | Dashboard |  |  |
| Native impressions | Platform analytics on builder device | Screenshot |  |  |
| Reactions and comments | Live public post and organic identities | Screenshot |  |  |
| Visitors | Read-only analytics | Export |  |  |
| Signups | Activated-user query | Export |  |  |
| Revenue | Completed live-mode product payment tied to usage; payout status claimed only if separately proven | Dashboard |  |  |
| Cold-user L4 quality test | Unassisted first value plus blank/back/invalid-input tests and manual alternative comparison | Recording |  |  |

Screenshots are backups. Live surfaces and live data are primary.

---

## 27. Build priority and cut order

Preserve in this order:

1. Contract state machine
2. Capability-separated verifier
3. Signed or otherwise authoritative external event
4. Deterministic promotion
5. One validated repair and exact replay
6. Automatic eval capture
7. Trace and Proof Passport
8. Telegram merchant intake
9. ElevenLabs generated voice confirmation
10. Hermes guardian cron
11. Buyer voice-note feedback
12. Linkup claim gate
13. Dodo Guardian product purchase
14. Outbound Customer Witness call

If forced to choose between a reliable voice note and a live call, ship the voice note.

If forced to choose between arbitrary repair and one deterministic repair grammar, ship the deterministic grammar.

If forced to choose between a beautiful dashboard and three real runs, obtain the runs.

---

## 28. Final public copy

### Hero

**Your AI-built selling page should have to prove it works.**

Send a voice note. ProofGate launches the page, attempts the buyer journey, repairs what fails, and keeps a public proof record alive after launch.

### Primary CTA

Launch and prove mine

### Proof Passport badge

Verified by ProofGate  
Buyer path last checked: time  
View evidence

### Merchant explanation

ProofGate does not promise conversion or guarantee uptime. It verifies specific buyer tasks against a specific release and revokes the status when those tasks stop passing.

### Thirty-second pitch

Everyone else can generate a website from a prompt. ProofGate is the independent release authority. A merchant sends a voice note, it creates the selling page, and a separate verifier attempts the exact buyer task. Any failure becomes a permanent regression test, a failure-specific specialist repairs the canary, and deterministic policy promotes only after exact replay and a real payment, booking, or delivered lead. After launch, Hermes cron keeps replaying those contracts, so the public Proof Passport is revocable rather than decorative.

---

## 29. Copy-paste kickoff prompt for Hermes

Use the following after this file exists in the repository:

> Read PROOFGATE_BUILD_BIBLE.md completely. Build ProofGate in this repository without discarding correct work already present. Do not re-ideate, broaden scope, or ask me to choose a stack unless a required credential or irreversible external action truly blocks progress. Complete the pre-event provider-readiness checklist outside the build clock. At build start, create EVIDENCE.md from the supplied rubric map, record the Hermes capability matrix, and run Spike A plus the mandatory external-oracle Spike B before feature work. Prioritize one complete real loop over breadth. Agents may only modify a Zod-validated SiteSpec; the verifier must be capability-separated; only deterministic code may promote production. Generated Telegram voice confirmation is core, buyer voice-note feedback follows, and outbound Customer Witness calling is stretch-only. Keep all failures, use real public surfaces, and never present mocks, redirects, synthetic events, test payments, or prerecorded audio as live proof. Stop feature work once Definition of Done passes across three external runs, then harden the demo and evidence.

---

## 30. Reference notes

Implementation should verify current provider APIs against official documentation at build time. Important current constraints:

- Hermes Telegram supports text, voice, images, and file attachments.
- Hermes delegation creates isolated child agents with restricted toolsets.
- Hermes cron runs in fresh sessions; attach the ProofGate skill and set workdir.
- Hermes built-in memory is deliberately bounded; store product-scale state in Convex.
- Dodo webhook processing must verify signatures, deduplicate events, and tolerate retries.
- Telegram bots require a user to initiate or link the conversation before the bot can send the buyer a receipt.

Official references to re-check before wiring production:

- Hermes Telegram gateway: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/messaging/telegram.md
- Hermes subagent delegation: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/delegation.md
- Hermes cron: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/cron.md
- Hermes persistent memory: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/memory.md
- Hermes skills: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/skills.md
- Dodo webhooks: https://docs.dodopayments.com/developer-resources/webhooks
- Dodo entitlement and fulfillment events: https://docs.dodopayments.com/developer-resources/webhooks/intents/entitlement-grant
- Telegram bot platform: https://core.telegram.org/bots

End of build bible.
