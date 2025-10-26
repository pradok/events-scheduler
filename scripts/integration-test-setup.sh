#!/bin/bash

# Integration Test Setup Script
# Ensures LocalStack is running before integration tests

set -e

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=========================================="
echo "Integration Test Setup"
echo "=========================================="

# Check if LocalStack is already running
if curl -s http://localhost:4566/_localstack/health > /dev/null 2>&1; then
  echo "✓ LocalStack is already running"
else
  echo "⚠ LocalStack not detected, starting docker services..."

  # Change to docker directory
  cd "$PROJECT_ROOT/docker"

  # Start only LocalStack (integration tests use Testcontainers for Postgres)
  docker-compose up -d localstack

  echo ""
  echo "Waiting for LocalStack to be ready..."

  # Wait for LocalStack to be healthy (max 30 seconds)
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
fi

echo ""
echo "=========================================="
echo "✓ Integration test environment ready!"
echo "=========================================="
echo ""
