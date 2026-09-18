import { createHmac, randomUUID } from "node:crypto";

import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { EncryptCommand, KMSClient } from "@aws-sdk/client-kms";
import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, HeadObjectCommand, S3Client, UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { SendTaskFailureCommand, SendTaskSuccessCommand, SFNClient } from "@aws-sdk/client-sfn";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

import { createAwsControlPlaneApp, type AwsControlPlaneDependencies } from "./app";
import { buildMetaBusinessLoginUrl, createMetaOAuthState, discoverMetaBusinessAssets, exchangeMetaAuthorizationCode, verifyMetaOAuthState } from "../../../packages/social/src/meta-oauth";
import { CompleteUploadRequestSchema, UploadPartRequestSchema, initiateTenantUpload } from "./media-upload";

type ApiGatewayEvent = {
  rawPath?: string;
  rawQueryString?: string;
  requestContext?: { http?: { method?: string }; authorizer?: { jwt?: { claims?: Record<string, string> } } };
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
};

type ApiGatewayResponse = { statusCode: number; headers: Record<string, string>; body: string; isBase64Encoded: false };

const secrets = new SecretsManagerClient({});
const sqs = new SQSClient({});
const sfn = new SFNClient({});
const kms = new KMSClient({});
const s3 = new S3Client({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });

let cachedProviderSecret: { expiresAt: number; value: Record<string, string> } | undefined;

async function providerSecret(): Promise<Record<string, string>> {
  if (cachedProviderSecret && cachedProviderSecret.expiresAt > Date.now()) return cachedProviderSecret.value;
  const secretArn = process.env.AXCAS_PROVIDER_SECRET_ARN;
  if (!secretArn) throw new Error("provider secret reference is unavailable");
  const response = await secrets.send(new GetSecretValueCommand({ SecretId: secretArn }));
  if (!response.SecretString) throw new Error("provider secret is empty");
  const value = JSON.parse(response.SecretString) as Record<string, string>;
  cachedProviderSecret = { value, expiresAt: Date.now() + 300_000 };
  return value;
}

