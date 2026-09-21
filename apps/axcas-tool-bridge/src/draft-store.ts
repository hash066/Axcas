import { createHash } from "node:crypto";
import { z } from "zod";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import { MerchantWorkflowInputSchema, type MerchantWorkflowInput } from "../../strands-orchestrator/src/schemas";

export const MerchantDraftCheckpointSchema = z.enum([
  "received",
  "assets_saved",
  "intake_saved",
  "candidate_ready",
  "verified",
  "approval_sent",
  "published",
  "reel_approval_sent",
  "reel_rendered",
  "reel_delivered",
  "metrics_ready",
]);

export const MerchantDraftV1Schema = z.object({
  schemaVersion: z.literal(1),
  input: MerchantWorkflowInputSchema,
  askedQuestion: z.boolean(),
  checkpoint: MerchantDraftCheckpointSchema,
  operationIds: z.array(z.string().min(3).max(256)).max(32),
  expiresAt: z.number().int().positive(),
  updatedAt: z.number().int().nonnegative(),
}).strict();
export type MerchantDraftV1 = z.infer<typeof MerchantDraftV1Schema>;

export type WorkflowDraftStore = {
  save: (input: MerchantWorkflowInput, state?: Partial<Pick<MerchantDraftV1, "askedQuestion" | "checkpoint" | "operationIds">>) => Promise<void>;
  load: (context: MerchantWorkflowInput["context"]) => Promise<MerchantDraftV1 | null>;
  clear: (context: MerchantWorkflowInput["context"]) => Promise<void>;
};

function merchantKey(context: MerchantWorkflowInput["context"]): string {
  return createHash("sha256").update(`${context.platform}:${context.userId}`).digest("hex");
}

export function createWorkflowDraftStore(env: NodeJS.ProcessEnv = process.env): WorkflowDraftStore | null {
  const tableName = env.AXCAS_STATE_TABLE;
  if (!tableName) return null;
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
  const key = (context: MerchantWorkflowInput["context"]) => ({ pk: `MERCHANT#${merchantKey(context)}`, sk: "WORKFLOW_DRAFT#active" });
  return {
    save: async (input, state = {}) => {
      const parsed = MerchantWorkflowInputSchema.parse(input);
      const now = Date.now();
      const draft = MerchantDraftV1Schema.parse({
        schemaVersion: 1,
        input: parsed,
        askedQuestion: state.askedQuestion ?? false,
        checkpoint: state.checkpoint ?? (parsed.assetIds.length ? "assets_saved" : "received"),
        operationIds: state.operationIds ?? [parsed.workflowId],
        expiresAt: Math.floor(now / 1000) + 86_400,
        updatedAt: now,
      });
      await client.send(new PutCommand({
        TableName: tableName,
        Item: { ...key(parsed.context), entityType: "merchant_workflow_draft", draftJson: JSON.stringify(draft), expiresAt: draft.expiresAt, updatedAt: draft.updatedAt },
      }));
    },
    load: async (context) => {
      const result = await client.send(new GetCommand({ TableName: tableName, Key: key(context), ConsistentRead: true }));
      const draftJson = result.Item?.draftJson;
      const expiresAt = result.Item?.expiresAt;
      if (typeof draftJson !== "string" || typeof expiresAt !== "number" || expiresAt < Math.floor(Date.now() / 1000)) return null;
      return MerchantDraftV1Schema.parse(JSON.parse(draftJson));
    },
    clear: async (context) => {
      const now = Date.now();
      // The runtime role deliberately has no broad DeleteItem capability. Replace the
      // sensitive draft with an already-expired, content-free tombstone; DynamoDB TTL
      // removes it asynchronously and load() treats it as absent immediately.
      await client.send(new PutCommand({
        TableName: tableName,
        Item: {
          ...key(context),
          entityType: "merchant_workflow_draft_tombstone",
          expiresAt: Math.floor(now / 1000) - 1,
          updatedAt: now,
        },
      }));
    },
  };
}
