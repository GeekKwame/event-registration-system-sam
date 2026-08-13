#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${1:-event-registration-system}"
REGION="${AWS_REGION:-us-west-1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" --output text)
DIST=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" --output text)
SITE=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='CloudFrontUrl'].OutputValue" --output text)

if [[ -z "$BUCKET" || -z "$DIST" ]]; then
  echo "CloudFront outputs were not found on stack $STACK_NAME. Deploy the SAM stack first." >&2
  exit 1
fi

aws s3 sync "$ROOT/frontend/" "s3://$BUCKET" --region "$REGION" --delete --exclude "*.md" --exclude "index.html" --cache-control "public, max-age=31536000, immutable"
aws s3 cp "$ROOT/frontend/index.html" "s3://$BUCKET/index.html" --region "$REGION" --cache-control "no-cache, no-store, must-revalidate" --content-type "text/html; charset=utf-8"
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" >/dev/null

echo "Published frontend to $SITE"
