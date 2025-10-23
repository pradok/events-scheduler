# Bounded Contexts Architecture - Impact Assessment

**Date:** 2025-01-23
**Decision:** Implement Modular Monolith with Bounded Contexts and Eventual Consistency
**Status:** Proposed (Pending Epic/Story Revision)

---

## Executive Summary

The architectural decision to implement **Bounded Contexts with Eventual Consistency** (documented in [bounded-contexts.md](./bounded-contexts.md)) impacts **Story 1.8: Create User Use Case** and requires:

1. **Story 1.8 Amendment** - Refactor CreateUserUseCase to use domain events instead of direct Event creation
2. **New Story 1.9** - Implement Domain Event Bus infrastructure
3. **New Story 1.10** - Implement Event Handler for UserCreated → Birthday Event generation

**Impact Level:** Medium
**Effort Increase:** +2 stories (~8-12 hours additional work)
**Benefits:** Cleaner architecture, easier testing, future-proof for microservices

---

## Current State Analysis

### Story 1.8: Create User Use Case (DONE)

**Current Implementation:**
- ✅ CreateUserUseCase directly depends on IEventRepository
- ✅ CreateUserUseCase directly depends on EventHandlerRegistry
- ✅ CreateUserUseCase creates both User AND Event entities
- ✅ User and Event creation are **tightly coupled** in the same use case

**Code Evidence:**
```typescript
// src/application/use-cases/user/CreateUserUseCase.ts (lines 34-72)
export class CreateUserUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly eventRepository: IEventRepository,      // ❌ Cross-context dependency
    private readonly timezoneService: TimezoneService,       // ❌ Event domain service
    private readonly eventHandlerRegistry: EventHandlerRegistry  // ❌ Event domain service
  ) {}

  public async execute(dto: CreateUserDTO): Promise<User> {
    const user = this.createUserEntity(dto);
    const savedUser = await this.userRepository.create(user);

    // ❌ Creating Event directly in User use case
    const handler = this.eventHandlerRegistry.getHandler('BIRTHDAY');
    const nextBirthdayLocal = handler.calculateNextOccurrence(user);
    const event = this.createEventEntity(user, nextBirthdayLocal, ...);
    await this.eventRepository.create(event);

    return savedUser;
  }
}
```

**Why This Is Wrong (Architecturally):**
1. **Violates Single Responsibility Principle** - User use case does TWO things (create user + create event)
2. **Tight coupling** - User context knows about Event context internals
3. **Hard to test** - Must mock Event infrastructure to test User creation
4. **False atomicity requirement** - Story 1.8 AC#9 says "atomic transaction" but this is NOT needed (User and Event are separate aggregates)
5. **Future microservice extraction is harder** - Cannot split User and Event into separate services

---

## Architectural Decision Rationale

### Key Insight: User and Event Are NOT Transactionally Coupled

**Critical Realization:** The acceptance criteria for Story 1.8 states:

> AC#9: Use case saves both user and event in a transaction (both succeed or both fail)

**This is architecturally incorrect because:**

1. **Event is derivable from User** - Birthday event can be regenerated from User data at any time
2. **Event is ephemeral** - Event is deleted after execution, User data is permanent
3. **No business requirement for atomicity** - If Event creation fails, User still exists (self-healing job can fix it)
4. **Future microservices require eventual consistency anyway** - Cannot share transactions across services

**Conclusion:** User and Event should be **eventually consistent**, not transactionally consistent.

---

## Proposed Changes

### Change 1: Amend Story 1.8 Acceptance Criteria

**Original AC#9:**
> 9. Use case saves both user and event in a transaction (both succeed or both fail)

**Revised AC#9:**
> 9. Use case saves user and publishes UserCreated domain event (Event creation happens asynchronously)

**Original AC#2:**
> 2. Use case receives IUserRepository, IEventRepository, and TimezoneService via dependency injection

**Revised AC#2:**
> 2. Use case receives IUserRepository and IDomainEventBus via dependency injection (NO Event dependencies)

**Rationale:**
- Reflects correct bounded context design
- User use case should NOT know about Event creation
- Eventual consistency is the correct pattern here

---

### Change 2: New Story 1.9 - Domain Event Bus Infrastructure

**Story Title:** Domain Event Bus Infrastructure

**As a** developer,
**I want** an event bus abstraction for in-process domain event communication,
**so that** bounded contexts can communicate without direct dependencies.

