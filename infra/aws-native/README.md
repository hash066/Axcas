# Axcas AWS-native beta stack

This stack is the replacement architecture, not evidence that the replacement is live. It keeps the existing Cloudflare/Convex service untouched until the AWS acceptance checklist passes.

During the migration, `MigrationAdminOriginUrl` deliberately keeps Hermes' typed build commands on the proven Worker boundary. The AWS API already owns new ingress, identity, OAuth, and private media paths; promotion, metrics, and the remaining typed commands move only after AWS parity tests pass. Pointing Hermes at the incomplete AWS command surface would create the exact customer-facing authentication/setup failures this redesign is meant to remove.

## What it creates

- HTTP API + WAF and a signature-checking Lambda for the Meta webhook
- encrypted, PITR-enabled DynamoDB state and append-only ledgers
- private versioned S3 media/site/evidence buckets and CloudFront site delivery
- Cognito custom authentication with a WhatsApp-delivered code
- SQS FIFO ingress/campaign queues with DLQs
- redundant Fargate Hermes/relay/tool-boundary tasks and a finite Strands task definition
- Standard Step Functions, Scheduler, CloudWatch alarms, and SNS alerts
- an Amplify application shell for Studio (Studio artifacts are deployed separately)

Hermes is pinned to installed version `0.18.2` at exact commit `88a58ff1355eabe468b4dcd4e152a596932632e6`. Its customer channel enables only the Axcas plugin. The plugin blocks every non-Axcas tool and filters command text, credentials, provider diagnostics, hashes, stack traces, and infrastructure language from WhatsApp output.

## Deploy

Run from a machine or AWS CloudShell with AWS CLI, Git, Docker, and PowerShell:

```powershell
./infra/aws-native/deploy.ps1 -EnvironmentName beta -Region ap-south-1
```

The script creates immutable/scanned ECR repositories, builds the three checked-in Dockerfiles, pushes content-addressed images, validates the AWS identity, and deploys CloudFormation. It never reads or writes provider credentials.

The stack initially creates its provider secret with unusable placeholders plus a generated internal service secret. Before any provider acceptance test, replace the placeholder JSON values in the `ProviderSecretArn` output with the real operator-owned Meta/Hermes values. Never paste these into Studio, WhatsApp, source control, CloudFormation parameters, or logs:

- `META_APP_SECRET`
- `META_VERIFY_TOKEN`
- `WHATSAPP_CLOUD_PHONE_NUMBER_ID`
- `WHATSAPP_CLOUD_ACCESS_TOKEN`
- `WHATSAPP_CLOUD_APP_ID`
- `WHATSAPP_CLOUD_WABA_ID`
- `OPENROUTER_API_KEY` (only if Hermes continues to use that inference provider)

Preserve the generated `PROOFGATE_SERVICE_SECRET` during the replacement. Customers provide none of these values.

## Gates before cutover

1. Register and OTP-verify `+91 91804 99647` in the Axcas WABA; put its production Phone Number ID and permanent system-user token into Secrets Manager.
2. Approve `axcas_login_code` and the separate action-required WhatsApp template.
3. Build and deploy all three images, then confirm two healthy Fargate tasks and Lambda health.
4. Complete Meta OAuth with a test Instagram Professional account, Page, and merchant-funded Ad Account.
5. Run the eleven live acceptance checks in the build bible. Record receipts in `EVIDENCE.md`.
6. Only then change the old Worker to a 30-day redirect and retire the EC2 runtime.

`uvx cfn-lint infra/aws-native/template.yaml` is the local structural validation command. Container builds still require Docker; source bundling can be checked with the same `esbuild` entrypoints used by the Dockerfiles.
