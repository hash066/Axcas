# Axcas — Small-business website and reel agent

Axcas turns a small business owner’s voice note, prices, services, photos, and reference reels into a verified business site and original reel system. WhatsApp remains the fastest path; `/studio` is a guided visual workspace for merchants who want to choose layouts, formats, and layers. ProofGate remains the internal verification and release engine name.

## AWS-native production redesign

The current source is migrating from the Cloudflare/Convex private beta to a separate AWS-native
stack in `infra/aws-native`. The replacement uses API Gateway/WAF, FIFO SQS, Step Functions,
redundant ECS Fargate workers, Cognito, DynamoDB, encrypted S3, CloudFront, Amplify,
EventBridge, CloudWatch, SNS, Bedrock, Polly, and the existing capability-separated verifier and
release authority. The configured customer-facing number is `+91 91804 99647`; it is **not live**
until the unused SIM is registered and OTP-verified in the Axcas WABA.

The new contracts add constrained `SiteSpecV3` publication, merchant OAuth for Instagram/Page/Ad
Account access, capability-gated Trial Reels, exact-hash three-variant campaigns, paused paid-ad
creation, INR spend ceilings, raw metric snapshots, and tenant-specific learning artifacts. These
are source/test facts until the AWS stack, Meta app review, first real site, Reel, post, capped ad,
and feedback receipt are recorded in `EVIDENCE.md`.

## Agents for Humans entry

Axcas enters the **Professional Agents** track. The hackathon-period Axcas product was created after 10 August 2026 on top of the older, disclosed ProofGate verification foundation; the repository history is intentionally preserved. The entry uses the official `@strands-agents/sdk` to coordinate typed intake, candidate, independent-verification, approval-request, metrics, and improvement tools. Strands cannot approve, promote, publish, run shell commands, or obtain provider credentials.

- [Submission draft](docs/hackathon/SUBMISSION.md)
- [Four-minute demo script](docs/hackathon/DEMO_SCRIPT.md)
- [Architecture diagram](docs/hackathon/architecture.svg)
- [AWS Builder post draft](docs/hackathon/BUILDER_POST.md)
- [Truthful demo runbook](DEMO_RUNBOOK.md)

The reel-template workspace adapts the entrant-authorized source recorded in [`apps/reel-template-worker/UPSTREAM.md`](apps/reel-template-worker/UPSTREAM.md). The Devpost entry must identify the source owner/team relationship or attach a durable written grant.

The launch flow remains constrained:

1. Hermes `v0.18.2` receives English voice, photos, and text through WhatsApp Business Cloud.
2. Hermes submits typed intake and immutable assets through the `proofgate` command; it never writes Convex or release state directly.
3. A constrained renderer produces a mobile product or service site from `SiteSpecV2`. Agents never emit page code.
4. The verifier checks the candidate. An authenticated merchant button approves the exact candidate hash; deterministic policy alone may promote it.
5. Product CTAs append a privacy-safe click and redirect to a prefilled message on the merchant’s separate order number.
6. One exact, consented India/US lead batch may be approved for one-attempt Vapi qualification calls.
7. Three reel angles can be proposed; one approved plan is rendered from merchant photos with AWS Polly and FFmpeg and returned privately.
8. Hermes reports raw views/clicks and proposes—not publishes—a verified improvement.
9. Axcas Studio offers Website, Reels, or Both, with WhatsApp-linked passwordless access, append-only project revisions, private uploads, five site layouts, five human-led reel formats, and editable hook/proof/CTA layers.

There is no blank-canvas site-code editor, payment flow, scraped lead source, synthetic product imagery, unapproved posting, or unbounded autonomous publishing. Exact approved campaigns may schedule their bound organic posts and capped merchant-funded ads after live provider acceptance.

## Run locally

```sh
npm ci
npm run typecheck
npm test
npm run dev:edge
```

Copy `.env.example` to an ignored `.env` and fill only the provider values you own. The Worker remains useful without provider credentials but truthfully reports blocked provider actions.

### Run the Strands orchestrator

The orchestrator uses Strands Agents SDK `1.17.0` with Amazon Bedrock. The zero-onboarding default is `apac.amazon.nova-lite-v1:0` from `ap-south-1`; Claude Sonnet 4.6 is optional after Anthropic use-case registration. Use an AWS identity allowed to invoke only the selected model; never put AWS keys in the repository.

```sh
npm ci
npm run start --workspace=@axcas/strands-orchestrator
```

It exposes the AgentCore-compatible runtime contract on loopback by default:

- `GET /ping`
- `POST /invocations` with `{ "mode": "build", "input": { ... } }`
- `POST /invocations` with `{ "mode": "improvement", "input": { ... } }`

