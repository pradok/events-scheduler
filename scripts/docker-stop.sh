#!/bin/bash

# Stop Docker development environment
# Time-Based Event Scheduling System

set -e

echo "=========================================="
echo "Stopping Docker development environment..."
echo "=========================================="

# Change to docker directory
cd "$(dirname "$0")/../docker"

# Stop services
docker-compose down

echo ""
echo "=========================================="
echo "Docker environment stopped successfully!"
echo "=========================================="
