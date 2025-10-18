# Coding Standards

**MANDATORY for AI agents and human developers**

Reference: [Full Architecture Document](../architecture.md#coding-standards)

---

## Core Standards

- **Languages & Runtimes:** TypeScript 5.3.3 (strict mode enabled), Node.js 20.11.0 LTS
- **Style & Linting:** ESLint 8.56.0 with TypeScript rules, Prettier 3.2.5 for formatting
- **Test Organization:** `*.test.ts` files colocated with source OR in parallel `tests/` directory structure

---

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Classes | PascalCase | `User`, `CreateUserUseCase` |
| Interfaces (Ports) | PascalCase with `I` prefix | `IUserRepository`, `IMessageSender` |
| Files | kebab-case for infrastructure, PascalCase for domain | `user.routes.ts`, `User.ts` |
| Variables/Functions | camelCase | `calculateNextBirthday`, `userId` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`, `DEFAULT_TIMEZONE` |
| Test Files | `*.test.ts` | `User.test.ts`, `CreateUserUseCase.test.ts` |

---

## Critical Rules

### 1. No Console.log in Production

- Use Pino logger exclusively
- `console.log` forbidden in `src/` (enforced by ESLint)
- Logging levels: ERROR, WARN, INFO, DEBUG

### 2. No `any` Types

- TypeScript strict mode enabled
- `any` type forbidden (use `unknown` if type truly unknown)
- Explicit typing required for all function signatures

### 3. Repository Pattern Required

- All database access must go through repository interfaces
- Never direct Prisma calls from use cases
- Ports define contracts, adapters implement them

### 4. Domain Layer Purity

- `src/domain/` must have zero imports from `src/adapters/` or `src/shared/`
- Enforced by linting or architecture tests
- Domain logic is framework-agnostic

### 5. Error Handling

- Never swallow errors silently
- Always log and rethrow or handle explicitly
- Use custom error classes (DomainError, ApplicationError, InfrastructureError)

### 6. Async/Await Only

- No callbacks or raw promises
- Use async/await for all asynchronous operations
- Proper error handling with try/catch

### 7. Value Objects for Validation

- Use value objects (Timezone, DateOfBirth) instead of primitive types
- Encapsulate validation logic in value objects
- Type safety through domain modeling

---

## Test Requirements

- Generate tests for all public methods and use case `execute()` functions
- Cover edge cases: invalid inputs, boundary conditions, state transitions
- Follow AAA pattern (Arrange, Act, Assert)
- Mock all external dependencies (repositories, message senders, delivery adapters)
- Minimum 80% code coverage for domain and application layers

---

## Architecture Principles

- **Hexagonal Architecture:** Clear separation between domain, application, and adapters
- **Domain-Driven Design:** Rich domain models with business logic
- **Dependency Inversion:** Use ports (interfaces) to define contracts
- **Single Responsibility:** Each class/module has one reason to change
- **Open/Closed:** Open for extension, closed for modification
