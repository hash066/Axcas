import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// jsdom 29 has no bundled declarations in this workspace.
// @ts-expect-error -- browser surface is narrowed immediately below.
import { JSDOM } from "jsdom";

import {
  AwsStudioRuntimeConfigSchema,
  renderAwsStudioBundle,
} from "../../apps/aws-studio/src/build";
import { renderAwsStudioAuthJs } from "../../apps/aws-studio/src/cognito-auth";

const config = {
  region: "ap-south-1",
  apiUrl: "https://abc123.execute-api.ap-south-1.amazonaws.com",
  cognitoUserPoolId: "ap-south-1_AxcasBeta1",
  cognitoClientId: "3n2exampleclientid9",
  whatsappNumber: "919180499647",
};

describe("AWS Amplify Studio frontend", () => {
  it("validates public runtime settings without accepting provider credentials", () => {
    expect(AwsStudioRuntimeConfigSchema.parse(config)).toEqual(config);
    expect(() => AwsStudioRuntimeConfigSchema.parse({ ...config, apiUrl: "http://localhost:8787" })).toThrow();
    expect(() => AwsStudioRuntimeConfigSchema.parse({ ...config, region: "us-east-1" })).toThrow();
    expect(() => AwsStudioRuntimeConfigSchema.parse({ ...config, metaAccessToken: "secret" })).toThrow();
  });

  it("builds a complete static Amplify artifact from the structured Studio", () => {
    const files = renderAwsStudioBundle(config);
    expect(Object.keys(files).sort()).toEqual([
      "aws-studio.js",
      "axcas-config.js",
      "index.html",
      "studio.css",
      "studio.js",
    ]);
    expect(files["index.html"]).toContain('data-pg="studio"');
    expect(files["index.html"]).toContain('data-pg="studio-canvas"');
    expect(files["index.html"]).toContain('<script src="/axcas-config.js" defer></script>');
    expect(files["index.html"]).toContain('<script src="/aws-studio.js" defer></script>');
    expect(files["index.html"].indexOf("axcas-config.js")).toBeLessThan(files["index.html"].indexOf("studio.js"));
    expect(files["studio.css"]).toContain(".builder-shell");
    expect(files["studio.js"]).toContain("__AXCAS_STUDIO_AUTH__");
    expect(files["studio.js"]).toContain("PATCH");
    expect(files["studio.js"]).toContain("/api/studio/projects/changes");
    expect(files["studio.js"]).toContain("Save website changes");
    expect(files["studio.css"]).toContain("#newProjectButton");
    expect(files["studio.css"]).toContain("#manageAccessButton");
    expect(files["studio.css"]).toContain("#manageDataButton");
    expect(Object.values(files).join("\n")).not.toContain("META_APP_SECRET");
    expect(Object.values(files).join("\n")).not.toContain("WHATSAPP_CLOUD_ACCESS_TOKEN");
  });

  it("uses Cognito custom auth and sends bearer tokens only to the configured API", () => {
    const javascript = renderAwsStudioAuthJs();
    expect(javascript).toContain("AWSCognitoIdentityProviderService.InitiateAuth");
    expect(javascript).toContain("AWSCognitoIdentityProviderService.RespondToAuthChallenge");
    expect(javascript).toContain("Authorization");
    expect(javascript).toContain("sessionStorage");
    expect(javascript).not.toContain("localStorage");
    expect(javascript).not.toContain("x-axcas-auth-sub");
    expect(javascript).not.toContain("client_secret");
  });

  it("completes the WhatsApp-code challenge before opening the structured workspace", async () => {
    const files = renderAwsStudioBundle(config);
    const dom = new JSDOM(files["index.html"], { runScripts: "outside-only", url: "https://beta.example.amplifyapp.com/" });
    const window = (dom as { window: Window & typeof globalThis }).window;
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", { value: () => undefined });
    Object.defineProperty(window.URL, "createObjectURL", { value: () => "blob:https://beta.example/media" });
    Object.defineProperty(window.URL, "revokeObjectURL", { value: () => undefined });
    Object.defineProperty(window, "Headers", { value: Headers });
    const idToken = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 })).toString("base64url")}.signature`;
    const calls: Array<{ url: string; options?: RequestInit }> = [];
    const fetch = async (input: string | URL | Request, options?: RequestInit) => {
      const url = String(input);
      calls.push({ url, options });
      if (url.includes("cognito-idp")) {
        const target = new Headers(options?.headers).get("x-amz-target");
        return target?.endsWith("InitiateAuth")
          ? { ok: true, json: async () => ({ ChallengeName: "CUSTOM_CHALLENGE", Session: "challenge-session" }) }
          : { ok: true, json: async () => ({ AuthenticationResult: { IdToken: idToken } }) };
      }
      return { ok: true, status: 200, json: async () => ({ account: { merchantId: "merchant-maya", locale: "en-IN", timezone: "Asia/Kolkata", plan: "free_beta" }, projects: [] }) };
    };
    Object.defineProperty(window, "fetch", { value: fetch });

    window.eval(files["axcas-config.js"]);
    window.eval(files["aws-studio.js"]);
    window.eval(files["studio.js"]);
    window.document.querySelector<HTMLButtonElement>("#studioModeButton")!.click();
    window.document.querySelector<HTMLButtonElement>("#linkButton")!.click();
    const form = window.document.querySelector<HTMLFormElement>("#awsSignInForm")!;
    const phone = form.elements.namedItem("phone") as HTMLInputElement;
    phone.value = "+91 98765 43210";
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await viWaitFor(() => window.document.querySelector("#linkStatus")!.textContent === "Code sent. Enter it here to open your workspace.");
    const code = form.elements.namedItem("code") as HTMLInputElement;
    code.value = "123456";
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await viWaitFor(() => !window.document.querySelector("#workspace")!.classList.contains("hidden"));

    const apiCall = calls.find((call) => call.url.endsWith("/api/studio/me"));
    expect(apiCall).toBeDefined();
    expect(new Headers(apiCall!.options?.headers).get("authorization")).toBe(`Bearer ${idToken}`);
    expect(calls.filter((call) => call.url.includes("cognito-idp"))).toHaveLength(2);
    expect(window.document.querySelector("#newProjectButton")!.classList.contains("hidden")).toBe(true);
    expect(window.document.querySelector("#manageAccessButton")!.classList.contains("hidden")).toBe(true);
    expect(window.document.querySelector("#manageDataButton")!.classList.contains("hidden")).toBe(true);
    expect(window.document.querySelector<HTMLButtonElement>('#projectForm button[type="submit"]')!.textContent).toBe("Save website changes");
  });

  it("hydrates the canonical AWS project and saves only a revision-bound SiteSpec patch", async () => {
    const files = renderAwsStudioBundle(config);
    const dom = new JSDOM(files["index.html"], { runScripts: "outside-only", url: "https://beta.example.amplifyapp.com/" });
    const window = (dom as { window: Window & typeof globalThis }).window;
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", { value: () => undefined });
    Object.defineProperty(window.URL, "createObjectURL", { value: () => "blob:https://beta.example/media" });
    Object.defineProperty(window.URL, "revokeObjectURL", { value: () => undefined });
    Object.defineProperty(window, "Headers", { value: Headers });
    const idToken = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 })).toString("base64url")}.signature`;
    const project = {
      schemaVersion: 1, projectId: "maya-studio", merchantId: "merchant-maya", revision: 3, specHash: "a".repeat(64), updatedAt: 1_800_000_000_000, updatedBy: "whatsapp",
      spec: {
        schemaVersion: 3, siteId: "maya-studio", merchantId: "merchant-maya", businessType: "tailor", layoutPreset: "editorial", sectionOrder: ["hero", "offerings", "proof", "contact"],
        theme: { accent: "#c54f34", surface: "#fffaf4", text: "#201915", headingFont: "serif", bodyFont: "sans" },
        business: { name: "Maya Studio", description: "Custom blouse stitching", timezone: "Asia/Kolkata", locale: "en-IN" },
        hero: { headline: "Maya Studio", subheadline: "Custom blouse stitching", assetId: "asset-maya-hero" },
        offerings: [{ itemId: "custom-blouse", name: "Custom blouse", description: "Made to measure", price: { currency: "INR", amountMinor: 150000 }, availability: "available" }],
        proof: [], contact: { orderWhatsAppNumber: "+919180499647", fulfillmentArea: "Bengaluru", leadTime: "3-5 days", ctaLabel: "Message us" }, seo: { title: "Maya Studio", description: "Custom blouse stitching" }, publishedAssetIds: ["asset-maya-hero"],
      },
    };
    const calls: Array<{ url: string; options?: RequestInit }> = [];
    const fetch = async (input: string | URL | Request, options?: RequestInit) => {
      const url = String(input); calls.push({ url, options });
      if (url.endsWith("/api/studio/me")) return { ok: true, status: 200, json: async () => ({ account: { merchantId: "merchant-maya", locale: "en-IN", timezone: "Asia/Kolkata", plan: "free_beta" }, projects: [project] }) };
      if (url.includes("/api/studio/projects/changes")) return { ok: true, status: 200, json: async () => ({ changes: [], cursor: "1800000000000:maya-studio:3" }) };
      if (url.endsWith("/api/studio/projects/maya-studio") && options?.method === "PATCH") {
        const patchCount = calls.filter((call) => call.options?.method === "PATCH").length;
        return patchCount === 1
          ? { ok: true, status: 200, json: async () => ({ ...project, revision: 4, updatedAt: 1_800_000_100_000, updatedBy: "studio" }) }
          : { ok: false, status: 409, json: async () => ({ error: "revision_conflict" }) };
      }
      throw new Error(`unexpected request ${url}`);
    };
    Object.defineProperty(window, "fetch", { value: fetch });
    window.eval(files["axcas-config.js"]);
    window.eval(files["aws-studio.js"]);
    window.sessionStorage.setItem(`axcas-studio-session:${config.cognitoClientId}`, JSON.stringify({ IdToken: idToken }));
    window.eval(files["studio.js"]);
    await viWaitFor(() => (window.document.querySelector<HTMLInputElement>('[name="businessName"]')?.value ?? "") === "Maya Studio");
    window.document.querySelector<HTMLInputElement>('[name="businessName"]')!.value = "Maya Atelier";
    window.document.querySelector<HTMLFormElement>("#projectForm")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await viWaitFor(() => calls.some((call) => call.options?.method === "PATCH"));
    const patchCall = calls.find((call) => call.options?.method === "PATCH")!;
    expect(patchCall.url.endsWith("/api/studio/projects/maya-studio")).toBe(true);
    expect(JSON.parse(String(patchCall.options?.body))).toMatchObject({ expectedRevision: 3, patch: { business: { name: "Maya Atelier" } } });
    expect(calls.some((call) => call.options?.method === "POST" && call.url.includes("/api/studio/projects"))).toBe(false);
    await viWaitFor(() => window.document.querySelector("#saveStatus")!.textContent?.startsWith("Saved.") === true);

    const businessName = window.document.querySelector<HTMLInputElement>('[name="businessName"]')!;
    businessName.value = "My unsaved local edit";
    businessName.dispatchEvent(new window.Event("input", { bubbles: true }));
    window.document.querySelector<HTMLFormElement>("#projectForm")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await viWaitFor(() => !window.document.querySelector("#conflictPanel")!.classList.contains("hidden"));
    expect(businessName.value).toBe("My unsaved local edit");
  });

  it("ships the static artifact through Amplify's immutable manual-deployment job", () => {
    const script = readFileSync(new URL("../../apps/aws-studio/deploy.ps1", import.meta.url), "utf8");
    expect(script).toContain("create-deployment");
    expect(script).toContain("zipUploadUrl");
    expect(script).toContain("start-deployment");
    expect(script).toContain("StudioApp");
    expect(script).not.toContain("META_APP_SECRET");
    expect(script).not.toContain("WHATSAPP_CLOUD_ACCESS_TOKEN");
  });
});

async function viWaitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("browser condition timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
