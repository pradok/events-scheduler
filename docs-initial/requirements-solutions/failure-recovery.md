# Solution: Failure Recovery (Requirement #5)

**Requirement from [brief.md](../brief.md):**
> "The system needs to be able to recover and send all unsent messages if the service was down for a period of time (say a day)."

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Solution Overview](#solution-overview)
3. [How It Works](#how-it-works)
4. [Implementation Details](#implementation-details)
5. [Recovery Scenarios](#recovery-scenarios)
6. [Exactly-Once Delivery Guarantee](#exactly-once-delivery-guarantee)
7. [Monitoring & Observability](#monitoring--observability)

---

## Problem Statement

### What We Need to Solve

When the scheduler goes down (crash, deployment, server failure), birthday events continue to accumulate:
- User A's birthday at 9:00 AM → Event ready but scheduler offline
- User B's birthday at 9:15 AM → Event ready but scheduler offline
- User C's birthday at 9:30 AM → Event ready but scheduler offline

**When the system comes back online:**
- ✅ Must send ALL missed birthday messages
- ✅ Must NOT send duplicate messages
- ✅ Must work automatically (no manual intervention)
- ✅ Must handle any downtime duration (5 minutes to 24+ hours)

### Related Challenges

From [challenges.md](../challenges.md#3-failure-recovery--resilience):
- Downtime recovery without duplicates
- Catch up on missed events
- Maintain exactly-once delivery guarantee

---

## Solution Overview

### Core Principle

**Events persist in the database as `PENDING` until successfully processed.**

The scheduler query naturally finds ALL events that should have been processed:

```sql
SELECT * FROM events
WHERE target_timestamp_utc <= NOW()  -- Any time in the past or present
  AND status = 'PENDING'              -- Not yet processed
FOR UPDATE SKIP LOCKED
LIMIT 100;
```

**Key insight:** By using `<=` instead of `=`, the query catches up on all missed work automatically.

### Why This Works

- **Database is source of truth** - Events don't disappear during downtime
- **Query is time-agnostic** - Finds events 1 minute late or 24 hours late
- **No special recovery mode** - Same query works for normal operation and recovery
- **Automatic on startup** - Run query immediately when scheduler starts

---

## How It Works

### Normal Operation (No Downtime)

```
Time: 9:00:30 AM

Database:
- Event A: target=9:00 AM, status=PENDING
- Event B: target=10:00 AM, status=PENDING

Scheduler Query:
WHERE target_timestamp_utc <= 9:00:30 AM AND status = 'PENDING'

Results: [Event A]  (Event B not ready yet)

Process Event A → Mark as COMPLETED
```

### Recovery After Downtime

```
System Down: 8:00 AM → 10:00 AM (2 hours)

During downtime:
- Event A: target=9:00 AM → Stays PENDING ⏳
- Event B: target=9:15 AM → Stays PENDING ⏳
- Event C: target=9:30 AM → Stays PENDING ⏳
- Event D: target=11:00 AM → Stays PENDING ⏳

System Up: 10:00 AM

Scheduler starts → Runs query immediately:
WHERE target_timestamp_utc <= 10:00 AM AND status = 'PENDING'

Results: [Event A, Event B, Event C]
(Event D not ready yet - target is 11:00 AM)

Process all 3 events:
- Event A: Send message (1 hour late) → COMPLETED ✅
- Event B: Send message (45 min late) → COMPLETED ✅
- Event C: Send message (30 min late) → COMPLETED ✅

Time: 11:00:30 AM (next scheduler run)
- Event D: Now ready → Processed on time ✅
```

---

## Implementation Details

### Scheduler Startup

```typescript
// src/scheduler/index.ts
async function startScheduler() {
  console.log('Scheduler starting...');

  // 🔑 KEY: Run immediately on startup (recovery)
  try {
    const result = await schedulerJob();
    console.log(`Initial recovery run: ${result.processed} events processed`);
  } catch (error) {
    console.error('Recovery run failed:', error);
    // Continue anyway - next scheduled run will retry
  }

  // Then run every 60 seconds (normal operation)
  const interval = setInterval(async () => {
    try {
      await schedulerJob();
    } catch (error) {
      console.error('Scheduler error:', error);
      // Continue running even on error
    }
  }, 60_000);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('Shutting down scheduler...');
    clearInterval(interval);
    process.exit(0);
  });
}

startScheduler();
```

### Scheduler Job (Works for Both Normal and Recovery)

```typescript
// src/scheduler/scheduler-job.ts
export async function schedulerJob(): Promise<{ processed: number }> {
  const startTime = Date.now();

  // Find ALL events that should have been processed
  // (Doesn't matter if they're 1 second late or 1 day late)
  const events = await eventRepository.findAndClaimReadyEvents(100);

  if (events.length === 0) {
    console.log('No events ready');
    return { processed: 0 };
  }

  console.log(`Found ${events.length} events to process`);

  let processed = 0;
  let failed = 0;

  for (const event of events) {
    // Calculate how late this event is
    const latenessMs = Date.now() - event.targetTimestampUTC.getTime();
    const latenessMinutes = Math.floor(latenessMs / 60000);

    // Log if significantly late (recovery scenario)
    if (latenessMinutes > 60) {
      logger.warn('Late event execution (recovery)', {
        eventId: event.id,
        userId: event.userId,
        targetTime: event.targetTimestampUTC.toISOString(),
        latenessMinutes,
        latenessHours: (latenessMinutes / 60).toFixed(1)
      });
    }

    try {
      // Execute the event (send birthday message)
      await eventExecutor.execute(event);

      // Mark as completed
      await eventRepository.markAsCompleted(event.id, new Date());

      // Generate next year's event
      await eventGenerationService.generateNextYearEvent(event.userId);

      processed++;

      logger.info('Event processed successfully', {
        eventId: event.id,
        userId: event.userId,
        latenessMinutes
      });
    } catch (error) {
      // Mark as failed (will be retried on next run if transient error)
      await eventRepository.markAsFailed(event.id, error.message);

      failed++;

      logger.error('Event processing failed', {
        eventId: event.id,
        userId: event.userId,
        error: error.message,
        attempts: event.attempts + 1
      });
    }
  }

  const durationMs = Date.now() - startTime;

  logger.info('Scheduler job completed', {
    processed,
    failed,
    durationMs,
    eventsPerSecond: (processed / (durationMs / 1000)).toFixed(2)
  });

  return { processed };
}
```

### Repository Query (PostgreSQL)

```typescript
// src/repositories/event-repository.ts
export class EventRepository {
  async findAndClaimReadyEvents(limit: number): Promise<BirthdayEvent[]> {
    return this.db.transaction(async (tx) => {
      // Find and lock events in one atomic operation
      const rows = await tx.query(`
        UPDATE events
        SET status = 'PROCESSING',
            version = version + 1,
            updated_at = NOW()
        WHERE id IN (
          SELECT id FROM events
          WHERE target_timestamp_utc <= NOW()
            AND status = 'PENDING'
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        )
        RETURNING *
      `, [limit]);

      return rows.map(row => this.mapToEntity(row));
    });
  }

  async markAsCompleted(eventId: string, executedAt: Date): Promise<void> {
    await this.db.query(`
      UPDATE events
      SET status = 'COMPLETED',
          executed_at = $2,
          updated_at = NOW()
      WHERE id = $1
    `, [eventId, executedAt]);
  }

  async markAsFailed(eventId: string, errorMessage: string): Promise<void> {
    await this.db.query(`
      UPDATE events
      SET status = 'FAILED',
          attempts = attempts + 1,
          last_error = $2,
          updated_at = NOW()
      WHERE id = $1
    `, [eventId, errorMessage]);
  }
}
```

---

## Recovery Scenarios

### Scenario 1: Short Downtime (5 minutes)

```
Timeline:
09:00:00 - Scheduler goes down
09:02:00 - Event A should fire (missed)
09:03:00 - Event B should fire (missed)
09:05:00 - Scheduler comes back up

Recovery:
09:05:00 - Scheduler starts
09:05:01 - Query finds: [Event A, Event B]
09:05:02 - Event A processed (3 min late) ✅
09:05:03 - Event B processed (2 min late) ✅

Result: Both messages delivered, slightly late
```

### Scenario 2: Long Downtime (24 hours)

```
Timeline:
March 15, 09:00 - Scheduler goes down
March 15, 09:00 - 23:59 - 50 birthdays missed
March 16, 00:00 - 09:00 - 20 birthdays missed
March 16, 09:00 - Scheduler comes back up

Recovery:
March 16, 09:00:00 - Scheduler starts
March 16, 09:00:01 - Query finds: 70 PENDING events
March 16, 09:00:02 - 09:01:00 - All 70 events processed (LIMIT 100)

Result: All 70 messages delivered, 24 hours late
```

### Scenario 3: Partial Processing + Crash

```
Timeline:
09:00:00 - 5 events ready: [A, B, C, D, E]
09:00:01 - Scheduler starts processing
09:00:02 - Event A: COMPLETED ✅
09:00:03 - Event B: COMPLETED ✅
09:00:04 - Event C: Processing... 💥 CRASH

Recovery:
09:05:00 - Scheduler restarts
09:05:01 - Query finds: [Event C, Event D, Event E]
           (Events A & B already COMPLETED, not returned)
09:05:02 - Event C: COMPLETED ✅
09:05:03 - Event D: COMPLETED ✅
09:05:04 - Event E: COMPLETED ✅

Result: No duplicates (A & B not re-processed)
        All events eventually processed
```

### Scenario 4: Repeated Failures with Retry Limit

```text
Event A keeps failing due to external webhook being down:

Attempt 1 (09:00): FAILED - Network timeout
  Status: FAILED, attempts=1

Attempt 2 (09:01): FAILED - Network timeout
  Status: FAILED, attempts=2

Attempt 3 (09:02): FAILED - Network timeout
  Status: FAILED, attempts=3

Attempt 4 (09:03): Max retries reached
  Move to dead letter queue or manual review
```

**Implementation:**

```typescript
const MAX_RETRIES = 3;

for (const event of events) {
  if (event.attempts >= MAX_RETRIES) {
    await eventRepository.moveToDeadLetterQueue(event.id);
    logger.error('Event moved to DLQ', {
      eventId: event.id,
      attempts: event.attempts,
      lastError: event.lastError
    });
    continue;
  }

  try {
    await eventExecutor.execute(event);
    await eventRepository.markAsCompleted(event.id, new Date());
  } catch (error) {
    await eventRepository.markAsFailed(event.id, error.message);
  }
}
```

---

## Exactly-Once Delivery Guarantee

### How We Prevent Duplicates

#### 1. Database State Tracking

Each event has a status field:
- `PENDING` → Ready to process
- `PROCESSING` → Currently being processed
- `COMPLETED` → Successfully processed (terminal state)
- `FAILED` → Processing failed (can retry)

Once an event is `COMPLETED`, it's never returned by the query again.

#### 2. Atomic Claiming with `FOR UPDATE SKIP LOCKED`

```sql
-- Multiple scheduler instances run this simultaneously
SELECT id FROM events
WHERE target_timestamp_utc <= NOW() AND status = 'PENDING'
FOR UPDATE SKIP LOCKED  -- Magic happens here
LIMIT 100;
```

**How it works:**
- Scheduler A locks Event 1, 2, 3
- Scheduler B tries to lock same events → SKIP LOCKED → Gets Event 4, 5, 6 instead
- No chance of overlap

#### 3. Optimistic Locking with Version Number

```sql
UPDATE events
SET status = 'PROCESSING',
    version = version + 1
WHERE id = $1
  AND version = $2;  -- Only succeeds if version matches
```

If two processes somehow try to update the same event:
- First one: version=0 → version=1 ✅ (succeeds)
- Second one: version=0 → ❌ (fails - version is now 1)

#### 4. Idempotent Event Execution

Each event has a unique ID. If webhook call is retried:

```typescript
// Webhook handler can check if already processed
await webhookClient.post(url, {
  message: `Hey, ${user.firstName} ${user.lastName} it's your birthday`,
  idempotencyKey: event.id,  // Webhook can dedupe
  eventId: event.id
});
```

---

## Monitoring & Observability

### Metrics to Track

```typescript
interface SchedulerMetrics {
  eventsProcessed: number;        // Successfully completed
  eventsFailed: number;           // Failed this run
  eventsLate: number;             // More than grace period late
  averageLatenessMinutes: number; // How late on average
  recoveryMode: boolean;          // True if processing old events
  durationMs: number;             // How long scheduler run took
}
```

### Logs for Recovery Analysis

```json
{
  "level": "warn",
  "message": "Late event execution (recovery)",
  "eventId": "event-123",
  "userId": "user-456",
  "targetTime": "2025-03-15T14:00:00Z",
  "actualTime": "2025-03-16T09:00:05Z",
  "latenessMinutes": 1140,
  "latenessHours": "19.0",
  "reason": "Recovery from downtime"
}
```

### Alerting Thresholds

```typescript
// Alert if many events are late (indicates recovery)
if (lateEventsCount > 10) {
  alerting.send('Recovery mode detected', {
    lateEvents: lateEventsCount,
    oldestEventAge: oldestEvent.latenessMinutes
  });
}

// Alert if scheduler hasn't run in a while (down?)
if (lastSchedulerRun > 5 * 60 * 1000) { // 5 minutes
  alerting.send('Scheduler appears to be down', {
    lastRun: lastSchedulerRun,
    minutesSinceLastRun: (Date.now() - lastSchedulerRun) / 60000
  });
}
```

### Database Queries for Analysis

```sql
-- Find all events that were late
SELECT
  id,
  user_id,
  target_timestamp_utc,
  executed_at,
  EXTRACT(EPOCH FROM (executed_at - target_timestamp_utc)) / 60 AS lateness_minutes
FROM events
WHERE status = 'COMPLETED'
  AND executed_at > target_timestamp_utc + INTERVAL '5 minutes'
ORDER BY lateness_minutes DESC
LIMIT 100;

-- Find events still pending after grace period (stuck?)
SELECT
  id,
  user_id,
  target_timestamp_utc,
  status,
  attempts,
  last_error,
  EXTRACT(EPOCH FROM (NOW() - target_timestamp_utc)) / 60 AS age_minutes
FROM events
WHERE status IN ('PENDING', 'FAILED')
  AND target_timestamp_utc < NOW() - INTERVAL '1 hour'
ORDER BY age_minutes DESC;
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('schedulerJob recovery', () => {
  test('processes events missed during downtime', async () => {
    // Setup: Create events in the past
    const event1 = await createEvent({ targetTimestampUTC: hourAgo() });
    const event2 = await createEvent({ targetTimestampUTC: twoHoursAgo() });

    // Act: Run scheduler
    const result = await schedulerJob();

    // Assert: Both events processed
    expect(result.processed).toBe(2);
    expect(await getEventStatus(event1.id)).toBe('COMPLETED');
    expect(await getEventStatus(event2.id)).toBe('COMPLETED');
  });

  test('does not reprocess completed events', async () => {
    // Setup: Event already completed
    const event = await createEvent({
      targetTimestampUTC: hourAgo(),
      status: 'COMPLETED'
    });

    // Act: Run scheduler
    const result = await schedulerJob();

    // Assert: Event not processed again
    expect(result.processed).toBe(0);
  });
});
```

### Integration Tests

```typescript
describe('Recovery integration', () => {
  test('recovers from 24-hour downtime', async () => {
    // Setup: Create 100 events spread over 24 hours
    const events = [];
    for (let i = 0; i < 100; i++) {
      const hoursAgo = Math.floor(Math.random() * 24);
      events.push(await createEvent({
        targetTimestampUTC: subHours(new Date(), hoursAgo)
      }));
    }

    // Act: Run scheduler (simulating recovery)
    const result = await schedulerJob();

    // Assert: All events processed
    expect(result.processed).toBe(100);

    for (const event of events) {
      const status = await getEventStatus(event.id);
      expect(status).toBe('COMPLETED');
    }
  });
});
```

---

## Summary

### How Recovery Works

1. ✅ **Events persist** - Stored in database as PENDING until completed
2. ✅ **Query finds all** - `WHERE target_timestamp_utc <= NOW()` catches everything
3. ✅ **Automatic on startup** - Scheduler runs query immediately
4. ✅ **No special mode** - Same code handles normal operation and recovery
5. ✅ **Exactly-once guaranteed** - Database locks prevent duplicates

### Key Benefits

- **Zero manual intervention** - Just restart the scheduler
- **Works for any downtime** - 5 minutes or 5 days, same mechanism
- **Complete audit trail** - Can analyze which events were late and why
- **Maintains guarantees** - Exactly-once delivery preserved during recovery
- **Simple implementation** - No complex recovery logic needed

### Related Documents

- [Architecture Design - Layer 5: Recovery & Monitoring](../architecture-design.md#layer-5-recovery--monitoring)
- [Event Triggering Mechanism](../tech-choices/event-triggering-mechanism.md)
- [Database Selection - FOR UPDATE SKIP LOCKED](../tech-choices/database-selection.md)
- [Challenges - Failure Recovery](../challenges.md#3-failure-recovery--resilience)

---

**Requirement Status:** ✅ Solution Designed & Documented

**Implementation Status:** 🚧 Phase 1 MVP (Week 3)

**Last Updated:** 2025-10-18
