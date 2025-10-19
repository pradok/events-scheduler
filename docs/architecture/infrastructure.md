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
