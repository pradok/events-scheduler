# End-to-End Testing Guide

**One-command setup for production-like local E2E testing**

---

## Quick Start

### Complete Environment Setup

Set up everything in one command:

```bash
npm run e2e:setup
```

**What it does:**
1. Starts Docker (PostgreSQL + LocalStack)
2. Runs database migrations
3. Verifies LocalStack resources
4. Builds Lambda functions
5. Deploys Lambdas to LocalStack
6. Verifies deployment
7. Optionally starts User API

**Time:** ~60-90 seconds

### Verify Everything Works

```bash
npm run e2e:verify
```

**26 automated checks:**
- ✓ Docker containers running
- ✓ PostgreSQL ready with tables
- ✓ LocalStack services available
- ✓ SQS queues + EventBridge rule exist
- ✓ Lambdas deployed with correct config
- ✓ Triggers connected (EventBridge → Scheduler, SQS → Worker)

---

## When to Use

### Use `npm run e2e:setup` when:

- Starting work for the day
- Setting up environment for the first time
- After running `npm run docker:reset`
- Before running E2E tests
- Onboarding new developers

### Use `npm run e2e:verify` when:

- Checking if environment is ready
- Debugging setup issues
- Before running tests to ensure all services up
- After making infrastructure changes

---

## What Gets Set Up

| Component | Status | Access |
|-----------|--------|--------|
| PostgreSQL | ✓ Running | localhost:5432 |
| LocalStack | ✓ Running | http://localhost:4566 |
| Scheduler Lambda | ✓ Deployed | EventBridge trigger (1 min) |
| Worker Lambda | ✓ Deployed | SQS trigger |
| User API | Optional | http://localhost:3000 |

**View in LocalStack Desktop:**
- Lambda functions
- SQS queues and messages
- CloudWatch Logs
- EventBridge rules

**View in Prisma Studio:**
```bash
npm run prisma:studio  # http://localhost:5555
```

---

## Manual End-to-End Test Workflow

**Goal:** Test the complete event scheduling flow manually

### Step-by-Step Test

1. **Set up environment:**

   ```bash
   npm run e2e:setup
   ```

2. **Create a test event in Prisma Studio:**

   ```bash
   npm run prisma:studio  # Opens at http://localhost:5555
   ```

   - Create a User (firstName, lastName, dateOfBirth, timezone)
   - Create an Event with status=PENDING and targetTimestampUTC in the past

3. **Monitor in LocalStack Desktop:**
   - Open CloudWatch Logs → `/aws/lambda/event-scheduler`
   - Wait ~1 minute for scheduler to claim event
   - Event status changes: PENDING → PROCESSING
   - Message sent to SQS queue

4. **Verify worker processes event:**
   - CloudWatch Logs → `/aws/lambda/event-worker`
   - Event status changes: PROCESSING → COMPLETED
   - Webhook delivered

5. **Verify in Prisma Studio:**
   - Refresh Event table
   - Event status = COMPLETED
   - executedAt timestamp populated

### Automated E2E Tests

Run automated tests:

```bash
npm run test:e2e
```

Tests the complete flow programmatically.

---

## Monitoring & Debugging

### View Logs

**LocalStack Desktop (Recommended):**

- CloudWatch Logs → `/aws/lambda/event-scheduler`
- CloudWatch Logs → `/aws/lambda/event-worker`

**CLI:**

```bash
# Scheduler logs
docker exec bday-localstack sh -c "awslocal logs tail /aws/lambda/event-scheduler --follow"

# Worker logs
docker exec bday-localstack sh -c "awslocal logs tail /aws/lambda/event-worker --follow"
```

### Check SQS Queue

**LocalStack Desktop:**

- Navigate to SQS → `bday-events-queue`
- View messages

**CLI:**

```bash
docker exec bday-localstack sh -c "awslocal sqs receive-message \
  --queue-url http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/bday-events-queue"
```

### Database Inspection

```bash
npm run prisma:studio  # GUI at http://localhost:5555
```

For detailed monitoring, see [Local Development Guide](./local-development.md#monitoring)

---

## Troubleshooting

### Setup Fails

**Try these in order:**

1. **Check Docker is running:**

   ```bash
   docker ps
   ```

2. **Full reset:**

   ```bash
   npm run docker:reset
   npm run e2e:setup
   ```

3. **Check logs:**

   ```bash
   npm run docker:logs
   ```

### Verification Fails

**Run verification to see what's wrong:**

```bash
npm run e2e:verify
```

**Common fixes:**

- Database tables missing → `npm run prisma:migrate`
- Lambdas not deployed → `npm run lambda:all`
- LocalStack resources missing → `npm run docker:reset`

### Events Not Processing

1. **Check scheduler is running:**
   - LocalStack Desktop → CloudWatch Logs → `/aws/lambda/event-scheduler`
   - Should see logs every 1 minute

2. **Check worker is processing:**
   - LocalStack Desktop → CloudWatch Logs → `/aws/lambda/event-worker`
   - Should see logs when messages arrive

3. **If still broken:**

   ```bash
   npm run lambda:all  # Redeploy Lambdas
   ```

For detailed troubleshooting, see:

- [Debugging Guide](./debugging.md)
- [Local Development Guide](./local-development.md)

---

## Daily Workflow

**Morning:**

```bash
npm run e2e:setup && npm run e2e:verify
```

**During development:**

- Make code changes
- Redeploy if needed: `npm run lambda:all`
- Monitor in LocalStack Desktop

**End of day:**

```bash
npm run docker:stop  # Or docker:reset for full cleanup
```

---

## Before Running Tests

```bash
npm run e2e:setup  # Ensure environment ready
npm run test:e2e   # Run tests
```

---

## See Also

- **[Local Development Guide](./local-development.md)** - Detailed service documentation
- **[LocalStack Desktop Setup](./localstack-desktop-setup.md)** - GUI tool installation
- **[Testing Guide](./testing-guide.md)** - Unit/integration/E2E test details
- **[Debugging Guide](./debugging.md)** - Comprehensive troubleshooting

---

**Last Updated:** 2025-10-27
