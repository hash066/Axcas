import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const template = readFileSync(new URL("../../infra/aws-native/template.yaml", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const deploy = readFileSync(new URL("../../apps/aws-studio/deploy.ps1", import.meta.url), "utf8");

function resource(logicalId: string): string {
  const marker = `  ${logicalId}:\n`;
  const start = template.indexOf(marker);
  if (start < 0) return "";
  const remainder = template.slice(start + marker.length);
  const next = remainder.search(/\n  [A-Za-z][A-Za-z0-9]*:\n    Type:/);
  return next < 0 ? template.slice(start) : template.slice(start, start + marker.length + next);
}

describe("AWS Studio cross-origin API boundary", () => {
  it("allows only the exact deployed Amplify branch origin and required browser inputs", () => {
    const api = resource("PublicApi");

    expect(template).toContain("StudioBranchName:");
    expect(api).toContain("CorsConfiguration:");
    expect(api).toContain("AllowOrigins: [!Sub 'https://${StudioBranchName}.${StudioApp.DefaultDomain}']");
    expect(api).toContain("AllowMethods: [GET, POST, PATCH, OPTIONS]");
    expect(api).toContain("AllowHeaders: [Authorization, Content-Type]");
    expect(api).toContain("MaxAge: 600");
    expect(api).not.toContain("AllowOrigins: ['*']");
    expect(api).not.toContain("AllowHeaders: ['*']");
  });

  it("keeps preflight unauthenticated while every merchant-data route requires the Cognito JWT", () => {
    const preflight = resource("StudioPreflightRoute");
    expect(preflight).toContain("RouteKey: 'OPTIONS /{proxy+}'");
    expect(preflight).toContain("AuthorizationType: NONE");
    expect(preflight).not.toContain("AuthorizerId:");

    for (const logicalId of [
      "StudioAccountRoute",
      "StudioProjectReadRoute",
      "StudioProjectPatchRoute",
      "StudioApprovalsRoute",
      "StudioProjectApprovalRoute",
      "MetaOAuthStartRoute",
      "StudioMediaUploadRoute",
      "StudioMediaPartRoute",
      "StudioMediaCompleteRoute",
    ]) {
      const route = resource(logicalId);
      expect(route, logicalId).toContain("AuthorizationType: JWT");
      expect(route, logicalId).toContain("AuthorizerId: !Ref StudioApiAuthorizer");
    }
  });

  it("uses the same configured branch for Amplify, CORS, deployment, and the public output", () => {
    expect(resource("StudioBranch")).toContain("BranchName: !Ref StudioBranchName");
    expect(template).toContain("StudioUrl: { Value: !Sub 'https://${StudioBranchName}.${StudioApp.DefaultDomain}' }");
    expect(template).toContain("StudioBranchNameOutput: { Value: !Ref StudioBranchName }");
    expect(deploy).toContain('Get-StackOutput "StudioUrl"');
    expect(deploy).toContain('Get-StackOutput "StudioBranchNameOutput"');
    expect(deploy).not.toContain('https://$BranchName.$appId.amplifyapp.com');
  });

  it("deploys Studio against the AWS-native application stack by default", () => {
    expect(deploy).toContain('[string]$StackName = "axcas-beta-native"');
    expect(deploy).not.toContain('[string]$StackName = "axcas-beta",');
  });
});
