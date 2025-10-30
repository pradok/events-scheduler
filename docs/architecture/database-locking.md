# Database Locking Strategies

**Comprehensive guide to pessimistic and optimistic locking in the Time-Based Event Scheduling System**

Reference: [Full Architecture Document](../architecture.md)

---

## Table of Contents

1. [Overview](#overview)
2. [Pessimistic Locking (FOR UPDATE SKIP LOCKED)](#pessimistic-locking-for-update-skip-locked)
3. [Optimistic Locking (Version-Based)](#optimistic-locking-version-based)
4. [When to Use Each Strategy](#when-to-use-each-strategy)
5. [Implementation Details](#implementation-details)
6. [Performance Considerations](#performance-considerations)
7. [Testing Concurrency](#testing-concurrency)

---

## Overview

This system uses **both pessimistic and optimistic locking** strategies depending on the use case:

| Strategy | Use Case | Implementation | Location |
|----------|----------|----------------|----------|
| **Pessimistic Locking** | Event claiming by distributed schedulers | `FOR UPDATE SKIP LOCKED` | `claimReadyEvents()` |
| **Optimistic Locking** | Event updates after processing | Version-based conflict detection | `update()` |

### Key Principle

- **Pessimistic locking** prevents conflicts by locking resources upfront (better for high-contention scenarios)
- **Optimistic locking** detects conflicts after they occur (better for low-contention scenarios)

---

## Pessimistic Locking (FOR UPDATE SKIP LOCKED)

### The Problem: Race Conditions in Distributed Schedulers

When multiple scheduler instances run simultaneously (e.g., multiple Kubernetes pods or Lambda invocations), naive implementations cause duplicate processing:

```typescript
// ❌ BROKEN: Race condition without row locking
async claimReadyEvents(limit: number): Promise<Event[]> {
  // Step 1: Instance A reads events 1, 2, 3
  // Step 2: Instance B reads events 1, 2, 3 (SAME EVENTS!)
  const events = await prisma.event.findMany({
    where: { status: 'PENDING', targetTimestampUTC: { lte: new Date() } },
    take: limit
  });

  // Step 3: Both instances update the SAME events to PROCESSING
  await prisma.event.updateMany({
    where: { id: { in: events.map(e => e.id) } },
    data: { status: 'PROCESSING' }
  });

  // Result: Both instances process events 1, 2, 3
  // User receives DUPLICATE birthday messages! 🎂🎂🎂
  return events;
}
```

**Real-world impact:**
- ❌ Duplicate birthday emails/SMS sent to users
- ❌ Duplicate webhook calls to external systems
- ❌ Wasted processing resources
- ❌ Data inconsistency

### The Solution: PostgreSQL Row-Level Locking

**`FOR UPDATE SKIP LOCKED`** provides atomic job claiming with two PostgreSQL clauses:

1. **`FOR UPDATE`** - Locks selected rows within a transaction
2. **`SKIP LOCKED`** - Skips already-locked rows instead of waiting

```typescript
// ✅ CORRECT: Row-level locking prevents race conditions
async claimReadyEvents(limit: number): Promise<Event[]> {
  return this.prisma.$transaction(async (tx) => {
    const now = new Date();

    // Step 1: SELECT with row-level locking
    const events = await tx.$queryRaw<Array<RawEvent>>`
      SELECT * FROM events
      WHERE status = 'PENDING'
        AND target_timestamp_utc <= ${now}
      ORDER BY target_timestamp_utc ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `;

    if (events.length === 0) {
      return [];
    }

    // Step 2: UPDATE locked rows to PROCESSING
    const eventIds = events.map(e => e.id);
    await tx.event.updateMany({
      where: { id: { in: eventIds } },
      data: {
        status: 'PROCESSING',
        version: { increment: 1 }
      }
    });

    // Locks released on transaction commit
    return events.map(eventToDomain);
  });
}
```

### How FOR UPDATE SKIP LOCKED Works

**Visual Analogy: Job Queue at a Factory**

Imagine 10 packages on a conveyor belt being processed by 3 workers:

```
┌─────────────────────────────────────────────────────────────┐
│ Conveyor Belt: 10 PENDING Events                           │
│ [1] [2] [3] [4] [5] [6] [7] [8] [9] [10]                   │
└─────────────────────────────────────────────────────────────┘

Worker A (Scheduler 1): Grabs packages 1-3 → puts 🔒 on them
Worker B (Scheduler 2): Skips 🔒 1-3, grabs packages 4-6
Worker C (Scheduler 3): Skips 🔒 1-6, grabs packages 7-9

✅ Result: All workers busy, no duplicates, no waiting!
Package 10 waits for next round.
```

**Without `SKIP LOCKED` (using only `FOR UPDATE`):**
```
Worker A: Grabs packages 1-5 → puts 🔒 on them
Worker B: Tries to grab packages → sees 🔒 → ⏳ WAITS
Worker C: Tries to grab packages → sees 🔒 → ⏳ WAITS

❌ Result: Workers B and C are idle (potential deadlock)
```

### Execution Flow with 3 Concurrent Instances

```sql
-- Instance 1 (Transaction 1 starts)
BEGIN;
SELECT * FROM events WHERE status='PENDING' LIMIT 5 FOR UPDATE SKIP LOCKED;
-- ✅ Returns events 1-5, locks them

-- Instance 2 (Transaction 2 starts - almost simultaneously)
BEGIN;
SELECT * FROM events WHERE status='PENDING' LIMIT 5 FOR UPDATE SKIP LOCKED;
-- ✅ Skips locked events 1-5, returns events 6-10, locks them

-- Instance 3 (Transaction 3 starts - almost simultaneously)
BEGIN;
SELECT * FROM events WHERE status='PENDING' LIMIT 5 FOR UPDATE SKIP LOCKED;
-- ✅ All events locked, returns empty array []

-- Instance 1 updates and commits
UPDATE events SET status='PROCESSING' WHERE id IN (1,2,3,4,5);
COMMIT; -- Releases locks on events 1-5

-- Instance 2 updates and commits
UPDATE events SET status='PROCESSING' WHERE id IN (6,7,8,9,10);
COMMIT; -- Releases locks on events 6-10

-- Instance 3 does nothing (no events claimed)
COMMIT;

-- Final state: All 10 events PROCESSING, no duplicates ✅
```

### Why Prisma's Native Methods Don't Work

**Prisma does NOT support `FOR UPDATE SKIP LOCKED`** in its query builder (as of 2025):

```typescript
// ❌ Not possible with Prisma's findMany
const events = await prisma.event.findMany({
  where: { status: 'PENDING' },
  forUpdate: true,        // ❌ Does not exist
  skipLocked: true        // ❌ Does not exist
});
```

**Alternative approaches and why they fail:**

1. **Optimistic Concurrency Control (Prisma's recommendation)**
   - ❌ Detects conflicts AFTER they occur (read → fail on version mismatch)
   - ❌ Doesn't prevent duplicate claims, just fails them
   - ❌ Requires retry logic, wastes processing

2. **findMany() + updateMany() without locking**
   - ❌ Race condition between SELECT and UPDATE
   - ❌ Multiple instances read same events before any UPDATE completes

3. **Interactive transactions without FOR UPDATE**
   - ❌ Transactions don't prevent concurrent reads
   - ❌ Still has race condition

**Raw SQL is the ONLY solution** for this use case in Prisma (see GitHub issues [#5983](https://github.com/prisma/prisma/issues/5983), [#17136](https://github.com/prisma/prisma/issues/17136)).

### Why the Transaction Wrapper is Critical

```typescript
// ❌ WITHOUT transaction: Locks released immediately
const events = await prisma.$queryRaw`SELECT ... FOR UPDATE SKIP LOCKED`;
// Locks are GONE here!
await prisma.event.updateMany(...); // Race condition possible

// ✅ WITH transaction: Locks held until commit
return prisma.$transaction(async (tx) => {
  const events = await tx.$queryRaw`SELECT ... FOR UPDATE SKIP LOCKED`;
  // Locks still held here ✅
  await tx.event.updateMany(...);
  // Locks still held here ✅
  return events;
  // Locks released on commit ✅
});
```

**Without the transaction wrapper:**
- `FOR UPDATE` locks are released immediately after the `$queryRaw` call
- The `updateMany` runs separately in a new transaction
- Other schedulers can read the same events before the status update completes

**With the transaction wrapper:**
- Both SELECT and UPDATE execute in the same transaction
- Locks are held from SELECT until COMMIT
- Other schedulers see locked rows and skip them correctly

### Scalability Benefits

This pattern enables **horizontal scaling** of the scheduler:

```
┌────────────────────────────────────────────────────────────┐
│ Production Deployment (3 Scheduler Pods)                   │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Pod 1: Claims events 1-100   ────┐                       │
│  Pod 2: Claims events 101-200 ────┼──→ PostgreSQL         │
│  Pod 3: Claims events 201-300 ────┘    (10K events)       │
│                                                            │
│  ✅ All pods busy                                          │
│  ✅ No duplicate processing                                │
│  ✅ No deadlocks                                           │
│  ✅ Linear scalability (add more pods = more throughput)   │
└────────────────────────────────────────────────────────────┘
```

**Performance characteristics:**
- ✅ **Lock contention:** Minimal (SKIP LOCKED avoids waiting)
- ✅ **Throughput:** Scales linearly with number of instances
- ✅ **Latency:** Sub-millisecond lock acquisition
- ✅ **Deadlocks:** Impossible (no waiting = no circular dependencies)

### Database Index Requirements

The claiming query requires a properly indexed table for optimal performance:

**Current Implementation (MVP):**
```sql
-- Composite index (indexes ALL events, not just PENDING)
CREATE INDEX idx_events_scheduler_query
ON events(target_timestamp_utc, status);
```

**Index characteristics:**
- **Type:** B-tree composite index
- **Columns:** `(target_timestamp_utc, status)`
- **Scope:** Indexes ALL events regardless of status
- **Performance:** Sufficient for MVP (up to millions of events)

**Future Optimization (Partial Index):**
```sql
-- Partial index (indexes only PENDING events)
CREATE INDEX idx_events_scheduler_query
ON events(target_timestamp_utc, status)
WHERE status = 'PENDING';
```

**Partial index benefits:**
- Smaller index size (only `PENDING` events)
- Faster index scans (fewer rows)
- More cache-friendly
- Ideal for serverless/Lambda cold starts

**Note:** Prisma does not support partial indexes in schema files. A partial index would require a custom SQL migration.

**Query execution plan (expected):**
```
LockRows  (cost=X..Y rows=100)
  ->  Limit  (cost=X..Y rows=100)
        ->  Index Scan using idx_events_scheduler_query on events
              Index Cond: ((target_timestamp_utc <= now()) AND (status = 'PENDING'))
```

### Implementation Reference

**File:** `src/modules/event-scheduling/adapters/persistence/PrismaEventRepository.ts`

**Method:** `claimReadyEvents(limit: number): Promise<Event[]>`

**Lines:** [128-197](../../src/modules/event-scheduling/adapters/persistence/PrismaEventRepository.ts#L128-L197)

**Documentation in code:**
```typescript
/**
 * Atomically claims ready events using FOR UPDATE SKIP LOCKED
 * Returns PENDING events where targetTimestampUTC <= now and transitions them to PROCESSING
 *
 * **Raw SQL Justification:**
 * Uses `$queryRaw` because Prisma doesn't support PostgreSQL row-level locking:
 * 1. FOR UPDATE - Row-level lock to prevent concurrent claims
 * 2. SKIP LOCKED - Skip rows already locked by other transactions (avoid deadlocks)
 *
 * **Concurrency Safety:**
 * FOR UPDATE SKIP LOCKED ensures multiple scheduler instances can run safely:
 * - Instance A locks events 1, 2, 3
 * - Instance B skips locked rows, claims events 4, 5, 6
 * - No duplicate processing, no deadlocks
 *
 * @see docs/architecture/database-locking.md
 * @see docs/architecture/coding-standards.md - Section on Raw SQL Usage
 */
```

---

## Optimistic Locking (Version-Based)

### The Problem: Concurrent Updates

After an event is claimed and processing completes, we need to update its status. Multiple processes might attempt to update the same event concurrently (e.g., a retry happening simultaneously with the original execution completing).

### The Solution: Version Column

The `events` table includes a `version` column that increments on every update:

```sql
CREATE TABLE events (
  -- ...
  version INTEGER NOT NULL DEFAULT 1,
  -- ...
);
```

**Update query with version check:**
```sql
UPDATE events
SET status = 'COMPLETED',
    version = version + 1,
    executed_at = NOW()
WHERE id = ?
  AND version = ?;  -- Check against OLD version
```

**If the update affects 0 rows:**
- Another process has already modified the event (version mismatch)
- Throw `OptimisticLockError` to signal conflict
- Application layer decides how to handle (retry, fail, log, etc.)

### How It Works

**Scenario: Two processes try to complete the same event**

```
Initial state: Event { id: 1, status: 'PROCESSING', version: 2 }

Process A reads:     { id: 1, status: 'PROCESSING', version: 2 }
Process B reads:     { id: 1, status: 'PROCESSING', version: 2 }

Process A updates:   WHERE id = 1 AND version = 2
                     SET version = 3, status = 'COMPLETED'
                     ✅ Succeeds (1 row affected)

Process B updates:   WHERE id = 1 AND version = 2
                     SET version = 3, status = 'COMPLETED'
                     ❌ Fails (0 rows affected - version is now 3, not 2)
                     → Throws OptimisticLockError
```

### Implementation in PrismaEventRepository

**File:** `src/modules/event-scheduling/adapters/persistence/PrismaEventRepository.ts`

**Method:** `update(event: Event): Promise<Event>`

**Lines:** [64-97](../../src/modules/event-scheduling/adapters/persistence/PrismaEventRepository.ts#L64-L97)

```typescript
/**
 * Updates an event with optimistic locking
 * Throws OptimisticLockError if version mismatch
 *
 * Note: The domain Event entity increments version when state changes (e.g., claim()),
 * but we need to check against the PREVIOUS version in the database.
 * So we check where version = event.version - 1 (the version before the domain operation).
 */
public async update(event: Event): Promise<Event> {
  const prismaData = eventToPrisma(event);
  const previousVersion = event.version - 1; // Version before the domain operation

  try {
    const updated = await this.prisma.event.update({
      where: {
        id: event.id,
        version: previousVersion, // Check against OLD version in DB
      },
      data: {
        status: prismaData.status,
        targetTimestampUTC: prismaData.targetTimestampUTC,
        // ...
        version: event.version, // Set to NEW version
        updatedAt: prismaData.updatedAt,
      },
    });

    return eventToDomain(updated);
  } catch (error) {
    // Prisma throws P2025 when no record found (version mismatch)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new OptimisticLockError(
        `Event ${event.id} was modified by another transaction (expected version ${previousVersion})`
      );
    }
    throw error;
  }
}
```

### Domain Entity Version Management

The `Event` entity automatically increments the version when state changes:

```typescript
export class Event {
  private _version: number;

  public claim(): void {
    if (this._status !== EventStatus.PENDING) {
      throw new DomainError('Only PENDING events can be claimed');
    }
    this._status = EventStatus.PROCESSING;
    this._version++; // Increment version on state change
  }

  public markCompleted(executedAt: DateTime): void {
    this._status = EventStatus.COMPLETED;
    this._executedAt = executedAt;
    this._version++; // Increment version on state change
  }

  public markFailed(failureReason: string): void {
    this._status = EventStatus.FAILED;
    this._failureReason = failureReason;
    this._retryCount++;
    this._version++; // Increment version on state change
  }
}
```

### When Optimistic Locking Fails

**OptimisticLockError is thrown when:**
- Another process updated the event between read and write
- The event version in the database doesn't match the expected version

**Error handling options:**

1. **Retry the operation** (read fresh data, apply changes, try again)
2. **Fail the operation** (log error, alert, manual intervention)
3. **Reconcile** (merge changes if possible, based on business logic)

**Example in use case:**
```typescript
try {
  await eventRepository.update(event);
} catch (error) {
  if (error instanceof OptimisticLockError) {
    // Option 1: Retry
    const freshEvent = await eventRepository.findById(event.id);
    freshEvent.markCompleted(executedAt);
    await eventRepository.update(freshEvent);

    // Option 2: Fail gracefully
    logger.warn('Event already updated by another process', { eventId: event.id });

    // Option 3: Ignore (if idempotent)
    return; // Event already completed, no-op
  }
  throw error;
}
```

### Database Schema

```sql
-- Version column in events table
CREATE TABLE events (
    -- ...
    version INTEGER NOT NULL DEFAULT 1,
    -- ...
);

-- Database comment
COMMENT ON COLUMN events.version IS 'Optimistic locking version for concurrency control';
```

---

## When to Use Each Strategy

### Use Pessimistic Locking (FOR UPDATE SKIP LOCKED) When:

✅ **High contention scenarios**
- Multiple processes competing for the same resources
- Distributed job queues (multiple scheduler instances)
- Ticket booking, inventory reservation systems

✅ **Preventing duplicates is critical**
- Duplicate processing would cause user-facing issues
- External API calls that aren't idempotent
- Financial transactions

✅ **Lock duration is short**
- Locks held only during claim operation (<100ms)
- Quick transition from locked to processed state

✅ **Database supports it**
- PostgreSQL 9.5+
- MySQL 8.0+
- Not available in: MongoDB, DynamoDB, most NoSQL databases

### Use Optimistic Locking (Version-Based) When:

✅ **Low to moderate contention**
- Conflicts are rare
- Most updates succeed on first try

✅ **Long-running operations**
- User editing a form for minutes
- Background processing with variable duration
- Human-in-the-loop workflows

✅ **Read-heavy workloads**
- Many reads, few writes
- No locks during read phase (better performance)

✅ **Database agnostic**
- Works on any database (SQL, NoSQL, key-value stores)
- Only requires atomic compare-and-swap on single column

✅ **Retry is acceptable**
- Application can handle `OptimisticLockError` and retry
- Failed updates don't cause critical issues

### Comparison Table

| Aspect | Pessimistic Locking | Optimistic Locking |
|--------|--------------------|--------------------|
| **Lock timing** | Before operation (proactive) | After operation (reactive) |
| **Conflict detection** | Prevents conflicts | Detects conflicts after they occur |
| **Performance under low contention** | Slight overhead (locking) | Best (no locks) |
| **Performance under high contention** | Best (no retries) | Poor (many retries) |
| **Deadlock risk** | Possible (without SKIP LOCKED) | None |
| **Database support** | Database-specific | Universal |
| **Lock duration** | Held during transaction | No locks held |
| **Retry logic required** | No | Yes |
| **Best for** | Distributed schedulers, job queues | Form updates, low-contention writes |

---

## Implementation Details

### Pessimistic Locking Implementation

**Location:** `PrismaEventRepository.claimReadyEvents()`

**Key components:**

1. **Transaction wrapper**
   ```typescript
   return this.prisma.$transaction(async (tx) => {
     // All operations inside transaction
   });
   ```

2. **Raw SQL with FOR UPDATE SKIP LOCKED**
   ```typescript
   const events = await tx.$queryRaw<Array<RawEvent>>`
     SELECT * FROM events
     WHERE status = 'PENDING'
       AND target_timestamp_utc <= ${now}
     ORDER BY target_timestamp_utc ASC
     LIMIT ${limit}
     FOR UPDATE SKIP LOCKED
   `;
   ```

3. **Status update within same transaction**
   ```typescript
   await tx.event.updateMany({
     where: { id: { in: eventIds } },
     data: {
       status: 'PROCESSING',
       version: { increment: 1 }
     }
   });
   ```

4. **Type safety with explicit mapping**
   ```typescript
   return events.map((e) =>
     eventToDomain({
       id: e.id,
       userId: e.user_id,  // Snake case to camel case
       eventType: e.event_type,
       status: EventStatus.PROCESSING,
       // ... explicit field mapping
     })
   );
   ```

### Optimistic Locking Implementation

**Location:** `PrismaEventRepository.update()`

**Key components:**

1. **Version calculation**
   ```typescript
   const previousVersion = event.version - 1; // Domain already incremented
   ```

2. **Conditional update with version check**
   ```typescript
   const updated = await this.prisma.event.update({
     where: {
       id: event.id,
       version: previousVersion, // Must match DB version
     },
     data: {
       version: event.version, // New version
       // ... other fields
     },
   });
   ```

3. **Error handling for version mismatch**
   ```typescript
   if (error instanceof Prisma.PrismaClientKnownRequestError &&
       error.code === 'P2025') {
     throw new OptimisticLockError(
       `Event ${event.id} was modified by another transaction`
     );
   }
   ```

### Combined Usage in Scheduler Flow

```typescript
// Step 1: PESSIMISTIC LOCKING - Claim events atomically
const events = await eventRepository.claimReadyEvents(100);
// Events are now PROCESSING with version incremented
// No other scheduler can claim these events (they're already PROCESSING)

// Step 2: Process each event
for (const event of events) {
  try {
    await deliveryAdapter.deliver(event);
    event.markCompleted(DateTime.now()); // Domain increments version

    // Step 3: OPTIMISTIC LOCKING - Update after processing
    await eventRepository.update(event);
    // If this fails (OptimisticLockError), another process updated it
  } catch (error) {
    if (error instanceof OptimisticLockError) {
      // Event already updated (maybe by retry handler)
      logger.warn('Event already updated', { eventId: event.id });
    } else {
      event.markFailed(error.message); // Domain increments version
      await eventRepository.update(event); // Save failure state
    }
  }
}
```

**Why both strategies work together:**
1. Pessimistic locking prevents duplicate claims (critical path)
2. Optimistic locking handles edge cases during processing (safety net)
3. Once claimed (PROCESSING), event won't be claimed again
4. Optimistic locking catches rare concurrent updates to same PROCESSING event

---

## Performance Considerations

### Pessimistic Locking Performance

**Query performance at scale:**

| Event Count | Index Type | Query Time | Lock Acquisition |
|-------------|-----------|------------|------------------|
| 1K | Partial Index | 5-10ms | <1ms |
| 10K | Partial Index | 10-20ms | <1ms |
| 100K | Partial Index | 20-50ms | 1-5ms |
| 1M | Partial Index | 30-60ms | 5-10ms |

**Index optimization for claiming:**

```sql
-- Current index (sufficient for MVP)
CREATE INDEX idx_events_scheduler_query
ON events(target_timestamp_utc, status)
WHERE status = 'PENDING';

-- Future optimization: Status first (post-MVP)
CREATE INDEX idx_events_scheduler_query_optimized
ON events(status, target_timestamp_utc)
WHERE status = 'PENDING';
```

**Why status-first index may be better:**
- Equality filter (`status = 'PENDING'`) is more selective
- Range filter (`target_timestamp_utc <= NOW()`) applied second
- PostgreSQL scans all PENDING rows first, then filters by time

**When to optimize:**
- ⏱️ Query consistently takes >200ms (p95)
- 🚨 Lambda timeouts occurring
- 📊 Database CPU >70%
- 🔒 Slow lock acquisition

**Monitoring metrics:**

```typescript
// Log metrics in Lambda
console.log('ClaimQuery', {
  queryDurationMs: queryDuration,
  eventsFound: events.length,
  batchSize: limit,
});

console.log('ClaimTransaction', {
  totalDurationMs: totalDuration,
  eventsClaimed: events.length,
});
```

**CloudWatch alert thresholds:**
- ⚠️ Warning: Query >100ms (p95)
- 🚨 Critical: Query >200ms (p95)
- 🚨 Critical: Transaction >1s (p95)

### Optimistic Locking Performance

**No performance overhead:**
- ✅ No locks held during read phase
- ✅ Single atomic UPDATE operation
- ✅ Only cost is handling OptimisticLockError on conflict (rare)

**Conflict rate monitoring:**

```typescript
// Track version conflicts
if (error instanceof OptimisticLockError) {
  metricsClient.increment('events.optimistic_lock_conflict', {
    operation: 'update',
    eventId: event.id
  });
}
```

**Expected conflict rate:**
- **<1%** in normal operation (low contention)
- **1-5%** during high load with retries
- **>5%** indicates excessive contention (consider pessimistic locking)

### Database Connection Pooling

**Critical for serverless environments:**

```typescript
// Use RDS Proxy for Lambda
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL, // Points to RDS Proxy
    },
  },
});
```

**Why RDS Proxy is mandatory:**
- Lambda instances open many connections
- PostgreSQL has limited connection slots (typically 100-200)
- RDS Proxy pools connections efficiently
- Prevents "too many connections" errors

**Configuration:**
- **Connection timeout:** <5 seconds (shorter than Lambda timeout)
- **Transaction timeout:** <29 seconds (shorter than Lambda timeout)
- **Max connections per Lambda:** 1-2 (reuse same Prisma instance)

---

## Testing Concurrency

### Pessimistic Locking Test

**File:** `src/__tests__/integration/adapters/secondary/persistence/PrismaEventRepository.test.ts`

**Test:** `should prevent duplicate claims when called concurrently`

```typescript
it('should prevent duplicate claims when called concurrently', async () => {
  // Arrange: 10 PENDING events
  const events = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      prisma.event.create({
        data: {
          userId: user.id,
          status: 'PENDING',
          targetTimestampUTC: new Date(Date.now() - 1000), // Ready
          // ... other fields
        },
      })
    )
  );

  // Act: 3 concurrent scheduler instances
  const [claimed1, claimed2, claimed3] = await Promise.all([
    repository.claimReadyEvents(5), // Instance 1: request 5
    repository.claimReadyEvents(5), // Instance 2: request 5
    repository.claimReadyEvents(5), // Instance 3: request 5
  ]);

  // Assert: No duplicates
  const allClaimedIds = [
    ...claimed1.map((e) => e.id),
    ...claimed2.map((e) => e.id),
    ...claimed3.map((e) => e.id),
  ];

  const uniqueIds = new Set(allClaimedIds);
  expect(allClaimedIds.length).toBe(uniqueIds.size); // No duplicates ✅
  expect(uniqueIds.size).toBe(10); // All 10 events claimed ✅

  // Verify database state
  const dbEvents = await prisma.event.findMany({
    where: { id: { in: events.map((e) => e.id) } },
  });
  expect(dbEvents.every((e) => e.status === 'PROCESSING')).toBe(true);
  expect(dbEvents.every((e) => e.version === 2)).toBe(true); // Version incremented
});
```

**What this test proves:**
- ✅ Each event claimed exactly once (no duplicates)
- ✅ All events claimed (none missed)
- ✅ Correct status transition (PENDING → PROCESSING)
- ✅ Version incremented atomically

### Optimistic Locking Test

**File:** `src/__tests__/integration/adapters/secondary/persistence/PrismaEventRepository.test.ts`

**Test:** `should throw OptimisticLockError when version mismatch`

```typescript
it('should throw OptimisticLockError when version mismatch', async () => {
  // Arrange: Create event with version 1
  const dbEvent = await prisma.event.create({
    data: {
      userId: user.id,
      status: 'PENDING',
      version: 1,
      // ... other fields
    },
  });

  // Another process updates the event (version becomes 2)
  await prisma.event.update({
    where: { id: dbEvent.id },
    data: { version: 2 },
  });

  // Act: Try to update with stale version (expects version 1)
  const event = eventToDomain(dbEvent);
  event.claim(); // This increments version to 2 in domain

  // Assert: Update fails because DB version is already 2
  await expect(repository.update(event)).rejects.toThrow(OptimisticLockError);
});
```

**What this test proves:**
- ✅ Version mismatch detected correctly
- ✅ OptimisticLockError thrown
- ✅ No silent data corruption

### Load Testing

**Simulate high concurrency:**

```typescript
describe('Load Testing - 100 concurrent schedulers', () => {
  it('should handle 100 concurrent claims without duplicates', async () => {
    // Arrange: 1000 PENDING events
    const events = await createManyEvents(1000);

    // Act: 100 concurrent scheduler instances
    const claimPromises = Array.from({ length: 100 }, () =>
      repository.claimReadyEvents(10)
    );

    const results = await Promise.all(claimPromises);

    // Assert
    const allClaimedIds = results.flatMap((r) => r.map((e) => e.id));
    const uniqueIds = new Set(allClaimedIds);

    expect(allClaimedIds.length).toBe(uniqueIds.size); // No duplicates
    expect(uniqueIds.size).toBeLessThanOrEqual(1000); // At most 1000 claimed
  });
});
```

---

## Summary

### Key Takeaways

1. **Two locking strategies for different use cases**
   - Pessimistic locking for atomic job claiming (distributed schedulers)
   - Optimistic locking for general updates (low contention)

2. **FOR UPDATE SKIP LOCKED is critical for distributed systems**
   - Prevents duplicate processing
   - Enables horizontal scaling
   - No deadlocks with SKIP LOCKED

3. **Transaction wrapper is mandatory for pessimistic locking**
   - Locks held from SELECT to COMMIT
   - Race conditions possible without transaction

4. **Version-based optimistic locking provides safety net**
   - Catches rare concurrent updates
   - Fails fast with clear error
   - Application decides how to handle conflict

5. **Both strategies work together**
   - Pessimistic locking prevents duplicate claims (critical)
   - Optimistic locking handles edge cases during processing (safety)

### References

**Implementation files:**
- [PrismaEventRepository.ts](../../src/modules/event-scheduling/adapters/persistence/PrismaEventRepository.ts) - Both locking implementations
- [Event.ts](../../src/modules/event-scheduling/domain/entities/Event.ts) - Version management in domain entity
- [OptimisticLockError.ts](../../src/domain/errors/OptimisticLockError.ts) - Custom error for version conflicts

**Related documentation:**
- [Design Patterns](./design-patterns.md) - Distributed Scheduler Pattern section
- [Coding Standards](./coding-standards.md) - Raw SQL usage guidelines
- [Database Schema](./database-schema.md) - Index and constraint definitions
- [Test Strategy](./test-strategy.md) - Concurrency testing guidelines

**External resources:**
- [PostgreSQL Row Locking](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS)
- [Prisma GitHub Issues: #5983](https://github.com/prisma/prisma/issues/5983) - FOR UPDATE SKIP LOCKED support
- [Martin Fowler: Optimistic Locking](https://martinfowler.com/eaaCatalog/optimisticOfflineLock.html)
