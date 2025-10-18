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
