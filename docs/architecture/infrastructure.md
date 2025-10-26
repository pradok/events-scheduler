# Infrastructure and Deployment

Complete infrastructure setup, deployment strategies, and CI/CD pipeline configuration for the Time-Based Event Scheduling System.

Reference: [Full Architecture Document](../architecture.md)

---

## Infrastructure as Code

### Tool
AWS CDK 2.122.0

### Location
All infrastructure code is located in the `infrastructure/` directory.

### Approach
TypeScript-based infrastructure definitions with separate stacks for:
- Database stack (RDS PostgreSQL)
- API stack (API Gateway + Lambda)
- Scheduler stack (EventBridge + Lambda)
- Queue stack (SQS + DLQ)
- Monitoring stack (CloudWatch Alarms + Dashboards)

This modular approach allows independent deployment and scaling of different components.

---

## Deployment Strategy

### Strategy
- **Phase 1**: Rolling updates for local development (Docker Compose)
- **Phase 2+**: Blue-Green deployment for Lambda functions in AWS
  - Zero downtime deployments
  - Automatic rollback on errors
  - Traffic shifting with canary deployments

### CI/CD Platform
GitHub Actions

### Pipeline Configuration
- **CI Pipeline**: `.github/workflows/ci.yml`
- **Deployment Pipeline**: `.github/workflows/deploy.yml` (Phase 2+)

---

## Pipeline Stages

### 1. Lint & Format
- **Tools**: ESLint + Prettier
- **Action**: Validate code style and formatting
- **Failure Mode**: Block merge if linting fails

### 2. Unit Tests
- **Framework**: Jest
- **Scope**: Domain and application layers
- **Coverage Target**: ≥80%
- **Failure Mode**: Block merge if tests fail or coverage drops

### 3. Integration Tests
- **Framework**: Jest + Testcontainers
- **Scope**: Adapters with real PostgreSQL
- **Infrastructure**: Testcontainers PostgreSQL 16
- **Failure Mode**: Block merge if tests fail

### 4. E2E Tests
- **Framework**: Jest
- **Scope**: Full system tests with LocalStack
- **Infrastructure**: Docker Compose + LocalStack
- **Test Scenarios**: Complete user journeys
- **Failure Mode**: Block merge if tests fail

### 5. Build
- **Tool**: esbuild
- **Output**: Compiled TypeScript + Lambda deployment packages
- **Optimization**: Tree-shaking, minification, source maps

### 6. Deploy (Phase 2+)
- **Tool**: AWS CDK
- **Target**: AWS environments (dev, staging, production)
- **Strategy**: Blue-Green deployment with traffic shifting

---

## API Gateway Architecture

### Overview

AWS API Gateway serves as the HTTP entry point for all REST API endpoints, providing:
- Request routing to Lambda functions
- Request/response validation
- Authorization and authentication
- Rate limiting and throttling
- CORS handling
- Request/response transformation

### Gateway Type

**REST API (v1)** - Chosen over HTTP API (v2) for:
- Lambda Authorizer support (custom JWT validation)
- More granular authorization controls
- Request/response transformation capabilities
- Better CloudWatch integration
- Full compatibility with LocalStack

### Architecture Pattern

```text
Client Request
    ↓
API Gateway (REST API)
    ↓
Lambda Authorizer (validates JWT token)
    ↓ (authorized)
API Gateway (routes to endpoint)
    ↓
Lambda Function (api-handler.ts)
    ↓
@fastify/aws-lambda adapter
    ↓
Fastify Application
    ↓
Use Cases → Domain Logic
```

### Authorization Strategy

#### Phase 1 (Local Development)

- **Method**: JWT-based authorization via Lambda Authorizer
- **Implementation**: Custom Lambda function validates JWT tokens
- **Token Source**: `Authorization: Bearer <token>` header
- **Validation**: JWT signature verification + expiration check
- **Caching**: Authorizer results cached for 5 minutes (configurable)
- **Fallback**: For local testing, can bypass authorizer with environment flag

#### Phase 2+ (Production)

- **Method**: AWS Cognito User Pools or Auth0 integration
- **Token Type**: JWT tokens issued by identity provider
- **Scopes**: Role-based access control (admin, user, service)
- **MFA**: Optional multi-factor authentication
- **Token Rotation**: Automatic refresh token handling

### Lambda Authorizer

#### Purpose

Validates JWT tokens before requests reach the API Lambda function.

#### Behavior

