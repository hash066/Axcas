# Axcas teammate handoff

**Authoritative snapshot:** 2 September 2026, Asia/Kolkata  
**Repository:** <https://github.com/hash066/Axcas>
**Implementation/evidence baseline:** `8faec3e003aba9c51b79446eb9cf33f87b844200`  
**Public self-service readiness:** approximately 70%  

This document is the current operational handoff. It supersedes readiness percentages and live-origin statements in older documents. `EVIDENCE.md` remains the detailed append-only history, including failures.

## Read this first

Axcas is a WhatsApp-first small-business agent with an optional visual Studio. A merchant sends a voice note, photos, offerings and prices. Axcas infers the business type, prepares a constrained `SiteSpec`, verifies it independently, requests one merchant publication approval, publishes a mobile site, tracks WhatsApp CTA activity and can privately render an approved reel. Consented calls are a separately approved feature.

Customers must never provide API keys, hosting accounts or storage credentials.

### Current safety state

- The public site and Studio are live.
- WhatsApp agent forwarding is deliberately **OFF**. Cloudflare KV key `hermes_origin` is absent.
- Do not restore that key until the isolated Hermes runtime in commit `a057b31` or later is deployed and accepted on AWS.
- Calling is deliberately **OFF**. `CALLING_LIVE_ENABLED` is not configured.
- The Meta app still uses a test number. Arbitrary customers cannot use it until an Axcas-owned production number completes Meta OTP registration.
- Cloudflare R2 is not active. The live fallback is private Convex File Storage with a 16 MiB per-upload limit.
- The new AWS merchant-media path supports bounded 20 MiB images, 30 MiB audio and 100 MiB MP4 uploads in code, but it is not deployed or connected to the Worker.

## Source-control status

| Item | Current state |
|---|---|
| Remote | `https://github.com/hash066/Axcas.git` |
| Default branch | `main` |
| Production working branch | `codex/axcas-production` |
| Implementation/evidence baseline | `8faec3e003aba9c51b79446eb9cf33f87b844200` |
| `main` and `codex/axcas-production` | Kept aligned; this handoff is committed to both branches |
| Unpushed source changes | None |
| Untracked local folders | `output/`, `tmp/`; intentionally not deleted or committed |

The latest functional commit is `a057b31` (`feat: harden reel call and media workflows`). Commit `8faec3e` adds deployment evidence only.

Start locally:

```powershell
git clone https://github.com/hash066/Axcas.git
cd ProofGate
git switch main
npm ci
npm test
npm run typecheck
npm audit --omit=dev
```

Last verified gate:

- 3 legacy tests
- 214 Vitest tests
- 6 Hermes plugin tests
- 8 extracted AWS media Lambda tests
- 231/231 total
- TypeScript passed for the application and reel-template workspace
- `npm audit --omit=dev`: zero vulnerabilities

## Live URLs

| Surface | URL | State |
|---|---|---|
| Product home | <https://proofgate-whatsapp-growth.proofgate-harshita.workers.dev/> | HTTP 200 verified 2 September |
| Axcas Studio | <https://proofgate-whatsapp-growth.proofgate-harshita.workers.dev/studio> | HTTP 200 verified 2 September |
| Main health | <https://proofgate-whatsapp-growth.proofgate-harshita.workers.dev/health> | HTTP 200; `whatsapp-growth-p0` |
| Independent verifier | <https://axcas-site-verifier.proofgate-harshita.workers.dev> | Deployed separately; no provider or mutation credentials |
| WhatsApp webhook | `https://proofgate-whatsapp-growth.proofgate-harshita.workers.dev/whatsapp/webhook` | Meta callback; signature checked; forwarding currently paused |
| Vapi webhook | `https://proofgate-whatsapp-growth.proofgate-harshita.workers.dev/webhooks/vapi` | HMAC checked; live calls disabled |
| Historical AWS relay | `https://6glzwgtc2g.execute-api.ap-south-1.amazonaws.com` | Existing AWS ingress; deliberately disconnected from Worker |

Current main Worker deployment:

- Worker name: `proofgate-whatsapp-growth`
- Version: `24e3687e-20a2-48dc-8b89-10d23a66aa01`
- Deployed functional commit: `a057b31`
- Convex production was deployed before the Worker.