**Acceptance Criteria:**

1. IDomainEventBus interface created in `src/shared/events/IDomainEventBus.ts`
2. Interface defines:
   - `publish<T extends DomainEvent>(event: T): Promise<void>`
   - `subscribe<T extends DomainEvent>(eventType: string, handler: (event: T) => Promise<void>): void`
3. InMemoryEventBus implementation created in `src/shared/events/InMemoryEventBus.ts`
4. InMemoryEventBus stores handlers in Map<eventType, handler[]>
5. InMemoryEventBus executes handlers sequentially (preserves ordering)
6. InMemoryEventBus logs errors but continues processing other handlers
7. Base DomainEvent interface created with common properties (eventType, context, occurredAt, aggregateId)
8. Unit tests achieve 100% coverage for InMemoryEventBus

**Tasks:**

- [ ] Task 1: Define IDomainEventBus interface
- [ ] Task 2: Create base DomainEvent interface
- [ ] Task 3: Implement InMemoryEventBus with Map-based storage
- [ ] Task 4: Implement publish() method with error handling
- [ ] Task 5: Implement subscribe() method
- [ ] Task 6: Write unit tests for event bus

**Effort Estimate:** 4-6 hours

**Dependencies:** None (foundation story)

**Files Created:**
- `src/shared/events/IDomainEventBus.ts`
- `src/shared/events/InMemoryEventBus.ts`
- `src/shared/events/DomainEvent.ts`
- `src/shared/events/InMemoryEventBus.test.ts`

---

### Change 3: New Story 1.10 - Event Handler for UserCreated

**Story Title:** Create Birthday Event on UserCreated Event Handler

**As a** developer,
**I want** an event handler that listens to UserCreated events and generates birthday events,
**so that** User and Event contexts are decoupled via domain events.

**Acceptance Criteria:**

1. UserCreatedEvent interface created in `src/modules/user/domain/events/UserCreated.ts`
2. Event schema includes: eventType, context, occurredAt, aggregateId, userId, firstName, lastName, dateOfBirth, timezone
3. CreateBirthdayEventOnUserCreatedHandler created in `src/modules/event-scheduling/application/event-handlers/`
4. Handler depends on: IEventRepository, TimezoneService, EventHandlerRegistry (NO User dependencies)
5. Handler reconstructs User value objects from UserCreatedEvent payload
6. Handler calculates next birthday using BirthdayEventHandler.calculateNextOccurrence()
7. Handler creates Event entity with correct timestamps
8. Handler persists Event to database
9. Handler is registered with IDomainEventBus at application startup
10. Unit tests verify birthday event generation from UserCreated event

**Tasks:**

- [ ] Task 1: Define UserCreatedEvent interface
- [ ] Task 2: Create CreateBirthdayEventOnUserCreatedHandler class
- [ ] Task 3: Implement handle(event: UserCreatedEvent) method
- [ ] Task 4: Reconstruct User value objects from event payload
- [ ] Task 5: Calculate next birthday using Strategy Pattern
- [ ] Task 6: Create and persist Event entity
- [ ] Task 7: Wire up handler subscription at app startup
- [ ] Task 8: Write unit tests for event handler

**Effort Estimate:** 4-6 hours

**Dependencies:** Story 1.9 (IDomainEventBus must exist)

**Files Created:**
- `src/modules/user/domain/events/UserCreated.ts`
- `src/modules/event-scheduling/application/event-handlers/CreateBirthdayEventOnUserCreatedHandler.ts`
- `src/modules/event-scheduling/application/event-handlers/CreateBirthdayEventOnUserCreatedHandler.test.ts`

---

### Change 4: Refactor Story 1.8 Implementation

**Required Refactoring:**

**Before (Current Implementation):**
```typescript
// src/application/use-cases/user/CreateUserUseCase.ts
export class CreateUserUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly eventRepository: IEventRepository,      // ❌ REMOVE
    private readonly timezoneService: TimezoneService,       // ❌ REMOVE
    private readonly eventHandlerRegistry: EventHandlerRegistry  // ❌ REMOVE
  ) {}

  public async execute(dto: CreateUserDTO): Promise<User> {
    const user = this.createUserEntity(dto);
    const savedUser = await this.userRepository.create(user);

    // ❌ REMOVE: Event creation logic
    const handler = this.eventHandlerRegistry.getHandler('BIRTHDAY');
    const nextBirthdayLocal = handler.calculateNextOccurrence(user);
    const event = this.createEventEntity(user, nextBirthdayLocal, ...);
    await this.eventRepository.create(event);

    return savedUser;
  }
}
```

