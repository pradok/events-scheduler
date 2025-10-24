#!/bin/bash

# LocalStack AWS Service Initialization Script
# Time-Based Event Scheduling System
# This script runs automatically when LocalStack container starts

set -e

echo "=========================================="
echo "Initializing LocalStack AWS services..."
echo "=========================================="

# Set AWS region
export AWS_DEFAULT_REGION=${AWS_REGION:-us-east-1}

# Wait for LocalStack to be ready
echo "Waiting for LocalStack to be ready..."
sleep 5

# Create SQS Queue for event processing (all event types: birthday, anniversary, reminder, etc.)
echo "Creating SQS queue: events-queue"
awslocal sqs create-queue \
  --queue-name events-queue \
  --attributes VisibilityTimeout=30,MessageRetentionPeriod=86400 \
  || echo "Queue may already exist"

# Create Dead Letter Queue for failed events
echo "Creating SQS Dead Letter Queue: events-dlq"
awslocal sqs create-queue \
  --queue-name events-dlq \
  --attributes MessageRetentionPeriod=1209600 \
  || echo "DLQ may already exist"

# Get queue URLs
QUEUE_URL=$(awslocal sqs get-queue-url --queue-name events-queue --query 'QueueUrl' --output text)
DLQ_URL=$(awslocal sqs get-queue-url --queue-name events-dlq --query 'QueueUrl' --output text)

echo "Queue URL: $QUEUE_URL"
echo "DLQ URL: $DLQ_URL"

# Create EventBridge rule for event scheduler (triggers every 1 minute)
# Generic rule for all event types (birthday, anniversary, reminder, etc.)
echo "Creating EventBridge rule: event-scheduler-rule"
awslocal events put-rule \
  --name event-scheduler-rule \
  --schedule-expression "rate(1 minute)" \
  --state ENABLED \
  --description "Triggers time-based event scheduler every 1 minute (all event types)" \
  || echo "EventBridge rule may already exist"

# Note: Lambda functions and API Gateway will be set up in later stories
# This initialization script prepares the message queue infrastructure

echo "=========================================="
echo "LocalStack initialization complete!"
echo "=========================================="
echo ""
echo "Available services:"
echo "- SQS Queue: events-queue"
echo "- SQS DLQ: events-dlq"
echo "- EventBridge Rule: event-scheduler-rule"
echo ""
echo "Test commands:"
echo "  awslocal sqs list-queues"
echo "  awslocal events list-rules"
echo "=========================================="
