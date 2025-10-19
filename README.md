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
| **Database** | PostgreSQL | 16.1 | Primary data store (future story) |
| **ORM** | Prisma | 5.9.1 | Type-safe database client (future story) |
| **Date/Time** | Luxon | 3.4.4 | Timezone handling (future story) |
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

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd bday

# Install dependencies
npm install

# Build the project
npm run build
```

### Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| **Build** | `npm run build` | Compile TypeScript to JavaScript using esbuild |
| **Build Watch** | `npm run build:watch` | Compile with watch mode for development |
| **Lint** | `npm run lint` | Run ESLint on source files |
| **Format** | `npm run format` | Format code with Prettier |

### Code Quality

Pre-commit hooks are configured to automatically run linting and formatting on all staged TypeScript files. This ensures code quality is maintained throughout development.

---

## Project Structure

```
bday/
├── .github/
│   └── workflows/           # CI/CD pipelines (future story)
│
├── src/
│   ├── domain/              # Pure business logic (no dependencies)
│   │   ├── entities/        # Domain entities (User, Event)
│   │   ├── value-objects/   # Value objects (Timezone, DateOfBirth)
│   │   ├── services/        # Domain services
│   │   └── errors/          # Domain-specific errors
│   │
│   ├── application/         # Use cases and orchestration
│   │   ├── ports/           # Interface definitions
│   │   └── use-cases/       # Application use cases
│   │
│   ├── adapters/            # Infrastructure implementations
│   │   ├── primary/         # Inbound adapters (HTTP, Lambda)
│   │   └── secondary/       # Outbound adapters (Database, Queue)
│   │
│   ├── shared/              # Shared utilities
│   │   ├── types/           # Common types
│   │   ├── errors/          # Application errors
│   │   └── utils/           # Helper functions
│   │
│   └── index.ts             # Main entry point
│
├── tests/                   # E2E tests (future story)
├── docs/                    # Documentation
├── .gitignore               # Git ignore patterns
├── package.json             # Project metadata and dependencies
├── tsconfig.json            # TypeScript configuration
├── .eslintrc.js             # ESLint configuration
├── .prettierrc              # Prettier configuration
└── README.md                # This file
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

### Phase 1 MVP

- ✅ **Multi-timezone Support**: Send messages at exactly 9am local time across all timezones
- ✅ **Exactly-Once Delivery**: No duplicate messages, guaranteed
- ✅ **Failure Recovery**: System recovers from downtime and catches up on missed events
- ✅ **RESTful API**: Create, read, update, delete users
- ✅ **Automatic Scheduling**: Events generated and scheduled automatically
- ✅ **Extensible Architecture**: Built to support future event types without core changes

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

### Current Phase: Phase 1 - Foundation & User Management 🚧

**Story 1.1: Project Setup & Monorepo Foundation** ✅ Complete
- ✅ Git repository configured
- ✅ TypeScript 5.3.3 with strict mode
- ✅ ESLint 8.56.0 and Prettier 3.2.5
- ✅ esbuild 0.20.0 for compilation
- ✅ Pre-commit hooks configured
- ✅ README.md complete

**Next Stories**:
- Story 1.2: Docker Development Environment
- Story 1.3: Database Schema & Prisma Setup
- Story 1.4: Domain Layer - User & Event Entities

---

## Contributing

This is currently a learning and demonstration project. Code standards are strictly enforced:

- TypeScript strict mode (zero `any` types)
- ESLint + Prettier enforced via pre-commit hooks
- All tests must pass (future)
- 80%+ test coverage for domain/application layers (future)

---

## License

ISC

---

## Contact

- **Documentation**: [docs/](docs/)
- **Issues**: GitHub Issues
- **Repository**: [GitHub URL]

---

**Status**: 🚧 Phase 1 In Progress | Story 1.1 Complete

**Last Updated**: 2025-10-20
