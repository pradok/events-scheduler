# Time-Based Event Scheduling System

A distributed, timezone-aware event scheduling system that triggers events at specific local times. Built with hexagonal architecture and domain-driven design, starting with birthday messaging as the Phase 1 MVP.

---

## Quick Start

### Prerequisites

- **Node.js 20.11.0** LTS
- **Docker Desktop** (for PostgreSQL + LocalStack)
- **npm 10+**

### ⚡ Complete E2E Environment Setup (One Command!)

**For quick handoff or full production-like testing:**

```bash
npm install                 # First time only
npm run e2e:setup           # Starts EVERYTHING: Docker, DB, Lambdas, API server
npm run e2e:verify          # Verify all services running (26 checks)
```

**What it does:**

- 🔄 Clean slate reset (deletes all data & creates fresh DB)
- 🐳 Starts PostgreSQL + LocalStack containers
- 🗄️ Runs database migrations (`prisma:migrate`)
- ⚡ Builds and deploys Lambda functions
- 🚀 Starts User API server at <http://localhost:3000>

**Perfect for:** Handing off to QA, new developers, or full system testing.

See [E2E Testing Guide](docs/e2e-testing-guide.md) for details.

---

### 5-Minute Manual Setup

**If you prefer step-by-step control:**

```bash
# 1. Install dependencies
npm install

# 2. Start Docker services
npm run docker:start

# 3. Run database migrations
npm run prisma:migrate

# 4. Verify setup
npm run docker:verify
```

**You're ready!** See [Getting Started Guide](docs/getting-started.md) for detailed setup.

---

## Development

### Start User API Server

```bash
npm run dev                 # Start Fastify API on http://localhost:3000
```

**Endpoints:**
- `GET /health` - Health check
- `GET /user/:id` - Get user
- `PUT /user/:id` - Update user
- `DELETE /user/:id` - Delete user

### Deploy Lambda Functions

```bash
npm run lambda:all          # Build and deploy scheduler/worker to LocalStack
```

### Common Commands

```bash
npm run dev                 # Start User API server (port 3000)
npm run docker:start        # Start PostgreSQL + LocalStack
npm run docker:stop         # Stop containers (keep data)
npm run docker:reset        # Nuclear option: delete everything and restart
npm run docker:verify       # Verify LocalStack resources created
npm run lambda:all          # Build and deploy Lambdas to LocalStack
npm run prisma:studio       # Open database GUI (port 5555)
npm test                    # Run unit tests (fast, no setup)
npm run test:integration    # Integration tests (requires database)
npm run test:e2e            # End-to-end tests (full setup)
```

---

## Architecture

**Hexagonal Architecture + Domain-Driven Design**

- **Domain Layer**: Pure business logic (entities, value objects, services)
- **Application Layer**: Use cases orchestrating domain logic
- **Adapters**: Infrastructure (HTTP/Lambda, PostgreSQL, SQS)

**Key Patterns:**
- Repository Pattern (data access abstraction)
- Strategy Pattern (pluggable event handlers)
- State Machine (event lifecycle: PENDING → PROCESSING → COMPLETED)
- Distributed Scheduler (FOR UPDATE SKIP LOCKED for concurrent job claiming)

See [Architecture Documentation](docs/architecture.md) for details.

---

## Technology Stack

| Category | Technology | Purpose |
|----------|-----------|---------|
| **Language** | TypeScript 5.3.3 | Strict mode, zero `any` types |
| **Runtime** | Node.js 20.11.0 | LTS |
| **API Framework** | Fastify 4.26.0 | REST API (local dev) |
| **Database** | PostgreSQL 16.1 | Primary data store |
| **ORM** | Prisma 6.17.1 | Type-safe database client |
| **Date/Time** | Luxon 3.4.4 | Timezone handling |
| **Testing** | Jest 29.7.0 | Unit/Integration/E2E tests |
| **Validation** | Zod 4.1.12 | Runtime schema validation |
| **Build** | esbuild 0.20.0 | Fast TypeScript compilation |
| **Local AWS** | LocalStack 3.1.0 | AWS service emulation |
| **Message Queue** | AWS SQS | Event buffering |
| **Scheduler** | AWS EventBridge | Periodic triggers (every 1 minute) |
| **Compute** | AWS Lambda | Serverless event processing |

