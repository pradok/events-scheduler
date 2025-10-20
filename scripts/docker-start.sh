#!/bin/bash

# Start Docker development environment
# Time-Based Event Scheduling System

set -e

echo "=========================================="
echo "Starting Docker development environment..."
echo "=========================================="

# Change to docker directory
cd "$(dirname "$0")/../docker"

# Start services in detached mode
docker-compose up -d

# Wait for services to be healthy
echo ""
echo "Waiting for services to be healthy..."
sleep 5

# Show service status
echo ""
docker-compose ps

echo ""
echo "=========================================="
echo "Docker environment started successfully!"
echo "=========================================="
echo ""
echo "Services:"
echo "  - PostgreSQL: localhost:5432"
echo "  - LocalStack: http://localhost:4566"
echo ""
echo "Useful commands:"
echo "  View logs: docker-compose logs -f"
echo "  Stop services: npm run docker:stop"
echo "  Reset database: npm run docker:reset"
echo "=========================================="
