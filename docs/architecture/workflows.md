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

## Workflow 3: User Timezone Update and Event Rescheduling

```mermaid
sequenceDiagram
    participant Client
    participant API as API Controller
    participant UpdateUserUC as UpdateUserUseCase
    participant UserRepo as UserRepository
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

    Note over UpdateUserUC: Check if timezone changed
    alt Timezone changed
        UpdateUserUC->>UserRepo: update(user with new timezone)
        UserRepo->>DB: UPDATE users SET timezone=?, updatedAt=NOW()

        UpdateUserUC->>EventRepo: findPendingEventsByUserId(userId)
        EventRepo->>DB: SELECT * FROM events<br/>WHERE userId=? AND status='PENDING'
        DB-->>EventRepo: [PendingEvents]

        loop For each pending event
            UpdateUserUC->>TzService: calculateNextBirthday(user.dateOfBirth, user.timezone)
            TzService-->>UpdateUserUC: newTargetTimestampLocal
            UpdateUserUC->>TzService: convertToUTC(newTargetTimestampLocal, user.timezone)
            TzService-->>UpdateUserUC: newTargetTimestampUTC

            UpdateUserUC->>EventRepo: update(event with new timestamps)
            EventRepo->>DB: UPDATE events<br/>SET targetTimestampUTC=?, targetTimestampLocal=?, targetTimezone=?
        end
    end

    UpdateUserUC-->>API: Updated User
    API-->>Client: 200 OK {user, rescheduledEvents: 1}
```

**Key Points:**

- Only PENDING events are rescheduled (PROCESSING/COMPLETED/FAILED events unchanged)
- Timezone recalculation uses same domain service as initial event generation
- All updates happen in transaction (user + events updated atomically)
- Client receives confirmation of how many events were rescheduled

---

## Workflow 4: Failure Recovery After System Downtime

```mermaid
sequenceDiagram
    participant System as System Restart
    participant RecoveryService as Recovery Service
    participant EventRepo as EventRepository
    participant DB as PostgreSQL
    participant SQS as SQS Queue
    participant Logger as Logger

    Note over System: System down for 24 hours<br/>Events missed

    System->>RecoveryService: startup()
    RecoveryService->>Logger: log("Starting recovery check")

    RecoveryService->>EventRepo: findMissedEvents()
    EventRepo->>DB: SELECT * FROM events<br/>WHERE targetTimestampUTC < NOW()<br/>AND status = 'PENDING'<br/>ORDER BY targetTimestampUTC ASC<br/>LIMIT 1000
    DB-->>EventRepo: [MissedEvents]

    alt No missed events
        EventRepo-->>RecoveryService: []
        RecoveryService->>Logger: log("No missed events")
    end

    alt Missed events found
        EventRepo-->>RecoveryService: [Event1, Event2, ...]
        RecoveryService->>Logger: log("Found {count} missed events", {lateExecutionFlag: true})

        loop For each missed event
            RecoveryService->>EventRepo: update status to PROCESSING
            EventRepo->>DB: UPDATE events SET status='PROCESSING', version=version+1

            RecoveryService->>SQS: sendMessage(event, {metadata: {lateExecution: true}})
            SQS-->>RecoveryService: MessageId
            RecoveryService->>Logger: log("Queued late event", {eventId, lateDuration: NOW() - targetTimestampUTC})
        end

        RecoveryService->>Logger: log("Recovery complete", {totalRecovered: count})
    end

    RecoveryService-->>System: Recovery complete
```

**Key Points:**

- Recovery runs automatically on system startup
- Queries for events with target time in the past and PENDING status
- Late execution flag added to logs for observability
- Events processed through normal executor flow (same reliability guarantees)
- Recovery is idempotent (can run multiple times safely)
- No duplicate messages sent (same idempotency keys used)

---
