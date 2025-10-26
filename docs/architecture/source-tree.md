# Source Tree Structure

**Hexagonal Architecture + DDD + Bounded Contexts with npm workspaces**

Reference: [Full Architecture Document](../architecture.md#source-tree)

**Note:** ✅ **Story 1.7b** - Reorganized to bounded context folder structure

---

## Project Structure

```text
bday/
├── .github/                            # (Future Phase - CI/CD)
│   └── workflows/
│       ├── ci.yml                      # GitHub Actions CI pipeline (Future)
│       └── deploy.yml                  # Deployment workflow (Future)
│
├── prisma/
│   ├── schema.prisma                   # Prisma schema definition
│   ├── migrations/                     # Database migration files
│   │   └── 20251020_init/
│   │       └── migration.sql
│   └── seed.ts                         # Database seeding script
│
├── src/
│   ├── modules/                        # ✅ BOUNDED CONTEXTS (Story 1.7b)
│   │   ├── user/                       # USER BOUNDED CONTEXT
│   │   │   ├── domain/
│   │   │   │   ├── entities/
│   │   │   │   │   ├── User.ts         # ✅ User aggregate root
│   │   │   │   │   └── User.test.ts    # ✅ User unit tests
│   │   │   │   └── value-objects/
│   │   │   │       ├── DateOfBirth.ts      # ✅ Birthday value object
│   │   │   │       └── DateOfBirth.test.ts # ✅ DateOfBirth unit tests
│   │   │   ├── application/
│   │   │   │   ├── ports/
│   │   │   │   │   ├── IUserRepository.ts      # ✅ User repository port
│   │   │   │   │   └── IUserRepository.test.ts # ✅ Port tests
│   │   │   │   └── use-cases/
│   │   │   │       ├── CreateUserUseCase.ts    # ✅ DONE (Story 1.8)
│   │   │   │       └── CreateUserUseCase.test.ts # ✅ Use case tests
│   │   │   └── adapters/
│   │   │       └── persistence/
│   │   │           ├── PrismaUserRepository.ts  # ✅ DONE (Story 1.7)
│   │   │           ├── PrismaUserRepository.integration.test.ts # ✅ 7 tests
│   │   │           └── mappers/
│   │   │               └── userMapper.ts        # ✅ Prisma ↔ Domain mapping
│   │   │
│   │   └── event-scheduling/           # EVENT SCHEDULING BOUNDED CONTEXT
│   │       ├── domain/
│   │       │   ├── entities/
│   │       │   │   ├── Event.ts        # ✅ Event aggregate root
│   │       │   │   └── Event.test.ts   # ✅ Event unit tests
│   │       │   ├── value-objects/
│   │       │   │   ├── EventStatus.ts          # ✅ Event status enum
│   │       │   │   ├── EventStatus.test.ts     # ✅ EventStatus tests
│   │       │   │   ├── IdempotencyKey.ts       # ✅ Idempotency key generator
│   │       │   │   └── IdempotencyKey.test.ts  # ✅ IdempotencyKey tests
│   │       │   └── services/
│   │       │       ├── TimezoneService.ts      # ✅ DONE (Story 1.5)
│   │       │       ├── TimezoneService.test.ts # ✅ 15 tests
│   │       │       ├── RecoveryService.ts      # ✅ DONE (Story 3.1) - System-triggered service
│   │       │       ├── RecoveryService.test.ts # ✅ 6 tests
│   │       │       └── event-handlers/         # ✅ DONE (Story 1.5)
│   │       │           ├── IEventHandler.ts    # ✅ Event handler interface
│   │       │           ├── EventHandlerRegistry.ts     # ✅ Strategy registry
│   │       │           ├── EventHandlerRegistry.test.ts # ✅ 16 tests
│   │       │           ├── BirthdayEventHandler.ts       # ✅ Birthday strategy
│   │       │           └── BirthdayEventHandler.test.ts  # ✅ 18 tests
│   │       ├── application/
│   │       │   └── ports/
│   │       │       ├── IEventRepository.ts      # ✅ Event repository port
│   │       │       └── IEventRepository.test.ts # ✅ Port tests
│   │       └── adapters/
│   │           └── persistence/
│   │               ├── PrismaEventRepository.ts  # ✅ DONE (Story 1.7)
│   │               ├── PrismaEventRepository.integration.test.ts # ✅ 11 tests
│   │               └── mappers/
│   │                   └── eventMapper.ts        # ✅ Prisma ↔ Domain mapping
│   │
│   ├── shared/                         # ✅ SHARED KERNEL (Story 1.7b)
│   │   ├── value-objects/
│   │   │   ├── Timezone.ts             # ✅ IANA timezone (shared)
│   │   │   └── Timezone.test.ts        # ✅ Timezone tests
│   │   └── validation/
│   │       └── schemas.ts              # ✅ Zod schemas
│   │
│   ├── domain/                         # Legacy shared domain artifacts
│   │   ├── errors/                     # Shared error classes
│   │   │   ├── DomainError.ts
│   │   │   ├── InvalidTimezoneError.ts
│   │   │   ├── InvalidDateOfBirthError.ts
│   │   │   ├── InvalidStateTransitionError.ts
│   │   │   ├── ValidationError.ts
│   │   │   └── OptimisticLockError.ts
│   │   └── schemas/                    # Prisma-generated schemas
│   │       ├── EntitySchemas.ts        # User & Event schemas
│   │       └── generated/              # Auto-generated Prisma schemas
│   │
│   ├── __tests__/                      # Shared test utilities
│   │   └── integration/
│   │       └── helpers/
│   │           └── testDatabase.ts     # ✅ Test DB helpers
│   │       │   ├── UpdateUserUseCase.test.ts
│   │       │   ├── DeleteUserUseCase.ts
│   │       │   └── DeleteUserUseCase.test.ts
│   │       └── event/
│   │           ├── GenerateBirthdayEventUseCase.ts
│   │           ├── GenerateBirthdayEventUseCase.test.ts
│   │           ├── ClaimReadyEventsUseCase.ts
│   │           ├── ClaimReadyEventsUseCase.test.ts
│   │           ├── ExecuteEventUseCase.ts
│   │           ├── ExecuteEventUseCase.test.ts
│   │           ├── HandleEventFailureUseCase.ts
│   │           └── HandleEventFailureUseCase.test.ts
│   │
│   ├── adapters/                       # Infrastructure implementations
│   │   ├── primary/                    # Inbound adapters (entry points)
│   │   │   ├── http/
│   │   │   │   ├── routes/
│   │   │   │   │   ├── user.routes.ts  # Fastify routes for /user
│   │   │   │   │   └── health.routes.ts
│   │   │   │   ├── controllers/
│   │   │   │   │   └── UserController.ts
│   │   │   │   ├── middleware/
│   │   │   │   │   ├── errorHandler.ts
│   │   │   │   │   ├── requestLogger.ts
│   │   │   │   │   └── validation.ts
│   │   │   │   └── server.ts           # Fastify app setup
│   │   │   └── lambda/
│   │   │       ├── api-handler.ts      # API Gateway → Fastify wrapper (@fastify/aws-lambda)
│   │   │       ├── scheduler-handler.ts # EventBridge → Scheduler
│   │   │       └── worker-handler.ts   # SQS → Executor
│   │   │
│   │   └── secondary/                  # Outbound adapters (infrastructure)
│   │       ├── persistence/
│   │       │   ├── PrismaUserRepository.ts
│   │       │   ├── PrismaUserRepository.test.ts    # Integration tests
│   │       │   ├── PrismaEventRepository.ts
│   │       │   ├── PrismaEventRepository.test.ts   # Integration tests
│   │       │   └── PrismaClient.ts     # Singleton client
│   │       ├── messaging/
│   │       │   ├── SQSMessageSender.ts
│   │       │   ├── SQSMessageSender.test.ts        # Integration tests
│   │       │   ├── SQSMessageConsumer.ts
│   │       │   └── SQSMessageConsumer.test.ts      # Integration tests
│   │       └── delivery/
│   │           ├── WebhookDeliveryAdapter.ts
│   │           └── WebhookDeliveryAdapter.test.ts  # Integration tests
│   │
│   ├── shared/                         # Shared utilities
│   │   ├── types/
│   │   │   ├── DTOs.ts                 # Data transfer objects
│   │   │   └── common.ts
│   │   ├── errors/
│   │   │   └── ApplicationError.ts     # Base application error
│   │   ├── utils/
│   │   │   ├── logger.ts               # Pino logger setup
│   │   │   └── config.ts               # Environment configuration
│   │   └── validation/
│   │       └── schemas.ts              # Zod validation schemas
│   │
│   └── index.ts                        # Main entry point (local dev)
│
├── tests/                              # E2E tests only (cross-system tests)
│   ├── e2e/
│   │   ├── user-lifecycle.e2e.test.ts
│   │   ├── event-scheduling.e2e.test.ts
│   │   └── failure-recovery.e2e.test.ts
│   └── helpers/
│       ├── builders/                   # Builder pattern for test data
│       │   ├── UserBuilder.ts          # Fluent API for User creation
│       │   ├── UserBuilder.test.ts
│       │   ├── EventBuilder.ts         # Fluent API for Event creation
│       │   └── EventBuilder.test.ts
│       ├── fixtures.ts                 # Test data factories
│       ├── test-container.ts           # Testcontainers setup
│       └── time-helpers.ts             # Time mocking utilities
│
├── infrastructure/                     # IaC (Phase 2+)
│   ├── lib/
│   │   ├── database-stack.ts           # RDS PostgreSQL
│   │   ├── api-stack.ts                # API Gateway + Lambda
│   │   ├── scheduler-stack.ts          # EventBridge + Scheduler Lambda
│   │   └── queue-stack.ts              # SQS + Worker Lambda
│   └── bin/
│       └── app.ts                      # CDK app entry point
│
├── docker/
│   ├── docker-compose.yml              # Local development stack
│   ├── Dockerfile                      # Application container
│   └── localstack/
│       └── init-aws.sh                 # LocalStack initialization
│
├── scripts/
│   ├── setup-local.sh                  # Local environment setup
│   ├── seed-db.sh                      # Database seeding
│   └── run-migrations.sh               # Prisma migration runner
│
├── .env.example                        # Environment variable template
├── .eslintrc.js                        # ESLint configuration
├── .prettierrc                         # Prettier configuration
├── jest.config.js                      # Jest test configuration
├── tsconfig.json                       # TypeScript configuration
├── package.json                        # Root package.json
└── README.md                           # Project documentation
```

---

## Key Organizational Principles

### Domain Layer Purity

`src/domain/` has zero imports from infrastructure or frameworks. This layer contains pure business logic with no external dependencies.

### Hexagonal Separation

- **Primary Adapters (Inbound):** HTTP, Lambda handlers are thin wrappers around use cases
- **Secondary Adapters (Outbound):** Prisma repositories, SQS clients implement port interfaces
- **Ports:** Interfaces in `application/ports/` define contracts

### Test Structure Mirrors Source

Each test folder matches the `src/` structure for easy navigation and maintenance.

### Infrastructure as Code

Separate `infrastructure/` directory for CDK stacks (Phase 2+). Keep infrastructure code separate from application code.

### Local Development

`docker/` contains Docker Compose for PostgreSQL + LocalStack. All local development runs in containers.

---

## Import Rules

### Domain Layer (`src/domain/`)

- ✅ Can import: Nothing (pure TypeScript, framework-agnostic)
- ❌ Cannot import: Adapters, shared utilities, external frameworks

### Application Layer (`src/application/`)

- ✅ Can import: Domain entities, value objects, domain services
- ❌ Cannot import: Adapters (only port interfaces, not implementations)

### Adapter Layer (`src/adapters/`)

- ✅ Can import: Application ports, domain entities, shared utilities
- ✅ Can import: External frameworks (Fastify, Prisma, AWS SDK)

### Shared Layer (`src/shared/`)

- ✅ Can import: External utilities (Pino, Zod)
- ❌ Cannot import: Domain, application, or adapters
