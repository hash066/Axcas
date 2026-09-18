import { createHash } from "node:crypto";

import { z } from "zod";

import {
  CampaignApprovalV2Schema,
  CreativeCampaignV2Schema,
  MetaConnectionV1Schema,
} from "../../../packages/domain/src/production-redesign";
import {
  executeApprovedCampaign,
  validateApprovedCampaignExecution,
  type CampaignExecutorDependencies,
} from "./campaign-executor";

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/);

export const CampaignRuntimeEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  executionId: slug,
  campaign: CreativeCampaignV2Schema,
  approval: CampaignApprovalV2Schema,
  connection: MetaConnectionV1Schema,
  requestedAt: z.number().int().nonnegative(),
}).strict();

export type CampaignRuntimeEnvelope = z.infer<typeof CampaignRuntimeEnvelopeSchema>;

type CampaignRuntimeOutcome = {
  status: "measuring";
  campaignId: string;
  scopeHash: string;
  organicMode: "normal" | "trial_reel";
  paidStatus: "DISABLED" | "ACTIVE";
};

export type CampaignRuntimeDependencies = {
  claimExecution: (input: { executionId: string; campaignId: string; merchantId: string; scopeHash: string; claimedAt: number }) => Promise<boolean>;
  execute: (input: CampaignRuntimeEnvelope & { now: number }) => Promise<CampaignRuntimeOutcome>;
  appendEvidence: (record: Record<string, unknown>) => Promise<void>;
  putState: (record: Record<string, unknown>) => Promise<void>;
  now?: () => number;
};

function eventKey(eventType: string, executionId: string, scopeHash: string): string {
  return createHash("sha256").update(`${eventType}:${executionId}:${scopeHash}`).digest("hex");
}

export async function runCampaignRuntime(inputValue: unknown, dependencies: CampaignRuntimeDependencies) {
  const envelope = CampaignRuntimeEnvelopeSchema.parse(inputValue);
  const now = (dependencies.now ?? Date.now)();
  const validated = await validateApprovedCampaignExecution({
    campaign: envelope.campaign,
    approval: envelope.approval,
    connection: envelope.connection,
    now,
  });
  const claim = {
    executionId: envelope.executionId,
    campaignId: envelope.campaign.campaignId,
    merchantId: envelope.campaign.merchantId,
    scopeHash: validated.scopeHash,
    claimedAt: now,
  };
  if (!await dependencies.claimExecution(claim)) {
    return { status: "duplicate" as const, executionId: envelope.executionId, campaignId: envelope.campaign.campaignId };
  }

  const evidenceBase = {
    pk: `CAMPAIGN#${envelope.campaign.campaignId}`,
    executionId: envelope.executionId,
    campaignId: envelope.campaign.campaignId,
    merchantId: envelope.campaign.merchantId,
    scopeHash: validated.scopeHash,
  };
  await dependencies.appendEvidence({
    ...evidenceBase,
    sk: `EVENT#${eventKey("started", envelope.executionId, validated.scopeHash)}`,
    eventType: "campaign_execution_started",
    recordedAt: now,
  });

  try {
    const outcome = await dependencies.execute({ ...envelope, now });
    if (outcome.campaignId !== envelope.campaign.campaignId || outcome.scopeHash !== validated.scopeHash || outcome.status !== "measuring") {
      throw new Error("campaign executor returned an invalid outcome");
    }
    const completedAt = (dependencies.now ?? Date.now)();
    await dependencies.putState({
      pk: `CAMPAIGN#${envelope.campaign.campaignId}`,
      sk: "CURRENT",
      merchantId: envelope.campaign.merchantId,
      executionId: envelope.executionId,
      scopeHash: validated.scopeHash,
      status: outcome.status,
      organicMode: outcome.organicMode,
      paidStatus: outcome.paidStatus,
      updatedAt: completedAt,
    });
    await dependencies.appendEvidence({
      ...evidenceBase,
      sk: `EVENT#${eventKey("completed", envelope.executionId, validated.scopeHash)}`,
      eventType: "campaign_execution_completed",
      outcome,
      recordedAt: completedAt,
    });
    return outcome;
  } catch (error) {
    const failedAt = (dependencies.now ?? Date.now)();
    const failureCode = error instanceof Error && /approval|permission|ceiling|connection/.test(error.message)
      ? "policy_rejected"
      : "execution_failed";
    await dependencies.putState({
      pk: `CAMPAIGN#${envelope.campaign.campaignId}`,
      sk: "CURRENT",
      merchantId: envelope.campaign.merchantId,
      executionId: envelope.executionId,
      scopeHash: validated.scopeHash,
      status: "failed",
      failureCode,
      updatedAt: failedAt,
    });
    await dependencies.appendEvidence({
      ...evidenceBase,
      sk: `EVENT#${eventKey(`failed:${failureCode}`, envelope.executionId, validated.scopeHash)}`,
      eventType: "campaign_execution_failed",
      failureCode,
      recordedAt: failedAt,
    });
    throw error;
  }
}

export function createCampaignRuntimeHandler(dependencies: CampaignRuntimeDependencies) {
  return async (event: unknown) => runCampaignRuntime(event, dependencies);
}

export function createCampaignExecutionHandler(
  runtimeDependencies: Omit<CampaignRuntimeDependencies, "execute">,
  executorDependencies: CampaignExecutorDependencies,
) {
  return createCampaignRuntimeHandler({
    ...runtimeDependencies,
    execute: (input) => executeApprovedCampaign(input, executorDependencies),
  });
}
