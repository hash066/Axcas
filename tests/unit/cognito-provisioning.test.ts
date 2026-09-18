import { describe, expect, it, vi } from "vitest";

import { provisionCognitoMerchant } from "../../apps/aws-control-plane/src/cognito-provisioning";

describe("signed WhatsApp Cognito provisioning", () => {
  it("creates a passwordless Cognito identity and binds it to one deterministic tenant", async () => {
    const createUser = vi.fn(async () => undefined);
    const getUser = vi.fn(async () => ({
      username: "cognito-internal-user-1",
      attributes: { sub: "6b799f21-55b5-4f20-9d41-6d7a645348f2", phone_number: "+919999888877" },
      status: "FORCE_CHANGE_PASSWORD",
    }));
    const updateUserAttributes = vi.fn(async () => undefined);
    const bindIdentity = vi.fn(async () => undefined);

    const result = await provisionCognitoMerchant({
      senderWaId: "919999888877",
      providerMessageId: "wamid.signed-start",
      receivedAt: 1_789_680_000_000,
    }, {
      hashSecret: "service-secret",
      createUser,
      getUser,
      updateUserAttributes,
      bindIdentity,
    });

    expect(createUser).toHaveBeenCalledWith({ phoneNumber: "+919999888877" });
    expect(updateUserAttributes).toHaveBeenCalledWith({ username: "cognito-internal-user-1", phoneNumber: "+919999888877", confirmForCustomAuth: true });
    expect(result).toMatchObject({
      authSubject: "6b799f21-55b5-4f20-9d41-6d7a645348f2",
      phoneNumber: "+919999888877",
      merchantId: expect.stringMatching(/^merchant-[a-f0-9]{20}$/),
      ownerWaIdHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(bindIdentity).toHaveBeenCalledWith({
      ...result,
      providerMessageId: "wamid.signed-start",
      verifiedAt: 1_789_680_000_000,
    });
  });

  it("recovers idempotently when Cognito already has the verified phone alias", async () => {
    const existing = Object.assign(new Error("already exists"), { name: "UsernameExistsException" });
    const bindIdentity = vi.fn(async () => undefined);
    await provisionCognitoMerchant({ senderWaId: "919999888877", providerMessageId: "wamid.retry", receivedAt: 42 }, {
      hashSecret: "service-secret",
      createUser: vi.fn(async () => { throw existing; }),
      getUser: vi.fn(async () => ({ username: "internal", attributes: { sub: "subject-123", phone_number: "+919999888877" }, status: "CONFIRMED" })),
      updateUserAttributes: vi.fn(async () => undefined),
      bindIdentity,
    });
    expect(bindIdentity).toHaveBeenCalledOnce();
  });

  it("fails closed on invalid sender identities or a mismatched Cognito alias", async () => {
    const dependencies = {
      hashSecret: "service-secret",
      createUser: vi.fn(async () => undefined),
      getUser: vi.fn(async () => ({ username: "internal", attributes: { sub: "subject-123", phone_number: "+918888777766" } })),
      updateUserAttributes: vi.fn(async () => undefined),
      bindIdentity: vi.fn(async () => undefined),
    };
    await expect(provisionCognitoMerchant({ senderWaId: "+919999888877", providerMessageId: "wamid.bad", receivedAt: 42 }, dependencies)).rejects.toThrow("invalid WhatsApp identity");
    await expect(provisionCognitoMerchant({ senderWaId: "919999888877", providerMessageId: "wamid.bad", receivedAt: 42 }, dependencies)).rejects.toThrow("Cognito phone binding mismatch");
    expect(dependencies.bindIdentity).not.toHaveBeenCalled();
  });
});
