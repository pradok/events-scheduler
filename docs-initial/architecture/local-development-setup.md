# Local Development Setup with LocalStack

This document explains how to run the entire AWS infrastructure locally using LocalStack and Docker Compose.

---

## Overview

LocalStack allows you to emulate AWS services on your local machine, enabling you to develop and test the birthday messaging system without deploying to AWS.

### What We Can Run Locally

| AWS Service | LocalStack Support | Local Alternative |
|-------------|-------------------|-------------------|
| **Lambda** | ✅ Full support | Run as Node.js functions |
| **EventBridge** | ✅ Full support | Cron scheduling works |
| **SQS** | ✅ Full support | Message queuing works |
| **RDS PostgreSQL** | ❌ Not supported | Use Docker PostgreSQL |
| **Secrets Manager** | ✅ Full support | Store secrets locally |
| **Parameter Store** | ✅ Full support | Store parameters locally |
| **SNS** | ✅ Full support | Can test SMS/Email flows |
| **SES** | ✅ Full support | Simulates email sending |
| **CloudWatch** | ✅ Partial support | Logs available |

**Key Difference**: We use a Docker PostgreSQL container instead of RDS, but the database schema and queries remain identical.

---

## Architecture: Local vs AWS

### AWS Production
```text
EventBridge → Lambda Scheduler → RDS + SQS → Lambda Worker → Webhook/SNS/SES
```

### Local Development
```text
LocalStack EventBridge → Lambda Scheduler → Docker PostgreSQL + LocalStack SQS → Lambda Worker → Webhook/SNS/SES
```

**Everything works the same way** - just running locally instead of in AWS!

---

## Setup: Docker Compose

### docker-compose.yml

```yaml
version: '3.8'

services:
  # PostgreSQL Database (replaces RDS)
  postgres:
    image: postgres:16-alpine
    container_name: bday-postgres
    environment:
      POSTGRES_DB: bday
      POSTGRES_USER: bday_user
      POSTGRES_PASSWORD: local_dev_password
      TZ: UTC
      PGTZ: UTC
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bday_user -d bday"]
      interval: 10s
      timeout: 5s
      retries: 5

  # LocalStack (AWS services emulation)
  localstack:
    image: localstack/localstack:latest
    container_name: bday-localstack
    ports:
      - "4566:4566"  # LocalStack edge port
      - "4571:4571"  # LocalStack legacy port
    environment:
      - SERVICES=lambda,sqs,events,secretsmanager,ssm,sns,ses
      - DEBUG=1
      - LAMBDA_EXECUTOR=docker
      - LAMBDA_DOCKER_NETWORK=bday_default
      - DOCKER_HOST=unix:///var/run/docker.sock
      - AWS_DEFAULT_REGION=us-east-1
      - AWS_ACCESS_KEY_ID=test
      - AWS_SECRET_ACCESS_KEY=test
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock"
      - "./localstack-init:/etc/localstack/init/ready.d"
      - "localstack_data:/tmp/localstack"
    depends_on:
      postgres:
        condition: service_healthy

  # Optional: pgAdmin for database GUI
  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: bday-pgadmin
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@local.dev
      PGADMIN_DEFAULT_PASSWORD: admin
    ports:
      - "5050:80"
    depends_on:
      - postgres

volumes:
  postgres_data:
  localstack_data:

networks:
  default:
    name: bday_default
```

---

## LocalStack Initialization

### localstack-init/setup.sh

Create this script to set up all AWS resources when LocalStack starts:

