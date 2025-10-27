# Local Development Guide

**Complete guide for running and developing the Time-Based Event Scheduling System locally**

For a quick 5-minute setup, see [Getting Started](./getting-started.md).

---

## Overview

This guide covers:
- Complete local setup workflow (Docker + API + Lambdas)
- Docker environment (PostgreSQL + LocalStack)
- User API server (Fastify)
- Database management (Prisma migrations, seeding)
- Lambda functions (build, deploy, test)
- NPM scripts reference
- Development workflows

---

## Complete Local Setup Workflow

This section shows how to run the **complete system** locally including Docker, database, API server, and Lambda functions.

### 1. Start Docker Services

```bash
npm run docker:start
```

**Starts:**
- PostgreSQL (port 5432) - Database
- LocalStack (port 4566) - AWS service emulation

**Wait:** ~15 seconds for health checks to pass.

### 2. Run Database Migrations

```bash
npm run prisma:migrate
```

**Creates:** Database tables (users, events) and applies schema.

### 3. Verify LocalStack Resources

```bash
npm run docker:verify
```

**Checks:** SQS queues, IAM roles, EventBridge rules all created.

### 4. Start User API Server (Optional)

```bash
npm run dev
```

**Starts:** Fastify API server on http://localhost:3000 with hot-reload.

**Endpoints:**
- `GET  http://localhost:3000/health` - Health check
- `GET  http://localhost:3000/user/:id` - Get user
- `PUT  http://localhost:3000/user/:id` - Update user
- `DELETE http://localhost:3000/user/:id` - Delete user

**Note:** Press `Ctrl+C` to stop the server.

### 5. Deploy Lambda Functions (Optional)

```bash
npm run lambda:all
```

**Deploys:**
- `event-scheduler` - Triggered by EventBridge every 1 minute
- `event-worker` - Triggered by SQS messages

**Note:** This is optional for local development but required for E2E testing.

### 6. Open Database UI (Optional)

```bash
npm run prisma:studio
```

**Opens:** Prisma Studio at http://localhost:5555 for visual database inspection.

### Complete Setup Summary

After running steps 1-6, you'll have:

| Component | Status | Endpoint/Port |
|-----------|--------|---------------|
| PostgreSQL | ✅ Running | localhost:5432 |
| LocalStack | ✅ Running | http://localhost:4566 |
| User API | ✅ Running (if started) | http://localhost:3000 |
| Lambdas | ✅ Deployed (if deployed) | Inside LocalStack |
| Prisma Studio | ✅ Running (if opened) | http://localhost:5555 |

### Quick Start for Daily Development

**Most common workflow:**

```bash
# Morning - start everything
npm run docker:start       # Start infrastructure
npm run dev                # Start API server (in new terminal)

# Development work...
# - Edit code (tsx watches and hot-reloads)
# - Test via Postman/curl at http://localhost:3000
# - View database via npm run prisma:studio

# Evening - stop everything
Ctrl+C                     # Stop API server
npm run docker:stop        # Stop Docker services
```

---

## Docker Services

### Services Overview

The local environment runs two Docker containers:

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| **PostgreSQL** | `postgres:16.1` | 5432 | Database for users and events |
| **LocalStack** | `localstack/localstack:3.1.0` | 4566 | AWS service emulation (SQS, Lambda, EventBridge) |

### Start Services

```bash
npm run docker:start
```

**What it does:**

- Starts PostgreSQL and LocalStack containers
- Runs LocalStack init script to create AWS resources
- Waits for health checks to pass

**Verify services running:**

```bash
docker ps
```

Expected output:

```
CONTAINER ID   IMAGE                        STATUS         PORTS
abc123         postgres:16.1                Up 10 seconds  0.0.0.0:5432->5432/tcp
def456         localstack/localstack:3.1.0  Up 10 seconds  0.0.0.0:4566->4566/tcp
```

### Stop Services

```bash
npm run docker:stop
```

