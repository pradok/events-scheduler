#!/bin/bash

# Complete End-to-End Setup Script
# Sets up production-like local environment with all services for E2E testing
#
# Usage:
#   ./scripts/e2e-setup-full.sh [OFFSET]
#
# Examples:
#   ./scripts/e2e-setup-full.sh           # No offset (default 9am)
#   ./scripts/e2e-setup-full.sh 10s       # FAST_TEST_DELIVERY_OFFSET (UTC timezone required)
#   ./scripts/e2e-setup-full.sh OVERRIDE  # EVENT_DELIVERY_TIMES_OVERRIDE (any timezone)
#   ./scripts/e2e-setup-full.sh 5m        # FAST_TEST_DELIVERY_OFFSET with 5 minutes

set -e

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get argument and determine which override to use
OFFSET_ARG=${1:-""}
FAST_TEST_DELIVERY_OFFSET=""
EVENT_DELIVERY_TIMES_OVERRIDE=""

# Special keyword "OVERRIDE" means use EVENT_DELIVERY_TIMES_OVERRIDE
if [ "$OFFSET_ARG" = "OVERRIDE" ]; then
  # Calculate time 10 seconds from now in HH:MM:SS format
  EVENT_DELIVERY_TIMES_OVERRIDE=$(date -u -v +10S "+%H:%M:%S" 2>/dev/null || date -u -d "+10 seconds" "+%H:%M:%S" 2>/dev/null)
elif [ -n "$OFFSET_ARG" ]; then
  # Otherwise use FAST_TEST_DELIVERY_OFFSET (existing behavior)
  FAST_TEST_DELIVERY_OFFSET="$OFFSET_ARG"
fi

echo "=========================================="
echo -e "${BLUE}Complete E2E Environment Setup${NC}"
echo "=========================================="
echo ""
echo "This script will:"
echo "  1. Reset Docker (delete all data - CLEAN SLATE)"
echo "  2. Start Docker containers (PostgreSQL + LocalStack)"
echo "  3. Run database migrations"
echo "  4. Verify LocalStack resources"
echo "  5. Build Lambda functions"
echo "  6. Deploy Lambdas to LocalStack"
echo "  7. Verify Lambda deployment"
echo "  8. Start User API server at http://localhost:3000"

if [ -n "$EVENT_DELIVERY_TIMES_OVERRIDE" ]; then
  echo ""
  echo -e "${YELLOW}⚡ EVENT_DELIVERY_TIMES_OVERRIDE=${EVENT_DELIVERY_TIMES_OVERRIDE}${NC}"
  echo -e "${YELLOW}   Events will trigger at ${EVENT_DELIVERY_TIMES_OVERRIDE} (works with any timezone)${NC}"
elif [ -n "$FAST_TEST_DELIVERY_OFFSET" ]; then
  echo ""
  echo -e "${YELLOW}⚡ FAST_TEST_DELIVERY_OFFSET=${FAST_TEST_DELIVERY_OFFSET}${NC}"
  echo -e "${YELLOW}   Events will trigger in ${FAST_TEST_DELIVERY_OFFSET} (UTC timezone required)${NC}"
fi

echo ""
echo -e "${YELLOW}⚠  WARNING: This will delete all existing data!${NC}"
echo "Press Ctrl+C to cancel, or wait 5 seconds to continue..."
sleep 5

# ==========================================
# Step 1: Reset Docker (Clean Slate)
# ==========================================
echo ""
echo -e "${BLUE}[1/8] Resetting Docker (clean slate)...${NC}"
echo "=========================================="

if docker ps | grep -q "bday-postgres\|bday-localstack"; then
  echo "Stopping and removing existing containers + volumes..."
  npm run docker:reset
else
  echo "No existing containers, starting fresh..."
  npm run docker:start
fi

echo -e "${GREEN}✓ Docker services started${NC}"

# ==========================================
# Step 2: Run Database Migrations
# ==========================================
echo ""
echo -e "${BLUE}[2/8] Running database migrations...${NC}"
echo "=========================================="

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
max_attempts=30
attempt=0
while ! docker exec bday-postgres pg_isready -U bday_user -d bday_db > /dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ $attempt -ge $max_attempts ]; then
    echo -e "${RED}✗ PostgreSQL failed to start${NC}"
    exit 1
  fi
  echo "  Waiting... ($attempt/$max_attempts)"
  sleep 1
done

echo "PostgreSQL is ready!"
echo ""

# Run migrations
npm run prisma:migrate

echo -e "${GREEN}✓ Database migrations complete${NC}"

# ==========================================
# Step 3: Verify LocalStack Resources
# ==========================================
echo ""
echo -e "${BLUE}[3/8] Verifying LocalStack resources...${NC}"
echo "=========================================="

