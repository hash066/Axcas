import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const templatePath = new URL("../../infra/aws-native/template.yaml", import.meta.url);
const controlPlaneDockerfile = new URL("../../infra/aws-native/Dockerfile.control-plane", import.meta.url);
const workerDockerfile = new URL("../../infra/aws-native/Dockerfile.worker", import.meta.url);
const hermesDockerfile = new URL("../../infra/aws-native/Dockerfile.hermes", import.meta.url);

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
    expect(template).toContain("DeletionPolicy: Retain");
  });

  it("packages three immutable runtimes and isolates finite orchestration work", () => {
    const template = readFileSync(templatePath, "utf8");
    expect(readFileSync(controlPlaneDockerfile, "utf8")).toContain("public.ecr.aws/lambda/nodejs:22");
    expect(readFileSync(workerDockerfile, "utf8")).toContain("ffmpeg");
    const hermes = readFileSync(hermesDockerfile, "utf8");
    expect(hermes).toContain("HERMES_GIT_REF=88a58ff1355eabe468b4dcd4e152a596932632e6");
    expect(hermes).toContain('org.opencontainers.image.version="0.18.2"');
    expect(hermes).toContain("hermes/plugins/axcas");
    expect(template).toContain("OrchestrationTask:");
    expect(template).toContain("Name: WHATSAPP_CLOUD_ACCESS_TOKEN");
    expect(template).not.toContain("AXCAS_PROVIDER_SECRET_JSON");
  });
});