**What it does:**

- Stops containers
- **Keeps data volumes** (PostgreSQL data, LocalStack state)
- Next `docker:start` will be faster

### Reset Services (Clean Slate)

```bash
npm run docker:reset
```

**What it does:**

- Stops all containers
- **Deletes all volumes** (database data, LocalStack state)
- Restarts containers from scratch
- Runs init scripts again

**Use when:** Starting fresh before tests, recovering from broken state

### View Logs

```bash
npm run docker:logs
```

**What it shows:**

- LocalStack initialization logs
- Resource creation messages
- Any errors

Press `Ctrl+C` to stop following logs.

### Verify LocalStack Resources

```bash
npm run docker:verify
```

**What it checks:**

- LocalStack health endpoint
- SQS queues exist (bday-events-queue, bday-events-dlq)
- DLQ redrive policy configured
- IAM role exists
- EventBridge rule exists and enabled
- CloudWatch Logs service ready

**Expected output:**

```
✅ All checks passed!

LocalStack is ready for E2E testing.
```

---

## Database Management

### PostgreSQL Configuration

**Connection Details:**

```bash
Host:     localhost
Port:     5432
Database: bday_db
User:     bday_user
Password: local_dev_password  (from docker-compose.yml)
```

**Connection String:**

```
postgresql://bday_user:local_dev_password@localhost:5432/bday_db
```

### Prisma Commands

#### Generate Prisma Client

```bash
npm run prisma:generate
```

**When to run:**

- After pulling new code that changed `schema.prisma`
- After modifying `schema.prisma` yourself

**What it does:** Generates TypeScript types and Prisma Client from schema

#### Run Migrations

```bash
npm run prisma:migrate
```

**When to run:**

- First time setup
- After pulling new migrations
- After creating new migrations

**What it does:**

- Applies pending migrations to database
- Creates `users` and `events` tables with proper schema

#### Create New Migration

```bash
npm run prisma:migrate -- --name add_user_email
```

**What it does:**

- Compares current schema to database
- Generates migration SQL file
- Applies migration

#### Open Prisma Studio (Database GUI)

```bash
npm run prisma:studio
```

Opens at: http://localhost:5555

**Use for:**

- Viewing database records
- Manually creating test data
- Debugging data issues

#### Seed Database (Optional)

```bash
npm run db:seed
```

**What it does:** Populates database with test data (if `prisma/seed.ts` exists)

#### Reset Database

```bash
npm run db:reset
```

**What it does:**

- Drops all tables
- Runs all migrations from scratch
- Runs seed script (if configured)

**WARNING:** Deletes all data!

---

## User API Server

### Overview

The User API provides HTTP REST endpoints for managing users. It runs as a **Fastify server** (not Lambda) for fast local development with hot-reload.

**Architecture:**
- **Local Development:** Fastify server (this section)
- **Production:** Can be deployed as Lambda, ECS, or PaaS (decision TBD)

### Start API Server

```bash
npm run dev
```

**What it does:**
- Starts Fastify server on http://localhost:3000
- Watches for code changes and auto-reloads (hot-reload)
- Logs all requests with Pino logger

**Requires:** PostgreSQL running (`npm run docker:start`)

### API Endpoints

#### Health Check

```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-27T00:00:00.000Z"
}
```

#### Get User

```bash
curl http://localhost:3000/user/{userId}
```

**Response (200):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "firstName": "John",
  "lastName": "Doe",
  "dateOfBirth": "1990-05-15",
  "timezone": "America/New_York",
  "createdAt": "2025-01-01T10:00:00.000Z",
  "updatedAt": "2025-01-01T10:00:00.000Z"
}
```

**Error (404):**
```json
{
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User not found: {userId}"
  }
}
```

#### Update User

```bash
curl -X PUT http://localhost:3000/user/{userId} \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jane",
    "dateOfBirth": "1992-06-20",
    "timezone": "Europe/London"
  }'
