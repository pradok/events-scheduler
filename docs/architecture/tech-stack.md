# Technology Stack

**Single Source of Truth for Technology Choices**

Reference: [Full Architecture Document](../architecture.md#tech-stack)

---

## Cloud Infrastructure

- **Provider:** AWS (Amazon Web Services)
- **Key Services:**
  - **API Gateway** (REST API endpoint with authorization)
  - Lambda (compute for API, scheduler, and workers)
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
| **Framework** | Fastify | 4.26.0 | REST API framework |
| **Fastify Type Provider** | fastify-type-provider-zod | 2.0.0 | Zod integration for Fastify |
| **ORM** | Prisma | 6.17.1 | Type-safe database client |
| **Prisma Zod Generator** | prisma-zod-generator | 1.29.1 | Auto-generate Zod schemas from Prisma models |
| **Date/Time** | Luxon | 3.4.4 | Timezone handling |
| **Testing Framework** | Jest | 29.7.0 | Unit/Integration/E2E tests |
| **Database** | PostgreSQL | 16.1 | Primary data store |
| **API Gateway** | AWS API Gateway | REST API v1 | HTTP endpoint with authorization |
| **Message Queue** | AWS SQS | - | Event buffering |
| **Scheduler** | AWS EventBridge | - | Periodic triggers |
| **Validation** | Zod | 4.1.12 | Runtime schema validation & type derivation |
| **Lambda Adapter** | @fastify/aws-lambda | 4.1.0 | Fastify → API Gateway integration |
| **Linting** | ESLint | 8.56.0 | Code quality |
| **Formatting** | Prettier | 3.2.5 | Code formatting |
| **Logger** | Pino | 8.17.2 | Structured logging |
| **HTTP Client** | Axios | 1.6.7 | External API calls |
| **Container** | Docker | 24.0.7 | Local development |
| **Local AWS** | LocalStack | 3.1.0 | AWS service simulation |
| **IaC** | AWS CDK | 2.122.0 | Infrastructure as Code |
| **CI/CD** | GitHub Actions | - | Automated testing/deployment (Future Phase) |
| **Monorepo Tool** | npm workspaces | - | Monorepo management |
| **Environment Config** | dotenv | 16.4.1 | Local environment variables |
| **Lambda Bundler** | esbuild | 0.20.0 | Fast TypeScript compilation |
| **Testing DB** | Testcontainers | 10.5.0 | Integration testing |

---

## Key Technology Decisions

### Fastify Over Express

- **Native Schema Integration:** Built-in JSON Schema validation with `fastify-type-provider-zod`
- **TypeScript-First Design:** Superior type inference for routes, better integration with `z.infer<>`
- **Performance:** 2-3x faster than Express, lower latency for serverless/Lambda cold starts
- **Modern Architecture:** Async/await native, plugin system aligns with hexagonal architecture
- **Schema-Driven Development:** Auto-generate OpenAPI/Swagger from Zod schemas
- **Meets NFR Requirements:** Performance advantage helps achieve 200ms p95 response time

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

### Zod 4.x Over Joi

- **TypeScript-first validation** with `z.infer<>` for type derivation
- **Single source of truth:** Schemas define both runtime validation AND compile-time types
- **Type inference** eliminates duplication between validation rules and type definitions
- **Modern API design** with excellent developer experience
- **Schema changes automatically propagate** throughout codebase via derived types
- **Version 4.1.12** required for prisma-zod-generator v1.29.1 compatibility
- **Auto-generation from Prisma:** Use `prisma-zod-generator` to generate base Zod schemas from Prisma models, then extend with domain-specific types

### prisma-zod-generator Integration

- **Auto-sync with database schema:** Zod schemas automatically generated from Prisma models
- **Pure model schemas only:** Configured to generate only model schemas (no CRUD bloat)
- **Domain layer extension:** Generated schemas extended with domain-specific types (Luxon DateTime, value objects)
- **Version requirements:**
  - `prisma-zod-generator@1.29.1` (latest)
  - `zod@4.1.12` (required by generator)
  - `prisma@6.17.1` (required by generator)
- **Configuration:** `pureModels: true`, all variants disabled, `mode: "custom"`

### Pino Over Winston

- Superior performance in serverless
- Structured JSON output
- CloudWatch friendly
- Native Fastify integration

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
