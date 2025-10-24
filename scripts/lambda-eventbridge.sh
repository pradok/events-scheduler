#!/bin/bash

# EventBridge Configuration Script
# Adds Lambda function as target for EventBridge scheduler rule

set -e

echo "=========================================="
echo "Configuring EventBridge → Lambda"
echo "=========================================="

# Remove existing targets (if any)
echo "Removing existing targets..."
awslocal events remove-targets \
  --rule event-scheduler-rule \
  --ids "1" 2>/dev/null || true

# Add Lambda as target for EventBridge rule
echo "Adding Lambda function as EventBridge target..."
awslocal events put-targets \
  --rule event-scheduler-rule \
  --targets "Id=1,Arn=arn:aws:lambda:us-east-1:000000000000:function:event-scheduler"

# Grant EventBridge permission to invoke Lambda (required even in LocalStack)
echo "Granting EventBridge permission to invoke Lambda..."
awslocal lambda add-permission \
  --function-name event-scheduler \
  --statement-id EventBridgeInvokePermission \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn arn:aws:events:us-east-1:000000000000:rule/event-scheduler-rule \
  2>/dev/null || echo "Permission may already exist"

echo "=========================================="
echo "EventBridge configuration complete!"
echo "=========================================="
echo "Rule: event-scheduler-rule"
echo "Schedule: rate(1 minute)"
echo "Target: event-scheduler Lambda"
echo ""
echo "Verify configuration:"
echo "  awslocal events list-targets-by-rule --rule event-scheduler-rule"
echo ""
echo "Manual trigger test:"
echo "  awslocal lambda invoke --function-name event-scheduler output.json"
echo "=========================================="
