#!/usr/bin/env bash
# Deploys (or updates) the Medilog AI relay on AWS Lambda in Sydney, then
# smoke-tests it. Needs the AWS CLI logged in (see deploy/aws/README.md).
#
#   export AWS_PROFILE=medilog
#   export MEDILOG_ACCESS_TOKEN=$(openssl rand -hex 32)   # keep this; the app needs it
#   ./deploy/aws/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

REGION="ap-southeast-2"
STACK="${MEDILOG_STACK:-medilog-relay}"
: "${MEDILOG_ACCESS_TOKEN:?Set MEDILOG_ACCESS_TOKEN first (generate one with: openssl rand -hex 32)}"

echo "→ Checking AWS login"
aws sts get-caller-identity --query Account --output text >/dev/null

echo "→ Building the relay bundle"
npm run -s build:lambda

echo "→ Deploying stack ${STACK} in ${REGION}"
aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$STACK" \
  --template-file deploy/aws/relay.yaml \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides "AccessToken=${MEDILOG_ACCESS_TOKEN}"

output() {
  aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
FUNCTION="$(output FunctionName)"
URL="$(output RelayUrl)"

echo "→ Uploading code to ${FUNCTION}"
aws lambda update-function-code --region "$REGION" --function-name "$FUNCTION" \
  --zip-file fileb://dist-lambda/relay.zip --output text --query LastUpdateStatus >/dev/null
aws lambda wait function-updated --region "$REGION" --function-name "$FUNCTION"

echo "→ Smoke test"
npm run -s smoke -- --relay "$URL" --token "$MEDILOG_ACCESS_TOKEN"

echo
echo "Relay URL: ${URL}"
echo "Put this URL and your token in mobile/.env.local (see deploy/aws/README.md, step 6)."