```bash
#!/bin/bash

echo "=== Initializing LocalStack Resources ==="

# Wait for LocalStack to be ready
sleep 5

# Set AWS endpoint
export AWS_ENDPOINT="http://localhost:4566"
export AWS_REGION="us-east-1"

# Create SQS Queues
echo "Creating SQS queues..."
awslocal sqs create-queue --queue-name bday-messages
awslocal sqs create-queue --queue-name bday-messages-dlq

# Get queue URLs
MAIN_QUEUE_URL=$(awslocal sqs get-queue-url --queue-name bday-messages --query 'QueueUrl' --output text)
DLQ_URL=$(awslocal sqs get-queue-url --queue-name bday-messages-dlq --query 'QueueUrl' --output text)

echo "Main Queue: $MAIN_QUEUE_URL"
echo "DLQ: $DLQ_URL"

# Configure Dead Letter Queue on main queue
DLQ_ARN=$(awslocal sqs get-queue-attributes --queue-url $DLQ_URL --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)
awslocal sqs set-queue-attributes \
  --queue-url $MAIN_QUEUE_URL \
  --attributes '{
    "RedrivePolicy": "{\"deadLetterTargetArn\":\"'$DLQ_ARN'\",\"maxReceiveCount\":\"5\"}",
    "VisibilityTimeout": "30"
  }'

# Create Secrets Manager secret (DB credentials)
echo "Creating Secrets Manager secret..."
awslocal secretsmanager create-secret \
  --name bday/db-credentials \
  --secret-string '{
    "host": "postgres",
    "port": 5432,
    "database": "bday",
    "username": "bday_user",
    "password": "local_dev_password"
  }'

# Create Parameter Store parameters
echo "Creating Parameter Store parameters..."
awslocal ssm put-parameter \
  --name /bday/webhook-url \
  --value "https://webhook.site/your-unique-id" \
  --type String \
  --description "Birthday webhook endpoint"

awslocal ssm put-parameter \
  --name /bday/environment \
  --value "local" \
  --type String

# Create Lambda execution role
echo "Creating IAM role for Lambda..."
awslocal iam create-role \
  --role-name bday-lambda-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "lambda.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# Attach policies to Lambda role
awslocal iam attach-role-policy \
  --role-name bday-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

echo "=== LocalStack initialization complete ==="
```

Make it executable:
```bash
chmod +x localstack-init/setup.sh
```

---

## Lambda Functions Setup

### Project Structure

```
bday/
├── docker-compose.yml
├── localstack-init/
│   └── setup.sh
├── database/
│   └── init.sql
├── lambdas/
│   ├── scheduler/
│   │   ├── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── worker/
│   │   ├── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── build.sh
└── scripts/
    └── deploy-lambdas.sh
```

### Lambda Deployment Script

```bash
#!/bin/bash
# scripts/deploy-lambdas.sh

set -e

echo "Building Lambda functions..."

# Build Scheduler Lambda
cd lambdas/scheduler
npm install
npm run build
zip -r scheduler.zip dist/ node_modules/

# Deploy Scheduler Lambda
awslocal lambda create-function \
  --function-name bday-scheduler \
  --runtime nodejs20.x \
  --role arn:aws:iam::000000000000:role/bday-lambda-role \
  --handler dist/index.handler \
  --zip-file fileb://scheduler.zip \
  --timeout 60 \
  --memory-size 512 \
  --environment Variables="{
    DB_HOST=postgres,
    DB_PORT=5432,
    DB_NAME=bday,
    DB_USER=bday_user,
    DB_PASSWORD=local_dev_password,
    SQS_QUEUE_URL=http://localhost:4566/000000000000/bday-messages,
    AWS_ENDPOINT=http://localstack:4566
  }"

echo "Scheduler Lambda deployed!"

# Build Worker Lambda
cd ../worker
npm install
npm run build
zip -r worker.zip dist/ node_modules/

# Deploy Worker Lambda
awslocal lambda create-function \
  --function-name bday-worker \
  --runtime nodejs20.x \
  --role arn:aws:iam::000000000000:role/bday-lambda-role \
  --handler dist/index.handler \
  --zip-file fileb://worker.zip \
  --timeout 30 \
  --memory-size 512 \
  --environment Variables="{
    DB_HOST=postgres,
    DB_PORT=5432,
    DB_NAME=bday,
    DB_USER=bday_user,
    DB_PASSWORD=local_dev_password,
    AWS_ENDPOINT=http://localstack:4566
  }"

# Connect SQS to Worker Lambda
QUEUE_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/bday-messages \
  --attribute-names QueueArn \
  --query 'Attributes.QueueArn' \
  --output text)

awslocal lambda create-event-source-mapping \
  --function-name bday-worker \
  --event-source-arn $QUEUE_ARN \
  --batch-size 10

echo "Worker Lambda deployed and connected to SQS!"

# Create EventBridge rule
awslocal events put-rule \
  --name bday-scheduler-trigger \
  --schedule-expression "rate(1 minute)"

# Add Lambda as target for EventBridge
SCHEDULER_ARN=$(awslocal lambda get-function \
  --function-name bday-scheduler \
  --query 'Configuration.FunctionArn' \
  --output text)

awslocal events put-targets \
  --rule bday-scheduler-trigger \
  --targets "Id=1,Arn=$SCHEDULER_ARN"

# Grant EventBridge permission to invoke Lambda
awslocal lambda add-permission \
  --function-name bday-scheduler \
  --statement-id EventBridgeInvoke \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn arn:aws:events:us-east-1:000000000000:rule/bday-scheduler-trigger

echo "EventBridge rule created - Scheduler will run every 1 minute!"

cd ../..
```

