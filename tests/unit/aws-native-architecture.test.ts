import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const templatePath = new URL("../../infra/aws-native/template.yaml", import.meta.url);
const controlPlaneDockerfile = new URL("../../infra/aws-native/Dockerfile.control-plane", import.meta.url);
const workerDockerfile = new URL("../../infra/aws-native/Dockerfile.worker", import.meta.url);
const hermesDockerfile = new URL("../../infra/aws-native/Dockerfile.hermes", import.meta.url);
const hermesConfig = new URL("../../infra/aws-native/hermes-config.yaml", import.meta.url);
const hermesPublicChannelPatch = new URL("../../infra/aws-native/hermes-public-channel.patch", import.meta.url);
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
      "AWS::CloudFront::Distribution", "AWS::Amplify::App", "AWS::Scheduler::ScheduleGroup",
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

  it("keeps phone verification on the signed WhatsApp admin path without Cognito SMS", () => {
    const template = readFileSync(templatePath, "utf8");
    const userPool = cloudFormationResource(template, "UserPool");

    expect(userPool).toContain("UsernameAttributes: [phone_number]");
    expect(userPool).not.toContain("AutoVerifiedAttributes:");
    expect(userPool).not.toContain("SmsConfiguration:");
    expect(userPool).not.toContain("UserAttributeUpdateSettings:");
  });

  it("protects the Studio continuity feed with the same Cognito JWT authorizer", () => {
    const template = readFileSync(templatePath, "utf8");
    const route = cloudFormationResource(template, "StudioProjectChangesRoute");
    expect(route).toContain("RouteKey: 'GET /api/studio/projects/changes'");
    expect(route).toContain("AuthorizationType: JWT");
    expect(route).toContain("AuthorizerId: !Ref StudioApiAuthorizer");
  });

  it("packages three immutable runtimes and isolates finite orchestration work", () => {
    const template = readFileSync(templatePath, "utf8");
    const controlPlane = readFileSync(controlPlaneDockerfile, "utf8");
    expect(controlPlane).toContain("public.ecr.aws/lambda/nodejs:22");
    expect(controlPlane).toContain("--format=cjs");
    expect(controlPlane).toContain("--outfile=/out/handler.js");
    expect(controlPlane).not.toContain("--format=esm");
    expect(readFileSync(workerDockerfile, "utf8")).toContain("ffmpeg");
    const worker = readFileSync(workerDockerfile, "utf8");
    expect(worker).toContain("--format=esm");
    expect(worker).toContain("--packages=external");
    expect(worker).toContain("npm prune --omit=dev --ignore-scripts");
    expect(worker).toContain("COPY --from=build /workspace/node_modules ./node_modules");
    const hermes = readFileSync(hermesDockerfile, "utf8");
    expect(hermes).toContain("HERMES_GIT_REF=88a58ff1355eabe468b4dcd4e152a596932632e6");
    expect(hermes).toContain('git -C /opt/hermes fetch --depth 1 origin "${HERMES_GIT_REF}"');
    expect(hermes).toContain('test "$(git -C /opt/hermes rev-parse HEAD)" = "${HERMES_GIT_REF}"');
    expect(hermes).toContain('org.opencontainers.image.version="0.18.2"');
    expect(hermes).toContain("hermes/plugins/axcas");
    expect(hermes).toContain("hermes-public-channel.patch");
    expect(hermes).toContain("git -C /opt/hermes apply");
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

  it("keeps Hermes operator onboarding out of the public WhatsApp channel", () => {
    const patch = readFileSync(hermesPublicChannelPatch, "utf8");

    expect(patch).toContain("Platform.WHATSAPP_CLOUD");
    expect(patch).toContain("public customer channel");
    expect(patch).toContain("source.platform not in");
    expect(patch).toContain("Platform.WEBHOOK");
    expect(patch).toContain("source.platform != Platform.WHATSAPP_CLOUD");
    expect(patch).toContain("You are Axcas, the WhatsApp-first growth agent");
    expect(patch).toContain("Never offer a personal profile");
    expect(patch).toContain("Never recommend Carrd, Wix, Squarespace, or another site builder");
    expect(patch).toContain("call axcas_continue before replying");
  });

  it("binds the inbound WhatsApp message id into the Hermes session source", () => {
    const patch = readFileSync(hermesPublicChannelPatch, "utf8");

    expect(patch).toContain("source.message_id = wamid");
    expect(patch).toContain('if _action == "respond":');
    expect(patch).toContain("await _adapter.send(");
  });

  it("ships the Axcas BRAG-derived creative director without executable customer compositions", () => {
    const dockerfile = readFileSync(hermesDockerfile, "utf8");
    const skill = readFileSync(new URL("../../hermes/skills/axcas-brag/SKILL.md", import.meta.url), "utf8");

    expect(dockerfile).toContain("hermes/skills/axcas-brag");
    expect(skill).toContain("BRAG-derived creative director");
    expect(skill).toContain("Hook (2–3s) → Reveal (2–4s)");
    expect(skill).toContain("merchant-owned media");
    expect(skill).toContain("never emit HTML, CSS, JavaScript");
    expect(skill).toContain("Copyright (c) 2026 Shunit Haviv Hakimi");
  });

  it("decodes native WhatsApp images before invoking Bedrock", () => {
    const patch = readFileSync(hermesPublicChannelPatch, "utf8");

    expect(patch).toContain("import base64");
    expect(patch).toContain("base64.b64decode(data, validate=True)");
    expect(patch).toContain('"source": {"bytes": image_bytes}');
    expect(patch).toContain('"jpg": "jpeg"');
  });

  it("keeps provider diagnostics operator-only on the public WhatsApp channel", () => {
    const patch = readFileSync(hermesPublicChannelPatch, "utf8");

    expect(patch).toContain("Axcas provider request failed on public WhatsApp");
    expect(patch).toContain("I received what you sent but couldn’t finish just now");
    expect(patch).not.toContain("check gateway logs for diagnostics");
  });

  it("runs Hermes through Bedrock with task-role credentials and streaming permission", () => {
    const template = readFileSync(templatePath, "utf8");
    const dockerfile = readFileSync(hermesDockerfile, "utf8");
    const config = readFileSync(hermesConfig, "utf8");
    const workerRole = cloudFormationResource(template, "WorkerTaskRole");
    const workerTask = cloudFormationResource(template, "WorkerTask");

    expect(config).toContain("provider: bedrock");
    expect(config).toContain("default: global.amazon.nova-2-lite-v1:0");
    expect(config).toContain("provider_filter:\n      - amazon");
    expect(config).toContain("base_url: https://bedrock-runtime.ap-south-1.amazonaws.com");
    expect(config).toContain("region: ap-south-1");
    expect(dockerfile).toContain('pip install --no-cache-dir "/opt/hermes[messaging,bedrock,anthropic]"');
    expect(workerRole).toContain("bedrock:InvokeModel");
    expect(workerRole).toContain("bedrock:InvokeModelWithResponseStream");
    expect(workerRole).toContain("bedrock:ListFoundationModels");
    expect(workerRole).toContain("bedrock:ListInferenceProfiles");
    expect(workerTask).not.toContain("OPENROUTER_API_KEY");
  });

  it("initializes the shared Fargate socket volume before distinct non-root runtimes start", () => {
    const template = readFileSync(templatePath, "utf8");
    const workerTask = cloudFormationResource(template, "WorkerTask");
    const worker = readFileSync(workerDockerfile, "utf8");
    const hermes = readFileSync(hermesDockerfile, "utf8");

    expect(worker).toContain("groupadd --gid 10000 axcas-runtime");
    expect(worker).toContain("useradd --uid 10001 --gid 10000");
    expect(hermes).toContain("groupadd --gid 10000 axcas-runtime");
    expect(hermes).toContain("useradd --uid 10002 --gid 10000");
    expect(workerTask).toContain("- Name: runtime-init");
    expect(workerTask).toContain("User: '0:0'");
    expect(workerTask).toContain("ReadonlyRootFilesystem: true");
    expect(workerTask).toContain("Command: [sh, -c, 'chown 0:10000 /run/axcas && chmod 0770 /run/axcas']");
    expect(workerTask.match(/ContainerName: runtime-init, Condition: SUCCESS/g)).toHaveLength(2);
    expect(workerTask).toContain("User: '10002:10000'");
    expect(workerTask.match(/User: '10001:10000'/g)).toHaveLength(2);
    expect(workerTask).not.toMatch(/chmod\s+0?777/);
  });

  it("keeps the always-on Hermes service disabled until provider acceptance", () => {
    const template = readFileSync(templatePath, "utf8");
    const workerService = cloudFormationResource(template, "WorkerService");

    expect(template).toContain("EnableWorkers:");
    expect(template).toContain("WorkersEnabled: !Equals [!Ref EnableWorkers, 'true']");
    expect(workerService).toContain("Condition: WorkersEnabled");
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

  it("uses HTTP API throttling without an invalid WAF REST-stage association and authorizes every workflow integration", () => {
    const template = readFileSync(templatePath, "utf8");
    const publicApiStage = cloudFormationResource(template, "PublicApiStage");
    const workflowRole = cloudFormationResource(template, "WorkflowRole");
    const dataKey = cloudFormationResource(template, "DataKey");
    const cognitoPolicy = cloudFormationResource(template, "CognitoProvisioningPolicy");

    expect(publicApiStage).toContain("ThrottlingBurstLimit: 100");
    expect(publicApiStage).toContain("ThrottlingRateLimit: 50");
    expect(template).not.toContain("Type: AWS::WAFv2::WebACLAssociation");
    expect(template).not.toContain("Type: AWS::WAFv2::WebACL");
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
