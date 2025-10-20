#!/bin/bash

# View Docker service logs
# Time-Based Event Scheduling System

# Change to docker directory
cd "$(dirname "$0")/../docker"

# Check if service name provided
if [ -z "$1" ]; then
  echo "Viewing logs for all services..."
  echo "Press Ctrl+C to exit"
  echo "=========================================="
  docker-compose logs -f
else
  echo "Viewing logs for service: $1"
  echo "Press Ctrl+C to exit"
  echo "=========================================="
  docker-compose logs -f "$1"
fi
