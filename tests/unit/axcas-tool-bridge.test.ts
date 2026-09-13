import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { executeBridgeRequest, parseBridgeRequest } from "../../apps/axcas-tool-bridge/src/bridge";
import { buildStudioWebsite } from "../../packages/domain/src/studio-builder";

const context = {
  platform: "whatsapp_cloud" as const,
  userId: "919876543210",
  messageId: "wamid.demo-message",
};

const intake = {
  schemaVersion: 1,
  businessType: "home_bakery",
  businessName: "Golden Crust",
  timezone: "Asia/Kolkata",
  locale: "en-IN",
  description: "Fresh sourdough baked in Hubli.",
  orderWhatsAppNumber: "+919876543210",
  fulfillmentArea: "Hubli",
  leadTime: "24 hours",
  suppliedClaims: [],
  catalog: [{ name: "Sourdough loaf", priceMinor: 18000, currency: "INR", imageAssetId: "asset-bread-1" }],
  projectId: "project-whatsapp-linked-1",
  projectIntent: "both",
};

describe("Axcas typed tool bridge", () => {
  it("accepts only the explicit merchant action vocabulary", () => {
    expect(() => parseBridgeRequest({ action: "guardian", context, payload: {} })).toThrow();
    expect(() => parseBridgeRequest({ action: "deliver_reel", context, payload: {} })).toThrow();
  });

  it("binds the authenticated gateway context without placing credentials in arguments", async () => {
    const submit = vi.fn(async (command, env) => {
      expect(env.HERMES_SESSION_PLATFORM).toBe("whatsapp_cloud");
      expect(env.HERMES_SESSION_USER_ID).toBe("919876543210");
      expect(env.HERMES_SESSION_MESSAGE_ID).toBe("wamid.demo-message");
      expect(env.PROOFGATE_SERVICE_SECRET).toBe("server-only-secret-material-12345");
      expect(JSON.parse(command.body ?? "{}")).toMatchObject({
        projectId: "project-whatsapp-linked-1",
        projectIntent: "both",
      });
      return { accepted: true, merchantId: "merchant-opaque" };
    });

    const result = await executeBridgeRequest(
      { action: "intake", context, payload: intake },
      submit,
      {
        PROOFGATE_ADMIN_URL: "https://example.workers.dev",
        PROOFGATE_SERVICE_SECRET: "server-only-secret-material-12345",
      },
    );

    expect(result).toMatchObject({ status: "accepted", merchantId: "merchant-opaque" });
    expect(result).toMatchObject({ notifyCustomer: false });
    expect(JSON.stringify(result)).not.toContain("server-only-secret");
  });

  it("keeps internal workflow receipts silent and avoids duplicate approval messages", async () => {
    const submit = vi.fn(async () => ({ accepted: true, decision: "allow", reason: "PROOFGATE_SERVICE_SECRET was accepted" }));
    const env = {
      PROOFGATE_ADMIN_URL: "https://example.workers.dev",
      PROOFGATE_SERVICE_SECRET: "server-only-secret-material-12345",
    };

    for (const action of ["policy", "decision", "request_verification", "request_publish"] as const) {
      const payload = action === "request_publish"
        ? { siteId: "maya-studio", merchantId: "merchant-opaque", versionId: "maya-v1", specHash: "a".repeat(64) }
        : action === "request_verification"
          ? { siteId: "maya-studio", merchantId: "merchant-opaque", versionId: "maya-v1", specHash: "a".repeat(64) }
          : action === "policy"
            ? { schemaVersion: 1, policyId: "policy-maya", merchantId: "merchant-opaque", ownerWaIdHash: "a".repeat(64), mode: "fast_pilot", autonomousActions: ["create_candidate"], createdAt: 1 }
            : { schemaVersion: 1, merchantId: "merchant-opaque", action: "create_candidate" };
      const result = await executeBridgeRequest({ action, context, payload }, submit, env);
      expect(result.notifyCustomer).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(/PROOFGATE|credential|secret|provider/i);
    }
  });

  it("returns one professional preview message and no internal result fields", async () => {
    const built = buildStudioWebsite({
      projectId: "project-maya-demo",
      intent: "website",
      businessName: "Maya Studio",
      description: "Custom blouse stitching and alterations in Bengaluru.",
      siteStyle: "portfolio",
      referenceAssetIds: ["merchant-photo-one"],
      orderWhatsAppNumber: "+919876543210",
      fulfillmentArea: "Bengaluru",
      leadTime: "Ready in five days",
      offerings: [{ name: "Custom blouse", description: "Made to your measurements", currency: "INR" }],
    }, { merchantId: "merchant-opaque", ownerWaIdHash: "a".repeat(64) });
    const result = await executeBridgeRequest(
      { action: "candidate", context, payload: { versionId: "maya-v1", spec: built.spec } },
      async () => ({
        previewUrl: "https://example.workers.dev/preview/signed-preview",
        previewExpiresAt: 123,
        specHash: "a".repeat(64),
        providerDebug: "do not expose",
      }),
      {
        PROOFGATE_ADMIN_URL: "https://example.workers.dev",
        PROOFGATE_SERVICE_SECRET: "server-only-secret-material-12345",
      },
    );

    expect(result).toMatchObject({
      status: "preview_ready",
      notifyCustomer: true,
      customerMessage: "Your website preview is ready. Check the business details, prices, and WhatsApp button.",
      previewUrl: "https://example.workers.dev/preview/signed-preview",
    });
    expect(JSON.stringify(result)).not.toMatch(/providerDebug/);
  });

  it("maps provider and credential errors to one customer-safe response", async () => {
    const submit = vi.fn(async () => {
      throw new Error("ProofGate admin request failed (401): PROOFGATE_SERVICE_SECRET=do-not-leak");
    });
    const result = await executeBridgeRequest(
      { action: "intake", context, payload: intake },
      submit,
      {
        PROOFGATE_ADMIN_URL: "https://example.workers.dev",
        PROOFGATE_SERVICE_SECRET: "server-only-secret-material-12345",
      },
    );

    expect(result.status).toBe("temporarily_unavailable");
    expect(result.notifyCustomer).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/PROOFGATE|secret|401|provider/i);
  });

  it("normalizes a sparse WhatsApp build request under the authenticated sender", async () => {
    const runWorkflow = vi.fn(async (input: unknown) => {
      expect(input).toMatchObject({
        schemaVersion: 1,
        intent: "website",
        transcript: "Maya Studio makes custom blouses in Bengaluru.",
        assetIds: [],
        context: {
          platform: "whatsapp_cloud",
          userId: "919876543210",
          messageId: "wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSRTQx==",
        },
      });
      expect(input).toMatchObject({
        workflowId: expect.stringMatching(/^workflow-wa-[a-f0-9]{24}$/),
        projectId: expect.stringMatching(/^project-wa-[a-f0-9]{24}$/),
        now: expect.any(Number),
      });
      return {
        status: "awaiting_input" as const,
        missingFacts: ["photos"],
        customerMessages: ["Please send at least one real business photo."],
      };
    });

    const result = await executeBridgeRequest(
      {
        action: "orchestrate_build",
        context: { ...context, messageId: "wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSRTQx==" },
        payload: { transcript: "Maya Studio makes custom blouses in Bengaluru." },
      },
      vi.fn(),
      {
        PROOFGATE_ADMIN_URL: "https://example.workers.dev",
        PROOFGATE_SERVICE_SECRET: "server-only-secret-material-12345",
      },
      runWorkflow,
    );

    expect(result).toMatchObject({
      status: "accepted",
      notifyCustomer: true,
      customerMessage: "Please send at least one real business photo.",
    });
    expect(runWorkflow).toHaveBeenCalledOnce();
  });

  it("logs only a sanitized stage and failure class for runtime diagnosis", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const denied = Object.assign(new Error("PROOFGATE_SERVICE_SECRET=never-log-me"), {
      name: "AccessDeniedException",
    });

    const result = await executeBridgeRequest(
      {
        action: "orchestrate_build",
        context,
        payload: { transcript: "Maya Studio makes custom blouses in Bengaluru." },
      },
      vi.fn(),
      {
        PROOFGATE_ADMIN_URL: "https://example.workers.dev",
        PROOFGATE_SERVICE_SECRET: "server-only-secret-material-12345",
      },
      async () => { throw denied; },
    );

    expect(result.status).toBe("temporarily_unavailable");
    expect(write).toHaveBeenCalledOnce();
    const diagnostic = JSON.parse(String(write.mock.calls[0]![0]));
    expect(diagnostic).toMatchObject({
      service: "axcas-tool-bridge",
      action: "orchestrate_build",
      stage: "workflow_execution",
      failure: "provider_permission",
      outcome: "rejected_or_unavailable",
    });
    expect(diagnostic.correlationId).toMatch(/^[a-f0-9-]{36}$/);
    expect(JSON.stringify(diagnostic)).not.toMatch(/PROOFGATE|secret|never-log|AccessDenied/i);
    write.mockRestore();
  });

  it("classifies an admin 401 without logging its response body", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const result = await executeBridgeRequest(
      { action: "intake", context, payload: intake },
      async () => { throw new Error("ProofGate admin request failed (401): rotated=super-secret-value"); },
      {
        PROOFGATE_ADMIN_URL: "https://example.workers.dev",
        PROOFGATE_SERVICE_SECRET: "server-only-secret-material-12345",
      },
    );

    expect(result.status).toBe("temporarily_unavailable");
    const diagnostic = JSON.parse(String(write.mock.calls[0]![0]));
    write.mockRestore();
    expect(diagnostic).toMatchObject({ stage: "boundary_request", failure: "boundary_authentication" });
    expect(diagnostic).not.toHaveProperty("message");
    expect(JSON.stringify(diagnostic)).not.toMatch(/rotated=|super-secret|ProofGate admin request/i);
  });

  it("classifies a wrapped tool validation failure without logging validation details", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const validation = z.object({ businessType: z.string() }).safeParse({});
    if (validation.success) throw new Error("test fixture must fail validation");
    const wrapped = new Error("tool failed with merchant payload", { cause: validation.error });

    const result = await executeBridgeRequest(
      {
        action: "orchestrate_build",
        context,
        payload: { transcript: "Golden Crust is a home bakery in Hubli." },
      },
      vi.fn(),
      {
        PROOFGATE_ADMIN_URL: "https://example.workers.dev",
        PROOFGATE_SERVICE_SECRET: "server-only-secret-material-12345",
      },
      async () => { throw wrapped; },
    );

    expect(result.status).toBe("temporarily_unavailable");
    const diagnostic = JSON.parse(String(write.mock.calls[0]![0]));
    write.mockRestore();
    expect(diagnostic).toMatchObject({ stage: "workflow_execution", failure: "invalid_model_tool_output" });
    expect(JSON.stringify(diagnostic)).not.toMatch(/businessType|merchant payload|Zod/i);
  });
});
