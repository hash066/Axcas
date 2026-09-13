# Axcas Strands orchestrator

This workspace is the AWS-hosted orchestration layer for Axcas. It uses the official TypeScript Strands Agents SDK (`@strands-agents/sdk` 1.17.0) and Amazon Bedrock. It is not a second release authority.

## What Strands owns

The build invocation gives one Strands agent exactly four Zod-validated tools, executed sequentially:

1. `capture_merchant_intake` extracts only supplied facts or returns one consolidated question.
2. `create_site_candidate` submits one `SiteSpecV2`; it cannot submit HTML or publish.
3. `dispatch_independent_verification` gives the credential-free verifier only a public preview and single-use evidence capability.
4. `request_release_approval` creates the exact identity-bound approval checklist only after accepted, passing evidence. It cannot approve or promote.

The build stops at `awaiting_approval`. A separate invocation for an already-published version exposes only `read_published_site_metrics` and `record_improvement_proposal`. Deterministic code first fetches the public site and matches its version and spec-hash headers. The proposal never publishes itself.

The model never receives provider credentials. There are no shell, filesystem, approval, promotion, call, payment, or social-posting tools.

## Run

Prerequisites are Node.js 22+, the EC2 instance role (or local AWS credential chain) with Bedrock model invocation, and server-only ProofGate credentials. From the repository root:

```sh
npm ci
export AWS_REGION=ap-south-1
export STRANDS_MODEL_ID=global.anthropic.claude-sonnet-4-6
export PROOFGATE_ADMIN_URL=https://proofgate-whatsapp-growth.proofgate-harshita.workers.dev
export PROOFGATE_SERVICE_SECRET='<server-only secret>'
export SITE_VERIFIER_URL='<credential-free verifier origin>'
npm start --workspace=@axcas/strands-orchestrator
```

In another terminal, verify the runtime and submit the checked-in demo request:

```sh
curl -s http://127.0.0.1:8080/ping
curl -s -X POST http://127.0.0.1:8080/invocations \
  -H 'content-type: application/json' \
  --data-binary @apps/strands-orchestrator/examples/build.json
```

The expected terminal state is either `needs_facts` with one consolidated customer-safe question, or `awaiting_approval` after candidate creation and independent verification. A build invocation must never return a published state. To exercise the post-publication learning phase, send `mode: "improvement"` with an exact already-public `siteId`, `versionId`, and `specHash`; the runtime rejects a mismatch before exposing metrics tools.

The `/ping` and `/invocations` paths match the Bedrock AgentCore runtime HTTP contract. On the current EC2 architecture, Hermes calls the same `runStrandsToolWorkflow` through the isolated Unix-socket tool bridge using the `orchestrate_build` action. The server binds to loopback by default.

The sample contains placeholder immutable asset IDs. Replace them with assets registered for the authenticated test merchant before a live run. Do not put secrets in the sample or Git.

## Test

```sh
npx vitest run tests/unit/strands-orchestrator.test.ts tests/unit/aws-runtime.test.ts tests/unit/axcas-tool-bridge.test.ts
npm run typecheck
```

Tests prove the tool allowlist, order guards, tenant/asset/claim validation, verifier gate, one-question intake, build pause at approval, and published-version gate for metrics. They use direct SDK tool invocation, so CI does not incur Bedrock cost. A real Bedrock receipt is a separate deployment acceptance gate and must not be claimed until it is recorded in `EVIDENCE.md`.

Official references: [Strands TypeScript quickstart](https://strandsagents.com/docs/user-guide/quickstart/typescript/), [typed tools](https://strandsagents.com/docs/api/typescript/tool/), [sequential executor](https://strandsagents.com/docs/api/typescript/SequentialToolExecutor/), and [AgentCore deployment](https://strandsagents.com/docs/user-guide/deploy/deploy_to_bedrock_agentcore/typescript/).