```

**Request Body (all fields optional):**
```json
{
  "firstName": "string",
  "lastName": "string",
  "dateOfBirth": "YYYY-MM-DD",
  "timezone": "IANA timezone"
}
```

**Business Logic:**
- If `dateOfBirth` changed: Reschedules PENDING birthday events
- If `timezone` changed: Recalculates PENDING event times

**Response (200):** Updated user object

#### Delete User

```bash
curl -X DELETE http://localhost:3000/user/{userId}
```

**What it does:**
- Deletes user
- Cascade deletes all associated events (transaction)

**Response (204):** No content (success)

### Testing with Postman/Insomnia

1. Import endpoints:
   - Base URL: `http://localhost:3000`
   - Health: `GET /health`
   - Get User: `GET /user/:id`
   - Update User: `PUT /user/:id`
   - Delete User: `DELETE /user/:id`

2. Create test user via Prisma Studio
3. Test endpoints with user ID

### Hot-Reload Development

The server uses `tsx watch` for automatic code reloading:

1. Start server: `npm run dev`
2. Edit code in `src/`
3. Save file → Server auto-restarts
4. Test changes immediately

**Files watched:**
- `src/adapters/primary/http/` (routes, server)
- `src/modules/user/` (use cases, domain)
- `src/shared/` (validation, events)

### Stop API Server

Press `Ctrl+C` in the terminal running `npm run dev`

### Production Build

```bash
npm run build:server   # Build to dist/server.js
npm start              # Run production server
```

**Note:** Production deployment strategy TBD (Lambda vs ECS vs PaaS)

---

## Lambda Functions

### Overview

The system uses two Lambda functions:

1. **event-scheduler** - Polls database for ready events, sends to SQS
2. **event-worker** - Consumes SQS messages, delivers webhooks

### Build Lambda Package

```bash
npm run lambda:build
```

**What it does:**

- Bundles Lambda handler code with esbuild
- Creates deployment package: `dist/event-scheduler.zip`

**Location:** `scripts/lambda-build.sh`

### Deploy Lambda to LocalStack

```bash
npm run lambda:deploy:localstack
```

**What it does:**

- Deploys Lambda function to LocalStack
- Function name: `event-scheduler`
- Runtime: `nodejs20.x`
- Timeout: 60 seconds
- Memory: 512 MB
- Sets environment variables (DATABASE_URL, SQS_QUEUE_URL)

**Location:** `scripts/deploy-lambda.js`

### Build + Deploy (All-in-One)

```bash
npm run lambda:all
```

**Runs:**

1. `lambda:build` - Build package
2. `lambda:deploy:localstack` - Deploy to LocalStack

**Use for:** Quick redeploy after code changes

### Manually Invoke Lambda

```bash
docker exec bday-localstack sh -c "awslocal lambda invoke \
  --function-name event-scheduler \
  --log-type Tail \
  output.json && cat output.json"
```

**Expected output:**

```json
{
  "statusCode": 200,
  "body": {
    "message": "Scheduler executed successfully",
    "eventsClaimed": 0
  }
}
```

### View Lambda Logs

```bash
docker exec bday-localstack sh -c "awslocal logs tail /aws/lambda/event-scheduler --follow"
```

---

## Environment Variables

### Local Development (.env)

```bash
# Database
DATABASE_URL="postgresql://bday_user:local_dev_password@localhost:5432/bday_db"

# LocalStack (for local development)
AWS_ENDPOINT_URL=http://localhost:4566
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test

# SQS
SQS_QUEUE_URL=http://localhost:4566/000000000000/bday-events-queue
SQS_DLQ_URL=http://localhost:4566/000000000000/bday-events-dlq

# Application
NODE_ENV=development
LOG_LEVEL=info
```

### Lambda Environment Variables

When Lambda runs inside LocalStack/Docker, it needs special configuration:

**DATABASE_URL for Lambda:**