---

## Database Initialization

### database/init.sql

```sql
-- Database initialization script
-- This runs automatically when PostgreSQL container starts

-- Set timezone to UTC
SET timezone = 'UTC';

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  date_of_birth DATE NOT NULL,
  timezone VARCHAR(100) NOT NULL,

  -- Multi-channel delivery
  preferred_channel VARCHAR(20) NOT NULL DEFAULT 'WEBHOOK'
    CHECK (preferred_channel IN ('WEBHOOK', 'SMS', 'EMAIL')),
  webhook_url VARCHAR(500),
  phone_number VARCHAR(20),
  email VARCHAR(255),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure at least one delivery method is provided
  CONSTRAINT check_delivery_method CHECK (
    webhook_url IS NOT NULL OR
    phone_number IS NOT NULL OR
    email IS NOT NULL
  )
);

-- Events table
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL DEFAULT 'BIRTHDAY',

  target_year INTEGER NOT NULL,
  target_date DATE NOT NULL,
  target_time TIME NOT NULL DEFAULT '09:00:00',
  timezone VARCHAR(100) NOT NULL,
  target_timestamp_utc TIMESTAMP WITH TIME ZONE NOT NULL,

  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),

  executed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  attempts INTEGER DEFAULT 0,
  last_error TEXT,

  -- Prevent duplicate events
  UNIQUE(user_id, event_type, target_year)
);

-- Indexes for performance
CREATE INDEX idx_events_ready ON events(target_timestamp_utc, status)
  WHERE status = 'PENDING';

CREATE INDEX idx_events_user ON events(user_id);
CREATE INDEX idx_events_status ON events(status);

-- Insert test data
INSERT INTO users (first_name, last_name, date_of_birth, timezone, preferred_channel, webhook_url)
VALUES
  ('John', 'Doe', '1990-01-15', 'America/New_York', 'WEBHOOK', 'https://webhook.site/test-123'),
  ('Jane', 'Smith', '1985-06-20', 'America/Los_Angeles', 'WEBHOOK', 'https://webhook.site/test-456'),
  ('Alice', 'Johnson', '1992-12-05', 'Europe/London', 'WEBHOOK', 'https://webhook.site/test-789');

-- Function to generate birthday events (called when user is created)
CREATE OR REPLACE FUNCTION generate_birthday_event(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_user RECORD;
  v_next_birthday DATE;
  v_target_year INTEGER;
  v_event_id UUID;
BEGIN
  -- Get user details
  SELECT * INTO v_user FROM users WHERE id = p_user_id;

  -- Calculate next birthday
  v_next_birthday := DATE_TRUNC('year', NOW()) +
    INTERVAL '1 year' * (EXTRACT(YEAR FROM NOW()) - EXTRACT(YEAR FROM v_user.date_of_birth)) +
    (v_user.date_of_birth - DATE_TRUNC('year', v_user.date_of_birth));

  IF v_next_birthday < CURRENT_DATE THEN
    v_next_birthday := v_next_birthday + INTERVAL '1 year';
  END IF;

  v_target_year := EXTRACT(YEAR FROM v_next_birthday);

  -- Insert event
  INSERT INTO events (
    user_id,
    event_type,
    target_year,
    target_date,
    target_time,
    timezone,
    target_timestamp_utc
  ) VALUES (
    p_user_id,
    'BIRTHDAY',
    v_target_year,
    v_next_birthday,
    '09:00:00',
    v_user.timezone,
    -- This is simplified - in real code use Luxon for timezone conversion
    v_next_birthday + INTERVAL '9 hours'
  ) RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON DATABASE bday IS 'Birthday messaging system - Local development';
```

---

## Starting the Local Environment

### 1. Start All Services

```bash
# Start PostgreSQL and LocalStack
docker-compose up -d

# Wait for services to be ready
sleep 10

# Check service health
docker-compose ps
```

### 2. Deploy Lambda Functions

```bash
# Deploy both Lambda functions and set up EventBridge
./scripts/deploy-lambdas.sh
```

### 3. Verify Setup