```typescript
// Pseudo-code for Lambda Authorizer logic
async function authorize(event: APIGatewayTokenAuthorizerEvent) {
  const token = event.authorizationToken.replace('Bearer ', '');

  try {
    // Validate JWT signature and expiration
    const decoded = jwt.verify(token, JWT_SECRET);

    // Generate IAM policy allowing/denying access
    return generatePolicy(decoded.sub, 'Allow', event.methodArn, {
      userId: decoded.sub,
      email: decoded.email,
      roles: decoded.roles
    });
  } catch (error) {
    return generatePolicy('user', 'Deny', event.methodArn);
  }
}
```

#### Response Caching

- **Cache Key**: Authorization token
- **TTL**: 300 seconds (5 minutes)
- **Benefits**: Reduces authorizer invocations, improves latency

#### Context Propagation

Authorizer passes user context to Lambda function:

```json
{
  "userId": "uuid-1234",
  "email": "user@example.com",
  "roles": ["user"]
}
```

### API Gateway Configuration

#### Endpoint Configuration

```typescript
// CDK Example (Phase 2+)
const api = new apigateway.RestApi(this, 'BdayAPI', {
  restApiName: 'Time-Based Event API',
  description: 'REST API for event scheduling system',
  deployOptions: {
    stageName: 'v1',
    loggingLevel: apigateway.MethodLoggingLevel.INFO,
    dataTraceEnabled: true,
    tracingEnabled: true
  },
  defaultCorsPreflightOptions: {
    allowOrigins: apigateway.Cors.ALL_ORIGINS, // Restrict in production
    allowMethods: apigateway.Cors.ALL_METHODS,
    allowHeaders: ['Content-Type', 'Authorization']
  }
});
```

#### Request Validation

```typescript
// Request validator for all endpoints
const requestValidator = api.addRequestValidator('RequestValidator', {
  validateRequestBody: true,
  validateRequestParameters: true
});
```

#### Throttling (Phase 2+)

```typescript
// Rate limiting configuration
{
  burstLimit: 1000,    // Max concurrent requests
  rateLimit: 500       // Sustained requests/second
}
```

### Local Development with LocalStack

#### LocalStack Configuration

```yaml
# docker-compose.yml
services:
  localstack:
    image: localstack/localstack:3.1.0
    ports:
      - "4566:4566"
    environment:
      - SERVICES=apigateway,lambda,sqs,eventbridge
      - DEBUG=1
      - LAMBDA_EXECUTOR=docker
      - DOCKER_HOST=unix:///var/run/docker.sock
    volumes:
      - "./localstack-init:/etc/localstack/init/ready.d"
      - "/var/run/docker.sock:/var/run/docker.sock"
```

#### API Gateway Setup Script

```bash
# localstack-init/api-gateway.sh
#!/bin/bash

# Create REST API
API_ID=$(awslocal apigateway create-rest-api \
  --name "bday-api" \
  --endpoint-configuration types=REGIONAL \
  --query 'id' --output text)

# Get root resource ID
ROOT_ID=$(awslocal apigateway get-resources \
  --rest-api-id $API_ID \
  --query 'items[0].id' --output text)

# Create /user resource
USER_RESOURCE_ID=$(awslocal apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_ID \
  --path-part "user" \
  --query 'id' --output text)

# Create POST method
awslocal apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $USER_RESOURCE_ID \
  --http-method POST \
  --authorization-type CUSTOM \
  --authorizer-id $AUTHORIZER_ID

# Deploy to 'local' stage
awslocal apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name local
```

#### Access Pattern

```bash
# Local API endpoint
http://localhost:4566/restapis/$API_ID/local/_user_request_/user

# Or with custom domain (LocalStack Pro)
http://api.bday.localhost.localstack.cloud:4566/user
```

### Integration with Fastify

#### Lambda Handler

```typescript
// src/adapters/primary/lambda/api-handler.ts
import awsLambdaFastify from '@fastify/aws-lambda';
import { app } from '../http/server'; // Fastify app

export const handler = awsLambdaFastify(app);
```

#### Request Context Access

```typescript
// Access API Gateway request context in Fastify routes
app.get('/user/:id', async (request, reply) => {
  // API Gateway context available via @fastify/aws-lambda
  const userId = request.requestContext.authorizer.userId;

  // Validate user can only access their own data
  if (request.params.id !== userId) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  // ... rest of handler
});
```

### Monitoring and Logging

#### CloudWatch Integration (Phase 2+)

- **Access Logs**: All API requests logged to CloudWatch
- **Execution Logs**: Detailed request/response traces
- **Metrics**: Request count, latency, 4xx/5xx errors
- **Alarms**: High error rate, high latency

#### Log Format

```json
{
  "requestId": "abc-123",
  "ip": "203.0.113.1",
  "requestTime": "2025-10-19T10:30:00Z",
  "httpMethod": "POST",
  "resourcePath": "/user",
  "status": 201,
  "protocol": "HTTP/1.1",
  "responseLength": 245,
  "latency": 150
}
```

