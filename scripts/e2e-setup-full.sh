#!/bin/bash

# Complete End-to-End Setup Script
# Sets up production-like local environment with all services for E2E testing

set -e

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "=========================================="
echo -e "${BLUE}Complete E2E Environment Setup${NC}"
echo "=========================================="
echo ""
echo "This script will:"
echo "  1. Start Docker containers (PostgreSQL + LocalStack)"
echo "  2. Run database migrations"
echo "  3. Verify LocalStack resources"
echo "  4. Build Lambda functions"
echo "  5. Deploy Lambdas to LocalStack"
echo "  6. Verify Lambda deployment"
echo "  7. Start User API server (optional)"
echo ""
echo "Press Ctrl+C to cancel, or wait 3 seconds to continue..."
sleep 3

# ==========================================
# Step 1: Start Docker Services
# ==========================================
echo ""
echo -e "${BLUE}[1/7] Starting Docker services...${NC}"
echo "=========================================="

if docker ps | grep -q "bday-postgres\|bday-localstack"; then
  echo -e "${YELLOW}⚠ Docker containers already running${NC}"
  read -p "Do you want to restart them? (y/N): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Stopping existing containers..."
    npm run docker:stop
    echo "Starting fresh containers..."
    npm run docker:start
  else
    echo "Keeping existing containers running"
  fi
else
  npm run docker:start
fi

echo -e "${GREEN}✓ Docker services started${NC}"

# ==========================================
# Step 2: Run Database Migrations
# ==========================================
echo ""
echo -e "${BLUE}[2/7] Running database migrations...${NC}"
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
echo -e "${BLUE}[3/7] Verifying LocalStack resources...${NC}"
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
echo -e "${BLUE}[4/7] Building Lambda functions...${NC}"
echo "=========================================="

npm run lambda:build

echo -e "${GREEN}✓ Lambda functions built${NC}"

# ==========================================
# Step 5: Deploy Lambdas to LocalStack
# ==========================================
echo ""
echo -e "${BLUE}[5/7] Deploying Lambdas to LocalStack...${NC}"
echo "=========================================="

npm run lambda:deploy:localstack

echo -e "${GREEN}✓ Lambdas deployed${NC}"

# ==========================================
# Step 6: Verify Lambda Deployment
# ==========================================
echo ""
echo -e "${BLUE}[6/7] Verifying Lambda deployment...${NC}"
echo "=========================================="

npm run lambda:verify

echo -e "${GREEN}✓ Lambda deployment verified${NC}"

# ==========================================
# Step 7: Start User API Server (Optional)
# ==========================================
echo ""
echo -e "${BLUE}[7/7] User API Server${NC}"
echo "=========================================="

read -p "Do you want to start the User API server? (y/N): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo ""
  echo -e "${YELLOW}Starting User API server...${NC}"
  echo ""
  echo "The API server will run in the foreground."
  echo "Press Ctrl+C to stop the server when done testing."
  echo ""
  echo -e "${GREEN}API server starting at http://localhost:3000${NC}"
  echo ""
  sleep 2
  npm run dev
else
  echo ""
  echo -e "${YELLOW}Skipping API server startup${NC}"
  echo ""
  echo "You can start it manually later with:"
  echo "  npm run dev"
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
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "  ✓ User API      - http://localhost:3000"
fi
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
