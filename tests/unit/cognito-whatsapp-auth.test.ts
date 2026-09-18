import { describe, expect, it, vi } from "vitest";

import { handleCognitoWhatsAppChallenge } from "../../apps/aws-control-plane/src/cognito-challenge";

describe("Cognito WhatsApp passwordless challenge", () => {
  it("issues one short-lived WhatsApp code without exposing it publicly", async () => {
    const sendCode = vi.fn(async () => ({ providerMessageId: "wamid.auth" }));
    const event = await handleCognitoWhatsAppChallenge({
      triggerSource: "CustomMessage_CreateAuthChallenge",
      userName: "merchant-user",
      request: { userAttributes: { phone_number: "+919876543210" }, session: [] },
      response: {},
    }, { sendCode, randomCode: () => "481902", now: () => 1_789_680_000_000 });

    expect(sendCode).toHaveBeenCalledWith({ phoneNumber: "+919876543210", code: "481902" });
    expect(event.response.publicChallengeParameters).toEqual({ delivery: "whatsapp", expiresAt: "1789680300000" });
    expect((event.response.privateChallengeParameters as Record<string, string> | undefined)?.answerHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(event.response.publicChallengeParameters)).not.toContain("481902");
  });

  it("verifies the answer and terminates after success or three failures", async () => {
    const created = await handleCognitoWhatsAppChallenge({
      triggerSource: "CustomMessage_CreateAuthChallenge",
      userName: "merchant-user",
      request: { userAttributes: { phone_number: "+919876543210" }, session: [] },
      response: {},
    }, { sendCode: vi.fn(async () => ({})), randomCode: () => "481902", now: () => 1_789_680_000_000 });
    const verified = await handleCognitoWhatsAppChallenge({
      triggerSource: "CustomMessage_VerifyAuthChallengeResponse",
      userName: "merchant-user",
      request: { userAttributes: {}, session: [], privateChallengeParameters: created.response.privateChallengeParameters as Record<string, string>, challengeAnswer: "481902" },
      response: {},
    }, { sendCode: vi.fn(async () => ({})), randomCode: () => "000000", now: () => 1_789_680_100_000 });
    expect(verified.response.answerCorrect).toBe(true);

    const bindIdentity = vi.fn(async () => undefined);
    const complete = await handleCognitoWhatsAppChallenge({
      triggerSource: "CustomMessage_DefineAuthChallenge",
      userName: "merchant-user",
      request: { userAttributes: { phone_number: "+919876543210" }, session: [{ challengeName: "CUSTOM_CHALLENGE", challengeResult: true }] },
      response: {},
    }, { sendCode: vi.fn(async () => ({})), bindIdentity, randomCode: () => "000000", now: () => 0 });
    expect(complete.response).toMatchObject({ issueTokens: true, failAuthentication: false });
    expect(bindIdentity).toHaveBeenCalledWith({ authSubject: "merchant-user", phoneNumber: "+919876543210" });

    const failed = await handleCognitoWhatsAppChallenge({
      triggerSource: "CustomMessage_DefineAuthChallenge",
      userName: "merchant-user",
      request: { userAttributes: {}, session: Array.from({ length: 3 }, () => ({ challengeName: "CUSTOM_CHALLENGE", challengeResult: false })) },
      response: {},
    }, { sendCode: vi.fn(async () => ({})), randomCode: () => "000000", now: () => 0 });
    expect(failed.response).toMatchObject({ issueTokens: false, failAuthentication: true });
  });
});
