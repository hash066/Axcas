param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceRevision,
  [ValidatePattern('^[a-z][a-z0-9-]{1,15}$')][string]$EnvironmentName = 'beta',
  [ValidatePattern('^[a-z]{2}-[a-z]+-[0-9]+$')][string]$Region = 'ap-south-1'
)

$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$template = Join-Path $PSScriptRoot 'codebuild-bootstrap.yaml'
$buildspec = Join-Path $PSScriptRoot 'buildspec.deploy.yml'

foreach ($commandName in @('aws', 'git')) {
  if (-not (Get-Command $commandName -ErrorAction SilentlyContinue)) { throw "$commandName is required" }
}
if (git -C $workspace status --porcelain) { throw 'Refusing to launch from an uncommitted worktree' }
$headRevision = (git -C $workspace rev-parse HEAD).Trim()
if ($headRevision -ne $SourceRevision) { throw 'SourceRevision must equal the checked-out commit' }

$checkHeaders = @{ Accept = 'application/vnd.github+json'; 'User-Agent' = 'axcas-codebuild-launcher' }
$checks = (Invoke-RestMethod -Headers $checkHeaders -Uri "https://api.github.com/repos/hash066/Axcas/commits/$SourceRevision/check-runs").check_runs
$verified = $checks | Where-Object { $_.name -eq 'verify' -and $_.head_sha -eq $SourceRevision -and $_.status -eq 'completed' -and $_.conclusion -eq 'success' -and $_.app.slug -eq 'github-actions' }
if (-not $verified) { throw 'The exact SOURCE_REVISION does not have a successful GitHub Actions verify check' }

$repositories = @(
  "axcas-$EnvironmentName-control-plane",
  "axcas-$EnvironmentName-worker",
  "axcas-$EnvironmentName-hermes"
)
foreach ($repository in $repositories) {
  $existing = aws ecr describe-repositories --repository-names $repository --region $Region --output json 2>$null
  if ($LASTEXITCODE -ne 0) {
    aws ecr create-repository --repository-name $repository --image-tag-mutability IMMUTABLE --image-scanning-configuration scanOnPush=true --encryption-configuration encryptionType=AES256 --region $Region *> $null
    if ($LASTEXITCODE -ne 0) { throw "Could not create ECR repository $repository" }
    continue
  }
  $configuration = $existing | ConvertFrom-Json
  $details = $configuration.repositories[0]
  if ($details.imageTagMutability -ne 'IMMUTABLE' -or $details.imageScanningConfiguration.scanOnPush -ne $true -or $details.encryptionConfiguration.encryptionType -ne 'AES256') {
    throw "Existing ECR repository $repository does not meet the immutable, scan-on-push, AES256 policy"
  }
}

aws cloudformation deploy --stack-name "axcas-$EnvironmentName-deploy-bootstrap" --template-file $template --region $Region --capabilities CAPABILITY_NAMED_IAM --no-fail-on-empty-changeset --parameter-overrides "EnvironmentName=$EnvironmentName"
if ($LASTEXITCODE -ne 0) { throw 'CodeBuild bootstrap deployment failed' }

$projectName = (aws cloudformation describe-stacks --stack-name "axcas-$EnvironmentName-deploy-bootstrap" --region $Region --query "Stacks[0].Outputs[?OutputKey=='ProjectName'].OutputValue | [0]" --output text).Trim()
$serviceRoleArn = (aws cloudformation describe-stacks --stack-name "axcas-$EnvironmentName-deploy-bootstrap" --region $Region --query "Stacks[0].Outputs[?OutputKey=='CloudFormationServiceRoleArn'].OutputValue | [0]" --output text).Trim()
if ($projectName -notmatch '^axcas-[a-z0-9-]+-deploy$' -or $serviceRoleArn -notmatch '^arn:aws[a-zA-Z-]*:iam::\d{12}:role/axcas-[a-z0-9-]+-cloudformation-service$') { throw 'Bootstrap outputs were invalid' }

$buildspecOverride = Get-Content $buildspec -Raw
$environmentOverrides = @(
  @{ name = 'SOURCE_REVISION'; value = $SourceRevision; type = 'PLAINTEXT' },
  @{ name = 'ENVIRONMENT_NAME'; value = $EnvironmentName; type = 'PLAINTEXT' },
  @{ name = 'CLOUDFORMATION_SERVICE_ROLE_ARN'; value = $serviceRoleArn; type = 'PLAINTEXT' }
) | ConvertTo-Json -Compress
$buildId = (aws codebuild start-build --project-name $projectName --region $Region --buildspec-override $buildspecOverride --environment-variables-override $environmentOverrides --query 'build.id' --output text).Trim()
if ($LASTEXITCODE -ne 0 -or $buildId -notmatch '^axcas-[a-z0-9-]+-deploy:') { throw 'CodeBuild did not start' }
Write-Output $buildId
