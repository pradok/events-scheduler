# Technology Stack

**Single Source of Truth for Technology Choices**

Reference: [Full Architecture Document](../architecture.md#tech-stack)

---

## Cloud Infrastructure

- **Provider:** AWS (Amazon Web Services)
- **Key Services:**
  - Lambda (compute for scheduler and workers)
  - EventBridge (scheduled triggers every 1 minute)
  - SQS (message queue for event buffering)
  - RDS PostgreSQL (primary database)
  - SNS (future: SMS delivery)
  - SES (future: email delivery)
  - CloudWatch (logs and metrics)
- **Deployment Regions:** us-east-1 (primary for Phase 1)

---

## Technology Stack Table

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| **Language** | TypeScript | 5.3.3 | Primary development language |
| **Runtime** | Node.js | 20.11.0 LTS | JavaScript runtime |
| **Framework** | Express.js | 4.18.2 | REST API framework |
| **ORM** | Prisma | 5.9.1 | Type-safe database client |
| **Date/Time** | Luxon | 3.4.4 | Timezone handling |
| **Testing Framework** | Jest | 29.7.0 | Unit/Integration/E2E tests |
| **Database** | PostgreSQL | 16.1 | Primary data store |
| **Message Queue** | AWS SQS | - | Event buffering |
| **Scheduler** | AWS EventBridge | - | Periodic triggers |
| **Validation** | Zod | 3.22.4 | Runtime schema validation |
| **Linting** | ESLint | 8.56.0 | Code quality |
| **Formatting** | Prettier | 3.2.5 | Code formatting |
| **Logger** | Pino | 8.17.2 | Structured logging |
| **HTTP Client** | Axios | 1.6.7 | External API calls |
| **Container** | Docker | 24.0.7 | Local development |
| **Local AWS** | LocalStack | 3.1.0 | AWS service simulation |
| **IaC** | AWS CDK | 2.122.0 | Infrastructure as Code |
| **CI/CD** | GitHub Actions | - | Automated testing/deployment |
| **Monorepo Tool** | npm workspaces | - | Monorepo management |
| **Environment Config** | dotenv | 16.4.1 | Local environment variables |
| **Lambda Bundler** | esbuild | 0.20.0 | Fast TypeScript compilation |
| **Testing DB** | Testcontainers | 10.5.0 | Integration testing |

---

## Key Technology Decisions

### TypeScript Over JavaScript

- Strong typing prevents runtime errors
- Excellent IDE support and autocomplete
- Strict mode enforces code quality

### Node.js 20 LTS

- Long-term support with stability
- Lambda-compatible runtime
- Broad ecosystem for serverless

### Prisma Over TypeORM

- Better TypeScript integration
- Cleaner API and migration management
- Supports PostgreSQL advanced features (FOR UPDATE SKIP LOCKED)

### PostgreSQL Over DynamoDB

- ACID transactions required
- `FOR UPDATE SKIP LOCKED` for atomic event claiming
- Rich query capabilities for complex operations

### Zod Over Joi

- TypeScript-first validation
- Type inference reduces duplication
- Modern API design

### Pino Over Winston

- Superior performance in serverless
- Structured JSON output
- CloudWatch friendly

### AWS CDK Over Terraform

- TypeScript-native (same language as application)
- Higher-level constructs for AWS
- Better AWS service coverage

---

## Version Pinning Strategy

All versions pinned to specific minor versions (not `^` or `~` ranges) for reproducibility:

- Node.js 20.11.0 LTS chosen over 21.x for stability
- PostgreSQL 16.1 (latest stable) for new features
- All npm packages use exact versions in package.json
