# LocalStack Setup Guide (Community Edition)

**Complete guide for local AWS service emulation using LocalStack Community Edition**

---

## Overview

LocalStack is a **fully functional local AWS cloud stack** that runs in Docker. It allows you to develop and test cloud applications offline without connecting to real AWS services.

**This project uses LocalStack Community Edition (FREE)** to emulate:
- ✅ **AWS Lambda** - Serverless function execution
- ✅ **Amazon SQS** - Message queuing service
- ✅ **Amazon EventBridge** - Event scheduling and routing
- ✅ **CloudWatch Logs** - Application logging
- ✅ **IAM** - Identity and access management
- ✅ **API Gateway** - HTTP API endpoints (for User API)
- ✅ **SNS** - Simple Notification Service (future use)

---

## Why LocalStack?

### Benefits

1. **Zero AWS Costs** - Run unlimited tests without AWS charges
2. **Fast Feedback** - Local testing is faster than deploying to AWS
3. **Offline Development** - No internet required
4. **Reproducible Tests** - Same environment every time
5. **CI/CD Friendly** - Easy to run in GitHub Actions
6. **Safe Experimentation** - Break things without consequences

### What Gets Emulated

| AWS Service | LocalStack Status | Use Case |
|-------------|-------------------|----------|
| Lambda | ✅ Full Support | Event scheduler + worker functions |
| SQS | ✅ Full Support | Event processing queue + DLQ |
| EventBridge | ✅ Full Support | 1-minute scheduler trigger |
| CloudWatch Logs | ✅ Full Support | Lambda execution logs |
| IAM | ✅ Full Support | Lambda execution role |
| API Gateway | ✅ Full Support | User REST API |
| SNS | ⚠️ Pro Only | Future notifications (Phase 2+) |
| RDS | ⚠️ Pro Only | Not needed (using Docker PostgreSQL) |

---

## Prerequisites

### Required Software

1. **Docker Desktop**
   ```bash
   docker --version
   # Should show: Docker version 24.0.7 or higher
   ```

2. **AWS CLI** (Optional - NOT required!)
   ```bash
   aws --version
   # Should show: aws-cli/2.x.x or higher
   ```

   **Note:** AWS CLI is **optional** for manual inspection. All commands in this guide use `docker exec` which works without installing AWS CLI on your machine.

3. **awslocal CLI Wrapper** (Optional - NOT required!)
   ```bash
   # Install via pip (optional)
   pip install awscli-local

   # Verify installation
   awslocal --version
   ```

   **What is awslocal?**
   - Wrapper around `aws` CLI
   - Automatically sets `--endpoint-url=http://localhost:4566`
   - Simplifies commands: `awslocal sqs list-queues` vs `aws --endpoint-url=http://localhost:4566 sqs list-queues`
   - **NOT NEEDED:** This guide uses `docker exec` commands that work without awslocal

### Optional Tools

- **LocalStack Desktop** - GUI for managing LocalStack (see Story 4.3)
- **jq** - JSON parsing for command-line (`brew install jq` - optional)

---

## Quick Start

### One-Command Fresh Start

Need a clean slate? Run this:

```bash
npm run docker:reset
```

This will:
1. Stop all containers
2. Delete all volumes (LocalStack data + PostgreSQL data)
3. Restart containers from scratch
4. Run init scripts to recreate all resources

**Perfect for:** Starting fresh before tests, recovering from broken state, resetting between development sessions.

---

### Standard Workflow

#### 1. Start LocalStack

```bash
npm run docker:start
```

**What happens:**
- ✅ Starts PostgreSQL container
- ✅ Starts LocalStack container
- ✅ Runs init script (`docker/localstack/init-aws.sh`)
- ✅ Creates SQS queues, IAM role, EventBridge rule
- ✅ Waits for health check to pass

**Expected output:**
```
Creating bday-postgres ... done
Creating bday-localstack ... done
Waiting for LocalStack to be ready...
Initializing LocalStack AWS services...
Queue URL: http://localhost:4566/000000000000/bday-events-queue
DLQ URL: http://localhost:4566/000000000000/bday-events-dlq
LocalStack initialization complete!
```

#### 2. Verify Resources

```bash
npm run docker:verify
```

**What it checks:**
- ✅ LocalStack health endpoint
- ✅ SQS main queue exists
- ✅ SQS DLQ exists with redrive policy
- ✅ IAM role exists
- ✅ EventBridge rule exists and is ENABLED
- ✅ CloudWatch Logs service ready

**Expected output:**
```
✅ All checks passed!

LocalStack is ready for E2E testing.

Next steps:
  - Deploy Lambdas: npm run lambda:all
  - Run E2E tests: npm run test:e2e
```

#### 3. View Logs (If Something Fails)

```bash
npm run docker:logs
```

Shows live logs from LocalStack container. Look for:
- Init script output
- Resource creation messages
- Any error messages