# Wait for LocalStack to be ready
echo "Waiting for LocalStack to be ready..."
max_attempts=30
attempt=0
while ! curl -s http://localhost:4566/_localstack/health > /dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ $attempt -ge $max_attempts ]; then
    echo -e "${RED}✗ LocalStack failed to start${NC}"
    exit 1
  fi
  echo "  Waiting... ($attempt/$max_attempts)"
  sleep 1
done

echo "LocalStack is ready!"
echo ""

# Verify resources
npm run docker:verify

echo -e "${GREEN}✓ LocalStack resources verified${NC}"

# ==========================================
# Step 4: Build Lambda Functions
# ==========================================
echo ""
echo -e "${BLUE}[4/8] Building Lambda functions...${NC}"
echo "=========================================="

npm run lambda:build

echo -e "${GREEN}✓ Lambda functions built${NC}"

# ==========================================
# Step 5: Deploy Lambdas to LocalStack
# ==========================================
echo ""
echo -e "${BLUE}[5/8] Deploying Lambdas to LocalStack...${NC}"
echo "=========================================="

npm run lambda:deploy:localstack

echo -e "${GREEN}✓ Lambdas deployed${NC}"

# ==========================================
# Step 6: Verify Lambda Deployment
# ==========================================
echo ""
echo -e "${BLUE}[6/8] Verifying Lambda deployment...${NC}"
echo "=========================================="

npm run lambda:verify

echo -e "${GREEN}✓ Lambda deployment verified${NC}"

# ==========================================
# Step 7: Start User API Server
# ==========================================
echo ""
echo -e "${BLUE}[7/8] Starting User API Server${NC}"
echo "=========================================="

# Check if API server is already running and kill it
if lsof -ti:3000 > /dev/null 2>&1; then
  echo -e "${YELLOW}API server already running on port 3000, stopping it...${NC}"
  kill -9 $(lsof -ti:3000) 2>/dev/null || true
  sleep 1
  echo -e "${GREEN}✓ Stopped existing API server${NC}"
fi

echo ""
echo -e "${YELLOW}Starting User API server...${NC}"
echo ""
echo "The API server will run in the foreground."
echo "Press Ctrl+C to stop the server when done testing."
echo ""

if [ -n "$EVENT_DELIVERY_TIMES_OVERRIDE" ]; then
  echo -e "${GREEN}API server starting at http://localhost:3000${NC}"
  echo -e "${YELLOW}⚡ EVENT_DELIVERY_TIMES_OVERRIDE=${EVENT_DELIVERY_TIMES_OVERRIDE}${NC}"
  echo ""
  sleep 2
  EVENT_DELIVERY_TIMES_OVERRIDE=$EVENT_DELIVERY_TIMES_OVERRIDE npm run dev
elif [ -n "$FAST_TEST_DELIVERY_OFFSET" ]; then
  echo -e "${GREEN}API server starting at http://localhost:3000${NC}"
  echo -e "${YELLOW}⚡ FAST_TEST_DELIVERY_OFFSET=${FAST_TEST_DELIVERY_OFFSET}${NC}"
  echo ""
  sleep 2
  FAST_TEST_DELIVERY_OFFSET=$FAST_TEST_DELIVERY_OFFSET npm run dev
else
  echo -e "${GREEN}API server starting at http://localhost:3000${NC}"
  echo ""
  sleep 2
  npm run dev
fi

# ==========================================
# Summary
# ==========================================
echo ""
echo "=========================================="
echo -e "${GREEN}✅ E2E Environment Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "Running Services:"
echo "  ✓ PostgreSQL    - localhost:5432"
echo "  ✓ LocalStack    - http://localhost:4566"
echo "  ✓ Scheduler Lambda - EventBridge trigger (1 min)"
echo "  ✓ Worker Lambda    - SQS trigger"
echo "  ✓ User API      - http://localhost:3000"
echo ""
echo "Management Tools:"
echo "  - LocalStack Desktop: View Lambdas, SQS, CloudWatch Logs"
echo "  - Prisma Studio: npm run prisma:studio (http://localhost:5555)"
echo ""
echo "Quick Test Commands:"
echo "  # View CloudWatch logs"
echo "  npm run docker:logs"
echo ""
echo "  # Check SQS queue"
echo "  docker exec bday-localstack sh -c 'awslocal sqs receive-message --queue-url http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/bday-events-queue'"
echo ""
echo "  # Manually invoke scheduler"
echo "  docker exec bday-localstack sh -c 'awslocal lambda invoke --function-name event-scheduler /tmp/output.json && cat /tmp/output.json'"
echo ""
echo "  # Run E2E tests"
echo "  npm run test:e2e"
echo ""
echo "Shutdown Commands:"
echo "  # Stop all services (keep data)"
echo "  npm run docker:stop"
echo ""
echo "  # Full cleanup (delete all data)"
echo "  npm run docker:reset"
echo ""
echo "=========================================="