### Security Considerations

#### HTTPS Only (Phase 2+)

- All API Gateway endpoints enforce HTTPS
- TLS 1.2+ required
- No HTTP traffic allowed

#### CORS Configuration

- Restrict `allowOrigins` to known domains in production
- Whitelist only required headers
- Limit allowed methods to required ones (GET, POST, PUT, DELETE)

#### API Keys (Future)

- Optional API key requirement for external integrations
- Usage plans for rate limiting per client
- Quota management

### Cost Considerations

#### Pricing Model (Phase 2+)

- **API Gateway**: $3.50 per million requests
- **Data Transfer**: $0.09 per GB
- **Caching**: Optional ($0.020/hour for 0.5GB cache)

#### Cost Optimization

- Use authorizer caching (reduce Lambda invocations)
- Enable compression for responses
- Monitor and optimize payload sizes
- Consider HTTP API (v2) if authorizer complexity allows

### Testing Strategy

#### Local Testing

- Use LocalStack for API Gateway simulation
- Test authorization flow with mock JWT tokens
- Validate request/response transformations

#### Integration Testing

- Test API Gateway → Lambda integration
- Verify authorizer behavior (allow/deny)
- Test CORS preflight requests
- Validate error handling and status codes

#### Load Testing (Phase 2+)

- Test throttling limits
- Validate authorizer cache behavior
- Measure latency under load

---

## Environments

### local
- **Infrastructure**: Docker Compose + LocalStack
- **Database**: PostgreSQL 16 container
- **Cost**: No AWS costs
- **Purpose**: Development and testing
- **Access**: All developers

### dev (Phase 2+)
- **Infrastructure**: AWS development environment
- **Database**: RDS PostgreSQL (t3.micro)
- **Lambda**: Development Lambda functions
- **Queue**: SQS Standard Queue
- **Cost**: Minimal AWS costs
- **Purpose**: Integration testing and feature validation
- **Access**: All developers
- **Deployment**: Automatic on push to `develop` branch

### staging (Phase 2+)
- **Infrastructure**: Pre-production AWS environment
- **Database**: RDS PostgreSQL (production-equivalent size)
- **Lambda**: Production-equivalent configuration
- **Queue**: SQS Standard Queue + DLQ
- **Cost**: Moderate AWS costs
- **Purpose**: Pre-production validation and UAT
- **Access**: QA team and senior developers
- **Deployment**: Automatic on merge to `main` branch

### production (Phase 2+)
- **Infrastructure**: Production AWS environment
- **Database**: RDS PostgreSQL (optimized size)
- **Lambda**: Production configuration with reserved concurrency
- **Queue**: SQS Standard Queue + DLQ
- **Monitoring**: CloudWatch Alarms + Dashboards
- **Cost**: Production AWS costs
- **Purpose**: Live system serving users
- **Access**: Operations team only
- **Deployment**: Manual approval required

---

## Environment Promotion Flow

```text
local (Docker) → dev (AWS) → staging (AWS) → production (AWS)
                    ↓             ↓                ↓
               Manual trigger   Auto on merge   Manual approval
```

### Promotion Gates
- **local → dev**: Manual trigger via GitHub Actions workflow
- **dev → staging**: Automatic on merge to `main` branch
- **staging → production**: Manual approval required
  - Approval from: Tech Lead or Engineering Manager
  - Verification: Staging tests passed, monitoring looks healthy

---

## Rollback Strategy

### Primary Method
Lambda version aliases with weighted traffic shifting (AWS native)

### Trigger Conditions
Automatic rollback triggered when:
- Error rate >5% (sustained for 5 minutes)
- Latency p99 >2s (sustained for 5 minutes)
- Manual intervention by operations team

### Recovery Time Objective (RTO)
- **Lambda Rollback**: <5 minutes
  - Immediate traffic shift to previous version
  - No redeployment required
- **Database Migration Rollback**: <30 minutes
  - Requires running down migration
  - May require application downtime

### Rollback Procedure

#### Lambda Rollback
1. Identify failing version via CloudWatch metrics
2. Update Lambda alias to point to previous stable version
3. Verify error rate returns to normal
4. Investigate root cause and fix

#### Database Rollback
1. Stop all Lambda functions
2. Run down migration script
3. Verify data integrity
4. Redeploy previous application version
5. Restart Lambda functions
6. Monitor for errors

---

## Monitoring and Observability (Phase 2+)

### Metrics
- **Application Metrics**:
  - Event processing rate
  - Webhook delivery success rate
  - API response times
  - Error rates by endpoint

