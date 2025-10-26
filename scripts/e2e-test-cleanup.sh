#!/bin/bash

# E2E Test Cleanup Script
# Stops and removes all docker services after E2E tests complete

set -e

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo ""
echo "=========================================="
echo "E2E Test Cleanup"
echo "=========================================="

cd "$PROJECT_ROOT/docker"

# Check if any services exist
if docker-compose ps -a --services | grep -q .; then
  echo "Stopping and removing docker services..."
  docker-compose rm -sf

  echo "✓ All services stopped and removed"
else
  echo "✓ No services running, nothing to clean up"
fi

echo "=========================================="
echo ""
