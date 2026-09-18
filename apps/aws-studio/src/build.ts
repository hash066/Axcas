import { z } from "zod";

import { renderStudio, renderStudioCss } from "../../../packages/renderer/src/render-studio";
import { renderStudioClientJs } from "../../../packages/renderer/src/render-studio-client";
import { renderAwsStudioAuthJs } from "./cognito-auth";

export const AwsStudioRuntimeConfigSchema = z.object({
  region: z.string().regex(/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/),
  apiUrl: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "" && url.pathname === "/" && !url.search && !url.hash;
  }, "API URL must be an HTTPS origin"),
  cognitoUserPoolId: z.string().regex(/^[a-z]{2}(?:-gov)?-[a-z]+-\d_[A-Za-z0-9]+$/),
  cognitoClientId: z.string().regex(/^[a-z0-9]{10,128}$/),
  whatsappNumber: z.string().regex(/^\d{8,15}$/),
}).strict().superRefine((value, context) => {
  if (!value.cognitoUserPoolId.startsWith(`${value.region}_`)) {
    context.addIssue({ code: "custom", path: ["cognitoUserPoolId"], message: "Cognito pool must belong to the configured region" });
  }
});

export type AwsStudioRuntimeConfig = z.infer<typeof AwsStudioRuntimeConfigSchema>;
export type AwsStudioBundle = Record<"index.html" | "studio.css" | "studio.js" | "aws-studio.js" | "axcas-config.js", string>;

function renderConfigJs(config: AwsStudioRuntimeConfig): string {
  const json = JSON.stringify(config).replace(/</g, "\\u003c");
  return `window.__AXCAS_CONFIG__=Object.freeze(${json});\n`;
}

export function renderAwsStudioBundle(input: unknown): AwsStudioBundle {
  const config = AwsStudioRuntimeConfigSchema.parse(input);
  const apiOrigin = new URL(config.apiUrl).origin;
  let html = renderStudio(config.whatsappNumber);
  const contentSecurityPolicy = `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' ${apiOrigin} https://cognito-idp.${config.region}.amazonaws.com; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`;
  html = html.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}">`);
  html = html.replace(
    /<script src="\/studio\.js\?v=[^"]+" defer><\/script>/,
    '<script src="/axcas-config.js" defer></script><script src="/aws-studio.js" defer></script><script src="/studio.js" defer></script>',
  );
  return {
    "index.html": html,
    "studio.css": `${renderStudioCss()}\n.aws-sign-in{display:grid;gap:16px;max-width:460px;margin:24px 0}.aws-sign-in label{display:grid;gap:8px}.aws-sign-in input{width:100%}`,
    "studio.js": renderStudioClientJs(),
    "aws-studio.js": renderAwsStudioAuthJs(),
    "axcas-config.js": renderConfigJs(config),
  };
}