See [Tech Stack Documentation](docs/architecture/tech-stack.md) for rationale.

---

## Documentation

### Getting Started
- **[Getting Started (5 min)](docs/getting-started.md)** - Quick setup guide
- **[E2E Testing Guide](docs/e2e-testing-guide.md)** - Production-like local testing (one command!)
- **[Local Development](docs/local-development.md)** - Complete workflow: Docker, API, Lambdas
- **[Testing Guide](docs/testing-guide.md)** - Running and writing tests
- **[Debugging Guide](docs/debugging.md)** - Troubleshooting and logs

### Architecture & Design
- **[Architecture Overview](docs/architecture.md)** - System design and patterns
- **[Design Patterns](docs/architecture/design-patterns.md)** - Distributed Scheduler, FOR UPDATE SKIP LOCKED
- **[Timezone Handling](docs/architecture/timezone-handling.md)** - How timezones work (beginner-friendly!)
- **[Tech Stack](docs/architecture/tech-stack.md)** - Technology choices
- **[Infrastructure](docs/architecture/infrastructure.md)** - AWS deployment options

### Product & Requirements
- **[Product Requirements (PRD)](docs/prd.md)** - Product vision and features
- **[Epic 1: Foundation](docs/prd/epic-1-foundation-user-management.md)** - User management
- **[Epic 2: Event Scheduling](docs/prd/epic-2-event-scheduling.md)** - Birthday events
- **[Epic 3: Recovery & Reliability](docs/prd/epic-3-recovery-reliability.md)** - Failure handling
- **[Epic 4: E2E Testing](docs/prd/epic-4-end-to-end-testing.md)** - LocalStack testing infrastructure

### Reference
- **[Coding Standards](docs/architecture/coding-standards.md)** - Development guidelines
- **[Test Strategy](docs/architecture/test-strategy.md)** - Testing approaches
- **[Source Tree](docs/architecture/source-tree.md)** - Project structure

---

## Project Structure

```
bday/
├── docs/                    # Documentation
│   ├── getting-started.md   # 5-minute quick start
│   ├── local-development.md # Complete dev workflow
│   ├── testing-guide.md     # Test practices
│   ├── debugging.md         # Troubleshooting
│   ├── architecture.md      # System design
│   ├── architecture/        # Design docs
│   ├── prd/                 # Epics and stories
│   └── stories/             # Story files
│
├── src/                     # Source code (Hexagonal Architecture)
│   ├── modules/             # Feature modules
│   │   ├── user/            # User management
│   │   └── event-scheduling/ # Event scheduling
│   ├── shared/              # Shared utilities
│   ├── adapters/            # Infrastructure adapters
│   │   ├── primary/         # Inbound (HTTP, Lambda)
│   │   └── secondary/       # Outbound (PostgreSQL, SQS)
│   ├── startup/             # Application startup
│   ├── index.ts             # Main entry point
│   └── server-standalone.ts # API server entry point
│
├── docker/                  # Docker Compose
│   ├── docker-compose.yml   # PostgreSQL + LocalStack
│   └── localstack/init-aws.sh # AWS resource initialization
│
├── prisma/                  # Prisma ORM
│   ├── schema.prisma        # Database schema
│   ├── migrations/          # Database migrations
│   └── seed.ts              # Sample data
│
├── scripts/                 # Helper scripts
│   ├── docker-*.sh          # Docker management
│   ├── lambda-build.sh      # Lambda packaging
│   ├── deploy-lambda.js     # Lambda deployment
│   └── verify-localstack.sh # Resource verification
│
└── lambdas/                 # Built Lambda functions
    ├── scheduler/           # EventBridge → Claims events → SQS
    └── worker/              # SQS → Delivers webhooks
```

---

## Key Features

### Current Capabilities ✅

- **Local Development Environment**: Docker Compose with PostgreSQL + LocalStack
- **User Management API**: Fastify REST API (GET/PUT/DELETE users)
- **Event Scheduling System**: EventBridge + Lambda scheduler + SQS worker
- **Timezone Support**: Events scheduled in user's local timezone
- **Distributed Scheduler**: Concurrent Lambda instances using FOR UPDATE SKIP LOCKED
- **Failure Recovery**: System recovers from downtime and catches up on missed events
- **E2E Testing**: Complete LocalStack testing infrastructure
- **Comprehensive Tests**: Unit, integration, and E2E test coverage

