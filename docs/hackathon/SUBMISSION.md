# Axcas — Agents for Humans submission

## Track

**Professional Agents**

## One-line pitch

Axcas is the background growth operator for WhatsApp-first small businesses: say what you sell, send your photos, and receive a checked website and measurable growth loop—with the agent interrupting only for the one decision that changes the outside world.

## The problem

Millions of small-business owners sell through chat while juggling pricing, photos, enquiries, content, and follow-up manually. Conventional website builders and marketing dashboards transfer more work to the owner. Agencies cost too much, and generic chatbots stop at advice.

Axcas does the repetitive work inside the channel the merchant already uses. It asks at most one consolidated missing-facts question, keeps reversible drafting work under the hood, and presents a single plain-language checklist before anything is published.

## What it does

1. Accepts a natural WhatsApp bundle of voice, text, prices, services, and photos.
2. Infers the business type and consolidates any genuinely missing facts into one question.
3. Produces a typed, immutable business-site specification; no model writes page code.
4. Builds a private preview and sends it through an independent verifier.
5. Presents one owner checklist bound to the exact candidate hash.
6. Deterministically publishes only the approved, verified version.
7. Tracks privacy-safe page views and WhatsApp enquiry clicks.
8. Proposes an evidence-based improvement without auto-publishing it.
9. Creates structured reel concepts from merchant-owned media and can render one approved private reel.

Axcas Studio is an optional visual companion. WhatsApp remains the primary product.

## Why this is an agent, not a chatbot

The agent owns a bounded multi-step job over time. It gathers evidence, chooses the next reversible step, invokes typed tools, waits for independent verification, pauses at a real owner decision, resumes from durable state, and later evaluates results. Its authority is deliberately limited: it cannot approve its own candidate, change the verifier result, publish without the owner, scrape leads, or invent live evidence.

## Strands Agents implementation

The hackathon agent is implemented with the Strands Agents SDK as the orchestration layer. Its tools expose the existing typed Axcas boundaries for intake, candidate preparation, verification dispatch, approval request, metrics, and improvement proposal. Tool results are structured and tenant-bound. Deterministic policy—not the model—owns publication and rollback.

The demonstrated trace must show the real Strands model → reasoning → tool → observation loop for the same merchant run shown in the video. A test double or a deterministic journey fixture proves contracts, not Strands usage. Claim Amazon Bedrock AgentCore only after a deployed runtime has been invoked and its receipt is preserved.

## AWS usage

- Strands Agents SDK for model-driven orchestration.
- AWS runtime for the agent boundary and background jobs.
- Amazon Polly for approved English-India reel voiceovers.
- FFmpeg on AWS for verified 1080×1920 H.264/AAC rendering.
- Private encrypted S3 for consented call recordings and prepared merchant media.
- API Gateway, encrypted SQS/DLQ, Systems Manager, CloudWatch, and Secrets Manager for the isolated runtime boundary.

Only services exercised in the recorded submission run belong in the final Devpost wording. Infrastructure declared in source but not deployed is implementation work, not live-demo evidence.

## Safety and trust

- Agents create validated data, never runtime HTML or scripts.
- Builder, verifier, and release authority are capability-separated.
- Approvals bind the authenticated WhatsApp sender and exact immutable scope hash.
- Merchant photos remain private unless explicitly selected for publication.
- No customer supplies API keys, cloud accounts, or storage credentials.
- No scraped leads, payment taking, automatic social posting, or synthetic product imagery.
- Calls require supplied leads, purpose-specific consent, an exact batch approval, and a separate recording-consent step.

## Demonstrated scope

The submission video must show only behavior that succeeds in the recorded run. Provider-gated features that are not demonstrated live should be described as safeguards or future integrations, not as completed evidence.

Recommended recorded path:

`merchant voice/photos -> one concise response -> private preview -> verifier result -> one checklist -> published site -> tracked WhatsApp CTA -> metrics -> proposed improvement`

Make the CTA and metric evidence part of the same run: open the newly published site as a visitor, tap the tracked WhatsApp button, then ask Axcas, “How is my site doing, and what should I test next?” The explicit request permits an immediate proposal before the normal seven-day/100-view threshold and creates a real, understandable outcome without seeding synthetic analytics.

## Pre-existing-work disclosure

The original ProofGate release-verification foundation predates the submission period. It supplied the capability-separated builder/verifier/release concept and append-only evidence model. During the hackathon period, the team built **Axcas** as a new Professional Agent experience on top of that foundation: WhatsApp-first multimodal intake, small-business schemas and renderers, tenant isolation, owner-bound checklists, visual Studio, reel workflow, provider boundaries, AWS runtime hardening, and the Strands orchestration layer.

This pre-existing foundation is disclosed to comply with the hackathon rules; the submission should be judged on the new Axcas agent and work created during the submission period.

Repository history makes the boundary auditable: ProofGate foundation commits `263625e` through `b0cce3c` predate the event; the first Axcas commit is `6b514d3` on 13 August 2026, inside the 10 August–14 September submission period. Do not squash away this history before judging.

## Owner-authorized source disclosure

The constrained reel workspace adapts five Remotion compositions from `gdpranavl/YouLeft_KumarKindaTemplates` at commit `ed8d037f7b35e0cc971521801df07e0edf69828c`; `apps/reel-template-worker/UPSTREAM.md` records the source and owner authorization. Before submission, make the rights basis independently auditable: the upstream owner must be an entrant/team member or provide a durable public license or written grant covering the submission. Do not rely only on a private chat assertion.

## Testing instructions for judges

These instructions are not complete until a judge can enter without being manually allowlisted.

1. Open the public live-demo URL supplied in Devpost.
2. Use the supplied no-payment judge workspace or credentials, if login is required.
3. Submit the included sample voice note and merchant-owned photos through the supported interface.
4. Open the returned private preview.
5. Review the plain-language checklist and approve the exact candidate.
6. Open the published mobile site and tap the tracked WhatsApp enquiry CTA.
7. Request the activity summary and inspect the proposed improvement.

Do not require judges to provide Meta, AWS, Vapi, Cloudflare, Convex, or model credentials.

The Meta test number is not judge access: it rejects non-allowlisted numbers. A recorded fixture is not a functioning demo. Before submission, either provision the production Axcas WhatsApp number or provide a free browser-accessible judge path backed by the same live Strands workflow and clearly label any provider boundary that is sandboxed.

## Links to fill before submission

- Live demo: `TODO`
- Public repository: <https://github.com/hash066/ProofGate>
- Demo video (public YouTube/Vimeo, no more than five minutes): `TODO`
- Architecture image: `docs/hackathon/architecture.svg`
- AWS Builder post: `TODO`
- AWS Builder ID included in Devpost: `TODO`

## Final truthful checklist

- [ ] Axcas is registered as a new hackathon project; the pre-existing ProofGate foundation is disclosed with the commit boundary above.
- [ ] Strands runtime is present in the public repository and used in the demonstrated flow.
- [ ] A real local invocation passes with recorded structured tool calls.
- [ ] AgentCore/AWS deployment is claimed only if invoked successfully.
- [ ] Live demo remains reachable without paid access through the judging period.
- [ ] A judge can enter without owner intervention or Meta test-number allowlisting.
- [ ] Repository About section shows the MIT license.
- [ ] Public README includes exact Strands installation, configuration, run, and test instructions.
- [ ] Demo video is public, under five minutes, and understandable without narration context.
- [ ] Video explicitly covers the problem, audience, and why it matters.
- [ ] Devpost description discloses pre-existing ProofGate work.
- [ ] No test fixture, synthetic event, or recorded fallback is described as live evidence.
