import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("AWS Hermes runtime assets", () => {
  it("installs an operator-owned runtime without embedding customer credentials", async () => {
    const script = await readFile("infra/aws/install-runtime.sh", "utf8");
    expect(script).toContain('REPOSITORY_URL="${1:?');
    expect(script).toContain('REPOSITORY_COMMIT="${2:?');
    expect(script).toMatch(/git .* checkout --detach/);
    expect(script).toMatch(/npm .* ci --ignore-scripts/);
    expect(script).toContain("sudo -H -u proofgate env HOME=/home/proofgate npm exec -- remotion browser ensure");
    expect(script).toContain("hermes/skills/proofgate");
    expect(script).toContain('venv/bin/pip install -e ".[messaging]"');
    expect(script).toContain(
      "install -d -m 0750 -o proofgate -g proofgate /home/proofgate/.hermes /home/proofgate/.hermes/logs",
    );
    expect(script).not.toMatch(/customer.*(?:api.?key|access.?token)/i);
    expect(script).not.toContain("git checkout main");
  });

  it("runs the authenticated origin on loopback under systemd", async () => {
    const unit = await readFile("infra/aws/systemd/proofgate-hermes-origin.service", "utf8");
    expect(unit).toContain("User=proofgate");
    expect(unit).toContain("EnvironmentFile=/etc/proofgate/origin.env");
    expect(unit).toContain("PROOFGATE_ORIGIN_HOST=127.0.0.1");
    expect(unit).toContain("@proofgate/hermes-origin-proxy");
    expect(unit).toContain("After=network-online.target proofgate-hermes-gateway.service");
    expect(unit).toContain("Requires=proofgate-hermes-gateway.service");
    expect(unit).toContain("NoNewPrivileges=true");
  });

  it("runs the pinned Hermes WhatsApp gateway without an admin credential", async () => {
    const unit = await readFile("infra/aws/systemd/proofgate-hermes-gateway.service", "utf8");
    const script = await readFile("infra/aws/install-runtime.sh", "utf8");

    expect(unit).toContain("User=proofgate");
    expect(unit).toContain("Group=proofgate");
    expect(unit).toContain("Environment=HOME=/home/proofgate");
    expect(unit).toContain("WorkingDirectory=/home/proofgate");
    expect(unit).toContain("EnvironmentFile=/etc/proofgate/hermes-gateway.env");
    expect(unit).not.toContain("EnvironmentFile=/etc/proofgate/hermes.env");
    expect(unit).toContain("ExecStart=/usr/local/bin/hermes gateway run");
    expect(unit).not.toContain("--accept-hooks");
    expect(unit).toContain("Restart=on-failure");
    expect(unit).toContain("NoNewPrivileges=true");
    expect(script).toContain(
      "install -m 0600 -o root -g root /dev/null /etc/proofgate/hermes.env",
    );
    expect(script).toContain("proofgate-hermes-gateway.service");
    expect(script).toContain("systemctl enable proofgate-hermes-gateway.service");
  });

  it("installs an explicit operator-funded model instead of falling back to OpenRouter", async () => {
    const script = await readFile("infra/aws/install-runtime.sh", "utf8");
    const config = await readFile("infra/aws/hermes-config.yaml", "utf8");

    expect(config).toContain("default: moonshotai/Kimi-K2.6");
    expect(config).toContain("provider: openai-api");
    expect(config).toContain("base_url: https://api.studio.nebius.ai/v1");
    expect(config).not.toMatch(/(?:api.?key|access.?token|service.?secret)\s*:/i);
    expect(script).toContain("infra/aws/hermes-config.yaml");
    expect(script).toContain("/home/proofgate/.hermes/config.yaml");
    expect(config).toContain("whatsapp: [axcas]");
    expect(config).toContain("enabled: [axcas]");
  });

  it("keeps AWS ingress closed and exposes deployment outputs", async () => {
    const template = await readFile("infra/aws/cloudformation.yaml", "utf8");
    expect(template).not.toContain("SecurityGroupIngress");
    expect(template).not.toContain("SecurityGroupEgress");
    expect(template).toContain("IamInstanceProfile: !Ref HermesProfile");
    expect(template).not.toContain("IamInstanceProfile: { Name: !Ref HermesProfile }");
    expect(template).toContain("InstanceId:");
    expect(template).toContain("RecordingsBucketName:");
    expect(template).toContain("AWSRegion:");
    expect(template).toContain('venv/bin/pip install -e ".[messaging]"');
    expect(template).toContain("cloudflared/releases/download/2026.7.3/cloudflared-linux-amd64");
    expect(template).toContain("9d71c677db00134c1bd4144b7783486b654ad281b1ea62b4972098d19f770f17");
    expect(template).toContain("https://nodejs.org/dist/v22.23.2/node-v22.23.2-linux-x64.tar.xz");
    expect(template).toContain("d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307");
    expect(template).toContain("ln -s /opt/node-v22.23.2-linux-x64/bin/node /usr/local/bin/node");
    expect(template).toContain("ln -s /opt/node-v22.23.2-linux-x64/bin/npm /usr/local/bin/npm");
    expect(template).toContain('test "$(node --version)" = "v22.23.2"');
    expect(template).toContain('test "$(npm --version)" = "10.9.8"');
    expect(template).not.toMatch(/apt-get install[^\n]*(?:nodejs|npm)/);
    expect(template).not.toMatch(/nodesource/i);
    expect(template).toContain("HermesRelayQueue:");
    expect(template).toContain("HermesRelayDeadLetterQueue:");
    expect(template).toContain("HermesRelayApi:");
    expect(template).toContain("HermesRelayFunction:");
    expect(template).toContain("SqsManagedSseEnabled: true");
    expect(template).toContain("RelayOriginUrl:");
    expect(template).toContain("RelayQueueUrl:");
  });

  it("separates durable merchant media from expiring consented call recordings", async () => {
    const template = await readFile("infra/aws/cloudformation.yaml", "utf8");

    expect(template).toContain("MerchantMediaBucket:");
    expect(template).toContain("MerchantMediaBucketPolicy:");
    expect(template).toContain("MerchantMediaBucketName:");
    expect(template).toContain("BucketOwnerEnforced");
    expect(template).toContain("ExpireUnselectedIngestAfter30Days");
    expect(template).toContain("ExpireGeneratedRendersAfter90Days");
    expect(template).toContain("AbortIncompleteMerchantMediaUploads");
    expect(template).toMatch(/MerchantMediaBucket:[\s\S]*?DeletionPolicy: Retain/);
    expect(template).toMatch(/RecordingsBucket:[\s\S]*?DeleteConsentedRecordingsAfter30Days/);
    expect(template).toContain("PolicyName: AxcasConsentedCallRecordings");
    expect(template).toContain("PolicyName: AxcasPrivateMerchantMedia");
    expect(template).toContain("- !Sub '${MerchantMediaBucket.Arn}/private/*'");
    expect(template).toContain("- !Sub '${MerchantMediaBucket.Arn}/published/*'");
    expect(template).toContain("Resource: !Sub '${RecordingsBucket.Arn}/*'");
  });

  it("grants the isolated Strands runtime only Bedrock model invocation", async () => {
    const template = await readFile("infra/aws/cloudformation.yaml", "utf8");
    const unit = await readFile("infra/aws/systemd/axcas-tool-bridge.service", "utf8");

    expect(template).toContain("PolicyName: AxcasStrandsBedrockInference");
    expect(template).toContain("bedrock:InvokeModel");
    expect(template).toContain("bedrock:InvokeModelWithResponseStream");
    expect(template).toContain("foundation-model/anthropic.claude-sonnet-4-6*");
    expect(template).toContain("inference-profile/global.anthropic.claude-sonnet-4-6*");
    expect(template).not.toMatch(/Action:\s*\[?bedrock:\*/);
    expect(unit).toContain("AXCAS_STRANDS_MODEL_ID=global.anthropic.claude-sonnet-4-6");
  });

  it("alarms on relay failure and notifies an operator-owned SNS topic", async () => {
    const template = await readFile("infra/aws/cloudformation.yaml", "utf8");
    const deploy = await readFile("infra/aws/deploy.ps1", "utf8");

    expect(template).toContain("OperatorAlertEmail:");
    expect(template).toContain("OperationsAlertTopic:");
    expect(template).toContain("OperationsEmailSubscription:");
    expect(template).toContain("HermesRelayDeadLetterAlarm:");
    expect(template).toContain("MetricName: ApproximateNumberOfMessagesVisible");
    expect(template).toContain("HermesRelayQueueAgeAlarm:");
    expect(template).toContain("MetricName: ApproximateAgeOfOldestMessage");
    expect(template).toContain("HermesRelayLambdaErrorsAlarm:");
    expect(template).toContain("MetricName: Errors");
    expect(template).toContain("TreatMissingData: notBreaching");
    expect(template).toContain("OperationsAlertTopicArn:");
    expect(deploy).toContain('[string]$OperatorAlertEmail');
    expect(deploy).toContain('ParameterKey=OperatorAlertEmail');
    expect(deploy).toContain("OutputKey=='OperationsAlertTopicArn'");
    expect(deploy).toContain("OutputKey=='MerchantMediaBucketName'");
  });

  it("alerts on instance failure and automatically recovers supported system failures", async () => {
    const template = await readFile("infra/aws/cloudformation.yaml", "utf8");

    expect(template).toContain("HermesSystemStatusAlarm:");
    expect(template).toContain("MetricName: StatusCheckFailed_System");
    expect(template).toContain("HermesInstanceStatusAlarm:");
    expect(template).toContain("MetricName: StatusCheckFailed_Instance");
    expect(template).toContain("arn:${AWS::Partition}:automate:${AWS::Region}:ec2:recover");
    expect(template).toMatch(/HermesSystemStatusAlarm:[\s\S]*?AlarmActions:[\s\S]*?ec2:recover/);
  });

  it("keeps the Hermes admin credential in Secrets Manager and syncs it without printing", async () => {
    const template = await readFile("infra/aws/cloudformation.yaml", "utf8");
    const syncScript = await readFile("infra/aws/sync-hermes-admin-secret.mjs", "utf8");
    const deploy = await readFile("infra/aws/deploy.ps1", "utf8");

    expect(template).toContain("HermesAdminSecret:");
    expect(template).toContain("Action: [secretsmanager:GetSecretValue]");
    expect(template).toContain("Resource: !Ref HermesAdminSecret");
    expect(template).toContain("AdminSecretArn:");
    expect(syncScript).toContain("GetSecretValueCommand");
    expect(syncScript).toContain("PROOFGATE_ADMIN_SECRET_ARN");
    expect(syncScript).toContain("PROOFGATE_ADMIN_URL");
    expect(syncScript).toContain("PROOFGATE_SERVICE_SECRET");
    expect(syncScript).not.toContain("console.info(serviceSecret");
    expect(syncScript).toContain('/etc/proofgate/axcas-tool-bridge.env');
    expect(syncScript).toContain('/etc/proofgate/hermes.env');
    expect(deploy).toContain("sync-hermes-admin-secret.mjs");
    expect(deploy).toContain("systemctl restart axcas-tool-bridge.service");
    expect(deploy).toContain("systemctl restart proofgate-hermes-gateway.service");
    expect(deploy.indexOf("systemctl restart axcas-tool-bridge.service")).toBeLessThan(
      deploy.indexOf("systemctl restart proofgate-hermes-gateway.service"),
    );
  });

  it("installs the durable SQS relay as a restricted service", async () => {
    const unit = await readFile("infra/aws/systemd/proofgate-hermes-relay.service", "utf8");
    const script = await readFile("infra/aws/install-runtime.sh", "utf8");

    expect(unit).toContain("User=proofgate");
    expect(unit).toContain("EnvironmentFile=/etc/proofgate/relay.env");
    expect(unit).toContain("@proofgate/hermes-sqs-relay");
    expect(unit).toContain("NoNewPrivileges=true");
    expect(script).toContain("proofgate-hermes-relay.service");
    expect(script).toContain("systemctl enable proofgate-hermes-relay.service");
  });

  it("runs the approval-claiming reel guardian as a restricted AWS service", async () => {
    const unit = await readFile("infra/aws/systemd/axcas-reel-guardian.service", "utf8");
    const script = await readFile("infra/aws/install-runtime.sh", "utf8");
    expect(unit).toContain("User=axcasguardian");
    expect(unit).toContain("EnvironmentFile=/etc/proofgate/hermes.env");
    expect(unit).toContain("@axcas/reel-guardian");
    expect(unit).toContain("NoNewPrivileges=true");
    expect(script).toContain("axcas-reel-guardian.service");
    expect(script).toContain("systemctl enable axcas-reel-guardian.service");
  });

  it("runs the approved call guardian as a restricted AWS service", async () => {
    const unit = await readFile("infra/aws/systemd/axcas-call-guardian.service", "utf8");
    const script = await readFile("infra/aws/install-runtime.sh", "utf8");
    expect(unit).toContain("User=axcasguardian");
    expect(unit).toContain("NoNewPrivileges=true");
    expect(unit).toContain("@axcas/call-guardian");
    expect(script).toContain("axcas-call-guardian.service");
    expect(script).toContain("systemctl enable axcas-call-guardian.service");
  });

  it("runs the named tunnel from a root-readable token file", async () => {
    const unit = await readFile("infra/aws/systemd/proofgate-cloudflared.service", "utf8");
    expect(unit).toContain("--token-file /etc/proofgate/cloudflared-token");
    expect(unit).toContain("After=network-online.target proofgate-hermes-origin.service");
    expect(unit).not.toMatch(/eyJ[A-Za-z0-9._-]{80,}/);
  });

  it("installs but does not enable the foundation-only quick tunnel", async () => {
    const unit = await readFile("infra/aws/systemd/proofgate-cloudflared-quick.service", "utf8");
    const script = await readFile("infra/aws/install-runtime.sh", "utf8");

    expect(unit).toContain("After=network-online.target proofgate-hermes-origin.service");
    expect(unit).toContain("Requires=proofgate-hermes-origin.service");
    expect(unit).toContain(
      "ExecStart=/usr/local/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8080",
    );
    expect(unit).toContain("Restart=on-failure");
    expect(unit).toContain("NoNewPrivileges=true");
    expect(script).toContain("proofgate-cloudflared-quick.service");
    expect(script).not.toContain("systemctl enable proofgate-cloudflared-quick.service");
  });

  it("provides a fail-closed one-command AWS deployment", async () => {
    const deploy = await readFile("infra/aws/deploy.ps1", "utf8");
    expect(deploy).toContain("aws sts get-caller-identity");
    expect(deploy).toContain("aws cloudformation validate-template");
    expect(deploy).toContain('"cloudformation", "deploy"');
    expect(deploy).toContain("& aws @deployArguments");
    expect(deploy).toContain("aws ssm send-command");
    expect(deploy).toContain("aws ssm wait command-executed");
    expect(deploy).toContain("raw.githubusercontent.com");
    expect(deploy).not.toContain('"set -euo pipefail"');
    expect(deploy).not.toMatch(/customer.*(?:api.?key|access.?token)/i);
  });
});
