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

#### Accessing PostgreSQL

```bash
# Using psql (if installed)
psql -h localhost -p 5432 -U bday_user -d bday_db
# Password: local_dev_password (from .env)

# Or using Docker exec
docker exec -it bday-postgres psql -U bday_user -d bday_db
```

#### Testing LocalStack

```bash
# Check LocalStack health
curl http://localhost:4566/_localstack/health

# List SQS queues (requires awslocal CLI)
awslocal sqs list-queues

# List EventBridge rules
awslocal events list-rules
```

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

### Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| **Build** | `npm run build` | Compile TypeScript to JavaScript using esbuild |
| **Build Watch** | `npm run build:watch` | Compile with watch mode for development |
| **Lint** | `npm run lint` | Run ESLint on source files |
| **Format** | `npm run format` | Format code with Prettier |
| **Docker Start** | `npm run docker:start` | Start PostgreSQL and LocalStack |
| **Docker Stop** | `npm run docker:stop` | Stop all Docker services |
| **Docker Reset** | `npm run docker:reset` | Reset database (deletes all data) |
| **Docker Logs** | `npm run docker:logs` | View logs for all services |

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
├── scripts/                 # Helper scripts (Story 1.2) ✅
│   ├── docker-start.sh      # Start Docker environment
│   ├── docker-stop.sh       # Stop Docker services
│   ├── docker-reset.sh      # Reset database
│   └── docker-logs.sh       # View service logs
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
- ✅ **Code Quality**: Pre-commit hooks, linting, formatting enforcement
- ✅ **Architecture Documentation**: Comprehensive design docs with BMAD workflow

### Future Phases

- **Phase 2**: Additional event types (anniversary, custom events)
- **Phase 3**: Advanced features (authentication, dashboard, audit trail)
- **Phase 4**: Production readiness (multi-tenancy, monitoring, scaling)

---

## Testing Strategy (Future)

- **Unit Tests**: Domain entities, value objects, services (100% coverage target)
- **Integration Tests**: Repository implementations, use cases (80% coverage target)
- **E2E Tests**: Full user workflows with real database
- **Test Organization**: Colocated `*.test.ts` files or parallel `tests/` directory

---

## Documentation

### Core Documents

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | System architecture and design patterns |
| [PRD](docs/prd.md) | Product requirements and user stories |
| [Tech Stack](docs/architecture/tech-stack.md) | Technology choices and rationale |
| [Coding Standards](docs/architecture/coding-standards.md) | Development guidelines |
| [Source Tree](docs/architecture/source-tree.md) | Project structure details |

---

## Development Status

### Current Phase: Epic 1 - Foundation & User Management 🚧

**Progress**: 2/10 stories complete (20%)

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

#### Next Up 📋

**Story 1.3: Database Schema & Prisma Setup** ⏳ Next

- Prisma ORM configuration
- Database schema for users and events tables
- Migrations and seeding

**Upcoming in Epic 1:**

- Story 1.4: Domain Layer - User & Event Entities
- Story 1.5: Timezone Service
- Story 1.6: Repository Port Interfaces
- Story 1.7: Prisma Repository Implementations
- Story 1.8: Create User Use Case
- Story 1.9: User CRUD Use Cases & REST API
- Story 1.10: CI/CD Pipeline Setup

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

**Status**: 🚧 Epic 1 In Progress | 2/10 Stories Complete

**Last Updated**: 2025-10-20