```bash
postgresql://bday_user:local_dev_password@host.docker.internal:5432/bday_db
```

**Why `host.docker.internal`?**

- Lambda runs inside Docker container
- `localhost` refers to the container itself, not your Mac
- `host.docker.internal` is Docker's special DNS name for host machine

---

## Development Workflows

### Typical Development Cycle

1. **Make code changes** to Lambda handler or domain logic
2. **Run unit tests:** `npm run test:unit`
3. **Rebuild Lambda:** `npm run lambda:build`
4. **Redeploy Lambda:** `npm run lambda:deploy:localstack`
5. **Test manually:** Invoke Lambda or check EventBridge trigger
6. **View logs:** `docker exec bday-localstack sh -c "awslocal logs tail /aws/lambda/event-scheduler"`

### Testing Scheduler Locally

#### 1. Create Test Events

```bash
# Open Prisma Studio
npm run prisma:studio
```

Navigate to http://localhost:5555 and create events with:

- `status`: `PENDING`
- `targetTimestampUTC`: Current time or past time
- `userId`: Valid user ID

#### 2. Invoke Scheduler

```bash
docker exec bday-localstack sh -c "awslocal lambda invoke \
  --function-name event-scheduler \
  output.json && cat output.json"
```

#### 3. Verify Events Claimed

Check event status changed from `PENDING` to `PROCESSING`:

```bash
# Option 1: Prisma Studio
npm run prisma:studio

# Option 2: psql
docker exec -it bday-postgres psql -U bday_user -d bday_db
SELECT id, status, "targetTimestampUTC" FROM events;
```

#### 4. Verify SQS Messages

```bash
docker exec bday-localstack sh -c "awslocal sqs receive-message \
  --queue-url http://localhost:4566/000000000000/bday-events-queue \
  --max-number-of-messages 10"
```

Expected: JSON messages with `eventId`, `eventType`, `idempotencyKey`

### Automatic Trigger (EventBridge)

After deploying Lambda, EventBridge will automatically trigger it every 1 minute.

**Monitor automatic execution:**

```bash
docker exec bday-localstack sh -c "awslocal logs tail /aws/lambda/event-scheduler --follow"
```

You should see logs every minute:

```json
{
  "msg": "Scheduler Lambda execution started",
  "eventBridgeRuleName": "arn:aws:events:us-east-1:000000000000:rule/event-scheduler-rule"
}
```

---

## NPM Scripts Reference

### API Server Commands

```bash
npm run dev                 # Start User API with hot-reload (port 3000)
npm start                   # Start User API in production mode
npm run build:server        # Build User API for production
```

### Docker Commands

```bash
npm run docker:start        # Start PostgreSQL + LocalStack
npm run docker:stop         # Stop containers (keep data)
npm run docker:reset        # Delete everything and restart fresh
npm run docker:logs         # View LocalStack logs
npm run docker:verify       # Verify LocalStack resources
npm run docker:teardown     # Stop and remove containers + volumes
```

### Database Commands

```bash
npm run prisma:generate     # Generate Prisma Client
npm run prisma:migrate      # Run migrations
npm run prisma:studio       # Open database GUI (port 5555)
npm run db:seed             # Seed test data
npm run db:reset            # Drop all tables and re-migrate
```

### Lambda Commands

```bash
npm run lambda:build                # Build Lambda package
npm run lambda:deploy:localstack    # Deploy to LocalStack
npm run lambda:all                  # Build + Deploy
```

### Testing Commands

```bash
npm run test                # Run all tests
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests (real database)
npm run test:e2e            # End-to-end tests (LocalStack + database)
npm run test:coverage       # Generate coverage report
```

### Code Quality Commands

```bash
npm run lint                # Check code style
npm run typecheck           # TypeScript type checking
npm run format              # Auto-format code
```

### Utility Commands

```bash
npm run webhook:mock        # Start mock webhook server for testing
```

---

## AWS CLI Commands (LocalStack)