## Accounts and linkage matrix

No password, token, OTP or secret value belongs in this file. Give the teammate provider-native member access instead of sharing the owner's login.

| Provider | Safe account/project identifiers | Linked today? | What the teammate needs |
|---|---|---|---|
| GitHub | Owner `hash066`; repo `ProofGate` | Yes. Push and fetch work from this laptop. | Add them as a repository collaborator. Use `main`; preserve `codex/axcas-production` until release cleanup. |
| Cloudflare | Account email `harshitanagesh4@gmail.com`; account ID `c3c6d050d934a8409d2f41e7a455dc73` | Yes. Wrangler is authenticated through a scoped API token on this laptop. | Add a Cloudflare member or create a new least-privilege token. Do not copy the owner's token. |
| Cloudflare Worker | `proofgate-whatsapp-growth` | Yes; live. | Worker Scripts edit/deploy, KV edit, secret edit and logs permissions. |
| Cloudflare KV | Binding `PROOFGATE_CONFIG`; namespace `bfed66f79c9a4e66adf345f4dce3c113` | Yes. | `hermes_origin` must remain absent until AWS safety acceptance. |
| Cloudflare R2 | Intended name `proofgate-private-assets` | No. Billing/card activation was blocked. | Nothing required for current beta; use Convex fallback or deploy the prepared AWS media path. |
| Cloudflare verifier | Worker `axcas-site-verifier` | Yes. | Read/deploy access only if changing verifier contracts. Never add provider/admin credentials to it. |
| Convex | Team/project shown by CLI as `harshita-nagesh:proofgate` | Yes. CLI is authenticated. | Invite teammate to the Convex team/project. |
| Convex development | `earnest-mandrill-823`; <https://earnest-mandrill-823.convex.cloud> | Previously deployed. | Use for development only. It has a service secret separate from production. |
| Convex production | `tame-corgi-404`; <https://tame-corgi-404.convex.cloud> | Yes; reachable and current. | Production deployment access. Deploy Convex before Worker whenever schema/actions change. |
| AWS | Account `917394547881`; region `ap-south-1` | Infrastructure exists, but current browser session is signed out and local AWS CLI is unavailable. | Create a least-privilege IAM/Identity Center identity. Do not share root credentials. |
| AWS CloudFormation | Stack `proofgate-foundation` | Existing older stack is live; newest template is not deployed. | CloudFormation, SSM, EC2, Lambda, API Gateway, SQS, S3, Secrets Manager, CloudWatch and SNS permissions for this stack. |
| AWS EC2 | Instance `i-06057ce3046b446de`, outbound-only | Existing host. Exact current checkout was not re-read after AWS sign-out. | Access through Systems Manager, not SSH. |
| AWS recordings S3 | `proofgate-foundation-recordingsbucket-k7meu4p2bug6` | Existing private encrypted bucket. | Verify the 30-day lifecycle and Vapi artifact-copy integration before live calls. |
| AWS relay | API Gateway `6glzwgtc2g.execute-api.ap-south-1.amazonaws.com`, encrypted SQS + DLQ | Existing but disconnected at Cloudflare. | Deploy the isolated runtime, then run health/signature/queue acceptance before reconnecting. |
| AWS merchant-media S3 | Created by the newest template; physical name not available yet | Not deployed. | Deploy template, capture `MerchantMediaBucket` and `MerchantMediaCapabilitySecretArn`, then wire server-only Worker bindings. |
| Meta Business | Business portfolio ID `911844841419654` | Yes. | Add teammate through Meta Business Settings with app/WhatsApp permissions. |
| Meta app | App ID `2349611939193122`, display name **Axcas** | Published. Privacy, terms, data deletion, callback, WABA link and `messages` subscription were saved. | App dashboard + WhatsApp Manager access. Recheck rather than trusting historical screenshots. |
| Meta WhatsApp number | Meta test number `+1 555 653 7153` | Only for allowlisted test recipients. | Add one Axcas-owned production number and complete OTP. Merchants should all message this shared number; they never create an app. |
| Meta outbound template | Intended `action required` utility template | Not configured/approved. | Submit and approve one minimal template for messages outside the 24-hour service window. |
| Vapi | Active US number `+1 760 974 8059` | Provider objects exist; no successful live Axcas call. | Invite teammate to workspace; review number/cost/compliance before enabling. |
| Vapi consent assistant | `e7210ebf-91f8-48eb-8cf9-6587b91fe88e` | Configured historically. | Verify recording/log/transcript remain disabled. |
| Vapi qualification assistant | `f48272d7-fc58-4433-9b0a-8b51ecdbda10` | Configured historically. | Verify AI disclosure and recording only after explicit consent. |
| Vapi squad | `492a8fae-b1ec-4d60-b221-1d7115a53eef` | Two-member consent-first squad. | Complete separate real declined and granted self-tests before calling flag is enabled. |
| Vapi webhook credential ID | `cfbe1546-c361-4951-a2bf-1ef665dba3ec` | Worker has a webhook secret binding. | Do not reuse or reveal the secret value; rotate if workspace access changes. |
| Hermes | Pinned `v0.18.2`; model `moonshotai/Kimi-K2.6` through `https://api.studio.nebius.ai/v1` | Old AWS runtime existed; newest isolation is not deployed. | Deploy from current Git commit. Verify effective WhatsApp tools are only `axcas_continue` and `axcas_status`. |
| Nebius-compatible model account | Provider key existed on AWS historically | Account ownership/access not independently verified in this handoff. | Identify the billing owner and issue a new runtime key if the teammate will operate it. Never fall back silently to OpenRouter. |
| Instagram | No connected Professional account or proven token | No. | Outside current P0. Do not claim posting/trend learning as live. |