The production WhatsApp bridge invokes the same `runStrandsToolWorkflow` code path through the bounded `orchestrate_build` action. Unit tests use a deterministic implementation of the public Strands model interface and execute the real Strands tool loop. A live Bedrock or AgentCore claim requires a separately recorded AWS invocation receipt.

## Hermes command boundary

```sh
npm run proofgate -- intake brief.json
npm run proofgate -- candidate candidate.json
npm run proofgate -- verification candidate-scope.json
npm run proofgate -- release candidate-scope.json
npm run proofgate -- asset ASSET_ID MERCHANT_ID META_MESSAGE_ID image/jpeg photo.jpg
npm run proofgate -- lead lead.json
npm run proofgate -- batch batch.json
npm run proofgate -- reel reel.json
npm run proofgate -- deliver-reel REEL_ID ASSET_ID MERCHANT_WA_ID "Your approved reel" --submit
npm run reel:template:render -- render-request.json
```

Commands validate locally by default. Add `--submit` only from the configured Hermes host. `verification` mints a short-lived single-use capability for the isolated verifier; `release` creates—not executes—a merchant approval request. Metrics and approved work are available through `metrics` and `guardian`; the only unauthenticated write is the exact capability-bound verifier evidence route.

## Important paths

| Path | Responsibility |
|---|---|
| `packages/domain/src/growth.ts` | Business, site, consent, approval, outcome, and reel schemas |
| `packages/domain/src/production-redesign.ts` | AWS-native SiteSpec V3, Meta connection, campaign, publication, metric, and learning contracts |
| `packages/domain/src/studio.ts` | Studio intent, project, reel style-profile, layer, and approval-checklist schemas |
| `packages/renderer/src/render-bakery-site.ts` | Constrained, XSS-safe catalog renderer |
| `packages/release-policy/src/growth-policy.ts` | Immutable call-batch hash and approval predicate |
| `packages/whatsapp-io` | Meta signature parsing, buttons, and template adapter |
| `packages/calls` | Consent-first Vapi squad, outbound client, authenticated callback |
| `packages/reels` and `apps/reel-worker` | Polly voiceover and verified FFmpeg render |
| `apps/reel-template-worker` | Owner-authorized Remotion compositions, private-asset adapter, and 1080×1920 render CLI |
| `apps/edge-runtime` | Public routes, webhooks, tracked redirects, private admin boundary |
| `apps/strands-orchestrator` | Strands reasoning/tool loop, guarded workflow state, Bedrock runtime contract |
| `apps/aws-control-plane` | AWS webhook ingress, FIFO dispatch, exact approval callback, and deterministic site publication |
| `convex/growth.ts` | Durable events, approvals, consent, guardian claims, structured outcomes |
| `hermes/skills/proofgate` | Hermes operating policy and typed commands |
| `infra/aws-native` | Replacement Cognito, API, queues, workflows, Fargate, DynamoDB, S3, CloudFront, Amplify and monitoring stack |

## Public surface

- `GET /s/:slug` — published small-business site
- `GET /studio` — guided website/reel workspace
- `POST /api/studio/link` — short-lived WhatsApp account link
- `POST /api/studio/link/status` — browser-bound session exchange
- `GET|POST /api/studio/projects` — authenticated append-only project revisions
- `PUT /api/studio/assets/:assetId` — authenticated private reference upload
- `GET /r/whatsapp/:siteId/:itemId` — tracked order redirect
- `GET /proof/:slug` — Proof Passport
- `GET /assets/:assetId` — explicitly selected immutable media
- `GET|POST /whatsapp/webhook` — Meta verification, approval interception, Hermes forwarding
- `POST /webhooks/vapi` — authenticated structured call outcome

All remaining administrative mutation routes are bearer-authenticated and intended only for the Hermes command boundary. Studio mutations require a secure HttpOnly session minted only after a Meta-signed WhatsApp link message.

## Deployment truth

See [Production launch](docs/PRODUCTION_LAUNCH.md) for the no-customer-API-key model,
server topology, launch sequence, and initial commercial packaging.

Convex development and production remain the deployed private-beta state while the new AWS stack is source-only. The hardened no-card File Storage fallback was verified through the public Worker with one synthetic PNG and an idempotent replay; release separation correctly kept it private. Worker HTTPS, the WhatsApp GET challenge, and the authenticated AWS Hermes origin are live. R2 remains card-blocked and optional. Do not call the AWS-native migration complete until its independent deployment and eleven-step live acceptance are recorded.

See [architecture](docs/architecture.md), [provider readiness](docs/provider-readiness.md), [privacy and consent](docs/privacy-and-consent.md), and [evidence](EVIDENCE.md).
The six-step live run and exact evidence requirements are in [live acceptance](docs/LIVE_ACCEPTANCE.md).
