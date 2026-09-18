import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const templatePath = new URL("../../infra/aws-native/template.yaml", import.meta.url);
const controlPlaneDockerfile = new URL("../../infra/aws-native/Dockerfile.control-plane", import.meta.url);
const workerDockerfile = new URL("../../infra/aws-native/Dockerfile.worker", import.meta.url);
const hermesDockerfile = new URL("../../infra/aws-native/Dockerfile.hermes", import.meta.url);
const deployScript = new URL("../../infra/aws-native/deploy.ps1", import.meta.url);
const productionGate = new URL("../../.github/workflows/production-gate.yml", import.meta.url);

function cloudFormationResource(template: string, logicalId: string): string {
  const normalized = template.replace(/\r\n/g, "\n");
  const marker = `  ${logicalId}:\n`;
  const start = normalized.indexOf(marker);
  if (start < 0) return "";
  const remainder = normalized.slice(start + marker.length);
  const nextResource = remainder.search(/\n  [A-Za-z][A-Za-z0-9]*:\n    Type:/);
  return nextResource < 0 ? normalized.slice(start) : normalized.slice(start, start + marker.length + nextResource);
}

describe("AWS-native production architecture", () => {
  it("contains the production control plane and has no single EC2 host", () => {
    const template = readFileSync(templatePath, "utf8");
    for (const resource of [
      "AWS::KMS::Key", "AWS::Cognito::UserPool", "AWS::DynamoDB::Table", "AWS::S3::Bucket",
      "AWS::SQS::Queue", "AWS::StepFunctions::StateMachine", "AWS::ECS::Cluster", "AWS::ECS::Service",
      "AWS::CloudFront::Distribution", "AWS::WAFv2::WebACL", "AWS::Amplify::App", "AWS::Scheduler::ScheduleGroup",
      "AWS::SNS::Topic", "AWS::CloudWatch::Alarm", "AWS::SecretsManager::Secret",
    ]) expect(template).toContain(`Type: ${resource}`);
    expect(template).not.toContain("Type: AWS::EC2::Instance");
    expect(template).toContain("Default: '919180499647'");
  });

  it("enables durable data protection and bounded queues", () => {
    const template = readFileSync(templatePath, "utf8");
    expect((template.match(/PointInTimeRecoveryEnabled: true/g) ?? [])).toHaveLength(2);
    expect(template).toContain("FifoQueue: true");
    expect(template).toContain("ContentBasedDeduplication: true");
    expect(template).toContain("SSEAlgorithm: aws:kms");
    expect(template).toContain("Sid: CloudFrontSiteDecryption");
    expect(template).toContain("'kms:Decrypt'");
    expect(template).toContain("DeletionPolicy: RetainExceptOnCreate");
    expect(template).not.toMatch(/DeletionPolicy: Retain\r?\n/);
  });

  it("keeps Cognito phone verification settings internally consistent", () => {
    const template = readFileSync(templatePath, "utf8");
    const userPool = cloudFormationResource(template, "UserPool");

    expect(userPool).toContain("AutoVerifiedAttributes: [phone_number]");
    expect(userPool).toContain("AttributesRequireVerificationBeforeUpdate: [phone_number]");
  });

  it("packages three immutable runtimes and isolates finite orchestration work", () => {
    const template = readFileSync(templatePath, "utf8");
    expect(readFileSync(controlPlaneDockerfile, "utf8")).toContain("public.ecr.aws/lambda/nodejs:22");
    expect(readFileSync(workerDockerfile, "utf8")).toContain("ffmpeg");
    const hermes = readFileSync(hermesDockerfile, "utf8");
    expect(hermes).toContain("HERMES_GIT_REF=88a58ff1355eabe468b4dcd4e152a596932632e6");
    expect(hermes).toContain('git -C /opt/hermes fetch --depth 1 origin "${HERMES_GIT_REF}"');
    expect(hermes).toContain('test "$(git -C /opt/hermes rev-parse HEAD)" = "${HERMES_GIT_REF}"');
    expect(hermes).toContain('org.opencontainers.image.version="0.18.2"');
    expect(hermes).toContain("hermes/plugins/axcas");
    expect(hermes).toContain('CMD ["hermes", "gateway", "run"]');
    expect(template).toContain("Command: [hermes, gateway, run]");
    expect(template).not.toContain("Command: [hermes, --gateway]");
    expect(template).toContain("OrchestrationTask:");
    expect(template).toContain("SitePathRewrite:");
    expect(template).toContain("SiteSecurityHeaders:");
    expect(template).toContain("ContentSecurityPolicy: \"default-src 'none'; img-src 'self' https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'\"");
    expect(template).toContain("PathPattern: 'r/*'");
    expect(template).toContain("Name: WHATSAPP_CLOUD_ACCESS_TOKEN");
    expect(template).not.toContain("AXCAS_PROVIDER_SECRET_JSON");
  });

  it("refuses dirty deploys and runs the same verification gate in CI", () => {
    const deploy = readFileSync(deployScript, "utf8");
    const workflow = readFileSync(productionGate, "utf8");
    expect(deploy).toContain("git -C $workspace status --porcelain");
    expect(deploy).toContain("api.github.com/repos/hash066/Axcas/commits/$sourceRevision/check-runs");
    expect(deploy).toContain("conclusion -eq 'success'");
    expect(deploy).toContain("docker image rm $taggedUri");
    expect(deploy).toContain("aws cloudformation validate-template");
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("pipx run cfn-lint infra/aws-native/template.yaml");
    expect(workflow).toContain("pipx run cfn-lint infra/aws-native/codebuild-bootstrap.yaml");
  });

  it("keeps disabled dynamic caching separate from forwarded tracking inputs", () => {
    const template = readFileSync(templatePath, "utf8");
    const cachePolicy = cloudFormationResource(template, "DynamicRouteCachePolicy");
    const originRequestPolicy = cloudFormationResource(template, "DynamicRouteOriginRequestPolicy");

    expect(cachePolicy).toContain("DefaultTTL: 0");
    expect(cachePolicy).toContain("MaxTTL: 0");
    expect(cachePolicy).toContain("MinTTL: 0");
    expect(cachePolicy).toContain("CookiesConfig: { CookieBehavior: none }");
    expect(cachePolicy).toContain("QueryStringsConfig: { QueryStringBehavior: none }");
    expect(cachePolicy).not.toContain("CookieBehavior: whitelist");
    expect(cachePolicy).not.toContain("QueryStringBehavior: whitelist");

    expect(originRequestPolicy).toContain("Type: AWS::CloudFront::OriginRequestPolicy");
    expect(originRequestPolicy).toContain("CookiesConfig: { CookieBehavior: whitelist, Cookies: [pgsid] }");
    expect(originRequestPolicy).toContain("QueryStringsConfig: { QueryStringBehavior: whitelist, QueryStrings: [source, campaign] }");

    const dynamicBehaviors = template.match(/PathPattern: '[re]\/\*'[\s\S]*?(?=\n\s+- PathPattern:|\n\s+CustomErrorResponses:)/g) ?? [];
    expect(dynamicBehaviors).toHaveLength(2);
    for (const behavior of dynamicBehaviors) {
      expect(behavior).toContain("CachePolicyId: !Ref DynamicRouteCachePolicy");
      expect(behavior).toContain("OriginRequestPolicyId: !Ref DynamicRouteOriginRequestPolicy");
    }
  });

  it("orders the API WAF stage and authorizes every workflow integration", () => {
    const template = readFileSync(templatePath, "utf8");
    const webAclAssociation = cloudFormationResource(template, "ApiWebAclAssociation");
    const workflowRole = cloudFormationResource(template, "WorkflowRole");
    const dataKey = cloudFormationResource(template, "DataKey");
    const cognitoPolicy = cloudFormationResource(template, "CognitoProvisioningPolicy");

    expect(webAclAssociation).toContain("DependsOn: PublicApiStage");
    for (const action of [
      "events:DescribeRule",
      "events:PutRule",
      "events:PutTargets",
      "kms:Decrypt",
      "kms:GenerateDataKey",
      "sqs:SendMessage",
    ]) expect(workflowRole).toContain(action);
    expect(dataKey).toContain("Sid: CloudWatchAlarmNotifications");
    expect(dataKey).toContain("Principal: { Service: cloudwatch.amazonaws.com }");
    expect(dataKey).toContain("'AWS:SourceAccount': !Ref 'AWS::AccountId'");
    expect(dataKey).toContain("alarm:axcas-${EnvironmentName}-*");
    for (const action of [
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminGetUser",
      "cognito-idp:AdminSetUserPassword",
      "cognito-idp:AdminUpdateUserAttributes",
    ]) expect(cognitoPolicy).toContain(action);
    expect(cognitoPolicy).toContain("Roles: [!Ref ControlPlaneRole]");
    expect(cognitoPolicy).toContain("Resource: !GetAtt UserPool.Arn");
    expect(cloudFormationResource(template, "ControlPlaneFunction")).toContain("DependsOn: CognitoProvisioningPolicy");
  });
});