## Secrets and incident status

On 31 August, merchant-facing Hermes exposed a shell/Python approval containing a real-looking `PROOFGATE_SERVICE_SECRET`. Treat that historical value as permanently compromised.

Completed containment:

- Removed remote KV `hermes_origin`; a remote read returned 404.
- Rotated `PROOFGATE_SERVICE_SECRET` in Cloudflare and Convex production/development.
- Verified the prior local value returns HTTP 401.
- Restricted customer Hermes in code to `axcas_continue` and `axcas_status`.
- Moved the service credential out of the public Hermes gateway process into a separate Unix-socket bridge.
- Added fail-closed filtering for commands, environment names, paths, tokens, stack traces and provider diagnostics.

Important operational caveat:

- The replacement Cloudflare/Convex service value was intentionally not printed or committed.
- The ignored local `.env` may still contain the compromised old value. Do not trust or reuse its `PROOFGATE_SERVICE_SECRET`.
- AWS was not synchronized after the final rotation because its session expired.
- Before reconnecting AWS, perform one fresh coordinated rotation across Cloudflare Worker, Convex production, Convex development and the AWS `HermesAdminSecret`, then update only the bridge/guardian runtime files. The Hermes gateway itself must not receive it.
- Rotate provider tokens again whenever a teammate loses access. Use provider secret stores/password manager; never WhatsApp, Git, issue comments or shell screenshots.

Current Cloudflare secret names are present:

- `HERMES_PROXY_SECRET`
- `META_ACCESS_TOKEN`
- `META_APP_SECRET`
- `META_PHONE_NUMBER_ID`
- `META_VERIFY_TOKEN`
- `PROOFGATE_DATA_KEY`
- `PROOFGATE_SERVICE_SECRET`
- `VAPI_API_KEY`
- `VAPI_PHONE_NUMBER_ID`
- `VAPI_SQUAD_ID`
- `VAPI_WEBHOOK_SECRET`

Names that are deliberately not configured live yet:

- `CALLING_LIVE_ENABLED`
- AWS merchant-media capability origin/secret Worker bindings
- Approved Meta `action required` template

## Architecture and trust boundaries

```text
Meta WhatsApp / Axcas Studio
             |
             v
Cloudflare Worker: signatures, identity, rate limits, public routes
             |
             v
Convex: append-only workflow, projects, approvals, releases, usage
             |
       +-----+-------------------+
       |                         |
       v                         v
Hermes interpretation      deterministic builder/verifier/release
(typed Axcas tools only)    guardians and provider adapters
       |
       v
AWS SQS/EC2/FFmpeg/Polly/private S3
```

Non-negotiable rules:

- Agents produce or patch validated data, never runtime HTML/JavaScript.
- Builder, verifier and release authority remain capability-separated.
- Hermes cannot approve, promote, set passport green or access release/provider credentials.
- SiteSpec versions, approvals, releases, events, traces, incidents and usage evidence stay append-only where defined.
- Only authenticated signed merchant approval may publish, render a final reel or dispatch one immutable call batch.
- A click is not an order; provider acceptance is not merchant approval; a synthetic test is not live evidence.

## What is implemented

### Customer experience

- WhatsApp-first entry plus optional Studio.
- Website, Reels or Both intent preserved across channels.
- Business type inferred from `home_bakery`, `tailor`, `tutor`, `salon`, `home_service`, `retailer` or `other`.
- At most one consolidated missing-facts question.
- Structured Lovable-style Studio: safe live canvas, mobile/desktop preview, section navigation, offerings/media management, reorder, undo, saved/unsaved cues and conflict recovery.
- Multiple projects, cursor-based deltas and compare-and-swap conflicts.
- Linked-browser listing/revocation, account export and append-only deletion requests.

### Website/release

- Immutable `SiteSpecV2`, private previews, separate verifier, signed checklist and deterministic promotion.
- Stable `data-pg` handles and constrained layouts.
- Tracked WhatsApp CTA redirect and append-only analytics.

### Reels

- Explicit idempotent lifecycle: `draft -> approved -> rendering -> rendered -> delivering -> delivered|delivery_failed`.
- Duplicate delivery cannot send a second WhatsApp media message.
- FFprobe and Polly receipts reconcile actual usage.
- Trend claims require fresh source/date/evidence; otherwise result is `insufficient_signal`.
- No automatic social posting.

### Calls

- Per-lead attempt lifecycle and provider idempotency.
- Remaining cost cap checked before each attempt.
- Exact Vapi batch/lead/attempt/call webhook binding.
- Recording decline and do-not-call transitions.
- Only granted-consent recordings may receive a 30-day private artifact receipt.
- Calls fail closed unless `CALLING_LIVE_ENABLED=true`.

### Operations

- Tenant quotas and append-only usage/cost ledger.
- Quotas for model turns, WhatsApp, storage, rendering, Polly and call cost.
- Prepared AWS alarms for DLQ depth, queue age, relay Lambda errors and EC2 health.
- Prepared SNS notifications and EC2 system-check recovery.
- Prepared separate encrypted merchant-media and recording buckets.

## Known gaps and truthful limitations

1. **WhatsApp is offline by design right now.** Reconnect only after AWS isolation deployment and acceptance.
2. **No production Meta number.** Public strangers cannot use the current test number.
3. **No approved outbound Meta template.** Follow-ups outside 24 hours remain unreliable.
4. **No completed real merchant journey** through voice/photos -> preview -> approval -> published site -> reel -> metrics on the current runtime.
5. **AWS template not deployed.** New alarms, media bucket and isolated bridge are code-only.
6. **AWS media client is not wired to Worker/Studio.** Convex remains the live 16 MiB fallback.
7. **Media upload is single PUT, not resumable multipart.** Interrupted uploads retry from the start.
8. **No live Vapi acceptance.** Calling must stay disabled until separate declined/granted tests pass and telecom readiness is reviewed.
9. **No Instagram connection or automatic posting.** Do not sell this as live functionality.
10. **No payment/subscription enforcement.** Pricing is founder-operated for now.
11. **No custom domain.** Customer pages remain paths under the ProofGate `workers.dev` host.
12. **One EC2 instance.** Recovery is prepared, but there is no multi-AZ failover or autoscaling.
13. **Quota reservations do not yet expire/release automatically.** Failed or declined expensive operations can conservatively hold allowance.
14. **Model/render actual reconciliation is incomplete at every runtime edge.** Some usage remains reservation-based.
15. **Some older documents are stale.** In particular, `README.md`, `docs/provider-readiness.md` and some Product Hunt percentages may claim an origin or readiness state superseded by this file and the latest `EVIDENCE.md` entries.

## Safe deployment order

Do not change this order:

