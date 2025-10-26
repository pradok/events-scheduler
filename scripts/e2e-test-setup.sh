#!/bin/bash

# E2E Test Setup Script
# Ensures full environment (LocalStack + PostgreSQL + deployed Lambdas) is ready for E2E tests

set -e

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=========================================="
echo "E2E Test Setup"
echo "=========================================="

# Check if LocalStack is running
if ! curl -s http://localhost:4566/_localstack/health > /dev/null 2>&1; then
  echo "⚠ LocalStack not detected, starting docker services..."

  cd "$PROJECT_ROOT/docker"
  docker-compose up -d

  echo ""
  echo "Waiting for services to be ready..."

  # Wait for LocalStack (max 30 seconds)
  max_attempts=30
  attempt=0

  while [ $attempt -lt $max_attempts ]; do
    if curl -s http://localhost:4566/_localstack/health > /dev/null 2>&1; then
      echo "✓ LocalStack is ready!"
      break
    fi

    attempt=$((attempt + 1))
    if [ $attempt -eq $max_attempts ]; then
      echo "❌ LocalStack failed to start after 30 seconds"
      exit 1
    fi

    sleep 1
  done
else
  echo "✓ LocalStack is already running"
fi

# Deploy Lambdas to LocalStack
cd "$PROJECT_ROOT"

echo ""
echo "Deploying Lambdas to LocalStack..."

# Always build and deploy Lambdas for E2E tests to ensure fresh deployment
npm run lambda:all

echo ""
echo "✓ Lambdas deployed successfully"

echo ""
echo "=========================================="
echo "✓ E2E test environment ready!"
echo "=========================================="
echo ""
echo "Services:"
echo "  - PostgreSQL: localhost:5432"
echo "  - LocalStack: http://localhost:4566"
echo "  - Scheduler Lambda: deployed"
echo "  - Worker Lambda: deployed"
echo ""
