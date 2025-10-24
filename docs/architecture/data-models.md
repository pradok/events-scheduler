# Data Models

**Domain entities and value objects for the Time-Based Event Scheduling System**

Reference: [Full Architecture Document](../architecture.md)

---

## Data Models Overview

The system is built around two core domain entities that represent the business domain:

1. **User** - Represents an individual with a birthday and timezone
2. **Event** - Represents a scheduled birthday message for a user

Additionally, we use **Value Objects** (DDD pattern) for type-safe, validated data:

1. **Timezone** - IANA timezone string with validation
2. **EventStatus** - Enumerated event lifecycle states
3. **DateOfBirth** - Validated date representing a user's birthday
4. **IdempotencyKey** - Unique key for preventing duplicate deliveries

---

## User

**Purpose:** Represents an individual person with a birthday that should be celebrated. The User entity encapsulates user identity and the data necessary to calculate when birthday events should occur.

**Key Attributes:**

- `id: UUID` - Unique identifier for the user (generated on creation)
- `firstName: string` - User's first name (required, 1-100 characters)
- `lastName: string` - User's last name (required, 1-100 characters)
- `dateOfBirth: DateOfBirth` - User's birthday as YYYY-MM-DD (required, validated value object)
- `timezone: Timezone` - User's IANA timezone (required, validated value object, e.g., "America/New_York")
- `createdAt: DateTime` - Timestamp when user was created (UTC)
- `updatedAt: DateTime` - Timestamp when user was last modified (UTC)

**Relationships:**

- **One-to-Many with Event:** A user has zero or more birthday events (one per year). When a user is created, the system automatically generates their next birthday event. When an event executes, a new event for the following year is generated.
- **Cascade Delete:** When a user is deleted, all associated events are deleted (orphan removal).

**Business Invariants:**

- First name and last name cannot be empty strings
- Date of birth must be a valid date in the past
- Timezone must be a valid IANA timezone identifier
- Date of birth cannot be in the future (validated at creation/update)

**Domain Behaviors:**

- `updateTimezone(newTimezone: Timezone): void` - Updates timezone and triggers recalculation of pending events
- `updateName(firstName: string, lastName: string): void` - Updates user's name

**Note:** Birthday calculation logic moved to `BirthdayEventHandler` (Strategy Pattern - Story 1.5). Use `BirthdayEventHandler.calculateNextOccurrence(user)` instead of `user.calculateNextBirthday()`.

---

## Event

**Purpose:** Represents a scheduled birthday message for a specific user at a specific time. Events are the core of the scheduling system and track the lifecycle from creation through execution.

**Key Attributes:**

