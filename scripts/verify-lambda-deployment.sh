#!/bin/bash

# Verify Lambda Deployment to LocalStack
# Checks that Lambdas are deployed correctly with proper configuration

set -e

echo "=========================================="
echo "Verifying Lambda Deployment"
echo "=========================================="
echo ""

LOCALSTACK_ENDPOINT="http://localhost:4566"
REGION="us-east-1"

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

success_count=0
total_checks=0

check() {
  ((total_checks++))
  if eval "$1" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} $2"
    ((success_count++))
    return 0
  else
    echo -e "${RED}✗${NC} $2"
    return 1
  fi
}

# ==========================================
# Check 1: Scheduler Lambda exists
# ==========================================
echo "Checking Scheduler Lambda..."
check "docker exec bday-localstack sh -c 'awslocal lambda get-function --function-name event-scheduler'" \
  "Scheduler Lambda function exists"

# ==========================================
# Check 2: Worker Lambda exists
# ==========================================
echo ""
echo "Checking Worker Lambda..."
check "docker exec bday-localstack sh -c 'awslocal lambda get-function --function-name event-worker'" \
  "Worker Lambda function exists"

# ==========================================
# Check 3: EventBridge rule exists
# ==========================================
echo ""
echo "Checking EventBridge configuration..."
check "docker exec bday-localstack sh -c 'awslocal events describe-rule --name event-scheduler-rule'" \
  "EventBridge rule exists"

# ==========================================
# Check 4: EventBridge targets configured
# ==========================================
TARGETS_OUTPUT=$(docker exec bday-localstack sh -c "awslocal events list-targets-by-rule --rule event-scheduler-rule" 2>/dev/null || echo "{}")
TARGET_COUNT=$(echo "$TARGETS_OUTPUT" | grep -c "event-scheduler" || echo "0")

if [ "$TARGET_COUNT" -gt 0 ]; then
  echo -e "${GREEN}✓${NC} EventBridge rule has targets configured"
  ((success_count++))
else
  echo -e "${RED}✗${NC} EventBridge rule has no targets"
fi
((total_checks++))

# ==========================================
# Check 5: SQS event source mapping exists
# ==========================================
echo ""
echo "Checking SQS event source mapping..."
MAPPING_OUTPUT=$(docker exec bday-localstack sh -c "awslocal lambda list-event-source-mappings --function-name event-worker" 2>/dev/null || echo "{}")
MAPPING_COUNT=$(echo "$MAPPING_OUTPUT" | grep -c "event-worker" || echo "0")

if [ "$MAPPING_COUNT" -gt 0 ]; then
  echo -e "${GREEN}✓${NC} SQS event source mapping configured for worker"
  ((success_count++))
else
  echo -e "${RED}✗${NC} SQS event source mapping not found"
fi
((total_checks++))

# ==========================================
# Check 6: Scheduler environment variables
# ==========================================
echo ""
echo "Checking Scheduler Lambda configuration..."
SCHEDULER_CONFIG=$(docker exec bday-localstack sh -c "awslocal lambda get-function-configuration --function-name event-scheduler" 2>/dev/null || echo "{}")

if echo "$SCHEDULER_CONFIG" | grep -q "DATABASE_URL"; then
  echo -e "${GREEN}✓${NC} DATABASE_URL configured"
  ((success_count++))
else
  echo -e "${RED}✗${NC} DATABASE_URL not configured"
fi
((total_checks++))

if echo "$SCHEDULER_CONFIG" | grep -q "SQS_QUEUE_URL"; then
  echo -e "${GREEN}✓${NC} SQS_QUEUE_URL configured"
  ((success_count++))
else
  echo -e "${RED}✗${NC} SQS_QUEUE_URL not configured"
fi
((total_checks++))

# ==========================================
# Check 7: Worker environment variables
# ==========================================
echo ""
echo "Checking Worker Lambda configuration..."
WORKER_CONFIG=$(docker exec bday-localstack sh -c "awslocal lambda get-function-configuration --function-name event-worker" 2>/dev/null || echo "{}")

if echo "$WORKER_CONFIG" | grep -q "DATABASE_URL"; then
  echo -e "${GREEN}✓${NC} DATABASE_URL configured"
  ((success_count++))
else
  echo -e "${RED}✗${NC} DATABASE_URL not configured"
fi
((total_checks++))

if echo "$WORKER_CONFIG" | grep -q "WEBHOOK_TEST_URL"; then
  echo -e "${GREEN}✓${NC} WEBHOOK_TEST_URL configured"
  ((success_count++))
else
  echo -e "${RED}✗${NC} WEBHOOK_TEST_URL not configured"
fi
((total_checks++))

# ==========================================
# Check 8: Lambda runtime and handler
# ==========================================
echo ""
echo "Checking Lambda runtime configuration..."

if echo "$SCHEDULER_CONFIG" | grep -q "nodejs20.x"; then
  echo -e "${GREEN}✓${NC} Scheduler runtime: nodejs20.x"
  ((success_count++))
else
  echo -e "${YELLOW}⚠${NC} Scheduler runtime not nodejs20.x"
fi
((total_checks++))

if echo "$WORKER_CONFIG" | grep -q "nodejs20.x"; then
  echo -e "${GREEN}✓${NC} Worker runtime: nodejs20.x"
  ((success_count++))
else
  echo -e "${YELLOW}⚠${NC} Worker runtime not nodejs20.x"
fi
((total_checks++))

# ==========================================
# Summary
# ==========================================
echo ""
echo "=========================================="
echo "Verification Summary"
echo "=========================================="
echo ""

if [ "$success_count" -eq "$total_checks" ]; then
  echo -e "${GREEN}✅ All checks passed! ($success_count/$total_checks)${NC}"
  echo ""
  echo "Lambda deployment is ready for E2E testing."
  echo ""
  echo "Next steps:"
  echo "  - View deployed functions in LocalStack Desktop"
  echo "  - Run E2E tests: npm run test:e2e"
  echo "  - Manually invoke: docker exec bday-localstack sh -c 'awslocal lambda invoke --function-name event-scheduler output.json'"
  echo ""
  exit 0
else
  echo -e "${RED}❌ Some checks failed ($success_count/$total_checks passed)${NC}"
  echo ""
  echo "Troubleshooting:"
  echo "  1. Ensure LocalStack is running: docker ps | grep localstack"
  echo "  2. Rebuild Lambdas: npm run lambda:build"
  echo "  3. Redeploy: npm run lambda:deploy:localstack"
  echo "  4. Check logs: npm run docker:logs"
  echo ""
  exit 1
fi
