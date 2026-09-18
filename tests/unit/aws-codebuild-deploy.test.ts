import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bootstrapTemplate = new URL("../../infra/aws-native/codebuild-bootstrap.yaml", import.meta.url);
const buildspecPath = new URL("../../infra/aws-native/buildspec.deploy.yml", import.meta.url);
const bootstrapScript = new URL("../../infra/aws-native/bootstrap-codebuild.ps1", import.meta.url);

describe("AWS-native CodeBuild deployment bootstrap", () => {
  it("uses an isolated privileged build with bounded ephemeral storage", () => {
    const template = readFileSync(bootstrapTemplate, "utf8");
    expect(template).toContain("Type: AWS::CodeBuild::Project");
    expect(template).toContain("PrivilegedMode: true");
    expect(template).toContain("ComputeType: BUILD_GENERAL1_MEDIUM");
    expect(template).toContain("Type: LINUX_CONTAINER");
    expect(template).toContain("128 GB ephemeral disk");
    expect(template).toContain("Type: NO_SOURCE");
  });

  it("scopes deployment authority to the Axcas stack, repositories, and service role", () => {
    const template = readFileSync(bootstrapTemplate, "utf8");
    expect(template).toContain("axcas-${EnvironmentName}-native");
    expect(template).toContain("repository/axcas-${EnvironmentName}-*");
    expect(template).toContain("changeSet/axcas-${EnvironmentName}-*");
    expect(template).toContain("iam:PassRole");
    expect(template).toContain("cloudformation.amazonaws.com");
    expect(template).not.toContain("AdministratorAccess");
    expect(template).not.toContain("PowerUserAccess");
  });

  it("allows CloudFormation to manage the dynamic route origin request policy", () => {
    const template = readFileSync(bootstrapTemplate, "utf8");
    for (const action of [
      "cloudfront:CreateOriginRequestPolicy",
      "cloudfront:DeleteOriginRequestPolicy",
      "cloudfront:GetOriginRequestPolicy",
      "cloudfront:UpdateOriginRequestPolicy",
    ]) expect(template).toContain(action);
  });

  it("allows CloudFormation to empty campaign schedules before deleting their group", () => {
    const template = readFileSync(bootstrapTemplate, "utf8");
    for (const action of [
      "scheduler:DeleteSchedule",
      "scheduler:GetSchedule",
      "scheduler:ListSchedules",
    ]) expect(template).toContain(action);
  });

  it("allows CloudFormation to tag only API Gateway HTTP API stage collections", () => {
    const template = readFileSync(bootstrapTemplate, "utf8");
    expect(template).toContain("Sid: AxcasApiStageTags");
    expect(template).toContain("- apigateway:TagResource");
    expect(template).toContain("- apigateway:UntagResource");
    expect(template).toContain("arn:${AWS::Partition}:apigateway:${AWS::Region}::/apis/*/stages");
    expect(template).not.toContain("arn:${AWS::Partition}:apigateway:${AWS::Region}::/apis/*/stages/*");
    expect(template).not.toContain("apigateway:*");
  });

  it("allows only the AWS-native stack services to initialize encrypted resources", () => {
    const template = readFileSync(bootstrapTemplate, "utf8");
    for (const action of [
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
      "kms:CreateGrant",
      "kms:Decrypt",
      "kms:DescribeKey",
      "kms:Encrypt",
      "kms:GenerateDataKey*",
      "kms:ReEncrypt*",
      "s3:GetBucketCORS",
      "s3:GetBucketLocation",
      "s3:GetBucketObjectLockConfiguration",
      "s3:GetBucketPublicAccessBlock",
      "s3:ListBucket",
      "s3:PutBucketCORS",
      "s3:PutBucketObjectLockConfiguration",
    ]) expect(template).toContain(action);
    expect(template).toContain("Sid: AxcasKmsServiceUse");
    expect(template).toContain("kms:ViaService");
    expect(template).toContain("dynamodb.${AWS::Region}.${AWS::URLSuffix}");
    expect(template).toContain("secretsmanager.${AWS::Region}.${AWS::URLSuffix}");
    expect(template).toContain("kms:GrantIsForAWSResource");
  });

  it("checks the exact immutable commit in both the launcher and build", () => {
    const buildspec = readFileSync(buildspecPath, "utf8");
    const bootstrap = readFileSync(bootstrapScript, "utf8");
    for (const source of [buildspec, bootstrap]) {
      expect(source).toContain("check-runs");
      expect(source).toContain("github-actions");
      expect(source).toContain("SOURCE_REVISION");
    }
    expect(buildspec).toContain('git fetch --depth=1 origin "$SOURCE_REVISION"');
    expect(buildspec).toContain('test "$(git rev-parse HEAD)" = "$SOURCE_REVISION"');
    expect(buildspec).toContain("imageDigest");
    expect(buildspec).toContain("build_if_missing");
    expect(buildspec).toContain('local repository="$1"');
    expect(buildspec).toContain('local image="$REGISTRY/$repository:$SOURCE_REVISION"');
    expect(buildspec).not.toContain('local repository="$1" dockerfile="$2" image=');
    expect(buildspec).toContain("set -euo pipefail\n        build_if_missing()");
    expect(buildspec).toContain('describe-images --repository-name "$repository" --image-ids imageTag="$SOURCE_REVISION"');
    expect(buildspec).toContain("@$CONTROL_DIGEST");
    expect(buildspec).toContain("@$WORKER_DIGEST");
    expect(buildspec).toContain("@$HERMES_DIGEST");
    expect(buildspec).not.toContain("env | sort");
    expect(buildspec).not.toContain("set -x");
  });

  it("starts CodeBuild without handing provider secrets to the build", () => {
    const bootstrap = readFileSync(bootstrapScript, "utf8");
    expect(bootstrap).toContain("aws codebuild start-build");
    expect(bootstrap).toContain("aws ecr describe-repositories");
    expect(bootstrap).toContain("aws ecr create-repository");
    expect(bootstrap).toContain("imageTagMutability");
    expect(bootstrap).toContain("scanOnPush");
    expect(bootstrap).toContain("SOURCE_REVISION");
    expect(bootstrap).toContain("ENVIRONMENT_NAME");
    expect(bootstrap).not.toContain("META_APP_SECRET");
    expect(bootstrap).not.toContain("WHATSAPP_CLOUD_ACCESS_TOKEN");
    expect(bootstrap).not.toContain("PROOFGATE_SERVICE_SECRET");
  });
});