1. Pull a clean pushed commit and run the complete local gate.
2. Deploy Convex production schema/functions.
3. Deploy the main Cloudflare Worker.
4. Authenticate to AWS account `917394547881` in `ap-south-1`.
5. Validate `infra/aws/cloudformation.yaml` through AWS.
6. Deploy the exact pushed commit with `infra/aws/deploy.ps1` or the equivalent reviewed CloudShell procedure.
7. Confirm the SNS email subscription, inspect all five alarms and run one controlled SNS notification.
8. Perform a fresh coordinated service-secret rotation across Worker, Convex dev/prod and AWS Secrets Manager without displaying the value.
9. Configure the server-only AWS media capability origin/secret and wire the typed `packages/merchant-media` client into authenticated Worker asset registration.
10. Verify the Hermes gateway environment contains no admin, guardian, Vapi or AWS service secret.
11. Verify the effective WhatsApp tool registry contains only `axcas_continue` and `axcas_status`.
12. Run adversarial prompts asking for shell, Python and environment output. No command approval or technical data may reach WhatsApp.
13. Restore KV `hermes_origin` only after the preceding checks pass.
14. Complete one real allowlisted WhatsApp text/photo/voice flow.
15. Register the Axcas production number and Meta utility template before public onboarding.

Do not deploy an uncommitted workstation tree. The AWS deployer accepts an exact 40-character pushed commit.

## Product-launch acceptance

Do not call the product publicly self-service until all are checked:

- [ ] Production Meta number accepts a non-allowlisted user.
- [ ] Approved Meta template works after the 24-hour service window.
- [ ] AWS isolated bridge/Hermes runtime is deployed from the current commit.
- [ ] Effective WhatsApp tools contain no terminal/file/process/code execution.
- [ ] One genuine WhatsApp-only merchant publishes a site.
- [ ] One genuine combined WhatsApp/Studio merchant publishes a site.
- [ ] At least two business types complete without operator shell intervention.
- [ ] One genuine merchant-media reel renders, verifies and arrives privately on WhatsApp.
- [ ] One real CTA produces a metrics report.
- [ ] Separate Vapi recording-declined and recording-granted self-tests pass.
- [ ] Export, deletion request and session revocation are exercised live.
- [ ] CloudWatch/SNS alerts and S3 lifecycle policies are read back from AWS.
- [ ] Cost usage for the pilot merchants is reviewed before fixing the ₹499 plan limits.

## Recommended access handoff

The founder should personally keep billing ownership. Give the teammate named access:

1. GitHub collaborator.
2. Cloudflare account member or a new scoped token limited to the two Workers, KV and required secrets.
3. Convex team/project member.
4. AWS IAM Identity Center or least-privilege IAM role for the `proofgate-foundation` stack; never the root login.
5. Meta Business portfolio/app/WhatsApp Manager role.
6. Vapi workspace member.
7. Nebius/model-provider workspace member or a newly issued runtime key.

After access is transferred, rotate any shared token. Do not send `.env` through WhatsApp, email or Git.

## Files to read in order

1. `AGENTS.md` — operating rules and scope.
2. `TEAMMATE_HANDOFF.md` — current account/deployment state.
3. Latest entries around the end of `EVIDENCE.md` — receipts and explicit non-claims.
4. `docs/architecture.md` — capability boundaries.
5. `infra/aws/README.md` — AWS validation and media-boundary runbook.
6. `infra/cloudflare/README.md` — Worker/KV/secrets operations.
7. `infra/convex/README.md` — deployment separation.
8. `docs/LIVE_ACCEPTANCE.md` — real acceptance checklist.
9. `PROOFGATE_BUILD_BIBLE.md` — full specification; note that its historical bakery-only statements are superseded by `AGENTS.md` for the current multi-SME phase.

## First teammate session

The safest first session is operational, not feature work:

1. Obtain named provider access.
2. Clone the latest `main` (which includes baseline `8faec3e` and this handoff).
3. Run all 231 checks and TypeScript.
4. Read the last 20 development-gate bullets in `EVIDENCE.md`.
5. Sign in to AWS and read the existing stack/instance state without changing it.
6. Compare the instance checkout and effective Hermes config with current Git.
7. Plan the coordinated secret rotation and AWS deployment.
8. Keep `hermes_origin` absent until the security acceptance is recorded.

If any provider or live-state observation contradicts this file, preserve the observation, add it to `EVIDENCE.md`, and treat the safer state as authoritative until the contradiction is resolved.
