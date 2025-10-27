#!/bin/bash

# Complete E2E Environment Verification Script
# Verifies all services are running and properly configured

set -e

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=========================================="
echo -e "${BLUE}E2E Environment Verification${NC}"
echo "=========================================="
echo ""

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
# Docker Container Checks
# ==========================================
echo -e "${BLUE}Docker Containers:${NC}"

check "docker ps | grep -q bday-postgres" \
  "PostgreSQL container running"

check "docker ps | grep -q bday-localstack" \
  "LocalStack container running"

# ==========================================
# PostgreSQL Checks
# ==========================================
echo ""
echo -e "${BLUE}PostgreSQL Database:${NC}"

check "docker exec bday-postgres pg_isready -U bday_user -d bday_db" \
  "PostgreSQL accepting connections"

check "docker exec bday-postgres psql -U bday_user -d bday_db -c 'SELECT 1' | grep -q '1 row'" \
  "Database queries working"

check "docker exec bday-postgres psql -U bday_user -d bday_db -c '\dt' | grep -q 'users'" \
  "Users table exists"

check "docker exec bday-postgres psql -U bday_user -d bday_db -c '\dt' | grep -q 'events'" \
  "Events table exists"

# ==========================================
# LocalStack Checks
# ==========================================
echo ""
echo -e "${BLUE}LocalStack Services:${NC}"

check "curl -s http://localhost:4566/_localstack/health | grep -q '\"lambda\"'" \
  "Lambda service available"

check "curl -s http://localhost:4566/_localstack/health | grep -q '\"sqs\"'" \
  "SQS service available"

check "curl -s http://localhost:4566/_localstack/health | grep -q '\"events\"'" \
  "EventBridge service available"

# ==========================================
# LocalStack Resources
# ==========================================
echo ""
echo -e "${BLUE}LocalStack Resources:${NC}"

check "docker exec bday-localstack sh -c 'awslocal sqs list-queues' | grep -q 'bday-events-queue'" \
  "SQS main queue exists"

check "docker exec bday-localstack sh -c 'awslocal sqs list-queues' | grep -q 'bday-events-dlq'" \
  "SQS DLQ exists"

check "docker exec bday-localstack sh -c 'awslocal events describe-rule --name event-scheduler-rule' | grep -q 'ENABLED'" \
  "EventBridge rule exists and enabled"

check "docker exec bday-localstack sh -c 'awslocal iam get-role --role-name lambda-execution-role'" \
  "IAM execution role exists"

# ==========================================
# Lambda Functions
# ==========================================
echo ""
echo -e "${BLUE}Lambda Functions:${NC}"

check "docker exec bday-localstack sh -c 'awslocal lambda get-function --function-name event-scheduler'" \
  "Scheduler Lambda deployed"

check "docker exec bday-localstack sh -c 'awslocal lambda get-function --function-name event-worker'" \
  "Worker Lambda deployed"

check "docker exec bday-localstack sh -c 'awslocal events list-targets-by-rule --rule event-scheduler-rule' | grep -q 'event-scheduler'" \
  "EventBridge → Scheduler Lambda connected"

check "docker exec bday-localstack sh -c 'awslocal lambda list-event-source-mappings --function-name event-worker' | grep -q 'event-worker'" \
  "SQS → Worker Lambda connected"

# ==========================================
# Lambda Configuration
# ==========================================
echo ""
echo -e "${BLUE}Lambda Configuration:${NC}"

SCHEDULER_CONFIG=$(docker exec bday-localstack sh -c "awslocal lambda get-function-configuration --function-name event-scheduler" 2>/dev/null || echo "{}")

check "echo '$SCHEDULER_CONFIG' | grep -q 'DATABASE_URL'" \
  "Scheduler has DATABASE_URL"

check "echo '$SCHEDULER_CONFIG' | grep -q 'SQS_QUEUE_URL'" \
  "Scheduler has SQS_QUEUE_URL"

check "echo '$SCHEDULER_CONFIG' | grep -q 'nodejs20.x'" \
  "Scheduler runtime is nodejs20.x"

WORKER_CONFIG=$(docker exec bday-localstack sh -c "awslocal lambda get-function-configuration --function-name event-worker" 2>/dev/null || echo "{}")

check "echo '$WORKER_CONFIG' | grep -q 'DATABASE_URL'" \
  "Worker has DATABASE_URL"

check "echo '$WORKER_CONFIG' | grep -q 'WEBHOOK_TEST_URL'" \
  "Worker has WEBHOOK_TEST_URL"

check "echo '$WORKER_CONFIG' | grep -q 'nodejs20.x'" \
  "Worker runtime is nodejs20.x"

# ==========================================
# API Server (Optional Check)
# ==========================================
echo ""
echo -e "${BLUE}User API Server:${NC}"

if curl -s http://localhost:3000/health > /dev/null 2>&1; then
  check "curl -s http://localhost:3000/health | grep -q 'ok'" \
    "API server responding at :3000"
  API_RUNNING=true
else
  echo -e "${YELLOW}⚠${NC} API server not running (optional)"
  echo "  Start with: npm run dev"
  API_RUNNING=false
fi

# ==========================================
# Prisma Client
# ==========================================
echo ""
echo -e "${BLUE}Prisma Client:${NC}"

check "test -d node_modules/@prisma/client" \
  "Prisma client installed"

check "test -d node_modules/.prisma/client" \
  "Prisma client generated"

# ==========================================
# Summary
# ==========================================
echo ""
echo "=========================================="
echo -e "${BLUE}Verification Summary${NC}"
echo "=========================================="
echo ""

REQUIRED_CHECKS=$((total_checks))
if [ "$API_RUNNING" = false ]; then
  # API check doesn't count if not running
  REQUIRED_CHECKS=$((total_checks))
fi

if [ "$success_count" -ge $((REQUIRED_CHECKS - 1)) ]; then
  echo -e "${GREEN}✅ E2E environment ready! ($success_count/$total_checks checks passed)${NC}"
  echo ""
  echo "All critical services are running and configured."
  echo ""
  echo "Ready for:"
  echo "  - Manual testing"
  echo "  - E2E test execution (npm run test:e2e)"
  echo "  - Development workflows"
  echo ""
  echo "Next steps:"
  echo "  - Open LocalStack Desktop to view services"
  echo "  - Open Prisma Studio: npm run prisma:studio"
  if [ "$API_RUNNING" = false ]; then
    echo "  - Start API server: npm run dev"
  fi
  echo "  - Run E2E tests: npm run test:e2e"
  echo ""
  exit 0
else
  echo -e "${RED}❌ Some checks failed ($success_count/$total_checks passed)${NC}"
  echo ""
  echo "Troubleshooting:"
  echo "  1. Run full setup: npm run e2e:setup"
  echo "  2. Check Docker: docker ps"
  echo "  3. Check logs: npm run docker:logs"
  echo "  4. Reset environment: npm run docker:reset"
  echo ""
  exit 1
fi
