# Core Workflows

This section illustrates key system workflows using sequence diagrams to show component interactions, including error handling paths and async operations.

Reference: [Full Architecture Document](../architecture.md)

---

## Workflow 1: User Creation and Initial Event Generation

```mermaid
sequenceDiagram
    participant Client
    participant API as API Controller
    participant Validator as Zod Validator
    participant CreateUserUC as CreateUserUseCase
    participant TzService as TimezoneService
    participant GenEventUC as GenerateBirthdayEventUseCase
    participant UserRepo as UserRepository
    participant EventRepo as EventRepository
    participant DB as PostgreSQL

    Client->>API: POST /user {firstName, lastName, dateOfBirth, timezone}
    API->>Validator: validate(requestBody)

    alt Invalid Input
        Validator-->>API: ValidationError
        API-->>Client: 400 Bad Request
    end

    Validator-->>API: Valid DTO
    API->>CreateUserUC: execute(createUserDto)

    CreateUserUC->>TzService: validateTimezone(timezone)
    TzService-->>CreateUserUC: Timezone (value object)

    CreateUserUC->>UserRepo: create(user)
    UserRepo->>DB: INSERT INTO users
    DB-->>UserRepo: User record
    UserRepo-->>CreateUserUC: User entity

    CreateUserUC->>GenEventUC: execute(user)
    GenEventUC->>TzService: calculateNextBirthday(dateOfBirth, timezone)
    TzService-->>GenEventUC: targetTimestampLocal
    GenEventUC->>TzService: convertToUTC(targetTimestampLocal, timezone)
    TzService-->>GenEventUC: targetTimestampUTC

    GenEventUC->>EventRepo: create(event)
    EventRepo->>DB: INSERT INTO events
    DB-->>EventRepo: Event record
    EventRepo-->>GenEventUC: Event entity

    GenEventUC-->>CreateUserUC: Event
    CreateUserUC-->>API: User
    API-->>Client: 201 Created {user, nextBirthdayEvent}
```

**Key Points:**

- Input validation happens at API boundary before reaching use cases
- Timezone validation ensures only valid IANA timezones are accepted
- Event generation is atomic with user creation (both succeed or both fail)
- Domain logic (timezone calculations) isolated in TimezoneService
- Database transactions ensure consistency

---

## Workflow 2: Scheduled Event Claiming and Execution

