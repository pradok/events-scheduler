# Time-Based Event Scheduling System

A distributed, timezone-aware event scheduling system that triggers events at specific local times. Built with hexagonal architecture and domain-driven design, starting with birthday messaging as the Phase 1 MVP.

---

## Overview

This project is a **general-purpose event scheduling platform** that can trigger any action at specific local times across multiple timezones. The system handles temporal criteria, timezone context, recurrence patterns, and pluggable delivery mechanisms.

### Architecture

- **Hexagonal Architecture**: Clear separation between domain, application, and infrastructure layers
- **Domain-Driven Design**: Rich domain models with business logic encapsulated in entities
- **Design Patterns**: Strategy, Repository, State Machine, Observer, Specification
- **TypeScript Strict Mode**: Zero `any` types, comprehensive type safety
- **Test-Driven**: AAA pattern, 80%+ coverage target for domain and application layers

---

## Technology Stack

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| **Language** | TypeScript | 5.3.3 | Primary development language with strict mode |
| **Runtime** | Node.js | 20.11.0 LTS | JavaScript runtime |
| **Framework** | Fastify | 4.26.0 | REST API framework (future story) |
| **Database** | PostgreSQL | 16.1 | Primary data store (Docker) |
| **ORM** | Prisma | 5.9.1 | Type-safe database client (Story 1.3) |
| **Date/Time** | Luxon | 3.4.4 | Timezone handling (Story 1.5) |
| **Local AWS** | LocalStack | 3.1.0 | AWS service emulation (Docker) |
| **Build Tool** | esbuild | 0.20.0 | Fast TypeScript compilation |
| **Linting** | ESLint | 8.56.0 | Code quality enforcement |
| **Formatting** | Prettier | 3.2.5 | Code formatting |
| **Testing** | Jest | 29.7.0 | Unit/Integration/E2E tests (future story) |
| **Validation** | Zod | 3.25.1 | Runtime schema validation (future story) |
| **Message Queue** | AWS SQS | - | Event buffering (future story) |
| **Scheduler** | AWS EventBridge | - | Periodic triggers (future story) |
| **Deployment** | AWS Lambda | - | Serverless compute (future story) |

---

## Getting Started

### Prerequisites

- **Node.js**: 20.11.0 LTS
- **npm**: 10.x (comes with Node.js)
- **Git**: Latest version
- **Docker**: 24.0.7+ with Docker Compose
- **PostgreSQL Client** (optional): For manual database access

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd bday

# Install dependencies
npm install

# Copy environment variables template
cp .env.example .env

# Start Docker development environment
npm run docker:start

# Build the project
npm run build
```

### Local Development with Docker

The project uses Docker Compose to run PostgreSQL and LocalStack (AWS service emulation) locally.

#### Starting the Environment

```bash
# Start all services (PostgreSQL + LocalStack)
npm run docker:start

# Or use the helper script directly
./scripts/docker-start.sh
```

This will start:

- **PostgreSQL 16.1** on `localhost:5432`
- **LocalStack 3.1.0** on `http://localhost:4566` (API Gateway, Lambda, SQS, EventBridge, SNS)

#### Stopping the Environment

```bash
# Stop all services
npm run docker:stop

# Or use the helper script
./scripts/docker-stop.sh
```

#### Viewing Logs

```bash
# View all service logs
npm run docker:logs

# View specific service logs
./scripts/docker-logs.sh postgres
./scripts/docker-logs.sh localstack
```

#### Resetting the Database

```bash
# WARNING: This deletes all data!
npm run docker:reset

# Or use the helper script
./scripts/docker-reset.sh
```

This stops containers, removes all volumes (data), and restarts fresh.

#### Complete Teardown

To completely remove Docker containers, volumes, and free up disk space:

**Remove containers and volumes (recommended):**

```bash
npm run docker:teardown

# Or use docker-compose directly
cd docker && docker-compose down -v
```

This removes:

- ✅ Containers (stopped and removed)
- ✅ Volumes (all database data deleted)
- ✅ Networks (removed)
- ❌ Images (kept for faster restart)

**Remove everything including images (nuclear option):**

```bash
npm run docker:teardown:all

# Or use docker-compose directly
cd docker && docker-compose down -v --rmi all
```

This removes containers, volumes, networks, AND Docker images (PostgreSQL, LocalStack). You'll need to re-download images (~500MB) on next start.

**When to use:**

- **`docker-compose down -v`**: Clean up test data completely
- **`docker-compose down -v --rmi all`**: Free up disk space, remove all traces

#### Accessing PostgreSQL