- **Infrastructure Metrics**:
  - Lambda invocations and errors
  - SQS queue depth and age
  - RDS connections and CPU
  - API Gateway latency

### Alarms
- High error rate (>5% for 5 minutes)
- High latency (p99 >2s for 5 minutes)
- SQS queue depth (>1000 messages for 10 minutes)
- RDS CPU (>80% for 15 minutes)
- Lambda throttles (any occurrence)

### Dashboards
- **Operations Dashboard**: Real-time system health
- **Business Metrics Dashboard**: Event delivery metrics
- **Cost Dashboard**: AWS spend by service

---

## Security Considerations

### Network Security
- **VPC**: All Lambda functions and RDS in private subnets
- **Security Groups**: Least privilege access
- **NAT Gateway**: Outbound internet access for Lambda

### Access Control
- **IAM Roles**: Separate roles for each Lambda function
- **Least Privilege**: Minimal permissions for each role
- **Secrets**: AWS Secrets Manager for sensitive data

### Compliance
- **Data Encryption**: At rest (RDS encryption) and in transit (TLS)
- **Audit Logging**: CloudTrail for all API calls
- **Backup**: Automated RDS backups with 7-day retention

---

## Cost Optimization

### Strategies
- **Lambda**: Right-sized memory allocation
- **RDS**: Instance size optimization based on metrics
- **SQS**: Standard queue (not FIFO) for cost savings
- **CloudWatch**: Log retention set to 7 days

### Estimated Monthly Costs (Phase 2+)
- **Development**: $50-100
- **Staging**: $100-200
- **Production**: $300-500 (depending on scale)

---

## Event Scheduling Lambda Architecture

The system uses a **two-Lambda producer-consumer pattern** for event scheduling and execution:

### Architecture Overview

```text
┌──────────────┐       ┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│  EventBridge │──────>│   Scheduler  │──────>│  SQS Queue   │──────>│    Worker    │
│  (1 minute)  │       │    Lambda    │       │ (events-queue│       │    Lambda    │
└──────────────┘       └──────────────┘       └──────────────┘       └──────────────┘
                              │                                              │
                              ▼                                              ▼
                       ┌──────────────┐                              ┌──────────────┐
                       │   Database   │                              │   Webhook    │
                       │ (PostgreSQL) │                              │   Endpoint   │
                       └──────────────┘                              └──────────────┘

                       Claims events:                               Delivers messages:
                       PENDING → PROCESSING                         PROCESSING → COMPLETED
```

### 1. Scheduler Lambda (`event-scheduler`)

**Purpose:** Polls database for ready events and queues them for execution

**Trigger:** EventBridge (every 1 minute)

**Workflow:**

1. Queries database: `targetTimestampUTC <= NOW() AND status = 'PENDING'`
2. Claims events atomically using `FOR UPDATE SKIP LOCKED`
3. Updates claimed events to `PROCESSING` status
4. Sends event details to SQS queue (`events-queue`)
5. Returns summary (events found, events claimed, errors)

**Code:** `src/adapters/primary/lambda/schedulerHandler.ts`

**Key Features:**

- Atomic claiming prevents race conditions
- Handles batch processing (100 events per run)
- Idempotent (safe to run multiple times)
- Graceful error handling with logging

### 2. Worker Lambda (`event-worker`)

**Purpose:** Processes queued events and delivers birthday messages

**Trigger:** SQS queue (`events-queue`) - batch size 10 messages

**Workflow:**

1. Receives batch of up to 10 messages from SQS
2. Validates message payload against schema
3. For each message:
   - Retrieves event from database (validates status = `PROCESSING`)
   - Delivers birthday message via webhook (HTTP POST)
   - Updates event status to `COMPLETED` on success
   - Generates next year's birthday event
4. Error handling:
   - **Permanent failures (4xx):** Mark `FAILED`, delete message
   - **Transient failures (5xx):** Leave `PROCESSING`, message reappears
   - **Invalid payloads:** Send to Dead Letter Queue

**Code:** `src/adapters/primary/lambda/workerHandler.ts`

**Key Features:**