```mermaid
sequenceDiagram
    participant EventBridge
    participant SchedulerLambda as Scheduler Lambda
    participant ClaimEventsUC as ClaimReadyEventsUseCase
    participant EventRepo as EventRepository
    participant DB as PostgreSQL
    participant SQS as SQS Queue
    participant WorkerLambda as Worker Lambda
    participant ExecuteEventUC as ExecuteEventUseCase
    participant WebhookAdapter as Webhook Adapter
    participant ExternalAPI as External Webhook

    Note over EventBridge: Every 1 minute
    EventBridge->>SchedulerLambda: Trigger
    SchedulerLambda->>ClaimEventsUC: execute()

    ClaimEventsUC->>EventRepo: findReadyEvents(limit=100)
    EventRepo->>DB: BEGIN TRANSACTION
    EventRepo->>DB: SELECT * FROM events<br/>WHERE targetTimestampUTC <= NOW()<br/>AND status = 'PENDING'<br/>FOR UPDATE SKIP LOCKED<br/>LIMIT 100
    DB-->>EventRepo: [Event1, Event2, ...]

    loop For each event
        EventRepo->>DB: UPDATE events<br/>SET status='PROCESSING', version=version+1<br/>WHERE id=? AND version=?

        alt Optimistic Lock Failed
            DB-->>EventRepo: 0 rows updated
            Note over EventRepo: Skip event (claimed by another process)
        end

        DB-->>EventRepo: 1 row updated
    end

    EventRepo->>DB: COMMIT
    DB-->>EventRepo: Transaction committed
    EventRepo-->>ClaimEventsUC: [ClaimedEvents]

    loop For each claimed event
        ClaimEventsUC->>SQS: sendMessage(event)
        SQS-->>ClaimEventsUC: MessageId
    end

    ClaimEventsUC-->>SchedulerLambda: Success
    SchedulerLambda-->>EventBridge: Complete

    Note over SQS,WorkerLambda: Async execution (SQS trigger)

    SQS->>WorkerLambda: Poll (batch=10)
    WorkerLambda->>ExecuteEventUC: execute(eventId)

    ExecuteEventUC->>EventRepo: findById(eventId)
    EventRepo->>DB: SELECT * FROM events WHERE id=?
    DB-->>EventRepo: Event
    EventRepo-->>ExecuteEventUC: Event

    ExecuteEventUC->>WebhookAdapter: deliver(event)
    WebhookAdapter->>ExternalAPI: POST /webhook<br/>Headers: X-Idempotency-Key<br/>Body: {eventId, message, ...}

    alt Success (2xx)
        ExternalAPI-->>WebhookAdapter: 200 OK
        WebhookAdapter-->>ExecuteEventUC: Success
        ExecuteEventUC->>EventRepo: update(event.markCompleted())
        EventRepo->>DB: UPDATE events SET status='COMPLETED', executedAt=NOW()
        DB-->>EventRepo: Updated
        ExecuteEventUC-->>WorkerLambda: Success
        WorkerLambda->>SQS: deleteMessage()
    end

    alt Transient Failure (5xx or Timeout)
        ExternalAPI-->>WebhookAdapter: 503 Service Unavailable
        WebhookAdapter-->>ExecuteEventUC: Error (throw exception)
        ExecuteEventUC-->>WorkerLambda: Exception
        Note over WorkerLambda,SQS: Message returns to queue<br/>(visibility timeout expires)
        Note over SQS: SQS retries with exponential backoff
    end

    alt Permanent Failure (4xx)
        ExternalAPI-->>WebhookAdapter: 404 Not Found
        WebhookAdapter-->>ExecuteEventUC: PermanentError
        ExecuteEventUC->>EventRepo: update(event.markFailed("404"))
        EventRepo->>DB: UPDATE events SET status='FAILED', failureReason='404'
        WorkerLambda->>SQS: deleteMessage()
    end
```

**Key Points:**

