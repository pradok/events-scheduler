# Local Development Guide

This guide covers how to run the Time-Based Event Scheduling System locally using Docker, LocalStack, and the event scheduler Lambda function.

---

## Prerequisites

- Node.js 20.11.0
- Docker Desktop
- npm 10+

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Generate Prisma Client
npm run prisma:generate

# 3. Start Docker services (PostgreSQL + LocalStack)
npm run docker:start

# 4. Run database migrations
npm run prisma:migrate

# 5. Build and deploy scheduler Lambda
npm run lambda:all
```

---

## Docker Services

### Start All Services

```bash
npm run docker:start
```

This starts:
- PostgreSQL 16 (port 5432)
- LocalStack (port 4566)
  - SQS Queue: `events-queue`
  - EventBridge Rule: `event-scheduler-rule`
  - Lambda Function: `event-scheduler`

### Stop All Services

```bash
npm run docker:stop
```

### Reset All Services

```bash
npm run docker:reset
```

Deletes all Docker containers and volumes (clean slate).

### View Logs

```bash
npm run docker:logs
```

---

## Scheduler Lambda Function

### Build Lambda Package

```bash
npm run lambda:build
```

Creates `dist/event-scheduler.zip` with bundled handler code and dependencies.

### Deploy Lambda to LocalStack

```bash
npm run lambda:deploy
```

Deploys the Lambda function to LocalStack with:
- Function name: `event-scheduler`
- Runtime: `nodejs20.x`
- Handler: `schedulerHandler.handler`
- Timeout: 60 seconds
- Memory: 512 MB

### Configure EventBridge Trigger

```bash
npm run lambda:configure
```

Adds the Lambda function as a target for the EventBridge rule (triggers every 1 minute).

### Build, Deploy, and Configure (All-in-One)

```bash
npm run lambda:all
```

Runs all three steps above in sequence.

---

## Testing the Scheduler

### 1. Create Test Events in Database

```bash
# Start Prisma Studio
npm run prisma:studio
```

Navigate to [http://localhost:5555](http://localhost:5555) and manually create test events with:
- `status`: `PENDING`
- `targetTimestampUTC`: Current time or past time
- `userId`: Valid user ID from `users` table

### 2. Manually Trigger Scheduler Lambda

```bash
awslocal lambda invoke \
  --function-name event-scheduler \
  --log-type Tail \
  output.json

# View response
cat output.json
```

### 3. Verify Events Were Claimed

Check that events status changed from `PENDING` to `PROCESSING`:

```bash
# Option 1: Prisma Studio (GUI)
npm run prisma:studio

# Option 2: psql (CLI)
docker exec -it bday-postgres psql -U bday_user -d bday_db
SELECT id, status, "targetTimestampUTC" FROM events;
```

### 4. Verify Messages in SQS Queue

```bash
awslocal sqs receive-message \
  --queue-url http://localhost:4566/000000000000/events-queue \
  --max-number-of-messages 10
```

Expected output: JSON messages with `eventId`, `eventType`, `idempotencyKey`, and `metadata` fields.

---

## Viewing Lambda Logs

### LocalStack Logs (Lambda Execution)

```bash
awslocal logs tail /aws/lambda/event-scheduler --follow
```

### View All Lambda Functions

```bash
awslocal lambda list-functions
```

### View EventBridge Rules

```bash
awslocal events list-rules
```

### View EventBridge Targets

```bash
awslocal events list-targets-by-rule --rule event-scheduler-rule
```

---

## Environment Variables

The following environment variables are required for the Lambda function (configured automatically during deployment):

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://bday_user:local_dev_password@host.docker.internal:5432/bday_db` |
| `SQS_QUEUE_URL` | SQS queue URL for event messages | `http://localhost:4566/000000000000/events-queue` |
| `AWS_ENDPOINT_URL` | LocalStack endpoint (local only) | `http://localhost:4566` |
| `AWS_REGION` | AWS region | `us-east-1` |
| `NODE_ENV` | Node environment | `development` |
| `LOG_LEVEL` | Logging level | `info` |