```bash
# Using psql (if installed)
psql -h localhost -p 5432 -U bday_user -d bday_db
# Password: local_dev_password (from .env)

# Or using Docker exec
docker exec -it bday-postgres psql -U bday_user -d bday_db
```

#### LocalStack Setup

LocalStack provides local AWS service emulation. The setup is automated via Docker Compose.

**Two-Step Deployment Process:**

1. **Start Infrastructure** (automatic via docker-compose):
   ```bash
   npm run docker:start
   ```

   This creates persistent infrastructure:
   - SQS queues: `events-queue`, `events-dlq`
   - EventBridge rule: `event-scheduler-rule`
   - IAM role: `lambda-execution-role`

2. **Deploy Lambda Function** (manual):
   ```bash
   # Build and deploy Lambda
   npm run lambda:all

   # Or run separately:
   npm run lambda:build                 # Build Lambda package
   npm run lambda:deploy:localstack     # Deploy to LocalStack
   ```

**Verify LocalStack Health:**
```bash
# Check all services
curl http://localhost:4566/_localstack/health

# List SQS queues (requires awslocal CLI)
awslocal sqs list-queues

# List Lambda functions
awslocal lambda list-functions

# List EventBridge rules
awslocal events list-rules
```

**Documentation:**
- [LocalStack Setup Guide](docs/architecture/localstack-setup.md) - Architecture and best practices
- [LocalStack Troubleshooting](docs/architecture/localstack-troubleshooting.md) - Common issues and solutions

#### Troubleshooting Docker

**Services won't start:**

```bash
# Check if ports are already in use
lsof -i :5432   # PostgreSQL
lsof -i :4566   # LocalStack

# View detailed logs
docker-compose -f docker/docker-compose.yml logs
```

**Database connection errors:**

```bash
# Verify PostgreSQL is healthy
docker-compose -f docker/docker-compose.yml ps

# Check PostgreSQL logs
docker logs bday-postgres
```

**Reset everything:**

```bash
# Stop services, remove volumes, and restart
npm run docker:reset
```

### Database Schema & Migrations

The project uses Prisma ORM for type-safe database access and migrations.

#### Running Migrations

```bash
# Create and apply a new migration (development)
npm run prisma:migrate

# Generate Prisma Client (after schema changes)
npm run prisma:generate
```

#### Seeding the Database

```bash
# Populate database with sample data
npm run db:seed
```

This creates:
- 3 sample users (John Doe, Jane Smith, Bob Johnson)
- 3 sample birthday events with different timezones

#### Resetting the Database

```bash
# WARNING: This deletes all data and reapplies migrations
npm run db:reset
```

#### Viewing Database

```bash
# Open Prisma Studio (database GUI)
npm run prisma:studio
```

This opens a web interface at http://localhost:5555 where you can view and edit data.

### Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| **Build** | `npm run build` | Compile TypeScript to JavaScript using esbuild |
| **Build Watch** | `npm run build:watch` | Compile with watch mode for development |
| **Test** | `npm test` | Run all tests (unit + integration) |
| **Test Watch** | `npm run test:watch` | Run tests in watch mode |
| **Test Coverage** | `npm run test:coverage` | Generate test coverage report |
| **Lint** | `npm run lint` | Run ESLint on source files |
| **Format** | `npm run format` | Format code with Prettier |
| **Docker Start** | `npm run docker:start` | Start PostgreSQL and LocalStack |
| **Docker Stop** | `npm run docker:stop` | Stop all Docker services |
| **Docker Reset** | `npm run docker:reset` | Reset database (deletes all data) |
| **Docker Logs** | `npm run docker:logs` | View logs for all services |
| **Docker Teardown** | `npm run docker:teardown` | Remove containers and volumes |
| **Docker Teardown All** | `npm run docker:teardown:all` | Remove containers, volumes, and images |
| **Prisma Generate** | `npm run prisma:generate` | Generate Prisma Client |
| **Prisma Migrate** | `npm run prisma:migrate` | Create and apply migrations |
| **Prisma Studio** | `npm run prisma:studio` | Open database GUI |
| **DB Seed** | `npm run db:seed` | Populate database with sample data |
| **DB Reset** | `npm run db:reset` | Reset database (deletes all data, reapplies migrations, reseeds) |
| **Lambda Build** | `npm run lambda:build` | Build Lambda package for LocalStack |
| **Lambda Deploy** | `npm run lambda:deploy:localstack` | Deploy Lambda to LocalStack using AWS SDK |
| **Lambda All** | `npm run lambda:all` | Build and deploy Lambda (recommended) |

### Code Quality