**After (Refactored):**
```typescript
// src/application/use-cases/user/CreateUserUseCase.ts
export class CreateUserUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly eventBus: IDomainEventBus  // ✅ ADD: Event bus abstraction
  ) {}

  public async execute(dto: CreateUserDTO): Promise<User> {
    // Step 1: Validate and create User entity
    const validatedDto = CreateUserSchema.parse(dto);
    const user = this.createUserEntity(validatedDto);

    // Step 2: Persist User
    const savedUser = await this.userRepository.create(user);

    // Step 3: Publish UserCreated domain event
    await this.eventBus.publish({
      eventType: 'UserCreated',
      context: 'user',
      occurredAt: DateTime.now().toISO(),
      aggregateId: savedUser.id,
      userId: savedUser.id,
      firstName: savedUser.firstName,
      lastName: savedUser.lastName,
      dateOfBirth: savedUser.dateOfBirth.toString(),
      timezone: savedUser.timezone.toString(),
    });

    return savedUser;
    // Event creation happens asynchronously in event handler ✅
  }

  // ❌ REMOVE: createEventEntity() method (moved to event handler)
}
```

**Refactoring Tasks:**
- [ ] Remove IEventRepository dependency from constructor
- [ ] Remove TimezoneService dependency from constructor
- [ ] Remove EventHandlerRegistry dependency from constructor
- [ ] Add IDomainEventBus dependency to constructor
- [ ] Remove createEventEntity() private method
- [ ] Remove Event creation logic from execute() method
- [ ] Add eventBus.publish(UserCreatedEvent) to execute() method
- [ ] Update unit tests to mock IDomainEventBus instead of repositories

**Effort Estimate:** 2-3 hours

**Dependencies:** Story 1.9 (IDomainEventBus must exist)

---

## Impact Summary

### Stories Affected

| Story | Status | Impact | Action Required |
|-------|--------|--------|-----------------|
| **1.8: Create User Use Case** | ✅ Done | **HIGH** - Implementation needs refactoring | Amend AC, refactor code |
| **1.9: Domain Event Bus** | ❌ New | **NEW STORY** | Create infrastructure |
| **1.10: UserCreated Handler** | ❌ New | **NEW STORY** | Move Event creation logic here |

### Epic 1 Impact

**Original Epic 1 Scope:**
- Stories 1.1 - 1.8 (8 stories)
- Estimated effort: ~40 hours

**Revised Epic 1 Scope:**
- Stories 1.1 - 1.10 (10 stories)
- Estimated effort: ~50 hours (+25% increase)

**Why This Is Worth It:**
- ✅ Cleaner architecture (decoupled contexts)
- ✅ Easier testing (mock event bus, not repositories)
- ✅ Future-proof for microservices (swap event bus, no code changes)
- ✅ Self-documenting (domain events as first-class citizens)
- ✅ Follows DDD best practices (bounded contexts)

---

## Testing Strategy Changes

### Unit Tests: Before vs After

**Before (Current):**
```typescript
describe('CreateUserUseCase', () => {
  let mockUserRepo: MockUserRepository;
  let mockEventRepo: MockEventRepository;           // ❌ Must mock Event infrastructure
  let mockTimezoneService: MockTimezoneService;     // ❌ Must mock Event domain service
  let mockEventRegistry: MockEventHandlerRegistry;  // ❌ Must mock Event domain service

  it('should create user and event atomically', async () => {
    // Complex setup mocking Event creation flow
    mockEventRegistry.getHandler.mockReturn(mockHandler);
    mockHandler.calculateNextOccurrence.mockReturn(nextBirthday);
    // ... 20+ lines of mocking
  });
});
```

**After (Refactored):**
```typescript
describe('CreateUserUseCase', () => {
  let mockUserRepo: MockUserRepository;
  let mockEventBus: MockEventBus;  // ✅ Only mock event bus

  it('should create user and publish UserCreated event', async () => {
    const user = await useCase.execute(dto);

    // Simple assertions
    expect(mockUserRepo.create).toHaveBeenCalledOnce();
    expect(mockEventBus.publish).toHaveBeenCalledWith({
      eventType: 'UserCreated',
      userId: user.id,
      // ...
    });
  });
});
```