**Note:** These commands run inside the LocalStack container using `docker exec`.

### SQS Commands

```bash
# List queues
docker exec bday-localstack sh -c "awslocal sqs list-queues"

# Receive messages
docker exec bday-localstack sh -c "awslocal sqs receive-message \
  --queue-url http://localhost:4566/000000000000/bday-events-queue \
  --max-number-of-messages 10"

# Purge queue (delete all messages)
docker exec bday-localstack sh -c "awslocal sqs purge-queue \
  --queue-url http://localhost:4566/000000000000/bday-events-queue"
```

### Lambda Commands

```bash
# List functions
docker exec bday-localstack sh -c "awslocal lambda list-functions"

# Invoke function
docker exec bday-localstack sh -c "awslocal lambda invoke \
  --function-name event-scheduler \
  output.json && cat output.json"

# Get function configuration
docker exec bday-localstack sh -c "awslocal lambda get-function-configuration \
  --function-name event-scheduler"

# Delete function
docker exec bday-localstack sh -c "awslocal lambda delete-function \
  --function-name event-scheduler"
```

### EventBridge Commands

```bash
# List rules
docker exec bday-localstack sh -c "awslocal events list-rules"

# List targets for rule
docker exec bday-localstack sh -c "awslocal events list-targets-by-rule \
  --rule event-scheduler-rule"

# Disable rule (stop automatic triggers)
docker exec bday-localstack sh -c "awslocal events disable-rule \
  --name event-scheduler-rule"

# Enable rule (resume automatic triggers)
docker exec bday-localstack sh -c "awslocal events enable-rule \
  --name event-scheduler-rule"
```

### CloudWatch Logs Commands

```bash
# List log groups
docker exec bday-localstack sh -c "awslocal logs describe-log-groups"

# Tail Lambda logs (follow mode)
docker exec bday-localstack sh -c "awslocal logs tail /aws/lambda/event-scheduler --follow"

# Get recent logs
docker exec bday-localstack sh -c "awslocal logs tail /aws/lambda/event-scheduler --since 10m"
```

---

## Common Issues

### Docker services won't start

```bash
# Check Docker Desktop is running
docker ps

# If error, start Docker Desktop and retry
npm run docker:start
```

### Port already in use (5432 or 4566)

```bash
# Find what's using the port
lsof -i :5432
lsof -i :4566

# Kill the process or change ports in docker-compose.yml
```

### Lambda function not found

```bash
# List functions
docker exec bday-localstack sh -c "awslocal lambda list-functions"

# If empty, redeploy
npm run lambda:all
```

### Database connection error in Lambda

Lambda must use `host.docker.internal` instead of `localhost`.

**Verify DATABASE_URL:**

```bash
docker exec bday-localstack sh -c "awslocal lambda get-function-configuration \
  --function-name event-scheduler" | grep DATABASE_URL
```

Expected: `postgresql://bday_user:local_dev_password@host.docker.internal:5432/bday_db`

### Prisma Client out of sync

```bash
# Regenerate Prisma Client
npm run prisma:generate

# If still errors, delete and regenerate
rm -rf node_modules/.prisma
npm run prisma:generate
```

**More troubleshooting:** See [Debugging Guide](./debugging.md)

---

## Next Steps

- **Run Tests:** See [Testing Guide](./testing-guide.md)
- **Setup LocalStack:** See [LocalStack Setup](./localstack-setup-community.md)
- **LocalStack Desktop:** See [LocalStack Desktop Setup Guide](./localstack-desktop-setup.md) (Recommended GUI tool)
- **Troubleshooting:** See [Debugging Guide](./debugging.md)
- **Architecture:** See [Architecture Documentation](./architecture.md)

---

## References

- [Architecture Documentation](./architecture.md)
- [Tech Stack](./architecture/tech-stack.md)
- [LocalStack Documentation](https://docs.localstack.cloud/)
- [Prisma Documentation](https://www.prisma.io/docs/)