- `FOR UPDATE SKIP LOCKED` prevents race conditions (events locked by one scheduler instance are skipped by others)
- Optimistic locking (version field) provides secondary safeguard
- SQS decouples scheduler from executor (scheduler doesn't wait for webhook calls)
- Idempotency key prevents duplicate deliveries on retry
- Transient failures (5xx, timeout) trigger automatic retries via SQS
- Permanent failures (4xx) are marked FAILED without retry

---

## Workflow 3: User Update with Event-Driven Rescheduling

**Status: UPDATED for Event-Driven Architecture** ✅

This workflow shows how user updates (DOB/timezone) trigger event rescheduling via domain events, maintaining bounded context separation.

```mermaid
sequenceDiagram
    participant Client
    participant API as API Controller
    participant UpdateUserUC as UpdateUserUseCase
    participant UserRepo as UserRepository
    participant EventBus as Domain Event Bus
    participant RescheduleHandler as RescheduleEventsHandler
    participant RescheduleUC as RescheduleEventsUseCase
    participant EventRepo as EventRepository
    participant TzService as TimezoneService
    participant DB as PostgreSQL

    Client->>API: PUT /user/:id {timezone: "America/Los_Angeles"}
    API->>UpdateUserUC: execute(userId, updateDto)

    UpdateUserUC->>UserRepo: findById(userId)
    UserRepo->>DB: SELECT * FROM users WHERE id=?
    DB-->>UserRepo: User record
    UserRepo-->>UpdateUserUC: User entity

    alt User not found
        UpdateUserUC-->>API: UserNotFoundError
        API-->>Client: 404 Not Found
    end

    Note over UpdateUserUC: Track old values for event comparison
    UpdateUserUC->>UserRepo: update(user with new timezone)
    UserRepo->>DB: UPDATE users SET timezone=?, updatedAt=NOW()
    DB-->>UserRepo: Updated user
    UserRepo-->>UpdateUserUC: Updated user entity

    Note over UpdateUserUC: Check if timezone changed
    alt Timezone changed
        UpdateUserUC->>EventBus: publish(UserTimezoneChanged event)
        Note over UpdateUserUC,EventBus: Event contains: userId, oldTimezone, newTimezone
    end

    UpdateUserUC-->>API: Updated User
    API-->>Client: 200 OK {user}

    Note over EventBus,RescheduleHandler: Async event processing (separate bounded context)
    EventBus->>RescheduleHandler: handle(UserTimezoneChanged)
    RescheduleHandler->>RescheduleUC: execute({userId, newTimezone})

    RescheduleUC->>EventRepo: findByUserId(userId)
    EventRepo->>DB: SELECT * FROM events WHERE userId=?
    DB-->>EventRepo: [All user events]
    EventRepo-->>RescheduleUC: [Events]

    Note over RescheduleUC: Filter to PENDING events only
    loop For each PENDING event
        alt Event is PROCESSING (race condition check)
            Note over RescheduleUC: Skip + Log warning<br/>(see Workflow 5)
        end

        alt Event is PENDING
            RescheduleUC->>TzService: convertToUTC(event.targetTimestampLocal, newTimezone)
            TzService-->>RescheduleUC: newTargetTimestampUTC

            RescheduleUC->>EventRepo: update(event with new UTC timestamp)
            EventRepo->>DB: UPDATE events<br/>SET targetTimestampUTC=?, targetTimezone=?<br/>WHERE id=? AND version=?

            alt Optimistic lock success
                DB-->>EventRepo: 1 row updated
            end

            alt Optimistic lock failure
                DB-->>EventRepo: 0 rows updated
                Note over RescheduleUC: Skip + Log warning<br/>(concurrent modification)
            end
        end
    end

    RescheduleUC-->>RescheduleHandler: RescheduleEventsResult {rescheduled: 2, skipped: 0}
    RescheduleHandler->>EventBus: Log results (info + warnings if skipped)
```

**Key Points:**

- ✅ **Bounded Context Separation:** UpdateUserUseCase (User Context) does NOT directly access EventRepository (Event Scheduling Context)
- ✅ **Event-Driven Architecture:** Communication via domain events (UserTimezoneChanged, UserBirthdayChanged)
- ✅ **Async Processing:** Event rescheduling happens asynchronously (doesn't block API response)
- ✅ **Race Condition Protection:** PROCESSING events are skipped (see Workflow 5 for details)
- ✅ **Optimistic Locking:** Version field prevents concurrent modification conflicts
- ✅ **Comprehensive Logging:** Reschedule results logged including skipped events
- ⚠️ **User Response:** Client receives updated user immediately (reschedule status NOT in response - happens async)

**Domain Events:**

- `UserBirthdayChanged` - Published when dateOfBirth changes
- `UserTimezoneChanged` - Published when timezone changes

**Event Handlers:**

- `RescheduleEventsOnUserBirthdayChangedHandler` → delegates to `RescheduleBirthdayEventsUseCase`
- `RescheduleEventsOnUserTimezoneChangedHandler` → delegates to `RescheduleEventsOnTimezoneChangeUseCase`

**Related Workflows:**

- See **Workflow 5** for race condition protection details when PROCESSING events are encountered

---

## Workflow 4: Failure Recovery After System Downtime

**Status: DETECTION IMPLEMENTED in Story 3.1** ✅ | **EXECUTION in Story 3.2** ⏳

This workflow shows how the system detects and handles missed events after system downtime. The workflow is split into two phases:

1. **Phase 1 (Story 3.1):** Detection - RecoveryService identifies missed events and logs them
2. **Phase 2 (Story 3.2):** Execution - Batch processing via SQS to execute missed events

```mermaid
sequenceDiagram
    participant System as System Restart
    participant RecoveryService as RecoveryService
    participant EventRepo as EventRepository
    participant DB as PostgreSQL
    participant Logger as Logger
    participant SQS as SQS Queue (Story 3.2)
    participant Worker as Worker Lambda (Story 3.2)

    Note over System: System down for 24 hours<br/>Events missed during downtime

    System->>RecoveryService: execute() - startup trigger
    RecoveryService->>Logger: info("Starting recovery check")

    Note over RecoveryService,DB: Phase 1: DETECTION (Story 3.1)
    RecoveryService->>EventRepo: findMissedEvents(1000)
    EventRepo->>DB: SELECT * FROM events<br/>WHERE status='PENDING'<br/>AND targetTimestampUTC < NOW()<br/>ORDER BY targetTimestampUTC ASC<br/>LIMIT 1000
    DB-->>EventRepo: [MissedEvents]

    alt No missed events
        EventRepo-->>RecoveryService: []
        RecoveryService->>Logger: info("No missed events found")
        RecoveryService-->>System: RecoveryResult {count: 0, oldest: null, newest: null}
    end

    alt Missed events found
        EventRepo-->>RecoveryService: [Event1 (7 days old), Event2 (3 days old), Event3 (1 hour old)]

        Note over RecoveryService: Calculate oldest/newest timestamps<br/>(Events sorted ASC by repository)
        RecoveryService->>Logger: info({<br/>  msg: "Missed events found",<br/>  count: 3,<br/>  oldestEventTimestamp: "2025-10-19T14:00:00Z",<br/>  newestEventTimestamp: "2025-10-26T09:00:00Z"<br/>})

        RecoveryService-->>System: RecoveryResult {<br/>  missedEventsCount: 3,<br/>  oldestEventTimestamp: DateTime(7 days ago),<br/>  newestEventTimestamp: DateTime(1 hour ago)<br/>}

        Note over System,Worker: Phase 2: BATCH EXECUTION (Story 3.2 - Future)
        Note over SQS,Worker: RecoveryService will batch-send<br/>missed events to SQS for processing<br/>(Not implemented in Story 3.1)
    end
```

**Phase 1: Detection Only (Story 3.1)** ✅

RecoveryService is **READ-ONLY** in Story 3.1:

```typescript
// RecoveryService.execute() - Detection only
const missedEvents = await this.eventRepository.findMissedEvents(1000);

if (missedEvents.length === 0) {
  this.logger.info('No missed events found');
  return { missedEventsCount: 0, oldestEventTimestamp: null, newestEventTimestamp: null };
}

const oldestEventTimestamp = missedEvents[0]!.targetTimestampUTC;
const newestEventTimestamp = missedEvents[missedEvents.length - 1]!.targetTimestampUTC;

this.logger.info({
  msg: 'Missed events found',
  count: missedEvents.length,
  oldestEventTimestamp: oldestEventTimestamp.toISO(),
  newestEventTimestamp: newestEventTimestamp.toISO(),
});

return { missedEventsCount, oldestEventTimestamp, newestEventTimestamp };
```

**Why Detection-Only in Story 3.1?**

- ✅ **Separation of Concerns:** Detection ≠ Execution
- ✅ **Observability First:** Get visibility into missed events before automating recovery
- ✅ **Safe MVP:** Detect issues without risk of accidentally re-executing events
- ✅ **Story 3.2 Prep:** Lays groundwork for batch SQS processing

**Phase 2: Batch Execution (Story 3.2 - Future)** ⏳

In Story 3.2, RecoveryService will:

1. Detect missed events (same as Phase 1)
2. Batch-send events to SQS in groups of 10 using `SendMessageBatch`
3. Worker Lambda will claim and execute events using existing `ClaimReadyEventsUseCase`
4. Respects 1000-event limit per recovery run (prevents memory overflow)

**Key Points:**

- ✅ **Story 3.1:** RecoveryService only DETECTS and LOGS missed events (read-only)
- ⏳ **Story 3.2:** Will add batch SQS sending and execution
- ✅ **Read-Only Query:** `findMissedEvents()` does not modify event status
- ✅ **Ordered by ASC:** Oldest events first for fair recovery
- ✅ **Batch Limit:** Max 1000 events per recovery run (prevents memory overflow)
- ✅ **Structured Logging:** Logs count, oldest timestamp, newest timestamp
- ✅ **Idempotent:** Safe to run multiple times (read-only operation)
- ✅ **No Race Conditions:** Uses same `ClaimReadyEventsUseCase` for execution (Story 3.2)

**Example Log Output (Missed Events Found):**

```json
{
  "level": "info",
  "msg": "Missed events found",
  "count": 42,
  "oldestEventTimestamp": "2025-10-19T14:00:00.000Z",
  "newestEventTimestamp": "2025-10-26T09:00:00.000Z"
}
```

**Related Files:**

- [RecoveryService.ts](../src/modules/event-scheduling/domain/services/RecoveryService.ts)
- [IEventRepository.ts](../src/modules/event-scheduling/application/ports/IEventRepository.ts) - `findMissedEvents()` method
- [PrismaEventRepository.ts](../src/modules/event-scheduling/adapters/persistence/PrismaEventRepository.ts) - Implementation

**Related Stories:**

- ✅ Story 3.1: Recovery Service - Missed Event Detection (COMPLETED)
- ⏳ Story 3.2: Batch Recovery Execution via SQS (FUTURE)

---

## Workflow 5: Race Condition Protection During User Updates

**Status: IMPLEMENTED in Story 3.1** ✅

This workflow illustrates how the system handles the race condition when a user updates their birthday/timezone while an event is being processed.

```mermaid
sequenceDiagram
    participant User as User (API Client)
    participant UpdateUserUC as UpdateUserUseCase
    participant EventBus as Domain Event Bus
    participant RescheduleUC as RescheduleBirthdayEventsUseCase
    participant EventRepo as EventRepository
    participant DB as PostgreSQL
    participant Scheduler as Scheduler Lambda
    participant Logger as Logger

    Note over Scheduler,DB: T1: Event being processed
    Scheduler->>EventRepo: claimReadyEvents()
    EventRepo->>DB: UPDATE events SET status='PROCESSING'<br/>WHERE id=? AND status='PENDING'
    DB-->>EventRepo: Event X (status=PROCESSING)

    Note over User,UpdateUserUC: T2: User updates birthday
    User->>UpdateUserUC: execute(userId, {dateOfBirth: "1990-02-20"})
    UpdateUserUC->>DB: UPDATE users SET dateOfBirth=?
    DB-->>UpdateUserUC: User updated

    Note over UpdateUserUC,EventBus: Publish domain event
    UpdateUserUC->>EventBus: publish(UserBirthdayChanged)
    EventBus->>RescheduleUC: handle(UserBirthdayChanged)

    Note over RescheduleUC,EventRepo: T3: Attempt to reschedule events
    RescheduleUC->>EventRepo: findByUserId(userId)
    EventRepo->>DB: SELECT * FROM events WHERE userId=?
    DB-->>EventRepo: [Event X, ...]
    EventRepo-->>RescheduleUC: [Event X (status=PROCESSING), ...]

    Note over RescheduleUC: Layer 1: Status Check
    alt Event is PROCESSING
        RescheduleUC->>Logger: warn("Skipping reschedule for PROCESSING event", {eventId, userId})
        Note over RescheduleUC: Skip this event<br/>(race condition detected)
    end

    alt Event is PENDING
        RescheduleUC->>EventRepo: update(event with new timestamp)
        EventRepo->>DB: UPDATE events SET targetTimestampUTC=?<br/>WHERE id=? AND version=?

        alt Optimistic Lock Failed (Layer 2)
            DB-->>EventRepo: 0 rows updated
            EventRepo-->>RescheduleUC: OptimisticLockError
            RescheduleUC->>Logger: warn("Event modified during reschedule", {eventId, userId})
            Note over RescheduleUC: Gracefully skip<br/>(another process updated it)
        end

        DB-->>EventRepo: 1 row updated
        EventRepo-->>RescheduleUC: Success
    end

    Note over RescheduleUC,Logger: Layer 3: Log Results
    RescheduleUC-->>EventBus: RescheduleEventsResult {rescheduled: 2, skipped: 1}
    EventBus->>Logger: info("Birthday events rescheduled", {rescheduled: 2, skipped: 1, skippedEventIds: ["event-x"]})
    EventBus->>Logger: warn("1 event could not be rescheduled due to PROCESSING state")

    RescheduleUC-->>UpdateUserUC: Complete (async)
    UpdateUserUC-->>User: 200 OK {user}

    Note over Scheduler,DB: T4: Event executes with OLD birthday
    Scheduler->>DB: UPDATE events SET status='COMPLETED'
    Note over Scheduler: Event delivered successfully<br/>Next year's event will use NEW birthday
```

**Race Condition Scenario:**

```text
Timeline:
T1: RecoveryService/Scheduler finds Event X (PENDING, old DOB)
T2: Scheduler claims Event X (PENDING → PROCESSING)
T3: User updates DOB → RescheduleBirthdayEventsUseCase triggered
T4: Reschedule use case tries to update Event X
```

**Without Protection:**

- Event X status is PROCESSING (being executed)
- Reschedule use case would try to modify it
- Could corrupt event data or cause delivery with mixed old/new data

**Three-Layer Defense:**

### Layer 1: Proactive Status Check

```typescript
// In RescheduleBirthdayEventsUseCase.ts
for (const event of pendingEvents) {
  if (event.status === EventStatus.PROCESSING) {
    logger.warn({
      msg: 'Skipping reschedule for event in PROCESSING state',
      eventId: event.id,
      userId: dto.userId,
      currentStatus: event.status,
      reason: 'Event is currently being executed'
    });
    skippedCount++;
    skippedEventIds.push(event.id);
    continue; // Skip this event
  }
  // ... proceed with reschedule
}
```

### Layer 2: Optimistic Locking Safety Net

```typescript
try {
  await this.eventRepository.update(rescheduledEvent);
  rescheduledCount++;
} catch (error) {
  if (error instanceof OptimisticLockError) {
    logger.warn({
      msg: 'Event modified during reschedule (optimistic lock conflict)',
      eventId: event.id,
      userId: dto.userId
    });
    skippedCount++;
    skippedEventIds.push(event.id);
    continue; // Gracefully skip
  }
  throw error; // Rethrow unexpected errors
}
```

### Layer 3: Comprehensive Logging

```typescript
// In event handler
const result = await rescheduleBirthdayEventsUseCase.execute(dto);

logger.info({
  msg: 'Birthday events rescheduled',
  userId: event.userId,
  rescheduledCount: result.rescheduledCount,
  skippedCount: result.skippedCount,
  skippedEventIds: result.skippedEventIds
});

if (result.skippedCount > 0) {
  logger.warn({
    msg: 'Some events could not be rescheduled due to PROCESSING state',
    userId: event.userId,
    skippedCount: result.skippedCount
  });
}
```

**Behavior Guarantees:**

When an event is in PROCESSING state during user update:

1. ✅ Event is **skipped** with warning log (no modification attempted)
2. ✅ Event **executes with old DOB/timezone** (correct - that birthday was already scheduled)
3. ✅ **Next year's event** will be created with **new DOB/timezone** (system self-corrects)
4. ✅ **No data corruption** or lost events
5. ✅ **Comprehensive audit trail** in logs for monitoring

**Logged Warning Example:**

```json
{
  "level": "warn",
  "msg": "Skipping reschedule for event in PROCESSING state",
  "eventId": "123e4567-e89b-12d3-a456-426614174000",
  "userId": "user-123",
  "currentStatus": "PROCESSING",
  "reason": "Event is currently being executed and cannot be safely rescheduled"
}
```

**Why This Is Safe:**

- Event executes correctly with scheduled data (no corruption)
- User receives their birthday message (no missed delivery)
- Next year automatically uses updated birthday (system self-corrects)
- Extremely rare scenario (user must update during exact moment of execution)
- Complete visibility via structured logs

**Future Enhancement:**

Could notify user via WebSocket/push notification:
> "Your profile was updated. However, 1 birthday event is currently being sent and will use your previous birthday. Next year's event will use the new date."

**Implementation Files:**

- `src/modules/event-scheduling/application/use-cases/RescheduleBirthdayEventsUseCase.ts`
- `src/modules/event-scheduling/application/use-cases/RescheduleEventsOnTimezoneChangeUseCase.ts`
- `src/modules/event-scheduling/application/types/RescheduleEventsResult.ts`
- `src/modules/event-scheduling/application/event-handlers/RescheduleEventsOnUserBirthdayChangedHandler.ts`
- `src/modules/event-scheduling/application/event-handlers/RescheduleEventsOnUserTimezoneChangedHandler.ts`

**Related Story:** [Story 3.1: Recovery Service - Missed Event Detection](../stories/3.1.recovery-service-missed-event-detection.story.md)

---