Press `Ctrl+C` to stop following logs.

#### 4. Stop LocalStack

```bash
npm run docker:stop
```

Stops containers but **preserves data volumes**. Next `docker:start` will be faster.

---

## Created Resources

### SQS Queues

| Resource | Name | URL | Purpose |
|----------|------|-----|---------|
| Main Queue | `bday-events-queue` | `http://localhost:4566/000000000000/bday-events-queue` | Event processing messages |
| Dead Letter Queue | `bday-events-dlq` | `http://localhost:4566/000000000000/bday-events-dlq` | Failed events after 3 retries |

**Redrive Policy:** Main queue automatically sends failed messages to DLQ after 3 receive attempts.

**Queue Configuration:**
```bash
# Main queue
Visibility Timeout: 30 seconds
Message Retention: 1 day (86400 seconds)
Max Receive Count: 3 (redrive to DLQ)

# Dead Letter Queue
Message Retention: 14 days (1209600 seconds)
```

### IAM Role

| Resource | Name | ARN | Trust Policy |
|----------|------|-----|--------------|
| Lambda Execution Role | `lambda-execution-role` | `arn:aws:iam::000000000000:role/lambda-execution-role` | Lambda service |

**Attached Policies:**
- `AWSLambdaBasicExecutionRole` - CloudWatch Logs write permission
- `AmazonSQSFullAccess` - Send/receive SQS messages
- `AmazonEventBridgeFullAccess` - EventBridge integration

### EventBridge Rule

| Resource | Name | Schedule | State | Target |
|----------|------|----------|-------|--------|
| Scheduler Rule | `event-scheduler-rule` | `rate(1 minute)` | ENABLED | (Added in Story 4.4) |

**What it does:**
- Triggers every 1 minute
- Will invoke `event-scheduler` Lambda (Story 4.4)
- Checks for ready events to process

---

## Accessing LocalStack

### Using Docker Exec (No AWS CLI Required!)

**Recommended:** Run commands inside LocalStack container

```bash
# List SQS queues
docker exec bday-localstack sh -c "awslocal sqs list-queues"

# Send test message
docker exec bday-localstack sh -c "awslocal sqs send-message \
  --queue-url http://localhost:4566/000000000000/bday-events-queue \
  --message-body '{\"test\": \"message\"}'"

# Receive message
docker exec bday-localstack sh -c "awslocal sqs receive-message \
  --queue-url http://localhost:4566/000000000000/bday-events-queue"

# List IAM roles
docker exec bday-localstack sh -c "awslocal iam list-roles"

# Describe EventBridge rule
docker exec bday-localstack sh -c "awslocal events describe-rule --name event-scheduler-rule"

# View CloudWatch log groups (after Lambdas run)
docker exec bday-localstack sh -c "awslocal logs describe-log-groups"
```

### Using awslocal CLI (If You Have It Installed)

**Optional:** If you installed awslocal on your host machine

```bash
# List SQS queues
awslocal sqs list-queues

# Send test message
awslocal sqs send-message \
  --queue-url http://localhost:4566/000000000000/bday-events-queue \
  --message-body '{"test": "message"}'

# Receive message
awslocal sqs receive-message \
  --queue-url http://localhost:4566/000000000000/bday-events-queue
```

### Using AWS SDK (TypeScript)

```typescript
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const sqsClient = new SQSClient({
  endpoint: 'http://localhost:4566',
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test'
  }
});

const command = new SendMessageCommand({
  QueueUrl: 'http://localhost:4566/000000000000/bday-events-queue',
  MessageBody: JSON.stringify({ eventId: '123', message: 'Test' })
});

await sqsClient.send(command);
```

### Environment Variables

```bash
# .env file (for local development)
AWS_ENDPOINT_URL=http://localhost:4566
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test

# SQS Queue URLs
SQS_QUEUE_URL=http://localhost:4566/000000000000/bday-events-queue
SQS_DLQ_URL=http://localhost:4566/000000000000/bday-events-dlq
```

**Note:** LocalStack uses dummy credentials (`test/test`). Real AWS credentials are NOT needed.

---

## Troubleshooting

### LocalStack Not Starting

**Symptom:** `docker:start` fails or hangs

**Solutions:**

1. **Check Docker is running:**
   ```bash
   docker ps
   ```
   If error, start Docker Desktop.

2. **Port 4566 already in use:**
   ```bash
   lsof -i :4566
   ```
   Kill conflicting process or change LocalStack port.

3. **View container logs:**
   ```bash
   npm run docker:logs
   ```
   Look for error messages.

4. **Nuclear option (reset everything):**
   ```bash
   npm run docker:reset
   ```

---

### Resources Not Created

**Symptom:** `docker:verify` fails

**Solutions:**

1. **Check init script ran:**
   ```bash
   npm run docker:logs | grep "LocalStack initialization complete"
   ```

2. **Manually check queue:**
   ```bash
   awslocal sqs list-queues
   ```

