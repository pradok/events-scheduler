#!/bin/bash

# Reset Docker development environment (removes all data)
# Time-Based Event Scheduling System

set -e

echo "=========================================="
echo "Resetting Docker development environment..."
echo "=========================================="
echo ""
echo "WARNING: This will delete all database data!"
echo "Press Ctrl+C to cancel, or wait 5 seconds to continue..."
sleep 5

# Change to docker directory
cd "$(dirname "$0")/../docker"

# Stop and remove services with volumes
docker-compose down -v

echo ""
echo "Starting fresh environment..."
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
echo "Docker environment reset complete!"
echo "=========================================="
echo ""
echo "All data has been cleared and services restarted."
echo "=========================================="
