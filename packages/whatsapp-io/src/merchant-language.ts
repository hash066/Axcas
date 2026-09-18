/**
 * Merchant-facing language guard.
 *
 * AGENTS.md and DEMO_RUNBOOK.md both state that internal vocabulary — "policy applied",
 * "candidate created", "verification requested", raw identifiers — must never reach a
 * merchant. That rule was previously enforced only by `customerText` on
 * `CustomerOutboxMessageSchema` (packages/domain/src/workflow.ts), and nothing drains that
 * table, so every live WhatsApp send bypassed it. This guard sits on the transport boundary
 * instead, where no send path can skip it.
 *
 * Rules are deliberately narrow. A false positive throws on a real merchant send, so phrases
 * that a merchant could legitimately receive ("cancellation policy", "verified") are fixed at
 * the call site rather than matched here.
 */

export type MerchantLanguageRule = { readonly name: string; readonly pattern: RegExp };

export const MERCHANT_LANGUAGE_RULES: readonly MerchantLanguageRule[] = [
  { name: "code_fence", pattern: /```/ },
  { name: "vendor_or_infrastructure", pattern: /\b(?:ProofGate|Convex|Cloudflare|Hermes|Vapi|Bedrock|Strands|Meta|AWS|Lambda|S3|DynamoDB|SQS|Fargate|CloudFront|Cognito|API Gateway|WAF|Polly|FFmpeg|backend|provider)\b/i },
  { name: "pipeline_vocabulary", pattern: /\b(?:candidate|capabilit(?:y|ies)|verifier|verification|intake|rollback)\b/i },
  { name: "policy_status", pattern: /\bpolic(?:y|ies)\s+(?:applied|checked|passed|failed|enforced)\b/i },
  { name: "identifier_vocabulary", pattern: /\b(?:site\s?id|asset\s?id|merchant\s?id|workflow\s?id|approval\s?id|version\s?id|spec\s?hash|bundle\s?id|slug)\b/i },
  { name: "schema_vocabulary", pattern: /\b(?:SiteSpecV2|SiteSpec|schemaVersion|specHash)\b/ },
  { name: "generated_slug", pattern: /\b[a-z0-9]+(?:-[a-z0-9]+)+-[0-9a-f]{6}\b/ },
  { name: "environment_variable", pattern: /(?:^|\W)(?:PROOFGATE|HERMES|META|VAPI|AWS|CONVEX|CLOUDFLARE)_[A-Z0-9_]+/ },
  { name: "shell_verb", pattern: /(?:^|\s)(?:cd|export|execute_code|subprocess)\b/i },
  { name: "shell_command", pattern: /\b(?:npm|npx|pnpm|yarn)\s+(?:run\s+)?[a-z0-9:_-]+/i },
  { name: "internal_path", pattern: /\/opt\/proofgate/i },
  { name: "opaque_identifier", pattern: /\b[a-f0-9]{48,}\b/i },
  { name: "preview_token", pattern: /\bpgp_[A-Za-z0-9_-]{8,}/ },
  { name: "approval_callback_id", pattern: /\bpg:[a-z0-9-]{3,64}:(?:approve|deny)\b/i },
  { name: "stack_trace", pattern: /(?:traceback|stack trace|exception at)\b/i },
  { name: "credential", pattern: /(?:secret|token|password)\s*[=:]\s*[A-Za-z0-9_+/-]{16,}/i },
  { name: "command_approval", pattern: /command approval required/i },
];

/** Returns the names of every rule the text violates, in declaration order. */
export function findMerchantLanguageViolations(value: string): readonly string[] {
  return MERCHANT_LANGUAGE_RULES.filter((rule) => rule.pattern.test(value)).map((rule) => rule.name);
}

/**
 * Fails closed on any outbound text carrying internal vocabulary. The thrown message names the
 * offending rules so a blocked send is diagnosable from logs without reproducing it.
 */
export function assertMerchantSafeText(value: string, field: string): void {
  const violations = findMerchantLanguageViolations(value);
  if (violations.length > 0) {
    throw new Error(`${field} contains internal vocabulary that must not reach a merchant: ${violations.join(", ")}`);
  }
}
