import { createHmac, timingSafeEqual } from "node:crypto";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";

const SessionEntrySchema = z.object({ challengeName: z.string().optional(), challengeResult: z.boolean().optional() }).passthrough();
const ChallengeEventSchema = z.object({
  triggerSource: z.string(),
  userName: z.string().min(1),
  request: z.object({
    userAttributes: z.record(z.string(), z.string()).default({}),
    session: z.array(SessionEntrySchema).default([]),
    privateChallengeParameters: z.record(z.string(), z.string()).optional(),
    challengeAnswer: z.string().optional(),
  }).passthrough(),
  response: z.record(z.string(), z.unknown()).default({}),
}).passthrough();

type ChallengeEvent = z.infer<typeof ChallengeEventSchema>;
type ChallengeDependencies = {
  sendCode: (input: { phoneNumber: string; code: string }) => Promise<{ providerMessageId?: string }>;
  bindIdentity?: (input: { authSubject: string; phoneNumber: string }) => Promise<void>;
  randomCode: () => string;
  now?: () => number;
  hashSecret?: string;
};

function answerHash(userName: string, code: string, expiresAt: number, secret: string): string {
  return createHmac("sha256", secret).update(`${userName}:${code}:${expiresAt}`).digest("hex");
}

export async function handleCognitoWhatsAppChallenge(eventValue: unknown, dependencies: ChallengeDependencies): Promise<ChallengeEvent> {
  const event = ChallengeEventSchema.parse(eventValue);
  const now = (dependencies.now ?? Date.now)();
  const secret = dependencies.hashSecret ?? "unit-test-only-secret";

  if (event.triggerSource.includes("DefineAuthChallenge")) {
    const last = event.request.session.at(-1);
    event.response.issueTokens = last?.challengeName === "CUSTOM_CHALLENGE" && last.challengeResult === true;
    event.response.failAuthentication = !event.response.issueTokens && event.request.session.length >= 3;
    event.response.challengeName = event.response.issueTokens || event.response.failAuthentication ? undefined : "CUSTOM_CHALLENGE";
    if (event.response.issueTokens && dependencies.bindIdentity) {
      const phoneNumber = event.request.userAttributes.phone_number;
      if (!phoneNumber || !/^\+[1-9]\d{7,14}$/.test(phoneNumber)) throw new Error("verified phone number is unavailable");
      await dependencies.bindIdentity({ authSubject: event.userName, phoneNumber });
    }
    return event;
  }

  if (event.triggerSource.includes("CreateAuthChallenge")) {
    const phoneNumber = event.request.userAttributes.phone_number;
    if (!phoneNumber || !/^\+[1-9]\d{7,14}$/.test(phoneNumber)) throw new Error("verified phone number is unavailable");
    const code = dependencies.randomCode();
    if (!/^\d{6}$/.test(code)) throw new Error("authentication code generator failed");
    const expiresAt = now + 300_000;
    await dependencies.sendCode({ phoneNumber, code });
    event.response.publicChallengeParameters = { delivery: "whatsapp", expiresAt: String(expiresAt) };
    event.response.privateChallengeParameters = { answerHash: answerHash(event.userName, code, expiresAt, secret), expiresAt: String(expiresAt) };
    event.response.challengeMetadata = "AXCAS_WHATSAPP_CODE";
    return event;
  }

  if (event.triggerSource.includes("VerifyAuthChallengeResponse")) {
    const supplied = event.request.challengeAnswer ?? "";
    const expiresAt = Number(event.request.privateChallengeParameters?.expiresAt ?? 0);
    const expected = event.request.privateChallengeParameters?.answerHash ?? "";
    const actual = answerHash(event.userName, supplied, expiresAt, secret);
    event.response.answerCorrect = expiresAt >= now && /^[a-f0-9]{64}$/.test(expected)
      && timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
    return event;
  }
  throw new Error("unsupported Cognito challenge trigger");
}

const secretsClient = new SecretsManagerClient({});
const identityStore = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });

export async function handler(event: unknown): Promise<ChallengeEvent> {
  const secretArn = process.env.AXCAS_PROVIDER_SECRET_ARN;
  if (!secretArn) throw new Error("passwordless authentication is not configured");
  const response = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const config = JSON.parse(response.SecretString ?? "{}") as Record<string, string>;
  const required = ["WHATSAPP_CLOUD_PHONE_NUMBER_ID", "WHATSAPP_CLOUD_ACCESS_TOKEN", "PROOFGATE_SERVICE_SECRET"];
  if (required.some((key) => !config[key])) throw new Error("passwordless authentication is not configured");
  const stateTable = process.env.AXCAS_STATE_TABLE;
  if (!stateTable) throw new Error("passwordless identity store is not configured");
  return handleCognitoWhatsAppChallenge(event, {
    hashSecret: config.PROOFGATE_SERVICE_SECRET,
    randomCode: () => String(Math.floor(100_000 + Math.random() * 900_000)),
    bindIdentity: async ({ authSubject, phoneNumber }) => {
      const ownerWaIdHash = createHmac("sha256", config.PROOFGATE_SERVICE_SECRET).update(phoneNumber.slice(1)).digest("hex");
      const merchantId = `merchant-${ownerWaIdHash.slice(0, 20)}`;
      const now = Date.now();
      await identityStore.send(new PutCommand({
        TableName: stateTable,
        Item: { pk: `IDENTITY#${authSubject}`, sk: "PROFILE", merchantId, ownerWaIdHash, verifiedAt: now },
        ConditionExpression: "attribute_not_exists(pk) OR ownerWaIdHash = :owner",
        ExpressionAttributeValues: { ":owner": ownerWaIdHash },
      }));
      await identityStore.send(new PutCommand({
        TableName: stateTable,
        Item: { pk: `WA#${ownerWaIdHash}`, sk: "PROFILE", merchantId, ownerWaIdHash, verifiedAt: now },
        ConditionExpression: "attribute_not_exists(pk) OR merchantId = :merchant",
        ExpressionAttributeValues: { ":merchant": merchantId },
      }));
      await identityStore.send(new PutCommand({
        TableName: stateTable,
        Item: { pk: `TENANT#${merchantId}`, sk: "ACCOUNT", schemaVersion: 1, merchantId, ownerWaIdHash, plan: "free_beta", locale: "en-IN", timezone: "Asia/Kolkata", updatedAt: now },
        ConditionExpression: "attribute_not_exists(pk) OR ownerWaIdHash = :owner",
        ExpressionAttributeValues: { ":owner": ownerWaIdHash },
      }));
    },
    sendCode: async ({ phoneNumber, code }) => {
      const graphResponse = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_API_VERSION ?? "v26.0"}/${encodeURIComponent(config.WHATSAPP_CLOUD_PHONE_NUMBER_ID)}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${config.WHATSAPP_CLOUD_ACCESS_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phoneNumber.slice(1),
          type: "template",
          template: {
            name: process.env.AXCAS_AUTH_TEMPLATE ?? "axcas_login_code",
            language: { code: "en" },
            components: [
              { type: "body", parameters: [{ type: "text", text: code }] },
              { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
            ],
          },
        }),
      });
      if (!graphResponse.ok) throw new Error("authentication delivery failed");
      const receipt = await graphResponse.json() as { messages?: Array<{ id?: string }> };
      return { providerMessageId: receipt.messages?.[0]?.id };
    },
  });
}