3. **Re-run init script:**
   ```bash
   docker exec bday-localstack bash /etc/localstack/init/ready.d/init-aws.sh
   ```

4. **Full reset:**
   ```bash
   npm run docker:reset
   npm run docker:verify
   ```

---

### awslocal Command Not Found

**Symptom:** `bash: awslocal: command not found`

**Solution:**

```bash
# Install awscli-local
pip install awscli-local

# Verify installation
which awslocal
awslocal --version
```

**Alternative:** Use `aws` CLI with explicit endpoint:
```bash
aws --endpoint-url=http://localhost:4566 sqs list-queues
```

---

### Health Check Failing

**Symptom:** LocalStack container keeps restarting

**Solutions:**

1. **Check LocalStack health manually:**
   ```bash
   curl http://localhost:4566/_localstack/health
   ```

2. **Increase startup timeout:**
   Edit `docker/docker-compose.yml`:
   ```yaml
   healthcheck:
     start_period: 30s  # Increase from 15s
   ```

3. **View detailed logs:**
   ```bash
   docker logs bday-localstack -f
   ```

---

### Permission Denied on Scripts

**Symptom:** `./scripts/verify-localstack.sh: Permission denied`

**Solution:**

```bash
chmod +x scripts/verify-localstack.sh
chmod +x scripts/docker-*.sh
```

---

## Community Edition Limitations

LocalStack Community Edition (FREE) does **NOT** support:

| Service | Limitation | Workaround |
|---------|-----------|------------|
| **RDS PostgreSQL** | Pro only | ✅ Use Docker PostgreSQL (already configured) |
| **X-Ray Tracing** | Pro only | ⚠️ Use CloudWatch Logs for debugging |
| **SNS/SES** | Pro only | ⚠️ Phase 2+ feature, not needed for MVP |
| **Web UI Dashboard** | Pro only | ✅ Use awslocal CLI or Story 4.3 (VSCode extension) |
| **CloudWatch Metrics** | Limited | ✅ CloudWatch Logs work fine |

**Decision:** Community Edition is **sufficient for MVP**. Pro Edition evaluation deferred to Story 4.2 (optional).

---

## Next Steps

After LocalStack is verified:

1. **Deploy Lambdas to LocalStack** (Story 4.4)
   ```bash
   npm run lambda:all
   ```

2. **Configure VSCode LocalStack Extension** (Story 4.3 - Optional)
   - Browse resources visually
   - View CloudWatch logs in IDE

3. **Run E2E Tests** (Story 4.6)
   ```bash
   npm run test:e2e
   ```

---

## Useful Commands Cheat Sheet

```bash
# Lifecycle
npm run docker:start      # Start LocalStack + PostgreSQL
npm run docker:stop       # Stop containers (keep data)
npm run docker:reset      # Full reset (delete data, restart)
npm run docker:logs       # View LocalStack logs
npm run docker:verify     # Check all resources created

# SQS Commands (using docker exec - no AWS CLI required!)
docker exec bday-localstack sh -c "awslocal sqs list-queues"
docker exec bday-localstack sh -c "awslocal sqs send-message --queue-url <URL> --message-body '{\"test\":\"msg\"}'"
docker exec bday-localstack sh -c "awslocal sqs receive-message --queue-url <URL>"
docker exec bday-localstack sh -c "awslocal sqs purge-queue --queue-url <URL>"

# EventBridge Commands
docker exec bday-localstack sh -c "awslocal events list-rules"
docker exec bday-localstack sh -c "awslocal events describe-rule --name event-scheduler-rule"

# IAM Commands
docker exec bday-localstack sh -c "awslocal iam list-roles"
docker exec bday-localstack sh -c "awslocal iam get-role --role-name lambda-execution-role"

# Lambda Commands (after Story 4.4)
docker exec bday-localstack sh -c "awslocal lambda list-functions"
docker exec bday-localstack sh -c "awslocal lambda invoke --function-name event-scheduler output.json"

# CloudWatch Logs Commands
docker exec bday-localstack sh -c "awslocal logs describe-log-groups"
docker exec bday-localstack sh -c "awslocal logs tail /aws/lambda/event-scheduler --follow"
```

**Note:** All commands use `docker exec` to run inside the LocalStack container. You do NOT need to install AWS CLI or awslocal on your machine!

---

## References

- **LocalStack Documentation:** https://docs.localstack.cloud/
- **LocalStack GitHub:** https://github.com/localstack/localstack
- **AWS CLI Reference:** https://docs.aws.amazon.com/cli/
- **Story 4.2:** LocalStack Pro Setup (Optional)
- **Story 4.3:** LocalStack Desktop & VSCode Extension
- **Story 4.4:** Lambda Deployment to LocalStack

---

**Last Updated:** 2025-10-27
**Story:** 4.1 - LocalStack Setup (Community Edition)
**Status:** Complete ✅