```bash
# Check Lambda functions
awslocal lambda list-functions

# Check SQS queues
awslocal sqs list-queues

# Check EventBridge rules
awslocal events list-rules

# Check Parameter Store
awslocal ssm get-parameter --name /bday/webhook-url

# Connect to database
psql postgresql://bday_user:local_dev_password@localhost:5432/bday
```

---

## Testing Locally

### Manual Trigger Scheduler

```bash
# Invoke scheduler Lambda manually
awslocal lambda invoke \
  --function-name bday-scheduler \
  --payload '{}' \
  response.json

cat response.json
```

### View Lambda Logs

```bash
# Scheduler logs
awslocal logs tail /aws/lambda/bday-scheduler --follow

# Worker logs
awslocal logs tail /aws/lambda/bday-worker --follow
```

### Check SQS Messages

```bash
# See messages in queue
awslocal sqs receive-message \
  --queue-url http://localhost:4566/000000000000/bday-messages \
  --max-number-of-messages 10

# Check Dead Letter Queue
awslocal sqs receive-message \
  --queue-url http://localhost:4566/000000000000/bday-messages-dlq \
  --max-number-of-messages 10
```

### Test Database Directly

```bash
# Connect to PostgreSQL
psql postgresql://bday_user:local_dev_password@localhost:5432/bday

# SQL queries
SELECT * FROM users;
SELECT * FROM events;

# Create test event that fires immediately
INSERT INTO events (user_id, event_type, target_year, target_date, target_time, timezone, target_timestamp_utc, status)
SELECT id, 'BIRTHDAY', 2025, CURRENT_DATE, '09:00:00', timezone, NOW() - INTERVAL '1 minute', 'PENDING'
FROM users LIMIT 1;

-- Wait 1 minute, then check if it was processed
SELECT * FROM events WHERE status = 'COMPLETED';
```

### Access pgAdmin (Optional)

Open browser: `http://localhost:5050`
- Email: `admin@local.dev`
- Password: `admin`

Add server:
- Host: `postgres`
- Port: `5432`
- Database: `bday`
- Username: `bday_user`
- Password: `local_dev_password`

---

## Development Workflow

### 1. Code Changes

```bash
# Make changes to Lambda code in lambdas/scheduler or lambdas/worker
vim lambdas/scheduler/index.ts

# Rebuild and redeploy
cd lambdas/scheduler
npm run build

# Update Lambda function
zip -r scheduler.zip dist/ node_modules/
awslocal lambda update-function-code \
  --function-name bday-scheduler \
  --zip-file fileb://scheduler.zip
```

### 2. Database Changes

```bash
# Connect to database
psql postgresql://bday_user:local_dev_password@localhost:5432/bday

# Run migrations
\i database/migrations/001_add_column.sql
```

### 3. View All Logs

```bash
# Docker Compose logs
docker-compose logs -f

# Specific service
docker-compose logs -f localstack
docker-compose logs -f postgres
```

---

## Cleanup

```bash
# Stop all services
docker-compose down

# Remove volumes (delete all data)
docker-compose down -v

# Remove images
docker-compose down --rmi all
```

---

## Key Differences: Local vs AWS

| Aspect | Local (LocalStack) | AWS Production |
|--------|-------------------|----------------|
| **Cost** | Free | ~$58/month |
| **Speed** | Instant deployment | Minutes to deploy |
| **Database** | Docker PostgreSQL | RDS PostgreSQL |
| **Lambda** | Runs in Docker | Runs on AWS infrastructure |
| **EventBridge** | Cron simulation | Real AWS EventBridge |
| **Networking** | All in one network | VPC with subnets |
| **NAT Gateway** | Not needed | $33/month |
| **Monitoring** | Basic logs | Full CloudWatch |
| **Scalability** | Limited to local resources | Auto-scales |

---

## Advantages of Local Development

✅ **Instant Feedback** - Changes deploy in seconds
✅ **No AWS Costs** - Develop for free
✅ **Offline Work** - No internet needed
✅ **Easy Debugging** - Direct access to all services
✅ **Fast Iteration** - Test without waiting for AWS
✅ **Reproducible** - Same setup for all developers

---

## Transitioning to AWS

When ready to deploy to AWS:

1. **CDK/Terraform** - Write infrastructure as code
2. **Same Lambda Code** - Works identically in AWS
3. **Same Database Schema** - Import to RDS
4. **Environment Variables** - Point to AWS endpoints
5. **Test** - Identical behavior to local

The code remains the same - only endpoints change!

---

## How LocalStack Helps with AWS Deployment