function identityHash(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function firstPartySession(cookieHeader: string | undefined): { id: string; setCookie?: string } {
  const existing = cookieHeader?.match(/(?:^|;\s*)pgsid=([A-Za-z0-9_-]{20,128})(?:;|$)/)?.[1];
  if (existing) return { id: existing };
  const id = randomUUID();
  return { id, setCookie: `pgsid=${id}; Path=/; Max-Age=31536000; Secure; HttpOnly; SameSite=Lax` };
}

async function dependencies(): Promise<AwsControlPlaneDependencies> {
  const config = await providerSecret();
  const queueUrl = process.env.AXCAS_INGRESS_QUEUE_URL;
  const tableName = process.env.AXCAS_STATE_TABLE;
  const ledgerTable = process.env.AXCAS_LEDGER_TABLE;
  const assetsBucket = process.env.AXCAS_ASSETS_BUCKET;
  if (!queueUrl || !tableName || !ledgerTable || !config.META_APP_SECRET || !config.META_VERIFY_TOKEN || !config.PROOFGATE_SERVICE_SECRET) throw new Error("control plane is not configured");
  const currentSite = async (siteId: string) => {
    const response = await dynamo.send(new GetCommand({ TableName: tableName, Key: { pk: `SITE#${siteId}`, sk: "CURRENT" }, ConsistentRead: true }));
    const item = response.Item as { merchantId?: string; versionId?: string; specHash?: string; businessName?: string; orderWhatsAppNumber?: string; offerings?: Array<{ itemId?: string; name?: string }> } | undefined;
    if (!item?.merchantId || !item.versionId || !/^[a-f0-9]{64}$/.test(item.specHash ?? "") || !item.businessName || !/^\+?\d{8,15}$/.test(item.orderWhatsAppNumber ?? "")) throw new Error("published site was not found");
    return { ...item, specHash: item.specHash!, orderWhatsAppNumber: item.orderWhatsAppNumber!, offerings: item.offerings ?? [] };
  };
  const recordSiteEvent = async (input: { type: "page_view" | "cta_click"; siteId: string; itemId?: string; source: string; campaign?: string; cookie?: string }) => {
    const site = await currentSite(input.siteId);
    const session = firstPartySession(input.cookie);
    const sessionIdHash = identityHash(session.id, config.PROOFGATE_SERVICE_SECRET);
    const now = Date.now();
    const campaignKey = input.campaign ?? "none";
    const dedupe = input.type === "page_view"
      ? `VIEW#${site.versionId}#${campaignKey}#${sessionIdHash}`
      : `CTA#${site.versionId}#${input.itemId ?? "general"}#${campaignKey}#${sessionIdHash}#${Math.floor(now / 60_000)}`;
    try {
      await dynamo.send(new PutCommand({
        TableName: ledgerTable,
        Item: {
          pk: `SITE#${input.siteId}`,
          sk: `EVENT#${dedupe}`,
          eventType: input.type,
          siteId: input.siteId,
          merchantId: site.merchantId,
          versionId: site.versionId,
          specHash: site.specHash,
          itemId: input.itemId,
          source: input.source,
          campaign: input.campaign,
          sessionIdHash,
          occurredAt: now,
        },
        ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
      }));
    } catch (error) {
      if ((error as { name?: string }).name !== "ConditionalCheckFailedException") throw error;
    }
    return { site, setCookie: session.setCookie };
  };
  const merchantForSubject = async (authSubject: string): Promise<string> => {
    const identity = await dynamo.send(new GetCommand({ TableName: tableName, Key: { pk: `IDENTITY#${authSubject}`, sk: "PROFILE" }, ConsistentRead: true }));
    const merchantId = (identity.Item as { merchantId?: string } | undefined)?.merchantId;
    if (!merchantId) throw new Error("Studio identity is not linked");
    return merchantId;
  };
  const uploadForSubject = async (authSubject: string, assetId: string) => {
    const merchantId = await merchantForSubject(authSubject);
    const response = await dynamo.send(new GetCommand({ TableName: tableName, Key: { pk: `TENANT#${merchantId}`, sk: `ASSET#${assetId}` }, ConsistentRead: true }));
    const item = response.Item as { assetId?: string; key?: string; uploadId?: string; status?: string; declaredBytes?: number } | undefined;
    if (!item || item.assetId !== assetId || !item.key || !item.uploadId || !item.status || !item.declaredBytes) throw new Error("media upload was not found");
    return { merchantId, item };
  };
  return {
    metaAppSecret: config.META_APP_SECRET,
    metaVerifyToken: config.META_VERIFY_TOKEN,
    recordPageView: async (input) => {
      const result = await recordSiteEvent({ type: "page_view", ...input });
      return { setCookie: result.setCookie };
    },
    trackedRedirect: async (input) => {
      const result = await recordSiteEvent({ type: "cta_click", ...input });
      const offering = input.itemId === "general" ? undefined : result.site.offerings.find((candidate) => candidate.itemId === input.itemId);
      if (input.itemId !== "general" && (!offering?.itemId || !offering.name)) throw new Error("published offering was not found");
      const message = offering
        ? `Hello ${result.site.businessName}, I'd like to enquire about ${offering.name}.`
        : `Hello ${result.site.businessName}, I found you on your website and would like to know more.`;
      const number = result.site.orderWhatsAppNumber.replace(/\D/g, "");
      return { location: `https://wa.me/${number}?text=${encodeURIComponent(message)}`, setCookie: result.setCookie };
    },
    enqueue: async (message) => {
      const ownerWaIdHash = identityHash(message.senderWaId, config.PROOFGATE_SERVICE_SECRET);
      const merchantId = `merchant-${ownerWaIdHash.slice(0, 20)}`;
      await dynamo.send(new PutCommand({
        TableName: tableName,
        Item: { pk: `WA#${ownerWaIdHash}`, sk: "PROFILE", merchantId, ownerWaIdHash, lastSeenAt: message.receivedAt },
        ConditionExpression: "attribute_not_exists(pk) OR merchantId = :merchant",
        ExpressionAttributeValues: { ":merchant": merchantId },
      }));
      const receipt = await sqs.send(new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({
          schemaVersion: 1,
          bodyBase64: Buffer.from(message.rawBody, "utf8").toString("base64"),
          contentType: "application/json",
          metaSignature: message.metaSignature,
        }),
        MessageGroupId: `wa-${ownerWaIdHash}`,
        MessageDeduplicationId: message.providerMessageId,
        MessageAttributes: {
          senderWaIdHash: { DataType: "String", StringValue: ownerWaIdHash },
          providerMessageId: { DataType: "String", StringValue: message.providerMessageId },
          receivedAt: { DataType: "Number", StringValue: String(message.receivedAt) },
        },
      }));
      return { messageId: receipt.MessageId };
    },
    resolveApproval: async (tap) => {
      const ownerWaIdHash = identityHash(tap.senderWaId, config.PROOFGATE_SERVICE_SECRET);
      const key = { pk: `APPROVAL#${tap.approvalId}`, sk: "APPROVAL" };
      const current = await dynamo.send(new GetCommand({ TableName: tableName, Key: key, ConsistentRead: true }));
      const approval = current.Item as { ownerWaIdHash?: string; decision?: string; expiresAt?: number; scopeHash?: string; taskToken?: string } | undefined;
      if (!approval || approval.ownerWaIdHash !== ownerWaIdHash || approval.decision !== "pending" || Number(approval.expiresAt) < Date.now()) return { accepted: false };
      await dynamo.send(new UpdateCommand({
        TableName: tableName, Key: key,
        UpdateExpression: "SET decision = :decision, decidedAt = :now, providerMessageId = :messageId",
        ConditionExpression: "decision = :pending AND ownerWaIdHash = :owner AND expiresAt >= :now",
        ExpressionAttributeValues: { ":decision": tap.decision, ":now": Date.now(), ":messageId": tap.providerMessageId, ":pending": "pending", ":owner": ownerWaIdHash },
      }));
      if (approval.taskToken) {
        if (tap.decision === "approved") await sfn.send(new SendTaskSuccessCommand({ taskToken: approval.taskToken, output: JSON.stringify({ approved: true, scopeHash: approval.scopeHash }) }));
        else await sfn.send(new SendTaskFailureCommand({ taskToken: approval.taskToken, error: "MerchantDenied", cause: "The authenticated merchant declined this exact scope." }));
      }
      return { accepted: true };
    },
    startMetaOAuth: async ({ authSubject, returnPath }) => {
      const identity = await dynamo.send(new GetCommand({ TableName: tableName, Key: { pk: `IDENTITY#${authSubject}`, sk: "PROFILE" }, ConsistentRead: true }));
      const profile = identity.Item as { merchantId?: string; ownerWaIdHash?: string } | undefined;
      if (!profile?.merchantId || !profile.ownerWaIdHash) throw new Error("Studio identity is not linked");
      const publicApiUrl = process.env.AXCAS_PUBLIC_API_URL;
      if (!publicApiUrl || !config.WHATSAPP_CLOUD_APP_ID || !config.PROOFGATE_SERVICE_SECRET) throw new Error("Meta OAuth is not configured");
      const issuedAt = Date.now();
      const nonce = randomUUID();
      const state = await createMetaOAuthState({ merchantId: profile.merchantId, ownerWaIdHash: profile.ownerWaIdHash, returnPath, issuedAt, expiresAt: issuedAt + 600_000, nonce }, config.PROOFGATE_SERVICE_SECRET);
      await dynamo.send(new PutCommand({ TableName: tableName, Item: { pk: `OAUTH#${nonce}`, sk: "META", merchantId: profile.merchantId, ownerWaIdHash: profile.ownerWaIdHash, expiresAt: issuedAt + 600_000, createdAt: issuedAt }, ConditionExpression: "attribute_not_exists(pk)" }));
      const redirectUri = new URL("/oauth/meta/callback", publicApiUrl).toString();
      return { authorizationUrl: buildMetaBusinessLoginUrl({ graphApiVersion: process.env.META_GRAPH_API_VERSION ?? "v26.0", appId: config.WHATSAPP_CLOUD_APP_ID, redirectUri, state }) };
    },
    completeMetaOAuth: async ({ code, state: signedState }) => {
      const publicApiUrl = process.env.AXCAS_PUBLIC_API_URL;
      const keyId = process.env.AXCAS_DATA_KEY_ID;
      if (!publicApiUrl || !keyId || !config.WHATSAPP_CLOUD_APP_ID || !config.META_APP_SECRET || !config.PROOFGATE_SERVICE_SECRET) throw new Error("Meta OAuth is not configured");
      const now = Date.now();
      const state = await verifyMetaOAuthState(signedState, config.PROOFGATE_SERVICE_SECRET, now);
      await dynamo.send(new UpdateCommand({
        TableName: tableName,
        Key: { pk: `OAUTH#${state.nonce}`, sk: "META" },
        UpdateExpression: "SET consumedAt = :now",
        ConditionExpression: "merchantId = :merchant AND ownerWaIdHash = :owner AND expiresAt >= :now AND attribute_not_exists(consumedAt)",
        ExpressionAttributeValues: { ":now": now, ":merchant": state.merchantId, ":owner": state.ownerWaIdHash },
      }));
      const graphApiVersion = process.env.META_GRAPH_API_VERSION ?? "v26.0";
      const redirectUri = new URL("/oauth/meta/callback", publicApiUrl).toString();
      const token = await exchangeMetaAuthorizationCode({ graphApiVersion, appId: config.WHATSAPP_CLOUD_APP_ID, appSecret: config.META_APP_SECRET, redirectUri, code });
      const assets = await discoverMetaBusinessAssets({ graphApiVersion, accessToken: token.accessToken });
      const connectionId = `meta-${state.nonce.toLowerCase()}`;
      const encrypted = await kms.send(new EncryptCommand({
        KeyId: keyId,
        Plaintext: new TextEncoder().encode(token.accessToken),
        EncryptionContext: { merchantId: state.merchantId, connectionId },
      }));
      if (!encrypted.CiphertextBlob) throw new Error("Meta credential encryption failed");
      await dynamo.send(new PutCommand({
        TableName: tableName,
        Item: {
          pk: `TENANT#${state.merchantId}`, sk: `META#${connectionId}`, connectionId, merchantId: state.merchantId,
          encryptedAccessToken: Buffer.from(encrypted.CiphertextBlob).toString("base64"), encryptedTokenRef: `kms://dynamodb/${state.merchantId}/${connectionId}`,
          expiresAt: now + token.expiresInSeconds * 1_000, pages: assets.pages, adAccounts: assets.adAccounts,
          capabilities: { reelPublishing: assets.pages.length > 0, trialReels: "unknown", paidAds: assets.adAccounts.length > 0 }, connectedAt: now,
        },
        ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
      }));
      return { returnPath: `${state.returnPath}?meta=${assets.pages.length ? "connected" : "no_instagram"}` };
    },
    beginMediaUpload: async ({ authSubject, request }) => {
      if (!assetsBucket) throw new Error("private media storage is unavailable");
      const merchantId = await merchantForSubject(authSubject);
      let created: { key: string; uploadId: string } | undefined;
      const releaseReservedQuota = async (tenant: string, bytes: number, assetId: string) => {
        await dynamo.send(new UpdateCommand({
          TableName: tableName,
          Key: { pk: `TENANT#${tenant}`, sk: "QUOTA#free_beta" },
          UpdateExpression: "ADD usedBytes :negative DELETE reservations :reservation",
          ConditionExpression: "contains(reservations, :assetId) AND usedBytes >= :bytes",
          ExpressionAttributeValues: { ":negative": -bytes, ":reservation": new Set([assetId]), ":assetId": assetId, ":bytes": bytes },
        }));
      };
      const result = await initiateTenantUpload({ ...(request as Record<string, unknown>), merchantId }, {
        newAssetId: () => `asset-${randomUUID()}`,
        reserveQuota: async (tenant, bytes, assetId) => {
          try {
            await dynamo.send(new UpdateCommand({
              TableName: tableName,
              Key: { pk: `TENANT#${tenant}`, sk: "QUOTA#free_beta" },
              UpdateExpression: "SET usedBytes = if_not_exists(usedBytes, :zero) + :bytes, updatedAt = :now ADD reservations :reservation",
              ConditionExpression: "attribute_not_exists(usedBytes) OR usedBytes <= :remaining",
              ExpressionAttributeValues: { ":zero": 0, ":bytes": bytes, ":now": Date.now(), ":remaining": 1_073_741_824 - bytes, ":reservation": new Set([assetId]) },
            }));
            return true;
          } catch (error) {
            if ((error as { name?: string }).name === "ConditionalCheckFailedException") return false;
            throw error;
          }
        },
        releaseQuota: releaseReservedQuota,
        createMultipart: async (upload) => {
          const response = await s3.send(new CreateMultipartUploadCommand({ Bucket: assetsBucket, Key: upload.key, ContentType: upload.contentType, ChecksumAlgorithm: upload.checksumAlgorithm, Metadata: upload.metadata }));
          if (!response.UploadId) throw new Error("multipart upload was not created");
          created = { key: upload.key, uploadId: response.UploadId };
          return { uploadId: response.UploadId };
        },
      });
      try {
        await dynamo.send(new PutCommand({
          TableName: tableName,
          Item: { pk: `TENANT#${merchantId}`, sk: `ASSET#${result.assetId}`, ...result, status: "uploading" },
          ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
        }));
      } catch (error) {
        if (created) await s3.send(new AbortMultipartUploadCommand({ Bucket: assetsBucket, Key: created.key, UploadId: created.uploadId }));
        await releaseReservedQuota(merchantId, result.declaredBytes, result.assetId);
        throw error;
      }
      return { assetId: result.assetId, uploadId: result.uploadId, partSize: result.partSize, partCount: result.partCount, expiresInSeconds: result.expiresInSeconds };
    },
    signMediaPart: async ({ authSubject, assetId, request }) => {
      if (!assetsBucket) throw new Error("private media storage is unavailable");
      const part = UploadPartRequestSchema.parse(request);
      const { item } = await uploadForSubject(authSubject, assetId);
      if (item.status !== "uploading" || item.uploadId !== part.uploadId) throw new Error("media upload is not active");
      const uploadUrl = await getSignedUrl(s3, new UploadPartCommand({
        Bucket: assetsBucket,
        Key: item.key,
        UploadId: item.uploadId,
        PartNumber: part.partNumber,
        ChecksumSHA256: part.checksumSha256,
      }), { expiresIn: 900 });
      return { uploadUrl, partNumber: part.partNumber, expiresInSeconds: 900 };
    },
    completeMediaUpload: async ({ authSubject, assetId, request }) => {
      if (!assetsBucket) throw new Error("private media storage is unavailable");
      const completion = CompleteUploadRequestSchema.parse(request);
      const { merchantId, item } = await uploadForSubject(authSubject, assetId);
      if (item.uploadId !== completion.uploadId) throw new Error("media upload capability mismatch");
      if (item.status === "uploaded_pending_verification") return { assetId, status: item.status };
      if (item.status !== "uploading") throw new Error("media upload is not active");
      const completed = await s3.send(new CompleteMultipartUploadCommand({
        Bucket: assetsBucket,
        Key: item.key,
        UploadId: item.uploadId,
        MultipartUpload: { Parts: completion.parts.sort((left, right) => left.partNumber - right.partNumber).map((part) => ({ PartNumber: part.partNumber, ETag: part.eTag, ChecksumSHA256: part.checksumSha256 })) },
      }));
      const head = await s3.send(new HeadObjectCommand({ Bucket: assetsBucket, Key: item.key }));
      if (head.ContentLength !== item.declaredBytes) throw new Error("uploaded media length does not match the declared source");
      await dynamo.send(new UpdateCommand({
        TableName: tableName,
        Key: { pk: `TENANT#${merchantId}`, sk: `ASSET#${assetId}` },
        UpdateExpression: "SET #status = :pending, uploadedAt = :now, providerEtag = :etag",
        ConditionExpression: "#status = :uploading AND uploadId = :uploadId",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":pending": "uploaded_pending_verification", ":uploading": "uploading", ":uploadId": item.uploadId, ":now": Date.now(), ":etag": completed.ETag ?? head.ETag ?? "unavailable" },
      }));
      const mediaQueueUrl = process.env.AXCAS_MEDIA_VERIFICATION_QUEUE_URL;
      if (!mediaQueueUrl) throw new Error("media verification queue is unavailable");
      await sqs.send(new SendMessageCommand({
        QueueUrl: mediaQueueUrl,
        MessageBody: JSON.stringify({ schemaVersion: 1, action: "verify_media_checksum", merchantId, assetId, bucket: assetsBucket, key: item.key }),
        MessageGroupId: merchantId,
        MessageDeduplicationId: `verify-${assetId}`,
      }));
      return { assetId, status: "uploaded_pending_verification" };
    },
  };
}

export async function handler(event: ApiGatewayEvent): Promise<ApiGatewayResponse> {
  const method = event.requestContext?.http?.method ?? "GET";
  const path = event.rawPath ?? "/";
  const query = event.rawQueryString ? `?${event.rawQueryString}` : "";
  const body = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body) : undefined;
  const requestHeaders = new Headers(event.headers as HeadersInit);
  requestHeaders.delete("x-axcas-auth-sub");
  const authSubject = event.requestContext?.authorizer?.jwt?.claims?.sub;
  if (authSubject) requestHeaders.set("x-axcas-auth-sub", authSubject);
  const request = new Request(`https://axcas.internal${path}${query}`, { method, headers: requestHeaders, body: method === "GET" || method === "HEAD" ? undefined : body });
  const response = await createAwsControlPlaneApp(await dependencies()).fetch(request);
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => { headers[key] = value; });
  return { statusCode: response.status, headers, body: await response.text(), isBase64Encoded: false };
}