Pre-commit hooks are configured to automatically run linting and formatting on all staged TypeScript files. This ensures code quality is maintained throughout development.

---

## Project Structure

```
bday/
├── docker/                  # Docker Compose configuration (Story 1.2) ✅
│   ├── docker-compose.yml   # PostgreSQL + LocalStack
│   ├── postgres/            # PostgreSQL initialization
│   └── localstack/          # AWS service initialization
│
├── prisma/                  # Prisma ORM (Story 1.3) ✅
│   ├── schema.prisma        # Database schema definition
│   ├── migrations/          # Database migration files
│   └── seed.ts              # Database seeding script
│
├── scripts/                 # Helper scripts (Story 1.2, 1.3) ✅
│   ├── docker-start.sh      # Start Docker environment
│   ├── docker-stop.sh       # Stop Docker services
│   ├── docker-reset.sh      # Reset database
│   ├── docker-logs.sh       # View service logs
│   └── db-reset.sh          # Reset database with Prisma
│
├── src/                     # Source code (Stories 1.4+)
│   ├── domain/              # Pure business logic (Story 1.4, 1.5)
│   ├── application/         # Use cases (Story 1.6+)
│   ├── adapters/            # Infrastructure (Story 1.7+)
│   ├── shared/              # Shared utilities
│   └── index.ts             # Placeholder entry point
│
├── docs/                    # Architecture documentation ✅
│   ├── architecture.md      # Main architecture document
│   ├── architecture/        # Sharded architecture docs
│   ├── prd.md               # Product requirements
│   ├── prd/                 # Sharded PRD (epics)
│   └── stories/             # Story files (BMAD workflow)
│
├── .env                     # Local environment config (gitignored) ✅
├── .env.example             # Environment template ✅
├── package.json             # Dependencies and scripts ✅
├── tsconfig.json            # TypeScript strict mode config ✅
├── .eslintrc.js             # ESLint rules ✅
├── .prettierrc              # Code formatting ✅
└── README.md                # This file ✅
```

---

## Development Workflow

### Making Changes

1. Create/modify TypeScript files in `src/`
2. Run `npm run lint` to check for errors
3. Run `npm run format` to format code
4. Run `npm run build` to compile
5. Commit changes (pre-commit hooks will run automatically)

### Code Standards

#### Critical Rules

- **No console.log in production**: Use logger (Pino) - enforced by ESLint
- **No `any` types**: Use explicit types or `unknown` - enforced by TypeScript strict mode
- **Repository pattern required**: All database access through interfaces
- **Domain layer purity**: Zero imports from adapters or infrastructure

#### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Classes | PascalCase | `User`, `CreateUserUseCase` |
| Interfaces (Ports) | PascalCase with `I` prefix | `IUserRepository` |
| Files | kebab-case (infra), PascalCase (domain) | `user.routes.ts`, `User.ts` |
| Variables/Functions | camelCase | `calculateNextBirthday` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| Test Files | `*.test.ts` | `User.test.ts` |

---

## Key Features (Planned)

### Phase 1 MVP - In Progress

- ⏳ **Multi-timezone Support**: Send messages at exactly 9am local time across all timezones
- ⏳ **Exactly-Once Delivery**: No duplicate messages, guaranteed
- ⏳ **Failure Recovery**: System recovers from downtime and catches up on missed events
- ⏳ **RESTful API**: Create, read, update, delete users
- ⏳ **Automatic Scheduling**: Events generated and scheduled automatically
- ✅ **Extensible Architecture**: Hexagonal + DDD patterns established

### Completed Infrastructure

- ✅ **Development Environment**: Docker Compose with PostgreSQL and LocalStack
- ✅ **Build Tooling**: TypeScript strict mode, ESLint, Prettier, esbuild
- ✅ **Database Schema**: Prisma ORM with migrations and seeding
- ✅ **Code Quality**: Pre-commit hooks, linting, formatting enforcement
- ✅ **Architecture Documentation**: Comprehensive design docs with BMAD workflow

### Future Phases

- **Phase 2**: Additional event types (anniversary, custom events)
- **Phase 3**: Advanced features (authentication, dashboard, audit trail)
- **Phase 4**: Production readiness (multi-tenancy, monitoring, scaling)

---

## Testing

The project uses **Jest** for testing with a comprehensive test suite covering unit, integration, and E2E tests.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (during development)
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run specific test file
npm test -- PrismaEventRepository.test.ts