LocalStack doesn't directly deploy to AWS, but it helps in several critical ways:

### 1. Infrastructure as Code (IaC) Validation

Test your CDK/Terraform against LocalStack before deploying to AWS:

```bash
# Test CDK deployment locally first
export CDK_DEFAULT_ACCOUNT=000000000000
export AWS_ENDPOINT_URL=http://localhost:4566
cdk deploy --require-approval never

# If it works in LocalStack, it will work in AWS
# Then deploy to real AWS
unset AWS_ENDPOINT_URL
cdk deploy --profile production
```

Benefits:

- ✅ Catch configuration errors before AWS deployment
- ✅ Validate IAM policies and permissions
- ✅ Test resource dependencies
- ✅ No AWS costs during development

### 2. CI/CD Pipeline Testing

Run integration tests in CI without AWS credentials:

```yaml
# .github/workflows/test.yml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      localstack:
        image: localstack/localstack:latest
        ports:
          - 4566:4566
        env:
          SERVICES: lambda,sqs,events,secretsmanager,ssm

      postgres:
        image: postgres:16-alpine
        ports:
          - 5432:5432
        env:
          POSTGRES_DB: bday
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_password

    steps:
      - uses: actions/checkout@v3

      - name: Deploy to LocalStack
        run: |
          npm install -g aws-cdk-local cdklocal
          cdklocal deploy --require-approval never

      - name: Run Integration Tests
        run: npm test
        env:
          AWS_ENDPOINT_URL: http://localhost:4566
          DB_HOST: localhost
```

Benefits:

- ✅ Test every commit without AWS costs
- ✅ Fast feedback loop (seconds vs minutes)
- ✅ No credential management in CI
- ✅ Consistent test environment

### 3. AWS CDK Development Workflow

Use `cdklocal` to test CDK stacks locally:

```bash
# Install CDK Local wrapper
npm install -g aws-cdk-local

# Deploy to LocalStack
cdklocal bootstrap
cdklocal deploy

# Test the stack
npm run test:integration

# Deploy to AWS when ready
cdk deploy --profile production
```

### 4. Multi-Environment Strategy

LocalStack as the first deployment target:

```text
Development Flow:
1. Local Development → LocalStack (instant feedback)
2. Pull Request → LocalStack in CI (automated testing)
3. Merge to Main → Deploy to AWS Dev (real AWS testing)
4. Manual Approval → Deploy to AWS Prod (production)
```

### 5. AWS CLI Commands Work Identically

All AWS CLI commands work the same - just point to LocalStack:

```bash
# Local development
export AWS_ENDPOINT_URL=http://localhost:4566

# Same commands work in both environments
aws lambda list-functions
aws sqs list-queues
aws ssm get-parameter --name /bday/webhook-url

# Deploy to AWS - remove endpoint
unset AWS_ENDPOINT_URL
aws lambda list-functions  # Now hits real AWS
```

### 6. Cost Estimation Before Deployment

Test realistic workloads locally to estimate AWS costs:

```bash
# Simulate 1000 events locally
for i in {1..1000}; do
  awslocal sqs send-message \
    --queue-url http://localhost:4566/000000000000/bday-messages \
    --message-body "{\"userId\": \"test-$i\"}"
done

# Monitor Lambda invocations, SQS throughput
# Calculate AWS costs based on actual usage patterns
```

### 7. Snapshot and Export Resources

Export LocalStack state to recreate in AWS:

```bash
# Export Lambda function configuration
awslocal lambda get-function --function-name bday-scheduler > scheduler-config.json

# Export SQS queue attributes
awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/bday-messages \
  --attribute-names All > queue-config.json

# Use these configs to create identical resources in AWS
```

### 8. LocalStack Pro Features (Paid)

If you use LocalStack Pro ($25-$50/month), you get additional deployment helpers:

#### Cloud Pods - Save and share LocalStack state

```bash
# Save your entire local setup
localstack pod save my-bday-setup

# Share with team
localstack pod push my-bday-setup

# Team member loads it
localstack pod pull my-bday-setup
localstack pod load my-bday-setup
```

#### AWS Parity Testing - Compare LocalStack vs AWS behavior

```bash
# Test against both LocalStack and AWS
localstack test --target localstack
localstack test --target aws
```

---

## Recommended Deployment Strategy

### Phase 1: Local Development (LocalStack)

```bash
# Develop and test locally
docker-compose up -d
./scripts/deploy-lambdas.sh
npm run test:integration
```

