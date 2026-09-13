import { Agent, type Tool } from "@strands-agents/sdk";
import { BedrockModel } from "@strands-agents/sdk/models/bedrock";
import type { z } from "zod";

export type StructuredAgentResult = { structuredOutput?: unknown };
export type StructuredAgent = {
  invoke: (prompt: string, options?: { structuredOutputSchema: z.ZodType }) => Promise<StructuredAgentResult>;
};

const SYSTEM_PROMPT = `You are Axcas Workflow Orchestrator, an operations agent for WhatsApp-first small businesses.
Use only facts and immutable asset IDs in the supplied workflow context. Never invent prices, claims, media, consent, verification, or results.
Generate only the requested structured data. You may create or revise a SiteSpec, but never HTML, JavaScript, shell commands, credentials, approvals, verification evidence, or deployment state.
The application—not you—owns tenant identity, verification dispatch, approvals, promotion, rollback, provider calls, and release state.
Keep merchant-facing language concise, professional, and free of implementation details.`;

export function createStrandsAgent(env: NodeJS.ProcessEnv = process.env, tools: Tool[] = []): StructuredAgent {
  const model = new BedrockModel({
    modelId: env.AXCAS_STRANDS_MODEL_ID ?? "apac.amazon.nova-lite-v1:0",
    region: env.AWS_REGION ?? "ap-south-1",
    temperature: 0,
    maxTokens: 4_000,
    clientConfig: { retryMode: "standard", maxAttempts: 3 },
  });
  return new Agent({ model, systemPrompt: SYSTEM_PROMPT, tools, toolExecutor: "sequential" });
}