# Run tests matching a pattern
npm test -- -t "should prevent duplicate claims"
```

### Test Types

#### Integration Tests ✅ Implemented

Integration tests verify adapter implementations with real database connections:

```bash
# Run integration tests (requires Docker PostgreSQL)
npm run docker:start
npm test
```

**Key integration tests:**
- **Repository implementations**: PrismaEventRepository, PrismaUserRepository
- **Database transactions**: Verify atomicity and isolation
- **Concurrency tests**: Distributed scheduler with `FOR UPDATE SKIP LOCKED`
- **Optimistic locking**: Version-based concurrency control

**Location:** `src/__tests__/integration/`

#### Unit Tests 🚧 In Progress

Unit tests cover domain entities, value objects, and services:

- **Domain entities**: User, Event business logic
- **Value objects**: EventStatus, IdempotencyKey, Timezone
- **Services**: TimezoneService, EventHandlerRegistry

**Target coverage:** 100% for domain layer

#### E2E Tests ✅ Implemented (Lambda)

End-to-end tests verify the complete Lambda deployment and execution flow in LocalStack:

```bash
# Deploy Lambda to LocalStack
npm run lambda:all

# Run E2E tests for deployed Lambda
npm test -- schedulerHandler.e2e.test.ts
```

**Scheduler Lambda E2E Tests:**

- **Infrastructure verification**: Lambda function exists with correct configuration
- **EventBridge integration**: Rule has Lambda as target
- **Manual invocation**: Lambda claims events and sends to SQS
- **Error handling**: Lambda handles empty database gracefully

**Quick Reference - Lambda Commands:**

```bash
npm run lambda:build          # Build Lambda package with esbuild
npm run lambda:deploy:localstack  # Deploy to LocalStack
npm run lambda:all            # Build + Deploy (recommended)
```

**Test all scheduler layers:**

```bash
# Run all scheduler tests (unit + integration + E2E)
npm test -- schedulerHandler