### Phase 2: Infrastructure as Code

```typescript
// infra/lib/bday-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';

export class BdayStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Define infrastructure
    const queue = new sqs.Queue(this, 'BdayMessagesQueue', {
      queueName: 'bday-messages',
      retentionPeriod: cdk.Duration.days(14)
    });

    const scheduler = new lambda.Function(this, 'Scheduler', {
      functionName: 'bday-scheduler',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambdas/scheduler'),
      timeout: cdk.Duration.minutes(1)
    });

    // ... rest of stack
  }
}
```

### Phase 3: Test with LocalStack

```bash
# Deploy CDK to LocalStack
cdklocal bootstrap
cdklocal deploy

# Run tests
npm run test:integration

# Verify everything works
```

### Phase 4: Deploy to AWS

```bash
# Deploy to AWS Dev environment
cdk deploy --profile dev --context env=dev

# Run smoke tests against AWS Dev
npm run test:smoke

# Deploy to AWS Prod
cdk deploy --profile prod --context env=prod
```

---

## AWS Deployment Tools Comparison

| Tool | LocalStack Support | Best For |
|------|-------------------|----------|
| **AWS CDK** | ✅ Excellent (cdklocal) | TypeScript/Python developers |
| **Terraform** | ✅ Excellent (tflocal) | Multi-cloud deployments |
| **Serverless Framework** | ✅ Good (plugins) | Quick Lambda deployments |
| **SAM (AWS)** | ✅ Good (samlocal) | AWS-native applications |
| **AWS CLI** | ✅ Perfect (awslocal) | Manual deployments, scripts |
| **Pulumi** | ✅ Good | Modern IaC with real languages |

**Recommendation**: Use **AWS CDK** with **cdklocal** for best LocalStack integration.

---

## Complete Development to Production Flow

```mermaid
graph LR
    A[Local Development<br/>LocalStack] --> B[Git Commit]
    B --> C[CI Pipeline<br/>LocalStack Tests]
    C --> D{Tests Pass?}
    D -->|No| A
    D -->|Yes| E[Deploy to AWS Dev]
    E --> F[Integration Tests<br/>AWS Dev]
    F --> G{Tests Pass?}
    G -->|No| A
    G -->|Yes| H[Manual Approval]
    H --> I[Deploy to AWS Prod]
```

**Key Point**: LocalStack acts as a gatekeeper - code must work locally before touching AWS.

---

## Summary: LocalStack's Role in AWS Deployment

LocalStack **doesn't replace** AWS deployment tools, but it **enhances** them by:

1. ✅ **Validating IaC** - Test CDK/Terraform before AWS deployment
2. ✅ **Enabling CI/CD** - Run tests without AWS credentials
3. ✅ **Reducing Costs** - Develop and test for free
4. ✅ **Faster Iteration** - Deploy in seconds vs minutes
5. ✅ **Risk Mitigation** - Catch errors before production
6. ✅ **Team Collaboration** - Consistent local environments
7. ✅ **Learning AWS** - Practice without fear of breaking things

**Best Practice**: Always test in LocalStack first, then deploy to AWS with confidence!

---

## Troubleshooting

### Lambda Can't Connect to PostgreSQL

**Issue**: Lambda shows connection timeout

**Fix**: Ensure Lambda uses `postgres` as hostname (Docker network name)
```typescript
const db = new Client({
  host: process.env.DB_HOST || 'postgres', // Docker service name
  port: 5432
});
```

### EventBridge Not Triggering

**Issue**: Scheduler doesn't run every minute

**Fix**: Check EventBridge rule and Lambda permission
```bash
awslocal events list-rules
awslocal lambda get-policy --function-name bday-scheduler
```

### SQS Messages Not Processing

**Issue**: Messages stuck in queue

**Fix**: Check event source mapping
```bash
awslocal lambda list-event-source-mappings
```

---

## Summary

With this setup, you get:

- ✅ Full AWS infrastructure locally
- ✅ Real Lambda functions
- ✅ PostgreSQL database
- ✅ SQS queues with DLQ
- ✅ EventBridge scheduling
- ✅ Parameter Store and Secrets Manager
- ✅ Fast development cycle
- ✅ Cost-free testing

**Next Steps**:
1. Run `docker-compose up -d`
2. Deploy Lambdas with `./scripts/deploy-lambdas.sh`
3. Test by creating users and watching events process
4. When ready, deploy to AWS with identical code!

---

**Status**: ✅ Ready for Local Development
