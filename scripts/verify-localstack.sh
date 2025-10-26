#!/bin/bash

# LocalStack Verification Script
# Verifies all AWS resources are created correctly in LocalStack
# Run after: npm run docker:start
#
# NOTE: This script uses 'docker exec' to run awslocal inside the LocalStack container
# No need to install AWS CLI or awslocal on your host machine!

set -e

echo "=========================================="
echo "Verifying LocalStack Setup..."
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track failures
FAILED=0

# Helper function to run awslocal commands inside LocalStack container
awslocal_exec() {
  docker exec bday-localstack sh -c "awslocal $*" 2>/dev/null
}

# Helper function for checks
check_resource() {
  local description="$1"
  local command="$2"

  echo -n "Checking: $description... "

  if eval "$command" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ PASS${NC}"
    return 0
  else
    echo -e "${RED}❌ FAIL${NC}"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

# 1. Check LocalStack Health
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. LocalStack Health Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if ! check_resource "LocalStack health endpoint" "curl -sf http://localhost:4566/_localstack/health"; then
  echo -e "${RED}ERROR: LocalStack is not running or not healthy${NC}"
  echo "Run: npm run docker:start"
  exit 1
fi

echo ""

# 2. Check SQS Queues
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. SQS Queue Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check_resource "SQS main queue 'bday-events-queue'" \
  "awslocal_exec sqs get-queue-url --queue-name bday-events-queue"

check_resource "SQS Dead Letter Queue 'bday-events-dlq'" \
  "awslocal_exec sqs get-queue-url --queue-name bday-events-dlq"

# Check DLQ redrive policy
echo -n "Checking: DLQ redrive policy configured... "
QUEUE_URL=$(awslocal_exec sqs get-queue-url --queue-name bday-events-queue --query QueueUrl --output text 2>/dev/null || echo "")

if [ -z "$QUEUE_URL" ]; then
  echo -e "${RED}❌ FAIL (queue not found)${NC}"
  FAILED=$((FAILED + 1))
else
  REDRIVE_POLICY=$(awslocal_exec sqs get-queue-attributes --queue-url "$QUEUE_URL" --attribute-names RedrivePolicy --query Attributes.RedrivePolicy --output text 2>/dev/null || echo "")

  if [ -n "$REDRIVE_POLICY" ] && [ "$REDRIVE_POLICY" != "None" ]; then
    echo -e "${GREEN}✅ PASS${NC}"
    echo "   Policy: $REDRIVE_POLICY"
  else
    echo -e "${RED}❌ FAIL (redrive policy not configured)${NC}"
    FAILED=$((FAILED + 1))
  fi
fi

echo ""

# 3. Check IAM Role
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. IAM Role Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check_resource "IAM role 'lambda-execution-role'" \
  "awslocal_exec iam get-role --role-name lambda-execution-role"

echo ""

# 4. Check EventBridge Rule
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4. EventBridge Rule Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check_resource "EventBridge rule 'event-scheduler-rule'" \
  "awslocal_exec events describe-rule --name event-scheduler-rule"

# Check rule state
echo -n "Checking: EventBridge rule is ENABLED... "
RULE_STATE=$(awslocal_exec events describe-rule --name event-scheduler-rule --query State --output text 2>/dev/null || echo "")

if [ "$RULE_STATE" = "ENABLED" ]; then
  echo -e "${GREEN}✅ PASS${NC}"
else
  echo -e "${RED}❌ FAIL (state: $RULE_STATE)${NC}"
  FAILED=$((FAILED + 1))
fi

echo ""

# 5. Check CloudWatch Logs Service
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5. CloudWatch Logs Service"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check_resource "CloudWatch Logs service ready" \
  "awslocal_exec logs describe-log-groups --limit 1"

echo ""

# Summary
echo "=========================================="
echo "Verification Summary"
echo "=========================================="

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All checks passed!${NC}"
  echo ""
  echo "LocalStack is ready for E2E testing."
  echo ""
  echo "Next steps:"
  echo "  - Deploy Lambdas: npm run lambda:all"
  echo "  - Run E2E tests: npm run test:e2e"
  echo ""
  exit 0
else
  echo -e "${RED}❌ $FAILED check(s) failed${NC}"
  echo ""
  echo "Troubleshooting:"
  echo "  1. Check init script logs: npm run docker:logs"
  echo "  2. Restart LocalStack: npm run docker:reset"
  echo "  3. Verify Docker is running: docker ps"
  echo ""
  exit 1
fi
