param(
  [string]$StackName = "event-registration-system",
  [string]$Region = "us-west-1"
)

$ErrorActionPreference = "Stop"

$outputs = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs" --output json | ConvertFrom-Json
$bucket = ($outputs | Where-Object { $_.OutputKey -eq "FrontendBucketName" }).OutputValue
$distributionId = ($outputs | Where-Object { $_.OutputKey -eq "CloudFrontDistributionId" }).OutputValue
$siteUrl = ($outputs | Where-Object { $_.OutputKey -eq "CloudFrontUrl" }).OutputValue

if (-not $bucket -or -not $distributionId) {
  throw "CloudFront outputs were not found on stack $StackName. Deploy the SAM stack first."
}

$frontend = Join-Path $PSScriptRoot "..\frontend"
aws s3 sync $frontend "s3://$bucket" --region $Region --delete --exclude "*.md" --exclude "index.html" --cache-control "public, max-age=31536000, immutable"
aws s3 cp (Join-Path $frontend "index.html") "s3://$bucket/index.html" --region $Region --cache-control "no-cache, no-store, must-revalidate" --content-type "text/html; charset=utf-8"
aws cloudfront create-invalidation --distribution-id $distributionId --paths "/*" | Out-Null

Write-Host "Published frontend to $siteUrl"
