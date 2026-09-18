import { createHash } from "node:crypto";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";

const MediaVerificationMessageSchema = z.object({
  schemaVersion: z.literal(1),
  action: z.literal("verify_media_checksum"),
  merchantId: z.string().regex(/^[a-z0-9-]{3,64}$/),
  assetId: z.string().regex(/^[A-Za-z0-9_-]{3,128}$/),
  bucket: z.string().min(3).max(255),
  key: z.string().regex(/^private\/[a-z0-9-]{3,64}\/[A-Za-z0-9_-]{3,128}\/source$/),
}).strict();

export async function verifyMediaBytes(body: AsyncIterable<Uint8Array>, expected: { expectedSha256: string; expectedBytes: number }) {
  if (!/^[a-f0-9]{64}$/.test(expected.expectedSha256) || !Number.isInteger(expected.expectedBytes) || expected.expectedBytes <= 0 || expected.expectedBytes > 1_073_741_824) {
    throw new Error("invalid media verification contract");
  }
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of body) {
    bytes += chunk.byteLength;
    if (bytes > 1_073_741_824) throw new Error("uploaded media exceeds the service limit");
    hash.update(chunk);
  }
  const sha256 = hash.digest("hex");
  return { sha256, bytes, verified: bytes === expected.expectedBytes && sha256 === expected.expectedSha256 };
}

const s3 = new S3Client({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });

export async function handler(event: { Records?: Array<{ body?: string; messageId?: string }> }): Promise<{ batchItemFailures: Array<{ itemIdentifier: string }> }> {
  const stateTable = process.env.AXCAS_STATE_TABLE;
  const ledgerTable = process.env.AXCAS_LEDGER_TABLE;
  const expectedBucket = process.env.AXCAS_ASSETS_BUCKET;
  if (!stateTable || !ledgerTable || !expectedBucket) throw new Error("media verifier is not configured");
  const failures: Array<{ itemIdentifier: string }> = [];
  for (const record of event.Records ?? []) {
    try {
      const message = MediaVerificationMessageSchema.parse(JSON.parse(record.body ?? ""));
      if (message.bucket !== expectedBucket || message.key !== `private/${message.merchantId}/${message.assetId}/source`) throw new Error("media verification scope mismatch");
      const object = await s3.send(new GetObjectCommand({ Bucket: message.bucket, Key: message.key }));
      const metadata = object.Metadata ?? {};
      if (metadata.merchantid !== message.merchantId || metadata.assetid !== message.assetId || !object.Body || !(Symbol.asyncIterator in object.Body)) throw new Error("media object identity mismatch");
      const result = await verifyMediaBytes(object.Body as AsyncIterable<Uint8Array>, {
        expectedSha256: metadata.sourcesha256 ?? "",
        expectedBytes: Number(metadata.declaredbytes ?? 0),
      });
      const status = result.verified ? "ready" : "verification_failed";
      const now = Date.now();
      await dynamo.send(new UpdateCommand({
        TableName: stateTable,
        Key: { pk: `TENANT#${message.merchantId}`, sk: `ASSET#${message.assetId}` },
        UpdateExpression: "SET #status = :status, verifiedAt = :now, verifiedSha256 = :sha, verifiedBytes = :bytes",
        ConditionExpression: "#status = :pending",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":status": status, ":pending": "uploaded_pending_verification", ":now": now, ":sha": result.sha256, ":bytes": result.bytes },
      }));
      await dynamo.send(new PutCommand({
        TableName: ledgerTable,
        Item: { pk: `TENANT#${message.merchantId}`, sk: `MEDIA#${message.assetId}#${result.sha256}`, eventType: "media_checksum_verified", assetId: message.assetId, verified: result.verified, bytes: result.bytes, sha256: result.sha256, recordedAt: now },
        ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
      }));
    } catch {
      if (record.messageId) failures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures: failures };
}