**Benefits:**
- ✅ Simpler test setup (fewer mocks)
- ✅ Faster tests (no Event domain logic executed)
- ✅ Tests are isolated to User context only
- ✅ Event creation logic tested separately in event handler tests

---

## Migration Path

### Option 1: Implement Now (Recommended)

**Pros:**
- Clean architecture from day one
- Easier to maintain long-term
- No technical debt accrued

**Cons:**
- Delays Story 1.8 completion by ~8-12 hours
- Must refactor working code

**Recommendation:** **DO THIS** - The architectural benefits outweigh the short-term delay.

---

### Option 2: Defer to Epic 2

**Pros:**
- Complete Epic 1 faster (ship MVP sooner)
- Can validate current approach first

**Cons:**
- Accrues technical debt
- Harder to refactor later (more code to change)
- Must rewrite tests
- May influence Epic 2 design incorrectly

**Recommendation:** **AVOID** - Refactoring later is more expensive than doing it right now.

---

## Proposed Story Order

### Revised Epic 1 Story Sequence

1. ✅ Story 1.1: Project Setup
2. ✅ Story 1.2: Docker Environment
3. ✅ Story 1.3: Database Schema
4. ✅ Story 1.4: Domain Entities
5. ✅ Story 1.5: Timezone Service & Strategy Pattern
6. ✅ Story 1.6: Repository Port Interfaces
7. ✅ Story 1.7: Prisma Repository Implementations
8. **Story 1.9: Domain Event Bus Infrastructure** ⬅️ **MOVE BEFORE 1.8**
9. **Story 1.8: Create User Use Case (Refactored)** ⬅️ **REFACTOR**
10. **Story 1.10: Create Birthday Event Handler** ⬅️ **NEW**

**Rationale for reordering:**
- Story 1.9 (Event Bus) must exist BEFORE Story 1.8 can be implemented correctly
- Story 1.10 (Event Handler) depends on Story 1.8 (publishes UserCreated event)

---

## Open Questions for Product Owner

1. **Urgency:** Is completing Epic 1 faster more important than clean architecture?
   - If YES → Defer refactoring to Epic 2
   - If NO → Implement now (recommended)

2. **Risk Tolerance:** Are you willing to accept technical debt to ship faster?
   - If YES → Keep current implementation
   - If NO → Refactor now (recommended)

3. **Team Size:** Are you planning to grow the team in the future?
   - If YES → Bounded contexts enable parallel work (refactor now)
   - If NO → Less critical (but still recommended)

4. **Microservices:** Is extracting Event Scheduler as a separate service likely?
   - If YES → Domain events are mandatory (refactor now)
   - If NO → Less critical (but still recommended)

---

## Recommendation

**Architect Recommendation: Implement Bounded Contexts NOW (Option 1)**

**Why:**
1. Story 1.8 is already done - refactoring is **cheaper** now than later
2. Only +8-12 hours of work for significant architectural improvement
3. Avoids technical debt from day one
4. Makes testing easier throughout Epic 2-4
5. Future-proofs for microservices extraction

**Next Steps:**
1. ✅ Review this impact assessment
2. ⏸️ Decide: Implement now OR defer to Epic 2
3. If implementing now:
   - Amend Story 1.8 acceptance criteria
   - Create Story 1.9 (Event Bus Infrastructure)
   - Create Story 1.10 (UserCreated Event Handler)
   - Refactor Story 1.8 implementation
4. If deferring:
   - Document as technical debt in `docs/technical-debt.md`
   - Create Story in Epic 2 for refactoring

---

## References

- **Architecture Decision:** [Bounded Contexts & Eventual Consistency](./bounded-contexts.md)
- **Current Implementation:** [CreateUserUseCase.ts](../../src/application/use-cases/user/CreateUserUseCase.ts)
- **Story Definition:** [Story 1.8](../stories/1.8.create-user-use-case.md)
- **Epic Definition:** [Epic 1](../prd/epic-1-foundation-user-management.md)
- **Design Patterns:** [Design Patterns](./design-patterns.md)

---

**Status:** Awaiting Decision
**Date:** 2025-01-23
**Architect:** Winston (BMAD Architect Agent)
