#!/bin/bash

# Lambda Deployment Script
# Deploys the scheduler Lambda function to LocalStack

set -e

echo "=========================================="
echo "Deploying Lambda to LocalStack"
echo "=========================================="

# Check if build exists
if [ ! -f "dist/event-scheduler.zip" ]; then
  echo "Error: Lambda package not found. Run 'npm run build:lambda' first."
  exit 1
fi

# Load environment variables
export AWS_ENDPOINT_URL=${AWS_ENDPOINT_URL:-http://localhost:4566}
export AWS_REGION=${AWS_REGION:-us-east-1}
export DATABASE_URL=${DATABASE_URL:-postgresql://bday_user:local_dev_password@host.docker.internal:5432/bday_db}
export SQS_QUEUE_URL=${SQS_QUEUE_URL:-http://localhost:4566/000000000000/events-queue}

# Delete existing Lambda function (if exists)
echo "Removing existing Lambda function (if exists)..."
awslocal lambda delete-function --function-name event-scheduler 2>/dev/null || true

# Create Lambda function
echo "Creating Lambda function: event-scheduler..."
awslocal lambda create-function \
  --function-name event-scheduler \
  --runtime nodejs20.x \
  --handler schedulerHandler.handler \
  --zip-file fileb://dist/event-scheduler.zip \
  --role arn:aws:iam::000000000000:role/lambda-execution-role \
  --timeout 60 \
  --memory-size 512 \
  --environment "Variables={DATABASE_URL=$DATABASE_URL,SQS_QUEUE_URL=$SQS_QUEUE_URL,AWS_ENDPOINT_URL=$AWS_ENDPOINT_URL,AWS_REGION=$AWS_REGION,NODE_ENV=development,LOG_LEVEL=info}"

echo "=========================================="
echo "Lambda deployed successfully!"
echo "=========================================="
echo "Function: event-scheduler"
echo "Runtime: nodejs20.x"
echo "Handler: schedulerHandler.handler"
echo "Timeout: 60 seconds"
echo "Memory: 512 MB"
echo ""
echo "Test command:"
echo "  awslocal lambda invoke --function-name event-scheduler output.json"
echo "=========================================="