### Architecture Highlights

- ✅ Hexagonal Architecture with clear layer separation
- ✅ Domain-Driven Design with rich domain models
- ✅ Type-safe with TypeScript strict mode (zero `any` types)
- ✅ Repository pattern for data access abstraction
- ✅ Event-driven with domain events
- ✅ Optimistic locking for concurrency control
- ✅ Idempotency for exactly-once processing

---

## Development Status

**Current:** Epic 4 (E2E Testing Infrastructure) - Story 4.1 Complete ✅

**Completed Epics:**
- ✅ Epic 1: Foundation & User Management
- ✅ Epic 2: Event Scheduling Core
- ✅ Epic 3: Recovery & Reliability

**Recent Progress:**
- ✅ Story 4.1: LocalStack Community Edition setup
- ✅ User API development server with hot-reload
- ✅ Documentation consolidation and organization

**Next Steps:**
- 📋 Story 4.4: Lambda deployment to LocalStack
- 📋 Story 4.6: Comprehensive E2E smoke test

See [docs/prd/](docs/prd/) for complete epic and story details.

---

## Development Methodology

This project uses **BMAD (Business-to-Market Accelerated Delivery)**:

- **Story-Driven Development**: Features implemented as well-defined stories
- **Architecture-First**: Comprehensive design before implementation
- **Quality Gates**: Mandatory review before marking stories "Done"

---

## Testing

```bash
npm test                    # Unit tests only (default, fast, no setup needed)
npm run test:unit           # Same as above (alias)
npm run test:integration    # Integration tests (requires database)
npm run test:e2e            # End-to-end tests (requires LocalStack + database)
npm run test:coverage       # Generate coverage report
npm run test:watch          # Unit tests in watch mode (VSCode Jest plugin compatible)
```

**Default behavior:** `npm test` runs **unit tests only** - fast, no Docker/database setup required. Perfect for development and VSCode Jest plugin.

**Coverage Targets:**
- Domain layer: 100%
- Application layer: 80%+
- Adapters: 80%+

### Fast Manual E2E Testing

For rapid manual testing of event scheduling (without waiting for 9:00 AM):

```bash
# Start server with delivery time override (triggers events in 5 minutes)
FAST_TEST_DELIVERY_OFFSET=5 npm run dev

# In another terminal, run the manual test script
npm run test:manual         # Creates user and shows next steps
npm run test:manual:fast    # Same as above (explicit +5 minutes)
```

**What it does:**
- Creates a test user via API
- Schedules birthday event to trigger in 5 minutes (instead of 9:00 AM)
- Shows expected trigger time and monitoring instructions

**Environment Variable:**
- `FAST_TEST_DELIVERY_OFFSET={value}` - Events trigger in X time from now
- Supports minutes and seconds:
  - `5` or `5m` = 5 minutes
  - `30s` = 30 seconds (ultra-fast)
  - `120` or `120m` = 2 hours
- Invalid format falls back to default (9am) - no error thrown
- **TESTING ONLY** - DO NOT use in production
- Future: Production config will use AWS Parameter Store (separate from this testing feature)

See [Testing Guide](docs/testing-guide.md) for details.

---

## Code Quality

**Enforced Standards:**
- TypeScript strict mode (zero `any` types)
- ESLint + Prettier (auto-run on commit)
- No `console.log` in production code (use Pino logger)
- Repository pattern for all database access
- Pure domain layer (no infrastructure imports)

See [Coding Standards](docs/architecture/coding-standards.md) for complete guidelines.

---

## Contributing

This is a demonstration project showcasing:
- Hexagonal Architecture + Domain-Driven Design
- BMAD methodology for AI-assisted development
- TypeScript strict mode best practices
- Comprehensive testing strategies

All code standards are enforced via pre-commit hooks.

---

## License

ISC

---

**Quick Links:**
- [Getting Started (5 min)](docs/getting-started.md)
- [Local Development Guide](docs/local-development.md)
- [Architecture Overview](docs/architecture.md)
- [All Documentation](docs/README.md)

**Status**: 🚧 Epic 4 In Progress | Story 4.1 Complete ✅

**Last Updated**: 2025-10-27
