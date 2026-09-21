import { createStrandsAgent } from "./agent";
import type { ProofGateBoundary } from "./boundary";
import type { MerchantWorkflowInput } from "./schemas";
import { runMerchantWorkflow } from "./workflow";

/**
 * Production entry point. Strands supplies bounded structured reasoning while
 * application code owns every state transition and side effect.
 */
export function runDeterministicStrandsWorkflow(
  input: MerchantWorkflowInput,
  boundary: ProofGateBoundary,
  env: NodeJS.ProcessEnv = process.env,
) {
  return runMerchantWorkflow(input, { agent: createStrandsAgent(env), boundary });
}
