param(
  [string]$EnvironmentName = "beta",
  [string]$Region = "ap-south-1",
  [string]$StackName = "axcas-beta",
  [string]$BranchName = "beta"
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$buildDirectory = Join-Path $PSScriptRoot "dist"
$archivePath = Join-Path ([System.IO.Path]::GetTempPath()) ("axcas-studio-" + [guid]::NewGuid().ToString("N") + ".zip")

function Get-StackOutput([string]$key) {
  $value = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='$key'].OutputValue | [0]" --output text
  if (!$value -or $value -eq "None") { throw "CloudFormation output '$key' is unavailable." }
  return $value.Trim()
}

try {
  $env:AWS_REGION = $Region
  $env:AXCAS_API_URL = Get-StackOutput "PublicApiUrl"
  $env:AXCAS_COGNITO_USER_POOL_ID = Get-StackOutput "UserPoolId"
  $env:AXCAS_COGNITO_CLIENT_ID = Get-StackOutput "StudioClientId"
  $env:AXCAS_WHATSAPP_NUMBER = "919180499647"

  Push-Location $workspace
  try { npx tsx apps/aws-studio/src/build-cli.ts $buildDirectory }
  finally { Pop-Location }

  Push-Location $buildDirectory
  try { Compress-Archive -Path * -DestinationPath $archivePath -CompressionLevel Optimal }
  finally { Pop-Location }

  $appId = aws cloudformation describe-stack-resource --stack-name $StackName --logical-resource-id StudioApp --region $Region --query "StackResourceDetail.PhysicalResourceId" --output text
  if (!$appId -or $appId -eq "None") { throw "The Amplify Studio app is unavailable." }
  $deployment = aws amplify create-deployment --app-id $appId.Trim() --branch-name $BranchName --region $Region --output json | ConvertFrom-Json
  if (!$deployment.zipUploadUrl -or !$deployment.jobId) { throw "Amplify did not return a deployment upload." }

  Invoke-WebRequest -Uri $deployment.zipUploadUrl -Method Put -InFile $archivePath -ContentType "application/zip" | Out-Null
  aws amplify start-deployment --app-id $appId.Trim() --branch-name $BranchName --job-id $deployment.jobId --region $Region | Out-Null
  Write-Host "Axcas Studio deployment started: https://$BranchName.$appId.amplifyapp.com"
}
finally {
  if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
}
