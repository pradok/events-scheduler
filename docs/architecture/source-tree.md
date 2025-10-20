# Source Tree Structure

**Hexagonal Architecture + DDD with npm workspaces**

Reference: [Full Architecture Document](../architecture.md#source-tree)

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
│   │   └── 20250118_init/
│   │       └── migration.sql
│   └── seed.ts                         # Database seeding script
│
├── src/
│   ├── domain/                         # PURE business logic (no dependencies)
│   │   ├── entities/
│   │   │   ├── User.ts                 # User aggregate root
│   │   │   ├── User.test.ts            # User unit tests
│   │   │   ├── Event.ts                # Event aggregate root
│   │   │   └── Event.test.ts           # Event unit tests
│   │   ├── value-objects/
│   │   │   ├── Timezone.ts             # IANA timezone value object
│   │   │   ├── Timezone.test.ts        # Timezone unit tests
│   │   │   ├── EventStatus.ts          # Event status enum
│   │   │   ├── EventStatus.test.ts     # EventStatus unit tests
│   │   │   ├── DateOfBirth.ts          # Birthday value object
│   │   │   ├── DateOfBirth.test.ts     # DateOfBirth unit tests
│   │   │   ├── IdempotencyKey.ts       # Idempotency key generator
│   │   │   └── IdempotencyKey.test.ts  # IdempotencyKey unit tests
│   │   ├── services/
│   │   │   ├── TimezoneService.ts      # Timezone calculation logic
│   │   │   ├── TimezoneService.test.ts # TimezoneService unit tests
│   │   │   ├── event-handlers/         # Strategy pattern for event types
│   │   │   │   ├── IEventHandler.ts    # Event handler interface
│   │   │   │   ├── EventHandlerRegistry.ts
│   │   │   │   ├── EventHandlerRegistry.test.ts
│   │   │   │   ├── BirthdayEventHandler.ts       # Phase 1
│   │   │   │   ├── BirthdayEventHandler.test.ts
│   │   │   │   ├── AnniversaryEventHandler.ts    # Phase 2+
│   │   │   │   ├── ReminderEventHandler.ts       # Phase 2+
│   │   │   │   └── SubscriptionEventHandler.ts   # Phase 2+
│   │   ├── factories/                  # Factory pattern for entity creation
│   │   │   ├── EventFactory.ts         # Event factory with business logic
│   │   │   └── EventFactory.test.ts    # Event factory unit tests
│   │   ├── validators/                 # Chain of Responsibility pattern
│   │   │   ├── IEventValidator.ts      # Validator interface
│   │   │   ├── EventStatusValidator.ts
│   │   │   ├── EventStatusValidator.test.ts
│   │   │   ├── EventTimestampValidator.ts
│   │   │   ├── EventTimestampValidator.test.ts
│   │   │   ├── IdempotencyValidator.ts
│   │   │   └── IdempotencyValidator.test.ts
│   │   ├── observers/                  # Observer pattern for event lifecycle
│   │   │   ├── IEventObserver.ts       # Observer interface
│   │   │   ├── MetricsObserver.ts
│   │   │   ├── MetricsObserver.test.ts
│   │   │   ├── LoggingObserver.ts
│   │   │   ├── LoggingObserver.test.ts
│   │   │   ├── AuditObserver.ts
│   │   │   └── AuditObserver.test.ts
│   │   ├── specifications/             # Specification pattern for queries
│   │   │   ├── ISpecification.ts       # Specification interface
│   │   │   ├── EventsByStatusSpec.ts
│   │   │   ├── EventsByStatusSpec.test.ts
│   │   │   ├── EventsByTimestampSpec.ts
│   │   │   ├── EventsByTimestampSpec.test.ts
│   │   │   ├── AndSpecification.ts
│   │   │   └── OrSpecification.ts
│   │   ├── errors/
│   │   │   ├── DomainError.ts          # Base domain error
│   │   │   ├── InvalidTimezoneError.ts
│   │   │   └── InvalidDateOfBirthError.ts
│   │   └── integration-tests/          # Domain integration tests
│   │       ├── event-generation.test.ts
│   │       └── timezone-calculations.test.ts
│   │
│   ├── application/                    # Use cases / orchestration
│   │   ├── ports/                      # Interface definitions (contracts)
│   │   │   ├── IUserRepository.ts
│   │   │   ├── IEventRepository.ts
│   │   │   ├── IMessageSender.ts
│   │   │   └── IDeliveryAdapter.ts
│   │   └── use-cases/
│   │       ├── user/
│   │       │   ├── CreateUserUseCase.ts
│   │       │   ├── CreateUserUseCase.test.ts
│   │       │   ├── GetUserUseCase.ts
│   │       │   ├── GetUserUseCase.test.ts
│   │       │   ├── UpdateUserUseCase.ts
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
