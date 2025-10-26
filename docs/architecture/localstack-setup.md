# LocalStack Setup and Debugging Guide

## Overview

LocalStack simulates AWS services for local development and testing, enabling developers to build and test cloud applications without deploying to real AWS infrastructure.

**Version:** LocalStack 3.1.0

**Services Used:**

- **SQS** (Simple Queue Service) - Message queue for event buffering
- **Lambda** - Compute for scheduler and worker functions
- **EventBridge** - Scheduled triggers (cron-like scheduling)
- **IAM** - Roles and permissions (minimal in LocalStack)

**Architecture:** See [Event Scheduling Lambda Architecture](./infrastructure.md#event-scheduling-lambda-architecture) for detailed explanation of the two-Lambda producer-consumer pattern.

## Dual-Purpose LocalStack Pattern

LocalStack supports **two distinct usage patterns simultaneously** without interference:

### Pattern 1: Persistent Infrastructure (Manual E2E / Demos)

**Purpose:** Manual testing, stakeholder demos, debugging production-like issues

**Resources:**
- **Queues:** `events-queue`, `events-dlq` (persistent, shared)
- **Lambda:** `event-scheduler` (deployed via deploy-lambda.js, reusable)
- **EventBridge:** Triggers Lambda every 1 minute automatically
- **Created by:** `docker/localstack/init-aws.sh` (runs on container startup)

**Workflow:**
1. `docker-compose up` → LocalStack starts, runs init-aws.sh
2. `npm run lambda:build` → Build Lambda package
3. `npm run lambda:deploy:localstack` → Deploy Lambda to persistent infrastructure
4. Lambda executes automatically via EventBridge or manual invocation
5. Real-world simulation with actual AWS services

**Use Cases:**
- Manual end-to-end testing
- Demonstrating features to stakeholders
- Debugging production-like issues
- Validating EventBridge scheduling behavior

### Pattern 2: Ephemeral Test Resources (Automated Tests)

**Purpose:** CI/CD, developer TDD workflow, regression testing

**Resources:**
- **Queues:** `test-queue-${Date.now()}` (unique per test, auto-deleted)
- **Lambda:** Shared or mocked (tests don't deploy Lambdas)
- **Database:** Testcontainers PostgreSQL (isolated per test)
- **Created by:** Integration tests using AWS SDK in `beforeEach` hooks

**Workflow:**
1. Test starts → Creates unique queue via `CreateQueueCommand`
2. Test executes → Uses isolated resources
3. Test ends → Deletes queue via `DeleteQueueCommand` (afterEach)
4. Fast, isolated, no shared state

**Use Cases:**
- Automated integration tests
- CI/CD pipelines
- Developer TDD workflow
- Regression testing

### Key Principle: No Interference

- Automated tests **ignore** persistent infrastructure (create their own queues)
- Manual E2E **ignores** test resources (uses `events-queue`)
- Both can run simultaneously without conflicts
- This is **intentional design**, not a problem to fix

## Resource Creation Responsibilities

### Static Infrastructure (`docker/localstack/init-aws.sh`)

**Purpose:** Resources that persist across Lambda deployments

**Creates:**
- SQS queue: `events-queue` (VisibilityTimeout: 30s, MessageRetention: 24 hours)
- SQS Dead Letter Queue: `events-dlq` (MessageRetention: 14 days)
- EventBridge rule: `event-scheduler-rule` (rate: 1 minute, state: ENABLED)
- IAM role: `lambda-execution-role` (basic Lambda execution permissions)

**Execution:** Automatically when LocalStack container starts

**When to Modify:**
- Adding new persistent queues for additional event types
- Changing EventBridge schedule expression
- Modifying queue attributes (visibility timeout, retention period)

### Dynamic Resources (`scripts/deploy-lambda.js`)

**Purpose:** Resources that change during development

**Creates/Updates:**
- Lambda function: `event-scheduler` (creates/deletes/updates)
- EventBridge target configuration (connects rule to Lambda)
- Lambda permissions (grants EventBridge permission to invoke)

**Execution:** Manual via `npm run lambda:deploy:localstack`

**When to Modify:**
- Deploying new Lambda code
- Changing Lambda configuration (timeout, memory, environment variables)
- Updating EventBridge target mappings

### Test Resources (Integration Tests)

**Purpose:** Isolated, ephemeral resources for test execution

**Creates:**
- Unique SQS queues: `test-queue-${Date.now()}`
- Temporary test data in PostgreSQL (via Testcontainers)

**Execution:** Automatically in `beforeEach` hooks

**Cleanup:** Automatically in `afterEach` hooks

**Example Pattern:**

```typescript
beforeEach(async () => {
  // Create unique test queue
  const createQueueResponse = await sqsClient.send(
    new CreateQueueCommand({
      QueueName: `test-queue-${Date.now()}`,
      Attributes: {
        VisibilityTimeout: '30',
        MessageRetentionPeriod: '300', // 5 minutes for testing
      },
    })
  );
  testQueueUrl = createQueueResponse.QueueUrl!;
});

afterEach(async () => {
  // Clean up: Delete test queue
  await sqsClient.send(
    new DeleteQueueCommand({ QueueUrl: testQueueUrl })
  );
});
```

## Queue Naming Conventions

### Standard Queue Name: `events-queue`

**Rationale:**
- Generic name supports multiple event types (birthday, anniversary, reminder)
- Matches existing init-aws.sh configuration
- Simpler than `bday-events-queue` (overly specific)

**Usage:**
- Created by `init-aws.sh`
- Referenced by `deploy-lambda.js` when getting queue URL
- Used by deployed Lambda functions via `SQS_QUEUE_URL` environment variable

### Test Queue Naming: `test-queue-${Date.now()}`

**Rationale:**
- Unique timestamp ensures no collisions between concurrent test runs
- Clear prefix identifies test resources
- Easy cleanup in `afterEach` hooks

**Usage:**
- Created by integration tests in `beforeEach`
- Deleted by integration tests in `afterEach`
- Never referenced by production code

## Service Endpoints and Configuration

### LocalStack Endpoint

**URL:** `http://localhost:4566`

**Health Check:**
```bash
curl -s http://localhost:4566/_localstack/health | python3 -m json.tool
```

**Expected Response:**
```json
{
  "services": {
    "sqs": "running",
    "lambda": "running",
    "events": "running",
    "iam": "available"
  }
}
```

### AWS SDK v3 Configuration

**Client Setup:**

```javascript
const { SQSClient } = require('@aws-sdk/client-sqs');

const sqsClient = new SQSClient({
  region: 'us-east-1',
  endpoint: 'http://localhost:4566',
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  },
});
```

**Benefits:**
- Modular imports (smaller bundle size)
- Modern async/await API
- Better TypeScript support
- Consistent with production AWS SDK usage

## Setup Workflow

### Initial Setup (One-Time)

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Start Docker Environment:**
   ```bash
   docker-compose up
   ```

   This will:
   - Start LocalStack container
   - Start PostgreSQL container
   - Run `init-aws.sh` to create static infrastructure

3. **Verify LocalStack Health:**
   ```bash
   curl -s http://localhost:4566/_localstack/health
   ```

### Lambda Deployment Workflow

1. **Build Lambda Package:**
   ```bash
   npm run lambda:build
   ```

   Creates `dist/event-scheduler.zip` containing Lambda code

2. **Deploy Lambda to LocalStack:**
   ```bash
   npm run lambda:deploy:localstack
   ```

   This will:
   - Verify queue exists (fail fast if not)
   - Delete existing Lambda (if exists)
   - Create new Lambda function
   - Configure EventBridge target
   - Grant EventBridge permissions

3. **Verify Deployment:**
   ```bash
   # List Lambda functions
   awslocal lambda list-functions

   # List EventBridge rules
   awslocal events list-rules

   # Check EventBridge targets
   awslocal events list-targets-by-rule --rule event-scheduler-rule
   ```

### Combined Workflow (Build + Deploy)

```bash
npm run lambda:all
```

Executes: `npm run lambda:build && npm run lambda:deploy:localstack`

## Separation of Concerns

### Why Separate Static Infrastructure from Lambda Deployment?

**Benefits:**

1. **Faster Redeployment:** No need to recreate queues/rules when updating Lambda code
2. **Clearer Responsibilities:** Infrastructure vs application logic separation
3. **Easier Troubleshooting:** Know where to look when something fails
4. **Test Isolation:** Tests remain isolated from shared infrastructure
5. **Production Alignment:** Mirrors real AWS deployment patterns

**Static Infrastructure Changes Rarely:**
- Queue configurations are stable
- EventBridge schedules change infrequently
- IAM roles persist across deployments

**Dynamic Resources Change Frequently:**
- Lambda code updates multiple times per day
- Environment variables change during development
- Lambda configuration tuning (timeout, memory)

### Example Development Cycle

**Typical Developer Workflow:**

```bash
# One-time setup (or after docker reset)
docker-compose up
npm run lambda:build
npm run lambda:deploy:localstack

# Daily development cycle
# 1. Make code changes to Lambda handler
# 2. Rebuild and redeploy Lambda
npm run lambda:all

# 3. Test changes (infrastructure still running)
npm test

# 4. Repeat steps 1-3
```

**Infrastructure changes are rare:**
- Queue attributes rarely change
- EventBridge schedule is stable
- IAM roles are minimal in LocalStack

## Testing Considerations

### Integration Test Isolation

**Speed vs Isolation Trade-offs:**

| Resource | Creation Time | Pattern |
|----------|---------------|---------|
| SQS Queue | ~1-1.5s | Create per test (acceptable overhead) |
| Lambda Function | ~4-7s | Share deployed Lambda (too slow per test) |
| PostgreSQL | ~5-10s | Testcontainers (isolated database per test suite) |

**Best Practices:**

1. **Create unique queues per test** for full isolation
2. **Share deployed Lambda** across tests (too slow to create per test)
3. **Use Testcontainers for PostgreSQL** (database isolation)
4. **Clean up resources in `afterEach`** to prevent leaks
5. **Use timestamp-based naming** to avoid collisions

### Test Execution

**Run All Tests:**
```bash
npm test
```

**Run Specific Integration Test:**
```bash
npm test SQSAdapter.integration.test.ts
```

**Run Tests with LocalStack Logs:**
```bash
# Terminal 1: Watch LocalStack logs
docker logs -f localstack

# Terminal 2: Run tests
npm test
```

## AWS CLI Commands (via awslocal)

**IMPORTANT:** The `awslocal` CLI is installed **inside the LocalStack container**, not on your host machine. All commands below must be run using `docker exec`:

```bash
docker exec bday-localstack awslocal <command>
```

### SQS Commands

```bash
# List all queues
docker exec bday-localstack awslocal sqs list-queues

# Get queue URL
docker exec bday-localstack awslocal sqs get-queue-url --queue-name events-queue

# Get queue attributes
docker exec bday-localstack awslocal sqs get-queue-attributes \
  --queue-url http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/events-queue \
  --attribute-names All

# Send test message
docker exec bday-localstack awslocal sqs send-message \
  --queue-url http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/events-queue \
  --message-body '{"eventId":"123","eventType":"BIRTHDAY","idempotencyKey":"test-key"}'

# Receive messages (long polling)
docker exec bday-localstack awslocal sqs receive-message \
  --queue-url http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/events-queue \
  --max-number-of-messages 10 \
  --wait-time-seconds 5

# Purge queue (delete all messages)
docker exec bday-localstack awslocal sqs purge-queue \
  --queue-url http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/events-queue
```

### Lambda Commands

```bash
# List Lambda functions
docker exec bday-localstack awslocal lambda list-functions

# List with formatted output
docker exec bday-localstack awslocal lambda list-functions \
  --query 'Functions[*].[FunctionName,Runtime,Handler]' \
  --output table

# Get Lambda configuration
docker exec bday-localstack awslocal lambda get-function-configuration \
  --function-name event-scheduler

# Invoke Lambda manually (returns immediately)
docker exec bday-localstack awslocal lambda invoke \
  --function-name event-scheduler \
  --payload '{}' \
  /tmp/response.json && docker exec bday-localstack cat /tmp/response.json

# View Lambda logs (LocalStack container logs)
docker logs bday-localstack --tail 100 | grep event-scheduler
```

### EventBridge Commands

```bash
# List EventBridge rules
docker exec bday-localstack awslocal events list-rules

# List with formatted output
docker exec bday-localstack awslocal events list-rules \
  --query 'Rules[*].[Name,State,ScheduleExpression]' \
  --output table

# Describe specific rule
docker exec bday-localstack awslocal events describe-rule \
  --name event-scheduler-rule

# List targets for rule
docker exec bday-localstack awslocal events list-targets-by-rule \
  --rule event-scheduler-rule

# Enable/disable rule
docker exec bday-localstack awslocal events enable-rule --name event-scheduler-rule
docker exec bday-localstack awslocal events disable-rule --name event-scheduler-rule
```

### IAM Commands

```bash
# List IAM roles
docker exec bday-localstack awslocal iam list-roles

# Get role details
docker exec bday-localstack awslocal iam get-role --role-name lambda-execution-role
```

## Environment Variables

### Lambda Environment Variables (via deploy-lambda.js)

```javascript
Environment: {
  Variables: {
    // Lambda runs in Docker, must use host.docker.internal to access host PostgreSQL
    DATABASE_URL: 'postgresql://bday_user:local_dev_password@host.docker.internal:5432/bday_db',

    // Use dynamically fetched queue URL
    SQS_QUEUE_URL: queueUrl,

    // LocalStack endpoint (from inside Lambda container)
    AWS_ENDPOINT_URL: 'http://localstack:4566',

    // AWS region
    AWS_REGION: 'us-east-1',

    // Production mode to avoid pino-pretty
    NODE_ENV: 'production',

    // Logging level
    LOG_LEVEL: 'info',
  },
}
```

### Integration Test Environment Variables

```typescript
// AWS SDK v3 respects AWS_ENDPOINT_URL
process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';

const sqsClient = new SQSClient({
  region: 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:4566',
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  },
});
```

## Common Patterns

### Error Handling: Queue Not Found

**In deploy-lambda.js:**

```javascript
try {
  const getQueueResponse = await sqsClient.send(
    new GetQueueUrlCommand({ QueueName: 'events-queue' })
  );
  queueUrl = getQueueResponse.QueueUrl;
  console.log(`✓ Using existing queue: ${queueUrl}`);
} catch (error) {
  console.error('❌ Queue not found. Ensure LocalStack and queues are created via docker-compose.');
  process.exit(1);
}
```

**Benefits:**
- Fails fast if init-aws.sh didn't run
- Provides clear error message to developer
- Prevents confusing downstream errors

### Lambda Redeployment Pattern

**In deploy-lambda.js:**

```javascript
// Delete existing Lambda (if exists)
try {
  await lambdaClient.send(new DeleteFunctionCommand({ FunctionName: 'event-scheduler' }));
  console.log('✓ Existing Lambda deleted');
  await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for deletion
} catch (error) {
  console.log('✓ No existing Lambda to delete');
}

// Create new Lambda
await lambdaClient.send(new CreateFunctionCommand({ ... }));
```

**Benefits:**
- Clean slate for each deployment
- Avoids "function already exists" errors
- Ensures latest code is deployed

## References

- [LocalStack Documentation](https://docs.localstack.cloud/)
- [AWS SDK v3 Documentation](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
- [Source: docker/localstack/init-aws.sh](../../docker/localstack/init-aws.sh)
- [Source: scripts/deploy-lambda.js](../../scripts/deploy-lambda.js)
- [Source: src/adapters/secondary/messaging/SQSAdapter.integration.test.ts](../../src/adapters/secondary/messaging/SQSAdapter.integration.test.ts)
- [LocalStack Troubleshooting Guide](./localstack-troubleshooting.md)
