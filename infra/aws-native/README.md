# Axcas AWS-native beta stack

This stack is the replacement architecture, not evidence that the replacement is live. It keeps the existing Cloudflare/Convex service untouched until the AWS acceptance checklist passes.

During the migration, `MigrationAdminOriginUrl` deliberately keeps Hermes' typed build commands on the proven Worker boundary. The AWS API already owns new ingress, identity, OAuth, and private media paths; promotion, metrics, and the remaining typed commands move only after AWS parity tests pass. Pointing Hermes at the incomplete AWS command surface would create the exact customer-facing authentication/setup failures this redesign is meant to remove.

## What it creates

- HTTP API with stage throttling and a signature-checking Lambda for the Meta webhook
- encrypted, PITR-enabled DynamoDB state and append-only ledgers
- private versioned S3 media/site/evidence buckets and CloudFront site delivery
- Cognito custom authentication with a WhatsApp-delivered code
- SQS FIFO ingress/campaign queues with DLQs
- an opt-in redundant Fargate Hermes/relay/tool-boundary service and a finite Strands task definition
- Standard Step Functions, Scheduler, CloudWatch alarms, and SNS alerts
- an Amplify application plus the separately deployed static Studio artifact in `apps/aws-studio`

AWS WAF's supported API Gateway association target is a REST API stage, not this stack's V2 HTTP
API. Edge WAF is deliberately deferred until the branded CloudFront/custom-domain layer; the beta
does not deploy an invalid or unattached web ACL.

Hermes is pinned to installed version `0.18.2` at exact commit `88a58ff1355eabe468b4dcd4e152a596932632e6`. Its customer channel enables only the Axcas plugin. The plugin blocks every non-Axcas tool and filters command text, credentials, provider diagnostics, hashes, stack traces, and infrastructure language from WhatsApp output.

## Deploy

Run from a machine with sufficient Docker storage:

```powershell
./infra/aws-native/deploy.ps1 -EnvironmentName beta -Region ap-south-1
```

The script creates immutable/scanned ECR repositories, builds the three checked-in Dockerfiles, pushes content-addressed images, validates the AWS identity, and deploys CloudFormation. It never reads or writes provider credentials.

For AWS CloudShell, use the CodeBuild bootstrap so no image layers are built or retained in the small CloudShell filesystem. The launcher refuses a dirty checkout, requires the exact checked-out 40-character commit, and independently requires that commit's successful GitHub Actions `verify` check. CodeBuild clones that detached revision, repeats the check, builds in an isolated privileged Linux environment with 128 GB ephemeral disk, and deploys only ECR image digests:

```powershell
./infra/aws-native/bootstrap-codebuild.ps1 -SourceRevision (git rev-parse HEAD) -EnvironmentName beta -Region ap-south-1
```

The command returns a CodeBuild build ID. Follow it without exposing environment data:

```powershell
aws codebuild batch-get-builds --ids <build-id> --region ap-south-1 --query 'builds[0].{Status:buildStatus,Logs:logs.deepLink}' --output table
```

The launcher idempotently reuses or creates the three immutable, scan-on-push AES256 ECR repositories and refuses an existing repository with weaker settings. The bootstrap stack creates a dedicated CodeBuild project, its retained 30-day log group, and a dedicated CloudFormation service role. The build role can push only those three repositories, operate only the `axcas-beta-native` stack and its explicitly named change sets, and pass only that service role. The service role has explicit service actions instead of an AWS administrator managed policy. No provider credential is a build input or output.

The first deployment leaves `EnableWorkers=false`. This allows the API, identity, storage, queues,
workflow definitions, CloudFront and Studio to receive independent acceptance without starting a
gateway against placeholder provider credentials. After the provider secret is configured, run one
standalone task acceptance check and update the stack with `EnableWorkers=true`; only then may two
healthy always-on Hermes tasks be claimed.

The stack initially creates its provider secret with unusable placeholders plus a generated internal service secret. Before any provider acceptance test, replace the placeholder JSON values in the `ProviderSecretArn` output with the real operator-owned Meta/Hermes values. Never paste these into Studio, WhatsApp, source control, CloudFormation parameters, or logs:

- `META_APP_SECRET`
- `META_VERIFY_TOKEN`
- `WHATSAPP_CLOUD_PHONE_NUMBER_ID`
- `WHATSAPP_CLOUD_ACCESS_TOKEN`
- `WHATSAPP_CLOUD_APP_ID`
- `WHATSAPP_CLOUD_WABA_ID`

Hermes uses AWS Bedrock through the ECS task role; no model-provider API key is stored in the provider secret.

Preserve the generated `PROOFGATE_SERVICE_SECRET` during the replacement. Customers provide none of these values.

Deploy the Studio artifact after the stack finishes:

```powershell
./apps/aws-studio/deploy.ps1 -StackName axcas-beta-native -Region ap-south-1
```

This reads the public API and Cognito outputs, creates a static bundle from the code-owned Studio renderer, and uploads it through an Amplify manual-deployment job. It does not read provider secrets. See `apps/aws-studio/README.md` for the current API-parity boundary.

## Gates before cutover

1. Register and OTP-verify `+91 91804 99647` in the Axcas WABA; put its production Phone Number ID and permanent system-user token into Secrets Manager.
2. Approve `axcas_login_code` and the separate action-required WhatsApp template.
3. Build and deploy all three images, run one standalone worker task against configured provider secrets, update `EnableWorkers=true`, then confirm two healthy Fargate tasks and Lambda health.
4. Complete Meta OAuth with a test Instagram Professional account, Page, and merchant-funded Ad Account.
5. Run the eleven live acceptance checks in the build bible. Record receipts in `EVIDENCE.md`.
6. Only then change the old Worker to a 30-day redirect and retire the EC2 runtime.

`uvx cfn-lint infra/aws-native/template.yaml` is the local structural validation command. Container builds still require Docker; source bundling can be checked with the same `esbuild` entrypoints used by the Dockerfiles.