# Run specific test types
npm test -- schedulerHandler.test.ts              # Unit tests only
npm test -- schedulerHandler.integration.test.ts  # Integration tests only
npm test -- schedulerHandler.e2e.test.ts          # E2E tests only
```

**Location:** `src/adapters/primary/lambda/*.e2e.test.ts`

### Testing Infrastructure

**Test Database:**
- PostgreSQL 16 in Docker via Testcontainers
- Automatic schema migration before tests
- Database cleanup between test suites

**Test Helpers:**
- `testDatabase.ts` - Database lifecycle management
- Builders for domain entities (User, Event)
- Fixture data generators

### Testing Connection Pooling (Advanced)

For testing Lambda connection pooling behavior locally with PgBouncer, see:
- [Local Development - Connection Pooling Testing](docs/architecture/local-development.md#connection-pooling-testing)

This covers:
- Setting up PgBouncer with Docker
- Testing connection reuse efficiency
- Verifying FOR UPDATE SKIP LOCKED works with pooling
- Monitoring connection pool statistics

### Test Organization

Tests are colocated with source code in `__tests__` directories:

```
src/
├── __tests__/
│   ├── integration/     # Integration tests with real DB
│   │   ├── adapters/
│   │   │   └── secondary/
│   │   │       └── persistence/
│   │   │           └── PrismaEventRepository.test.ts
│   │   └── helpers/
│   │       └── testDatabase.ts
│   └── unit/            # Unit tests (coming soon)
│
├── domain/
│   └── entities/
│       └── User.test.ts  # Unit tests colocated
```

### Coverage Targets

| Layer | Target | Current |
|-------|--------|---------|
| **Domain** | 100% | 🚧 In progress |
| **Application** | 80% | 📋 Planned |
| **Adapters** | 80% | ✅ ~90% |

### Key Test Cases

**Distributed Scheduler Concurrency:**
```typescript
// Verifies FOR UPDATE SKIP LOCKED prevents duplicate claims
it('should prevent duplicate claims when called concurrently', async () => {
  // 10 PENDING events, 3 concurrent claimReadyEvents() calls
  // Result: All 10 events claimed exactly once, no duplicates
});
```

**Optimistic Locking:**
```typescript
// Verifies version-based concurrency control
it('should fail with stale version (optimistic locking)', async () => {
  // Update event → succeeds
  // Try to update with stale version → throws OptimisticLockError
});
```

See [Test Strategy](docs/architecture/test-strategy.md) for complete testing documentation.

---

## Documentation

### Core Documents

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | System architecture and design patterns |
| [Design Patterns](docs/architecture/design-patterns.md) | Distributed Scheduler Pattern, FOR UPDATE SKIP LOCKED |
| [Local Development](docs/architecture/local-development.md) | Docker setup, testing, PgBouncer connection pooling |
| [Infrastructure](docs/architecture/infrastructure.md) | AWS deployment (Lambda, ECS/EKS, RDS Proxy) |
| [Test Strategy](docs/architecture/test-strategy.md) | Testing approaches and coverage targets |
| [PRD](docs/prd.md) | Product requirements and user stories |
| [Tech Stack](docs/architecture/tech-stack.md) | Technology choices and rationale |
| [Coding Standards](docs/architecture/coding-standards.md) | Development guidelines |
| [Source Tree](docs/architecture/source-tree.md) | Project structure details |

### Quick Start Guides

| Topic | Document | Section |
|-------|----------|---------|
| **Get Started Locally** | [Local Development](docs/architecture/local-development.md#quick-start) | Setup in 4 steps |
| **Run Tests** | [Local Development](docs/architecture/local-development.md#testing) | Unit, integration, E2E tests |
| **Connection Pooling** | [Local Development](docs/architecture/local-development.md#connection-pooling-testing) | PgBouncer setup and testing |
| **Database Management** | [Local Development](docs/architecture/local-development.md#database-management) | Migrations, seeding, Prisma Studio |

### Key Technical Topics

| Topic | Document | Section |
|-------|----------|---------|
| **Distributed Scheduler** | [Design Patterns](docs/architecture/design-patterns.md#8-distributed-scheduler-pattern---concurrent-job-claiming) | FOR UPDATE SKIP LOCKED explanation |
| **Lambda vs Containers** | [Infrastructure](docs/architecture/infrastructure.md#scheduler-deployment-options) | Deployment architecture comparison |
| **Query Performance** | [Design Patterns](docs/architecture/design-patterns.md#query-performance-and-indexing) | Index optimization guide |
| **Concurrency Testing** | [Local Development](docs/architecture/local-development.md#connection-pooling-testing) | Integration test examples |

---

## Development Status

### Current Phase: Epic 1 - Foundation & User Management 🚧

**Progress**: 3/9 stories complete (33%)

#### Completed Stories ✅

**Story 1.1: Project Setup & Monorepo Foundation** ✅

- Git repository, TypeScript 5.3.3 strict mode
- ESLint 8.56.0, Prettier 3.2.5, esbuild 0.20.0
- Pre-commit hooks with husky + lint-staged
- Comprehensive architecture documentation

**Story 1.2: Docker Development Environment** ✅

- Docker Compose with PostgreSQL 16.1
- LocalStack 3.1.0 (API Gateway, Lambda, SQS, EventBridge, SNS)
- Database initialization scripts (uuid-ossp extension)
- Helper scripts for Docker operations

**Story 1.3: Database Schema & Prisma Setup** ✅

- Prisma ORM 5.9.1 configured with PostgreSQL
- Complete database schema (users and events tables)
- Initial migration created and applied
- Database seeding with sample data
- Prisma Client generated with full TypeScript types

#### Next Up 📋

**Story 1.4: Domain Layer - User & Event Entities** ⏳ Next

- Pure domain entities with business logic
- Value objects for type safety
- Domain-driven design patterns

**Upcoming in Epic 1:**

- Story 1.5: Timezone Service
- Story 1.6: Repository Port Interfaces
- Story 1.7: Prisma Repository Implementations
- Story 1.8: Create User Use Case
- Story 1.9: User CRUD Use Cases & REST API

See [docs/prd/epic-1-foundation-user-management.md](docs/prd/epic-1-foundation-user-management.md) for full epic details.

---

## Development Methodology

This project follows the **BMAD (Business-to-Market Accelerated Delivery)** methodology:

- **Story-Driven Development**: Each feature is a well-defined story with acceptance criteria
- **Comprehensive Planning**: Architecture-first approach with detailed technical documentation
- **AI-Assisted Development**: Stories created by SM agent, implemented by Dev agent, reviewed by QA agent
- **Quality Gates**: Each story includes mandatory QA review before marking as "Done"

See [.bmad-core/](. bmad-core/) for workflow configuration and agent definitions.

---

## Contributing

This is a demonstration project showcasing:

- Hexagonal Architecture + Domain-Driven Design
- BMAD methodology for AI-assisted development
- TypeScript strict mode best practices
- Comprehensive testing strategies

Code standards are strictly enforced:

- TypeScript strict mode (zero `any` types)
- ESLint + Prettier via pre-commit hooks
- Test coverage targets (when testing infrastructure is added)

---

## License

ISC

---

**Status**: 🚧 Epic 1 In Progress | 3/9 Stories Complete

**Last Updated**: 2025-10-20