- Batch processing (10 messages per invocation)
- Retry logic with exponential backoff
- Idempotency via event status validation
- Annual recurrence (generates next year's event)

### Event Status Transitions

```text
PENDING ──────> PROCESSING ──────> COMPLETED
                     │                  │
                     │                  ├─> (Next year event: PENDING)
                     │
                     └──────> FAILED (permanent errors)
```

### Why Two Lambdas?

**Separation of Concerns:**

- **Scheduler:** Fast, predictable execution (polling + claiming)
- **Worker:** Variable execution time (webhook calls, retries)

**Scalability:**

- **Scheduler:** Low concurrency (1-5 instances)
- **Worker:** High concurrency (10-100 instances based on queue depth)

**Reliability:**

- **Scheduler failures:** Events remain in database for next poll
- **Worker failures:** SQS retries automatically (up to 3 attempts)

### LocalStack Deployment Status

| Component | Local Development | Production (AWS) |
|-----------|-------------------|------------------|
| Scheduler Lambda | ✅ Deployed | ✅ Deployed |
| Worker Lambda | ✅ Deployed | ✅ Deployed |
| SQS Queue | ✅ Created | ✅ Created |
| SQS Event Source Mapping | ✅ Configured | ✅ Configured |
| EventBridge Rule | ✅ Created | ✅ Created |

**Deployment Commands:**

```bash
# Build both Lambdas
npm run lambda:build

# Deploy both Lambdas to LocalStack
npm run lambda:deploy:localstack

# Verify deployment
docker exec bday-localstack awslocal lambda list-functions
```

**See:** [LocalStack Setup](./localstack-setup.md) for detailed setup and debugging

---

## Scheduler Deployment Options

The event scheduler component can be deployed in different architectures depending on scale, cost, and operational requirements. All deployment options use the **Distributed Scheduler Pattern** with PostgreSQL row-level locking (`FOR UPDATE SKIP LOCKED`) to prevent duplicate event processing.

### Overview of Deployment Models

| Model | Best For | Pros | Cons |
|-------|----------|------|------|
| **Serverless (Lambda)** | Variable workloads, cost optimization | Auto-scaling, pay-per-use, zero ops | Cold starts, connection limits |
| **Long-Running (ECS/EKS)** | Continuous high-volume | Predictable latency, simple connections | Always-on costs, manual scaling |
| **Hybrid** | Mixed workloads | Best of both worlds | More complex architecture |

### The Core Pattern: FOR UPDATE SKIP LOCKED

**All deployment models rely on the same concurrency control mechanism:**

```sql
-- Atomic event claiming with row-level locking
SELECT * FROM events
WHERE status = 'PENDING'
  AND target_timestamp_utc <= NOW()
ORDER BY target_timestamp_utc ASC
LIMIT 100
FOR UPDATE SKIP LOCKED
```

**Why this matters:**
- ✅ **Multiple instances** can safely claim different events concurrently
- ✅ **No coordination required** between scheduler instances
- ✅ **No duplicate processing** - each event claimed exactly once
- ✅ **No deadlocks** - SKIP LOCKED prevents waiting

**See:** [Design Patterns - Distributed Scheduler Pattern](./design-patterns.md#8-distributed-scheduler-pattern---concurrent-job-claiming) for detailed explanation.

---

### Option 1: Serverless Lambda (Phase 2 Default)

**Architecture:**

```
┌──────────────────────────────────────────────────────────┐
│ EventBridge Rule (every 1 minute)                        │
└───────────────────┬──────────────────────────────────────┘
                    │ triggers
                    ▼
┌──────────────────────────────────────────────────────────┐
│ Lambda: ClaimAndProcessEvents                            │
│ - Concurrency: 10 instances (configurable)               │
│ - Each claims 100 events via FOR UPDATE SKIP LOCKED      │
│ - Memory: 1024 MB                                        │
│ - Timeout: 5 minutes                                     │
└───────────────────┬──────────────────────────────────────┘
                    │ connects via
                    ▼
┌──────────────────────────────────────────────────────────┐
│ RDS Proxy (Connection Pooling)                           │
│ - Max connections: 100                                   │
│ - Multiplexing enabled                                   │
└───────────────────┬──────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────┐
│ RDS PostgreSQL                                           │
│ - FOR UPDATE SKIP LOCKED prevents duplicates             │
└──────────────────────────────────────────────────────────┘
```

#### Implementation

```typescript
// Lambda handler
import { PrismaClient } from '@prisma/client';

// Global instance (reused across warm invocations)
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL, // Points to RDS Proxy
    },
  },
});

export const handler = async (event: ScheduledEvent) => {
  const batchSize = 100;

  // Claim events with row-level locking
  const claimedEvents = await prisma.$transaction(async (tx) => {
    const events = await tx.$queryRaw<Array<RawEvent>>`
      SELECT * FROM events
      WHERE status = 'PENDING'
        AND target_timestamp_utc <= NOW()
      ORDER BY target_timestamp_utc ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    `;

    if (events.length === 0) return [];

    await tx.event.updateMany({
      where: { id: { in: events.map(e => e.id) } },
      data: { status: 'PROCESSING', version: { increment: 1 } },
    });

    return events;
  }, {
    timeout: 5000, // 5 second max transaction
  });

  // Process events
  for (const event of claimedEvents) {
    await processEvent(event);
  }

  return { processed: claimedEvents.length };
};
```

#### Configuration

```yaml
# serverless.yml or CDK
functions:
  scheduler:
    handler: src/scheduler.handler
    timeout: 300 # 5 minutes
    memorySize: 1024 # 1 GB
    reservedConcurrency: 10 # Max 10 concurrent Lambdas
    environment:
      DATABASE_URL: ${env:RDS_PROXY_ENDPOINT}
    events:
      - schedule:
          rate: rate(1 minute)
          enabled: true
```

#### Critical Requirements for Lambda

**1. Connection Pooling (MANDATORY)**

```typescript
// ❌ BAD: New Prisma instance per invocation
export const handler = async () => {
  const prisma = new PrismaClient(); // Creates new connection pool!
  await prisma.event.claimReadyEvents(100);
  await prisma.$disconnect(); // Closes connections
};

// ✅ GOOD: Reuse Prisma instance
const prisma = new PrismaClient(); // Outside handler - global scope

export const handler = async () => {
  await prisma.event.claimReadyEvents(100);
  // Don't disconnect - instance reused on next warm start
};
```

**Why RDS Proxy is Required:**
- Lambdas are stateless - each invocation could create new connections
- 10 concurrent Lambdas × 10 connections each = 100 database connections
- RDS Proxy pools connections, reducing database load
- Without it: Risk exhausting database connection limit (default 100)

**2. Transaction Timeout**

```typescript
// Set explicit timeout to prevent Lambda timeout errors
await prisma.$transaction(async (tx) => {
  // ... claim events
}, {
  timeout: 5000, // Must be < Lambda timeout
});
```

**3. Warm Start Optimization**

```yaml
# CDK: Keep Lambdas warm to avoid cold starts
provisionedConcurrentExecutions: 2 # Always keep 2 warm instances
```

#### Scaling Behavior

**Example Scenario: 1,000 events ready to process**

```
Time: 00:00 - EventBridge triggers Lambda

Instance 1: Claims events 1-100    (FOR UPDATE SKIP LOCKED)
Instance 2: Claims events 101-200  (skips 1-100, locked)
Instance 3: Claims events 201-300  (skips 1-200, locked)
...
Instance 10: Claims events 901-1000

Total processing time: ~5 minutes (all instances work in parallel)
```

**Throughput calculation:**
- 10 concurrent Lambdas
- 100 events per Lambda
- 1 minute trigger interval
- **Theoretical max: 60,000 events/hour**

#### Pros and Cons

**✅ Pros:**
- **Cost efficient**: Pay only for execution time
- **Auto-scaling**: AWS handles scaling (0 to 1000s of instances)
- **No infrastructure management**: Fully managed
- **Good for variable workloads**: Birthday events spike in certain months
- **FOR UPDATE SKIP LOCKED works perfectly**: Fast atomic transactions

**❌ Cons:**
- **Cold starts**: 1-3 second initialization delay
- **Connection pooling required**: Must use RDS Proxy
- **15-minute max timeout**: Not suitable for very long processing
- **More complex debugging**: Distributed traces across many invocations

**Best for:**
- Variable event volume (seasonal patterns)
- Cost-sensitive deployments
- Event-driven architectures
- When you want to minimize operational overhead

---

### Option 2: Long-Running Containers (ECS/EKS)

**Architecture:**

```
┌──────────────────────────────────────────────────────────┐
│ Kubernetes/ECS: Scheduler Deployment                     │
│ - Replicas: 3 pods (horizontal pod autoscaler)           │
│ - Each pod runs infinite loop checking for events        │
│ - Built-in connection pooling via Prisma                 │
└───────────────────┬──────────────────────────────────────┘
                    │ direct connection
                    ▼
┌──────────────────────────────────────────────────────────┐
│ RDS PostgreSQL                                           │
│ - FOR UPDATE SKIP LOCKED prevents duplicates             │
│ - Fewer connections (3 pods vs 10 Lambdas)               │
└──────────────────────────────────────────────────────────┘
```

#### Implementation

```typescript
// Continuous scheduler process
class EventScheduler {
  constructor(private prisma: PrismaClient) {}

  async start() {
    console.log('Scheduler started');

    while (true) {
      try {
        // Claim and process events
        const events = await this.claimReadyEvents(100);

        if (events.length > 0) {
          console.log(`Claimed ${events.length} events`);
          await this.processEvents(events);
        }

        // Sleep for 10 seconds before next poll
        await sleep(10000);
      } catch (error) {
        console.error('Scheduler error:', error);
        await sleep(5000); // Back off on error
      }
    }
  }

  private async claimReadyEvents(limit: number): Promise<Event[]> {
    return this.prisma.$transaction(async (tx) => {
      const events = await tx.$queryRaw<Array<RawEvent>>`
        SELECT * FROM events
        WHERE status = 'PENDING'
          AND target_timestamp_utc <= NOW()
        ORDER BY target_timestamp_utc ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `;

      if (events.length === 0) return [];

      await tx.event.updateMany({
        where: { id: { in: events.map(e => e.id) } },
        data: { status: 'PROCESSING', version: { increment: 1 } },
      });

      return events.map(eventToDomain);
    });
  }

  private async processEvents(events: Event[]): Promise<void> {
    // Process in parallel
    await Promise.allSettled(
      events.map(event => this.processEvent(event))
    );
  }
}

// Entry point
const prisma = new PrismaClient();
const scheduler = new EventScheduler(prisma);
scheduler.start();
```

#### Kubernetes Configuration

```yaml
# k8s/scheduler-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: event-scheduler
spec:
  replicas: 3
  selector:
    matchLabels:
      app: event-scheduler
  template:
    metadata:
      labels:
        app: event-scheduler
    spec:
      containers:
      - name: scheduler
        image: your-repo/event-scheduler:latest
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: url
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
---
# Horizontal Pod Autoscaler
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: event-scheduler-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: event-scheduler
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

#### Scaling Behavior

**Example Scenario: 1,000 events ready to process**

```
Pod 1: Polls every 10s, claims events 1-100
Pod 2: Polls every 10s, claims events 101-200
Pod 3: Polls every 10s, claims events 201-300

Next poll (10 seconds later):
Pod 1: Claims events 301-400
Pod 2: Claims events 401-500
Pod 3: Claims events 501-600

... continues until all events processed

Total processing time: ~40 seconds (3 pods × 100 events per poll)
```

#### Pros and Cons

**✅ Pros:**
- **No cold starts**: Always running, instant processing
- **Simple connection management**: Built-in Prisma connection pooling
- **Predictable costs**: Fixed hourly rate
- **No timeout limits**: Can run indefinitely
- **Better for continuous high-volume**: Processes events faster

**❌ Cons:**
- **Always-on costs**: Pay even when idle
- **Manual scaling**: Need to configure HPA and monitor
- **Infrastructure management**: Need to manage Kubernetes/ECS
- **Over-provisioning risk**: May pay for unused capacity

**Best for:**
- Continuous high-volume processing
- Predictable workloads
- When cold starts are unacceptable
- Need for sub-second latency

---

### Option 3: Hybrid (Two-Stage Lambda)

**Architecture for Long Event Processing:**

```
┌──────────────────────────────────────────────────────────┐
│ EventBridge Rule (every 1 minute)                        │
└───────────────────┬──────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────┐
│ Lambda 1: ClaimEvents (fast, <5 seconds)                 │
│ - Claims events with FOR UPDATE SKIP LOCKED              │
│ - Pushes to SQS queue                                    │
└───────────────────┬──────────────────────────────────────┘
                    │ sends messages to
                    ▼
┌──────────────────────────────────────────────────────────┐
│ SQS Queue (standard)                                     │
│ - Decouples claiming from processing                     │
│ - Built-in retry logic                                   │
└───────────────────┬──────────────────────────────────────┘
                    │ triggers (batch of 10)
                    ▼
┌──────────────────────────────────────────────────────────┐
│ Lambda 2: ProcessEvent (can be slow)                     │
│ - Processes individual events                            │
│ - Updates status to COMPLETED/FAILED                     │
└──────────────────────────────────────────────────────────┘
```

#### Implementation

```typescript
// Lambda 1: Claim events (fast)
export const claimHandler = async () => {
  const events = await prisma.$transaction(async (tx) => {
    const events = await tx.$queryRaw`
      SELECT * FROM events
      WHERE status = 'PENDING'
        AND target_timestamp_utc <= NOW()
      LIMIT 100
      FOR UPDATE SKIP LOCKED
    `;

    if (events.length === 0) return [];

    await tx.event.updateMany({
      where: { id: { in: events.map(e => e.id) } },
      data: { status: 'PROCESSING' },
    });

    return events;
  });

  // Push to SQS
  for (const event of events) {
    await sqs.sendMessage({
      QueueUrl: process.env.PROCESSING_QUEUE_URL,
      MessageBody: JSON.stringify(event),
    });
  }

  return { claimed: events.length };
};

// Lambda 2: Process events (can be slow)
export const processHandler = async (sqsEvent: SQSEvent) => {
  for (const record of sqsEvent.Records) {
    const event = JSON.parse(record.body);

    try {
      // Process event (can take time - send email, webhook, etc.)
      await processEvent(event);

      // Mark as completed
      await prisma.event.update({
        where: { id: event.id },
        data: { status: 'COMPLETED', executedAt: new Date() },
      });
    } catch (error) {
      // Mark as failed
      await prisma.event.update({
        where: { id: event.id },
        data: {
          status: 'FAILED',
          failureReason: error.message,
          retryCount: { increment: 1 },
        },
      });
      throw error; // Let SQS retry
    }
  }
};
```

#### Pros and Cons

**✅ Pros:**
- **Best of both worlds**: Fast claiming (no timeout), slow processing (can retry)
- **Better observability**: SQS provides queue metrics
- **Automatic retries**: SQS handles failed processing
- **Decoupled**: Claiming and processing scale independently

**❌ Cons:**
- **More complex**: Two Lambda functions + SQS
- **Higher latency**: Event sits in queue before processing
- **More cost**: SQS requests add cost

**Best for:**
- Event processing takes >1 minute (webhooks, external APIs)
- Need robust retry logic
- Want to decouple claim from process

---

### Comparison Matrix

| Aspect | Lambda (Single-Stage) | Long-Running (ECS/EKS) | Hybrid (Lambda + SQS) |
|--------|----------------------|------------------------|----------------------|
| **Cold Start** | ⚠️ 1-3s | ✅ None | ⚠️ 1-3s |
| **Connection Pooling** | ⚠️ Requires RDS Proxy | ✅ Built-in | ⚠️ Requires RDS Proxy |
| **Scaling** | ✅ Auto (instant) | ⚠️ HPA (1-2 min) | ✅ Auto (instant) |
| **Cost (low volume)** | ✅ Pay-per-use | ❌ Always-on | ⚠️ Medium |
| **Cost (high volume)** | ⚠️ Can be expensive | ✅ Fixed | ⚠️ Medium |
| **Max Processing Time** | ❌ 15 minutes | ✅ Unlimited | ✅ Unlimited |
| **Observability** | ⚠️ Distributed traces | ✅ Centralized logs | ✅ SQS metrics |
| **Retry Logic** | ⚠️ Manual | ⚠️ Manual | ✅ Built-in (SQS) |
| **FOR UPDATE SKIP LOCKED** | ✅ Works | ✅ Works | ✅ Works |
| **Duplicate Prevention** | ✅ Database-level | ✅ Database-level | ✅ Database-level |

---

### Recommendations

**Choose Serverless Lambda if:**
- Variable event volume (birthdays seasonal)
- Want to minimize operational overhead
- Budget-conscious (pay only when processing)
- Can tolerate 1-3s cold start delay
- Event processing completes in <5 minutes

**Choose Long-Running Containers if:**
- Continuous high-volume processing
- Need predictable sub-second latency
- Already have Kubernetes/ECS infrastructure
- Want simpler connection management
- Processing is continuous throughout the day

**Choose Hybrid (Lambda + SQS) if:**
- Event processing takes >5 minutes
- Need robust retry mechanisms
- Want to decouple claiming from processing
- Processing has variable duration

**Phase 2 Default:** Serverless Lambda (single-stage)
- Good starting point for most use cases
- Can migrate to hybrid or containers later if needed
- Minimizes infrastructure complexity

---

### Critical Implementation Notes

**All deployment options MUST:**

1. **Use `FOR UPDATE SKIP LOCKED`** in transaction
   ```typescript
   await prisma.$transaction(async (tx) => {
     const events = await tx.$queryRaw`... FOR UPDATE SKIP LOCKED`;
     await tx.event.updateMany({ status: 'PROCESSING' });
   });
   ```

2. **Wrap SELECT + UPDATE in single transaction**
   - Locks must be held until UPDATE completes
   - Without transaction: race condition possible

3. **Handle empty result gracefully**
   ```typescript
   if (events.length === 0) {
     return []; // No events to process
   }
   ```

4. **Set appropriate batch size**
   - Lambda: 100 events per invocation
   - Containers: 100-500 events per poll
   - Balance between throughput and transaction size

5. **Monitor for lock contention**
   - PostgreSQL metrics: `pg_stat_activity`
   - CloudWatch custom metrics: events claimed per instance
   - Alert if instances consistently claim 0 events (may indicate over-provisioning)

**See:** [Design Patterns - Distributed Scheduler Pattern](./design-patterns.md#8-distributed-scheduler-pattern---concurrent-job-claiming) for complete implementation details and concurrency testing.

**See:** [Local Development](./local-development.md#connection-pooling-testing) for testing connection pooling with PgBouncer locally.

---