**Note:** For production, remove `AWS_ENDPOINT_URL` to use real AWS services.

---

## Troubleshooting

### Issue: Lambda function not found

```bash
awslocal lambda list-functions
```

If empty, redeploy:

```bash
npm run lambda:deploy
```

### Issue: EventBridge not triggering Lambda

Check that Lambda is added as a target:

```bash
awslocal events list-targets-by-rule --rule event-scheduler-rule
```

If empty, run:

```bash
npm run lambda:configure
```

### Issue: Database connection error in Lambda

Lambda runs inside Docker and must use `host.docker.internal` instead of `localhost`:

```bash
# Verify DATABASE_URL in Lambda environment
awslocal lambda get-function-configuration --function-name event-scheduler
```

Expected: `postgresql://bday_user:local_dev_password@host.docker.internal:5432/bday_db`

### Issue: SQS queue not receiving messages

1. Verify queue exists:

```bash
awslocal sqs list-queues
```

2. Check Lambda logs for errors:

```bash
awslocal logs tail /aws/lambda/event-scheduler --follow
```

3. Manually invoke Lambda and check output:

```bash
awslocal lambda invoke --function-name event-scheduler output.json
cat output.json
```

---

## Development Workflow

### Typical Development Cycle

1. **Make code changes** to `src/adapters/primary/lambda/schedulerHandler.ts`
2. **Run tests**: `npm test`
3. **Rebuild Lambda**: `npm run lambda:build`
4. **Redeploy Lambda**: `npm run lambda:deploy`
5. **Test manually**: `awslocal lambda invoke --function-name event-scheduler output.json`
6. **View logs**: `awslocal logs tail /aws/lambda/event-scheduler`

### Testing Automatic Trigger (Every 1 Minute)

After configuring EventBridge, the scheduler Lambda will automatically run every minute. Monitor logs:

```bash
awslocal logs tail /aws/lambda/event-scheduler --follow
```

You should see logs every minute:
```json
{
  "msg": "Scheduler Lambda execution started",
  "eventBridgeRuleName": "arn:aws:events:us-east-1:000000000000:rule/event-scheduler-rule",
  "eventTime": "2025-10-24T10:00:00Z"
}
```

---

## AWS CLI Commands (LocalStack)

All `aws` commands use `awslocal` alias for LocalStack:

### SQS

```bash
# List queues
awslocal sqs list-queues

# Receive messages
awslocal sqs receive-message --queue-url <queue-url> --max-number-of-messages 10

# Purge queue
awslocal sqs purge-queue --queue-url <queue-url>
```

### Lambda

```bash
# List functions
awslocal lambda list-functions

# Invoke function
awslocal lambda invoke --function-name event-scheduler output.json

# Get function logs
awslocal logs tail /aws/lambda/event-scheduler

# Delete function
awslocal lambda delete-function --function-name event-scheduler
```

### EventBridge

```bash
# List rules
awslocal events list-rules

# List targets for rule
awslocal events list-targets-by-rule --rule event-scheduler-rule

# Enable rule
awslocal events enable-rule --name event-scheduler-rule

# Disable rule
awslocal events disable-rule --name event-scheduler-rule
```

---

## Next Steps

- **Story 2.4**: Implement Webhook Delivery Adapter
- **Story 2.5**: Implement Event Executor Use Case
- **Story 2.6**: Implement Worker Lambda (SQS Consumer)

---

## References

- [Architecture Documentation](./architecture.md)
- [Story 2.3: EventBridge Scheduler Trigger](./stories/2.3.eventbridge-scheduler-trigger.story.md)
- [Tech Stack](./architecture/tech-stack.md)
- [LocalStack Documentation](https://docs.localstack.cloud/)
