# Agents for Humans: Building Axcas, a background growth operator for WhatsApp-first businesses

Small-business owners do not need another dashboard. A tailor, tutor, baker, salon, or local retailer often already runs the business through WhatsApp: customer questions, prices, photos, availability, and follow-up all live in the chat. The missing piece is not advice. It is an agent that completes the repetitive work and asks the owner only when a decision genuinely matters.

That is why we built Axcas.

## From one message to a verified result

The merchant can send one natural bundle: a voice note, photos, prices, services, location, and lead time. Axcas infers a constrained business type and asks at most one consolidated missing-facts question. A Strands agent then coordinates typed tools for intake, candidate preparation, independent verification, the owner decision, metrics, and a later improvement proposal.

We deliberately did not give the model unrestricted website-writing or deployment access. The agent produces a Zod-validated `SiteSpec`; a code-owned renderer treats every value as untrusted data. The verifier receives only a public candidate and a single-use evidence capability. It receives no deployment or promotion credential. Finally, deterministic policy checks the candidate hash, verification contract, blockers, and owner-bound approval before changing the production pointer.

That separation makes the autonomy useful. Axcas can quietly perform reversible work while remaining unable to approve itself.

## Why Strands and AWS

Strands is the orchestration layer, not a label around a predetermined script. The production path gives the Strands agent a small set of tenant-bound tools, lets the model choose the next reversible action from the merchant goal and durable state, observes the structured result, and continues until input or owner authority is required. Each tool validates its input again at the application boundary. In the submitted demo, we will show the real Strands trace for the same merchant run—model invocation, tool selection, observation, pause, and resume—only after that live receipt exists.

The AWS foundation is designed to host the isolated background runtime and bounded media pipeline. API Gateway and encrypted SQS decouple public WhatsApp ingress from the worker. Systems Manager avoids public SSH. Secrets Manager keeps service credentials outside the customer-facing agent. Polly provides an English-India voice option for an approved reel, and FFmpeg validates the final 1080×1920 H.264/AAC output. Private S3 lifecycle rules bound retention for permitted call artifacts and merchant media. The published post will describe a component as live only when its deployment and invocation receipt has been preserved.

Amazon Bedrock AgentCore is optional in this hackathon. We will name it in the published version only if the submitted build is deployed and invoked there. The important property is preserved either way: hosting the agent does not give it the verifier or release authority.

## The hardest product decision

The first version exposed too many internal operations. A customer could encounter technical diagnostics or repeated approvals—exactly the burden the product was meant to remove. We redesigned the experience around three rules:

1. Keep provider and infrastructure details under the hood.
2. Ask at most one combined clarification question.
3. Ask for one checklist only when publishing, rendering a final reel, or dispatching an exact consented call batch.

Progress messages now describe customer outcomes: details saved, draft prepared, independent check complete, preview ready. They never include shell commands, environment variables, stack traces, or provider credentials.

## What we learned

An agent for humans is not defined by how often it speaks. It is defined by how much safe work it completes between interruptions. The best experience feels less like operating software and more like delegating to a careful teammate.

Axcas is still intentionally constrained. It does not scrape leads, take payments, auto-post social content, or generate synthetic product photos. Those limitations make the demonstrated promise credible: one message can become one checked business asset, one understandable decision, and one measurable outcome.

## What was new for this hackathon

Axcas was created during the Agents for Humans submission period. It builds on an earlier open-source ProofGate verification foundation, which supplied the capability-separated builder/verifier/release concept and append-only evidence model. We disclose that foundation rather than presenting it as hackathon work. The WhatsApp-first Axcas product, small-business workflow, tenant isolation, concise owner checklist, Studio companion, reel pipeline, provider boundaries, AWS runtime hardening, and Strands orchestration were built during the event. The public Git history preserves that boundary.

Repository: <https://github.com/hash066/ProofGate>

Live demo: **TODO before publishing**
