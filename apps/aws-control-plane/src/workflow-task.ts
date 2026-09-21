import { createHash } from "node:crypto";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";

import { MerchantWorkflowInputSchema, type MerchantWorkflowInput } from "../../strands-orchestrator/src/schemas";

const WorkflowTaskEnvelopeSchema = z.object({ workflowInput: MerchantWorkflowInputSchema }).strict();
export type WorkflowTaskEnvelope = z.infer<typeof WorkflowTaskEnvelopeSchema>;

type WorkflowOutcome = { status: string; [key: string]: unknown };
type WorkflowTaskDependencies = {
  execute: (input: MerchantWorkflowInput) => Promise<WorkflowOutcome>;
  putState: (record: Record<string, unknown>) => Promise<void>;
  appendEvidence: (record: Record<string, unknown>) => Promise<void>;
  now?: () => number;
};

export function parseWorkflowTaskEnvelope(raw: string): WorkflowTaskEnvelope {
  return WorkflowTaskEnvelopeSchema.parse(JSON.parse(raw));
}

function stableDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function runWorkflowTask(envelopeValue: unknown, dependencies: WorkflowTaskDependencies): Promise<WorkflowOutcome> {
  const envelope = WorkflowTaskEnvelopeSchema.parse(envelopeValue);
  const input = envelope.workflowInput;
  const outcome = await dependencies.execute(input);
  const recordedAt = (dependencies.now ?? Date.now)();
  const merchantId = input.merchantId ?? "pending";
  const digest = stableDigest(outcome);
  await dependencies.putState({
    pk: `WORKFLOW#${input.workflowId}`,
    sk: "CURRENT",
    merchantId,
    projectId: input.projectId,
    status: outcome.status,
    outcome,
    updatedAt: recordedAt,
  });
  await dependencies.appendEvidence({
    pk: `WORKFLOW#${input.workflowId}`,
    sk: `EVENT#workflow_outcome#${digest}`,
    eventType: "workflow_outcome",
    merchantId,
    projectId: input.projectId,
    outcome,
    recordedAt,
  });
  return outcome;
}

async function productionMain(): Promise<void> {
  const raw = process.env.AXCAS_WORKFLOW_INPUT;
  const stateTable = process.env.AXCAS_STATE_TABLE;
  const ledgerTable = process.env.AXCAS_LEDGER_TABLE;
  if (!raw || !stateTable || !ledgerTable) throw new Error("AWS workflow task configuration is incomplete");
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
  const [{ ProofGateBoundary }, { runDeterministicStrandsWorkflow }] = await Promise.all([
    import("../../strands-orchestrator/src/boundary"),
    import("../../strands-orchestrator/src/deterministic-workflow"),
  ]);
  const putState = async (record: Record<string, unknown>) => {
    await client.send(new PutCommand({ TableName: stateTable, Item: record }));
  };
  const appendEvidence = async (record: Record<string, unknown>) => {
    try {
      await client.send(new PutCommand({ TableName: ledgerTable, Item: record, ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)" }));
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error;
    }
  };
  const envelope = parseWorkflowTaskEnvelope(raw);
  const outcome = await runWorkflowTask(envelope, {
    execute: (input) => runDeterministicStrandsWorkflow(input, new ProofGateBoundary()),
    putState,
    appendEvidence,
  });
  process.stdout.write(`${JSON.stringify({ service: "axcas-workflow-task", status: outcome.status, workflowId: envelope.workflowInput.workflowId })}\n`);
}

if (process.env.AXCAS_WORKFLOW_TASK_AUTO_RUN === "1") {
  await productionMain();
}