- `id: UUID` - Unique identifier for the event
- `userId: UUID` - Foreign key to User (required, indexed)
- `eventType: string` - Type of event (hardcoded to "BIRTHDAY" for Phase 1, extensible for Phase 2+)
- `status: EventStatus` - Current lifecycle state (enum: PENDING, PROCESSING, COMPLETED, FAILED)
- `targetTimestampUTC: DateTime` - When the event should execute (UTC, indexed for scheduler queries)
- `targetTimestampLocal: DateTime` - When the event should execute in user's local time (for display/debugging)
- `targetTimezone: string` - Timezone used for calculation (stored for audit trail, may differ from user's current timezone if they changed it)
- `executedAt: DateTime | null` - Actual execution timestamp (null until executed)
- `failureReason: string | null` - Error message if status is FAILED
- `retryCount: number` - Number of execution attempts (default 0, max 3)
- `version: number` - Optimistic locking version (incremented on each update)
- `idempotencyKey: string` - Unique key for external API calls (prevents duplicate webhook sends on retry)
- `deliveryPayload: JSON` - Message payload to deliver (e.g., `{"message": "Hey, John Doe it's your birthday"}`)
- `createdAt: DateTime` - Timestamp when event was created (UTC)
- `updatedAt: DateTime` - Timestamp when event was last modified (UTC)

**Relationships:**

- **Many-to-One with User:** Each event belongs to exactly one user (required foreign key)
- **Cascade on User Delete:** If user is deleted, all associated events are deleted

**Business Invariants:**

- Status transitions must follow state machine: PENDING → PROCESSING → (COMPLETED | FAILED)
- Cannot transition from COMPLETED or FAILED back to PENDING
- Target timestamp cannot be modified after event enters PROCESSING state
- Retry count cannot exceed 3
- Version must increment on every update (optimistic locking)

**Domain Behaviors:**

- `claim(): void` - Atomically transitions from PENDING → PROCESSING (used by scheduler)
- `markCompleted(executedAt: DateTime): void` - Transitions to COMPLETED state
- `markFailed(reason: string): void` - Transitions to FAILED state (increments retry count if < 3)
- `canRetry(): boolean` - Returns true if retry count < 3 and status is FAILED
- `generateIdempotencyKey(): string` - Creates unique key for external API idempotency

### Event State Machine

The Event entity enforces a strict state machine to prevent invalid state transitions and ensure data consistency in distributed systems.

**State Diagram:**

```text
┌─────────┐
│ PENDING │ ← Initial state when event is created
└────┬────┘
     │ claim()
     ↓
┌────────────┐
│ PROCESSING │ ← Event is being executed by a worker
└─────┬──────┘
      │
      ├─→ markCompleted() → ┌───────────┐
      │                      │ COMPLETED │ ← Terminal state (success)
      │                      └───────────┘
      │
      └─→ markFailed() ────→ ┌────────┐
                             │ FAILED │ ← Terminal state (permanent failure)
                             └────────┘
```

**Valid Transitions:**

| From State  | To State   | Method               | Description                                  |
|-------------|------------|----------------------|----------------------------------------------|
| PENDING     | PROCESSING | `claim()`            | Scheduler claims event for execution         |
| PROCESSING  | COMPLETED  | `markCompleted()`    | Webhook delivered successfully               |
| PROCESSING  | FAILED     | `markFailed()`       | Permanent failure (4xx error, max retries)   |

**Invalid Transitions (All throw `InvalidStateTransitionError`):**

| From State  | To State   | Why Invalid                                                     |
|-------------|------------|-----------------------------------------------------------------|
| PENDING     | COMPLETED  | Event must be claimed (PROCESSING) before completion            |
| PENDING     | FAILED     | Event must be claimed (PROCESSING) before marking failed        |
| PROCESSING  | PROCESSING | Event is already being processed (double claim)                 |
| COMPLETED   | *any*      | Terminal state - historical record, cannot be modified          |
| FAILED      | *any*      | Terminal state - historical record, cannot be modified          |

**Rationale for State Machine Rules:**

1. **Why COMPLETED and FAILED are terminal states:**
   - These represent **historical audit records** of event execution outcomes
   - Once an event reaches a terminal state, it should **never be modified**
   - This ensures **immutable audit trail** for compliance and debugging
   - Terminal states preserve the exact execution timestamp, failure reason, and delivery status

2. **Why PENDING cannot transition directly to COMPLETED or FAILED:**
   - Events must be **claimed first** (PENDING → PROCESSING) to prevent duplicate processing
   - The PROCESSING state indicates **"this event is owned by a worker"**
   - Without claiming, multiple workers could attempt to process the same event simultaneously
   - Optimistic locking on version field prevents race conditions during claiming

3. **Why concurrent updates are prevented via optimistic locking:**
   - Multiple scheduler instances may attempt to claim the same event
   - **Optimistic locking** (via `version` field) detects concurrent modifications
   - The first worker to update wins; others receive `OptimisticLockError`
   - This ensures **exactly-once processing** in distributed systems

**Optimistic Locking Mechanism:**

Every state transition increments the `version` field:

```typescript
// Initial state
event.version = 1; // PENDING

// After claiming
const claimedEvent = event.claim();
claimedEvent.version = 2; // PROCESSING

// After completion
const completedEvent = claimedEvent.markCompleted(DateTime.now());
completedEvent.version = 3; // COMPLETED
```

The repository layer enforces optimistic locking:

```sql
-- Repository update checks previous version
UPDATE events
SET status = 'PROCESSING', version = 2, updated_at = NOW()
WHERE id = ? AND version = 1; -- Optimistic lock: must match previous version

-- If 0 rows affected → another transaction modified the event → throw OptimisticLockError
```

**Error Handling Behavior:**

1. **`InvalidStateTransitionError`** (Domain Error):
   - **Cause:** Attempting an invalid state transition (e.g., COMPLETED → PROCESSING)
   - **Classification:** Programming bug or race condition
   - **Handling:** Log error, do not retry, investigate root cause
   - **Example:** Worker attempts to claim an event that's already COMPLETED
   - **Prevention:** Proper state checking before calling state transition methods

2. **`OptimisticLockError`** (Infrastructure Error):
   - **Cause:** Version mismatch during concurrent update (another transaction modified the event)
   - **Classification:** Expected behavior in distributed systems with multiple workers
   - **Handling:** Log warning, do not retry (event already claimed/processed by another worker)
   - **Example:** Two schedulers simultaneously try to claim the same event
   - **Resolution:** First update succeeds, second fails with version mismatch (correct behavior)

**State Machine Examples:**

**Valid Lifecycle Example 1 - Successful Execution:**

```text
PENDING (v1) → claim() → PROCESSING (v2) → markCompleted() → COMPLETED (v3)
```

**Valid Lifecycle Example 2 - Permanent Failure:**

```text
PENDING (v1) → claim() → PROCESSING (v2) → markFailed("HTTP 404") → FAILED (v3)
```

**Invalid Transition Example 1 - Skip PROCESSING:**

```typescript
const event = new Event({ status: EventStatus.PENDING, ... });
event.markCompleted(DateTime.now()); // ❌ Throws InvalidStateTransitionError
// Error: "Invalid state transition from PENDING to COMPLETED"
```

**Invalid Transition Example 2 - Modify Terminal State:**

```typescript
const event = new Event({ status: EventStatus.COMPLETED, ... });
event.claim(); // ❌ Throws InvalidStateTransitionError
// Error: "Invalid state transition from COMPLETED to PROCESSING"
```

**Concurrent Update Example - Optimistic Locking:**

```typescript
// Two workers load the same event
const worker1Event = await repository.findById(eventId); // version = 1
const worker2Event = await repository.findById(eventId); // version = 1

// Worker 1 claims event first
await repository.update(worker1Event.claim()); // ✅ Success, version → 2

// Worker 2 attempts to claim (stale version)
await repository.update(worker2Event.claim()); // ❌ Throws OptimisticLockError
// Error: "Event was modified by another transaction (expected version 1)"
```

**Testing Coverage:**

The state machine is tested at multiple layers:

1. **Unit Tests** ([EventStatus.test.ts](../../src/modules/event-scheduling/domain/value-objects/EventStatus.test.ts)):
   - All valid transitions return `true` from `isValidTransition()`
   - All invalid transitions return `false` from `isValidTransition()`
   - `validateTransition()` throws `InvalidStateTransitionError` for invalid transitions

2. **Unit Tests** ([Event.test.ts](../../src/modules/event-scheduling/domain/entities/Event.test.ts)):
   - `claim()` succeeds from PENDING, throws from all other states
   - `markCompleted()` succeeds from PROCESSING, throws from all other states
   - `markFailed()` succeeds from PROCESSING, throws from all other states
   - Terminal states (COMPLETED, FAILED) cannot transition to any other state
   - Version increments correctly on every state transition

3. **Integration Tests** ([PrismaEventRepository.integration.test.ts](../../src/modules/event-scheduling/adapters/persistence/PrismaEventRepository.integration.test.ts)):
   - Concurrent updates detected via version mismatch
   - Version increments correctly through full lifecycle (PENDING → PROCESSING → COMPLETED)
   - Optimistic lock error messages include event ID and expected version for debugging
   - Concurrent `claimReadyEvents()` calls do not claim same event twice (FOR UPDATE SKIP LOCKED)

---

## Timezone (Value Object)

**Purpose:** Type-safe wrapper for IANA timezone identifiers with validation. Ensures only valid timezones are used throughout the system.

**Structure:**

```typescript
class Timezone {
  private readonly value: string;

  constructor(value: string) {
    if (!Timezone.isValid(value)) {
      throw new InvalidTimezoneError(value);
    }
    this.value = value;
  }

  static isValid(tz: string): boolean {
    // Validate against IANA timezone database using Luxon
  }

  toString(): string {
    return this.value;
  }

  equals(other: Timezone): boolean {
    return this.value === other.value;
  }
}
```

**Rationale:** Prevents invalid timezone strings from entering the domain. Encapsulates validation logic in a single place.

---

## EventStatus (Value Object / Enum)

**Purpose:** Enumerated type representing the event lifecycle states with enforced state machine transitions.

**States:**

- `PENDING` - Event created, waiting for target time
- `PROCESSING` - Event claimed by scheduler, being executed
- `COMPLETED` - Event successfully executed
- `FAILED` - Event execution failed after max retries

**State Machine:**

```text
PENDING → PROCESSING → COMPLETED
              ↓
            FAILED
```

**Validation Rules:**

- Cannot transition from COMPLETED or FAILED to any other state
- Cannot skip states (e.g., PENDING → COMPLETED without PROCESSING)

---

## DateOfBirth (Value Object)

**Purpose:** Type-safe representation of a date of birth with validation rules specific to birthdays.

**Structure:**

```typescript
class DateOfBirth {
  private readonly value: DateTime; // Luxon DateTime

  constructor(dateString: string) {
    const parsed = DateTime.fromISO(dateString);
    if (!parsed.isValid) {
      throw new InvalidDateOfBirthError(dateString);
    }
    if (parsed > DateTime.now()) {
      throw new DateOfBirthInFutureError(dateString);
    }
    this.value = parsed;
  }

  getMonthDay(): { month: number; day: number } {
    return { month: this.value.month, day: this.value.day };
  }

  toString(): string {
    return this.value.toISODate(); // YYYY-MM-DD
  }

  equals(other: DateOfBirth): boolean {
    return this.value.equals(other.value);
  }
}

// Note: calculateNextOccurrence() method removed in Story 1.5
// Birthday calculation moved to BirthdayEventHandler (Strategy Pattern)
```

**Rationale:** Encapsulates birthday-specific logic (calculating next occurrence, handling leap years). Prevents invalid dates from entering the system.

---

## IdempotencyKey (Value Object)

**Purpose:** Generates unique, deterministic keys for preventing duplicate event deliveries during retries.

The IdempotencyKey ensures that if an event execution fails due to transient errors (network timeouts, temporary service unavailability), retry attempts will send the same idempotency key to the external webhook endpoint. This allows the receiving service to detect and ignore duplicate requests, guaranteeing **exactly-once delivery semantics** even when the system retries multiple times.

**Key Properties:**

- **Deterministic:** Same userId + targetTimestampUTC + eventType always produces the same key
- **Unique:** Different inputs always produce different keys (SHA-256 collision probability is negligible)
- **Immutable:** Once generated for an event, the key never changes through state transitions
- **Persistent:** Stored in database and included in all webhook requests

**Structure:**

```typescript
class IdempotencyKey {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static generate(userId: string, targetTimestampUTC: DateTime): IdempotencyKey {
    // Deterministic key: hash(userId + targetTimestampUTC + eventType)
    const keyData = `${userId}-${targetTimestampUTC.toISO()}-BIRTHDAY`;
    const hash = crypto.createHash('sha256').update(keyData).digest('hex');
    return new IdempotencyKey(`event-${hash.substring(0, 16)}`);
  }

  static fromString(value: string): IdempotencyKey {
    return new IdempotencyKey(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: IdempotencyKey): boolean {
    return this.value === other.value;
  }
}
```

**Key Format:** `event-{16_character_sha256_hash}`

**Example:** `event-a1b2c3d4e5f6g7h8`

**Generation Algorithm:**

1. Concatenate: `userId + "-" + targetTimestampUTC.toISO() + "-" + eventType`
2. Hash: Apply SHA-256 cryptographic hash function
3. Truncate: Take first 16 characters of hex digest
4. Format: Prefix with `"event-"` to create final key

**Why SHA-256 Hash Instead of Plain IDs?**

- **Security:** Doesn't expose internal user IDs or event timestamps to external systems
- **Consistency:** Fixed 24-character length regardless of input length
- **Collision Resistance:** SHA-256 makes accidental duplicates virtually impossible
- **Privacy:** External webhook services cannot reverse-engineer user data from the key

**Deterministic Behavior Guarantee:**

Given the same inputs, `IdempotencyKey.generate()` will **always** produce identical output:

```typescript
// These two calls produce identical keys:
const key1 = IdempotencyKey.generate('user-123', DateTime.fromISO('2025-03-15T14:00:00Z'));
const key2 = IdempotencyKey.generate('user-123', DateTime.fromISO('2025-03-15T14:00:00Z'));

key1.equals(key2); // true
key1.toString() === key2.toString(); // true
```

**Webhook Header Usage:**

The idempotency key is sent to webhook endpoints in the `X-Idempotency-Key` HTTP header:

```http
POST /webhook HTTP/1.1
Host: example.com
Content-Type: application/json
X-Idempotency-Key: event-a1b2c3d4e5f6g7h8

{
  "message": "Hey, John Doe it's your birthday"
}
```

**Retry Consistency:**

When an event execution fails with a transient error (503 Service Unavailable, network timeout), the system retries the webhook delivery. All retry attempts use the **same idempotency key**:

```
Attempt 1: X-Idempotency-Key: event-a1b2c3d4e5f6g7h8  (fails with 503)
Attempt 2: X-Idempotency-Key: event-a1b2c3d4e5f6g7h8  (fails with timeout)
Attempt 3: X-Idempotency-Key: event-a1b2c3d4e5f6g7h8  (succeeds)
```

The external webhook service can use this header to detect duplicates and avoid processing the same event multiple times.

**External Webhook Service Configuration:**

**Testing with RequestBin/webhook.site:**

For development and integration testing, you can use services like RequestBin or webhook.site to inspect idempotency keys:

1. **Create endpoint:** Visit https://requestbin.com or https://webhook.site to create a test endpoint
2. **Configure environment variable:**
   ```bash
   WEBHOOK_TEST_URL=https://your-endpoint-id.requestbin.com
   ```
3. **Run integration tests:** Execute your webhook delivery tests
4. **View requests:** Open the RequestBin dashboard to see all incoming requests
5. **Verify idempotency:** Check that retry attempts have identical `X-Idempotency-Key` headers

**Important:** RequestBin and webhook.site are **passive inspection tools**—they log requests but do NOT enforce idempotency automatically. They allow you to verify that the system sends the correct headers.

**Production Webhook Implementation:**

For production webhook endpoints, the receiving service must implement idempotency logic:

```typescript
// Example: Webhook receiver implementing idempotency
app.post('/webhook', async (req, res) => {
  const idempotencyKey = req.headers['x-idempotency-key'];

  // Check if this key was already processed
  const alreadyProcessed = await db.processedKeys.exists(idempotencyKey);

  if (alreadyProcessed) {
    // Duplicate request - return success without reprocessing
    return res.status(200).json({ success: true, duplicate: true });
  }

  // Process the webhook payload
  await processWebhook(req.body);

  // Store the idempotency key to prevent future duplicates
  await db.processedKeys.save(idempotencyKey, { expiresIn: '7 days' });

  return res.status(200).json({ success: true });
});
```

**Logging and Debugging:**

All log statements related to event execution include the idempotency key for request tracing:

```typescript
logger.info({
  msg: 'Executing event',
  eventId: 'event-123',
  idempotencyKey: 'event-a1b2c3d4e5f6g7h8',
  userId: 'user-456',
  targetTimestampUTC: '2025-03-15T14:00:00Z'
});
```

**Example Log Output:**

```json
{
  "level": "info",
  "msg": "Webhook delivery succeeded",
  "eventId": "event-123",
  "idempotencyKey": "event-a1b2c3d4e5f6g7h8",
  "statusCode": 200,
  "durationMs": 245,
  "timestamp": "2025-03-15T14:00:01.245Z"
}
```

Use the `idempotencyKey` field to correlate logs across multiple retry attempts and trace the complete lifecycle of an event execution.

**Database Storage:**

The idempotency key is stored in the `events` table with a unique constraint:

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY,
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,
  -- ... other columns
);
```

The unique constraint prevents accidental creation of duplicate events with the same idempotency key, providing an additional layer of data integrity.

**Rationale:** Ensures that if the same event is retried (due to transient failure), the external webhook endpoint receives the same idempotency key and can deduplicate, achieving exactly-once delivery semantics.

---

## Entity Relationship Diagram

```mermaid
erDiagram
    USER ||--o{ EVENT : has
    USER {
        uuid id PK
        string firstName
        string lastName
        date dateOfBirth
        string timezone
        datetime createdAt
        datetime updatedAt
    }
    EVENT {
        uuid id PK
        uuid userId FK
        string eventType
        enum status
        datetime targetTimestampUTC
        datetime targetTimestampLocal
        string targetTimezone
        datetime executedAt
        string failureReason
        int retryCount
        int version
        string idempotencyKey
        json deliveryPayload
        datetime createdAt
        datetime updatedAt
    }
```

---
