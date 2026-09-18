import { createHmac } from "node:crypto";

export type CognitoUserRecord = {
  username: string;
  attributes: Record<string, string>;
  status?: string;
};

export type CognitoMerchantBinding = {
  authSubject: string;
  phoneNumber: string;
  merchantId: string;
  ownerWaIdHash: string;
};

export type CognitoProvisioningDependencies = {
  hashSecret: string;
  createUser: (input: { phoneNumber: string }) => Promise<void>;
  getUser: (input: { phoneNumber: string }) => Promise<CognitoUserRecord>;
  updateUserAttributes: (input: { username: string; phoneNumber: string; confirmForCustomAuth: boolean }) => Promise<void>;
  bindIdentity: (input: CognitoMerchantBinding & { providerMessageId: string; verifiedAt: number }) => Promise<void>;
};

export async function provisionCognitoMerchant(
  input: { senderWaId: string; providerMessageId: string; receivedAt: number },
  dependencies: CognitoProvisioningDependencies,
): Promise<CognitoMerchantBinding> {
  if (!/^\d{8,15}$/.test(input.senderWaId) || !input.providerMessageId || input.providerMessageId.length > 256 || !Number.isSafeInteger(input.receivedAt) || input.receivedAt < 0) {
    throw new Error("invalid WhatsApp identity");
  }
  if (!dependencies.hashSecret) throw new Error("identity binding is not configured");
  const phoneNumber = `+${input.senderWaId}`;
  try {
    await dependencies.createUser({ phoneNumber });
  } catch (error) {
    if ((error as { name?: string }).name !== "UsernameExistsException") throw error;
  }

  // Cognito resolves the verified phone alias to its internal username. Reading it
  // back is required: aliases are not safe substitutes for the immutable `sub`.
  const user = await dependencies.getUser({ phoneNumber });
  const authSubject = user.attributes.sub;
  if (!user.username || user.username.length > 128 || !/^[A-Za-z0-9_-]{3,128}$/.test(authSubject ?? "") || user.attributes.phone_number !== phoneNumber) {
    throw new Error("Cognito phone binding mismatch");
  }
  await dependencies.updateUserAttributes({ username: user.username, phoneNumber, confirmForCustomAuth: user.status !== "CONFIRMED" });

  const ownerWaIdHash = createHmac("sha256", dependencies.hashSecret).update(input.senderWaId).digest("hex");
  const binding = { authSubject, phoneNumber, merchantId: `merchant-${ownerWaIdHash.slice(0, 20)}`, ownerWaIdHash };
  await dependencies.bindIdentity({ ...binding, providerMessageId: input.providerMessageId, verifiedAt: input.receivedAt });
  return binding;
}
