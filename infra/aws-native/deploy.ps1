param(
  [ValidatePattern('^[a-z][a-z0-9-]{1,15}$')][string]$EnvironmentName = 'beta',
  [ValidatePattern('^[a-z]{2}-[a-z]+-[0-9]+$')][string]$Region = 'ap-south-1',
  [string]$OperatorAlertEmail = ''
)

$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$template = Join-Path $PSScriptRoot 'template.yaml'

foreach ($commandName in @('aws', 'docker', 'git')) {
  if (-not (Get-Command $commandName -ErrorAction SilentlyContinue)) { throw "$commandName is required" }
}

$accountId = (aws sts get-caller-identity --query Account --output text --region $Region).Trim()
if ($LASTEXITCODE -ne 0 -or $accountId -notmatch '^\d{12}$') { throw 'AWS identity lookup failed' }
$registry = "$accountId.dkr.ecr.$Region.amazonaws.com"
$sourceRevision = (git -C $workspace rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceRevision -notmatch '^[a-f0-9]{40}$') { throw 'Git revision lookup failed' }

$repositories = [ordered]@{
  control = "axcas-$EnvironmentName-control-plane"
  worker = "axcas-$EnvironmentName-worker"
  hermes = "axcas-$EnvironmentName-hermes"
}
foreach ($repository in $repositories.Values) {
  aws ecr describe-repositories --repository-names $repository --region $Region *> $null
  if ($LASTEXITCODE -ne 0) {
    aws ecr create-repository --repository-name $repository --image-tag-mutability IMMUTABLE --image-scanning-configuration scanOnPush=true --encryption-configuration encryptionType=AES256 --region $Region *> $null
    if ($LASTEXITCODE -ne 0) { throw "Could not create ECR repository $repository" }
  }
}

$loginPassword = aws ecr get-login-password --region $Region
$loginPassword | docker login --username AWS --password-stdin $registry *> $null
if ($LASTEXITCODE -ne 0) { throw 'ECR login failed' }

$images = [ordered]@{
  control = @{ Dockerfile = 'infra/aws-native/Dockerfile.control-plane'; Repository = $repositories.control }
  worker = @{ Dockerfile = 'infra/aws-native/Dockerfile.worker'; Repository = $repositories.worker }
  hermes = @{ Dockerfile = 'infra/aws-native/Dockerfile.hermes'; Repository = $repositories.hermes }
}
$imageUris = @{}
foreach ($name in $images.Keys) {
  $entry = $images[$name]
  $taggedUri = "$registry/$($entry.Repository):$sourceRevision"
  docker build --pull --file (Join-Path $workspace $entry.Dockerfile) --tag $taggedUri $workspace
  if ($LASTEXITCODE -ne 0) { throw "$name image build failed" }
  docker push $taggedUri
  if ($LASTEXITCODE -ne 0) { throw "$name image push failed" }
  $digest = (aws ecr describe-images --repository-name $entry.Repository --image-ids imageTag=$sourceRevision --query 'imageDetails[0].imageDigest' --output text --region $Region).Trim()
  if ($digest -notmatch '^sha256:[a-f0-9]{64}$') { throw "$name image digest lookup failed" }
  $imageUris[$name] = "$registry/$($entry.Repository)@$digest"
}

$parameters = @(
  "EnvironmentName=$EnvironmentName",
  "ControlPlaneImageUri=$($imageUris.control)",
  "WorkerImageUri=$($imageUris.worker)",
  "HermesImageUri=$($imageUris.hermes)",
  'WhatsAppNumber=919180499647',
  "OperatorAlertEmail=$OperatorAlertEmail"
)
aws cloudformation deploy --stack-name "axcas-$EnvironmentName-native" --template-file $template --region $Region --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset --parameter-overrides $parameters
if ($LASTEXITCODE -ne 0) { throw 'CloudFormation deployment failed' }

aws cloudformation describe-stacks --stack-name "axcas-$EnvironmentName-native" --region $Region --query 'Stacks[0].Outputs[].{Key:OutputKey,Value:OutputValue}' --output table

