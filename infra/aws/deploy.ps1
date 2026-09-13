param(
  [string]$Region = "ap-south-1",
  [string]$StackName = "proofgate-foundation",
  [Parameter(Mandatory = $true)][string]$RepositoryCommit,
  [string]$RepositoryUrl = "https://github.com/hash066/Axcas.git",
  [string]$AdminUrl = "https://proofgate-whatsapp-growth.proofgate-harshita.workers.dev",
  [string]$OperatorAlertEmail = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($RepositoryCommit -notmatch '^[a-f0-9]{40}$') {
  throw "RepositoryCommit must be a full 40-character SHA."
}
if ($RepositoryUrl -notmatch '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?$') {
  throw "RepositoryUrl must be an explicit HTTPS GitHub repository."
}
if ($AdminUrl -notmatch '^https://[a-z0-9.-]+\.workers\.dev/?$') {
  throw "AdminUrl must be the named workers.dev origin."
}
if ($OperatorAlertEmail -and $OperatorAlertEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
  throw "OperatorAlertEmail must be a valid email address."
}
if ($Region -notmatch '^[a-z]{2}-[a-z]+-\d$' -or $StackName -notmatch '^[A-Za-z][A-Za-z0-9-]{2,127}$') {
  throw "Region or StackName is invalid."
}
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  throw "AWS CLI v2 is required."
}

$template = (Resolve-Path (Join-Path $PSScriptRoot "cloudformation.yaml")).Path

aws sts get-caller-identity --region $Region --output json
if ($LASTEXITCODE -ne 0) { throw "AWS identity check failed." }

aws cloudformation validate-template --template-body "file://$template" --region $Region | Out-Null
if ($LASTEXITCODE -ne 0) { throw "CloudFormation validation failed." }

$deployArguments = @(
  "cloudformation", "deploy",
  "--stack-name", $StackName,
  "--template-file", $template,
  "--capabilities", "CAPABILITY_IAM",
  "--region", $Region,
  "--no-fail-on-empty-changeset"
)
$stackParameters = @("ParameterKey=StudioOrigin,ParameterValue=$($AdminUrl.TrimEnd('/'))")
if ($OperatorAlertEmail) {
  $stackParameters += "ParameterKey=OperatorAlertEmail,ParameterValue=$OperatorAlertEmail"
}
$deployArguments += @("--parameter-overrides") + $stackParameters
& aws @deployArguments
if ($LASTEXITCODE -ne 0) { throw "CloudFormation deployment failed." }

$instanceId = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" --output text
$bucket = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='RecordingsBucketName'].OutputValue" --output text
$merchantMediaBucket = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='MerchantMediaBucketName'].OutputValue" --output text
$merchantMediaSecretArn = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='MerchantMediaCapabilitySecretArn'].OutputValue" --output text
$operationsTopicArn = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='OperationsAlertTopicArn'].OutputValue" --output text
$relayOrigin = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='RelayOriginUrl'].OutputValue" --output text
$relayQueue = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='RelayQueueUrl'].OutputValue" --output text
$relaySecretArn = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='RelaySecretArn'].OutputValue" --output text
$adminSecretArn = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='AdminSecretArn'].OutputValue" --output text
if ($LASTEXITCODE -ne 0 -or $instanceId -notmatch '^i-[a-f0-9]+$' -or [string]::IsNullOrWhiteSpace($bucket) -or [string]::IsNullOrWhiteSpace($merchantMediaBucket) -or $merchantMediaSecretArn -notmatch '^arn:' -or $operationsTopicArn -notmatch '^arn:' -or $relayOrigin -notmatch '^https://[a-z0-9]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com$' -or $relayQueue -notmatch '^https://sqs\.[a-z0-9-]+\.amazonaws\.com/' -or $relaySecretArn -notmatch '^arn:' -or $adminSecretArn -notmatch '^arn:') {
  throw "Stack outputs are incomplete."
}

$registered = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  $ping = aws ssm describe-instance-information --region $Region --filters "Key=InstanceIds,Values=$instanceId" --query "InstanceInformationList[0].PingStatus" --output text 2>$null
  if ($LASTEXITCODE -eq 0 -and $ping -eq "Online") { $registered = $true; break }
  Start-Sleep -Seconds 10
}
if (-not $registered) { throw "Instance did not register with Systems Manager." }

$repositoryPath = ($RepositoryUrl -replace '^https://github.com/', '') -replace '\.git$', ''
$installerUrl = "https://raw.githubusercontent.com/$repositoryPath/$RepositoryCommit/infra/aws/install-runtime.sh"
$commands = @(
  "set -eu",
  "curl -fsSL '$installerUrl' -o /tmp/proofgate-install-runtime.sh",
  "chmod 0700 /tmp/proofgate-install-runtime.sh",
  "sudo /tmp/proofgate-install-runtime.sh '$RepositoryUrl' '$RepositoryCommit'",
  "printf '%s\n' 'HERMES_RELAY_QUEUE_URL=$relayQueue' | sudo tee /etc/proofgate/relay.env >/dev/null",
  "sudo chown root:proofgate /etc/proofgate/relay.env && sudo chmod 0640 /etc/proofgate/relay.env",
  "if sudo grep -q '^HERMES_PROXY_SECRET=.' /etc/proofgate/origin.env; then sudo HERMES_RELAY_SECRET_ARN='$relaySecretArn' node /opt/proofgate/ProofGate/infra/aws/sync-relay-secret.mjs; fi",
  "sudo systemctl restart proofgate-hermes-relay.service",
  "sudo env PROOFGATE_ADMIN_SECRET_ARN='$adminSecretArn' PROOFGATE_ADMIN_URL='$AdminUrl' node /opt/proofgate/ProofGate/infra/aws/sync-hermes-admin-secret.mjs",
  "sudo systemctl restart axcas-tool-bridge.service",
  "sudo systemctl restart proofgate-hermes-gateway.service"
)
$parameters = @{ commands = $commands } | ConvertTo-Json -Compress
$commandId = aws ssm send-command --region $Region --instance-ids $instanceId --document-name AWS-RunShellScript --parameters $parameters --query "Command.CommandId" --output text
if ($LASTEXITCODE -ne 0 -or $commandId -notmatch '^[a-f0-9-]{36}$') { throw "Runtime installation dispatch failed." }

aws ssm wait command-executed --region $Region --command-id $commandId --instance-id $instanceId
if ($LASTEXITCODE -ne 0) { throw "Runtime installation failed or timed out." }
$status = aws ssm get-command-invocation --region $Region --command-id $commandId --instance-id $instanceId --query "Status" --output text
if ($LASTEXITCODE -ne 0 -or $status -ne "Success") { throw "Runtime installation did not succeed." }

[pscustomobject]@{
  StackName = $StackName
  Region = $Region
  InstanceId = $instanceId
  RecordingsBucket = $bucket
  MerchantMediaBucket = $merchantMediaBucket
  MerchantMediaCapabilitySecretArn = $merchantMediaSecretArn
  OperationsAlertTopicArn = $operationsTopicArn
  RelayOriginUrl = $relayOrigin
  RelayQueueUrl = $relayQueue
  AdminSecretArn = $adminSecretArn
  RepositoryCommit = $RepositoryCommit
  RuntimeInstalled = $true
}
