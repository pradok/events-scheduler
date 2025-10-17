# Event Triggering Mechanism Selection

This document analyzes different approaches for triggering time-based events and explains the rationale behind choosing the polling/cron approach.

---

## Table of Contents

1. [The Core Question](#the-core-question)
2. [Option 1: Polling/Cron (Recommended)](#option-1-pollingcron-recommended)
3. [Option 2: AWS EventBridge Scheduled Events](#option-2-aws-eventbridge-scheduled-events)
4. [Efficiency Analysis](#efficiency-analysis)
5. [Implementation Options](#implementation-options)
6. [Decision: Polling Pattern](#decision-polling-pattern)

---

## The Core Question

**How do we trigger birthday message events at exactly 9:00 AM local time?**

Our system needs to:

- Monitor the database for events that are "ready to execute"
- Execute the event action (send birthday message)
- Ensure exactly-once delivery (no duplicates)
- Handle failures gracefully (retry, recovery)

Two main approaches exist:

1. **Polling/cron pattern** - Query database periodically
2. **External scheduler** - AWS EventBridge per-event rules

---

## Option 1: Polling/Cron (Recommended)

### How It Works

A scheduler process runs periodically (e.g., every 60 seconds) and queries the database for events ready to execute:

```typescript
// Scheduler runs every 1 minute
async function schedulerJob() {
  // 1. Query database for events ready NOW
  const events = await db.query(`
    SELECT * FROM events
    WHERE target_timestamp_utc <= NOW()
      AND status = 'PENDING'
    FOR UPDATE SKIP LOCKED  -- 🔒 Lock them atomically!
    LIMIT 100
  `);

  if (events.length === 0) {
    console.log('No events ready');
    return;
  }

  // 2. Update status to PROCESSING (prevents other instances from grabbing)
  await db.query(`
    UPDATE events
    SET status = 'PROCESSING',
        version = version + 1,
        updated_at = NOW()
    WHERE id = ANY($1)
  `, [events.map(e => e.id)]);

  // 3. Process each event
  for (const event of events) {
    try {
      await sendBirthdayMessage(event);

      // 4. Mark as COMPLETED
      await db.query(`
        UPDATE events
        SET status = 'COMPLETED',
            executed_at = NOW()
        WHERE id = $1
      `, [event.id]);

      // 5. Generate next year's event
      await generateNextYearEvent(event.userId);

    } catch (error) {
      // 6. Mark as FAILED (will be retried later)
      await db.query(`
        UPDATE events
        SET status = 'FAILED',
            attempts = attempts + 1,
            last_error = $2
        WHERE id = $1
      `, [event.id, error.message]);
    }
  }
}

// Run every 60 seconds
setInterval(schedulerJob, 60_000);
```

### Architecture Diagram

```
Time: 8:59:00 AM
┌─────────────────────────────────────────────────┐
│  PostgreSQL Database                            │
│  Event A: target=9:00 AM, status=PENDING        │
│  Event B: target=9:00 AM, status=PENDING        │
│  Event C: target=10:00 AM, status=PENDING       │
└─────────────────────────────────────────────────┘

Time: 9:00:30 AM - Scheduler wakes up
┌─────────────────────────────────────────────────┐
│  Scheduler #1 runs query:                       │
│  SELECT * FROM events                           │
│  WHERE target_timestamp_utc <= NOW()            │
│    AND status = 'PENDING'                       │
│  FOR UPDATE SKIP LOCKED                         │
│  LIMIT 100;                                     │
│                                                  │
│  Results: [Event A, Event B]                    │
│  (Event C skipped - not ready yet)              │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│  Atomic UPDATE in same transaction:             │
│  Event A: status → PROCESSING 🔒               │
│  Event B: status → PROCESSING 🔒               │
│  Event C: unchanged (still PENDING)             │
└─────────────────────────────────────────────────┘

Meanwhile: Scheduler #2 also wakes up
┌─────────────────────────────────────────────────┐
│  Scheduler #2 runs same query:                  │
│  SELECT * FROM events ... FOR UPDATE SKIP LOCKED│
│                                                  │
│  Sees Event A → LOCKED by Scheduler #1 → SKIP  │
│  Sees Event B → LOCKED by Scheduler #1 → SKIP  │
│  Sees Event C → Not ready yet                   │
│                                                  │
│  Results: [] (no events to process)             │
└─────────────────────────────────────────────────┘

Scheduler #1 continues processing
┌─────────────────────────────────────────────────┐
│  Process Event A:                               │
│  - Send birthday message ✅                    │
│  - Update: status → COMPLETED, executed_at=now  │
│                                                  │
│  Process Event B:                               │
│  - Send birthday message ✅                    │
│  - Update: status → COMPLETED, executed_at=now  │
└─────────────────────────────────────────────────┘

Time: 9:01:30 AM - Next scheduler run
┌─────────────────────────────────────────────────┐
│  Query: WHERE target_timestamp_utc <= NOW()     │
│         AND status = 'PENDING'                  │
│                                                  │
│  Results: [] (A & B are COMPLETED)              │
│  Event C still not ready (target=10:00 AM)      │
└─────────────────────────────────────────────────┘

✅ Precise timing (within 1 minute)
✅ No race conditions (FOR UPDATE SKIP LOCKED)
✅ Complete audit trail (all state changes logged)
✅ Automatic recovery (failed events stay PENDING)
```

### Why This Works Well

#### 1. Precise Timing ✅

Scheduler runs every 60 seconds. If event target is 9:00:00 AM:

- Scheduler at 9:00:30 AM finds it (30 seconds late)
- Scheduler at 9:01:30 AM would have found it (90 seconds late)
- Maximum delay: 1 minute

**For birthday messages:** User won't notice if message arrives at 9:00:37 AM vs 9:00:00 AM.

#### 2. Controlled Execution ✅

`FOR UPDATE SKIP LOCKED` (PostgreSQL) provides atomic claiming:

- Query and lock in a single operation
- Other scheduler instances skip locked rows
- Zero chance of duplicate processing

**No need for:**

- Distributed locking mechanisms
- Separate idempotency tables
- Complex coordination logic

#### 3. Built-in Failure Recovery ✅

If processing fails:

- Event stays in database with status=PENDING or FAILED
- Next scheduler run picks it up
- Can retry with exponential backoff
- Event is never lost

```typescript
// Retry logic is simple
const events = await findEventsWithRetries();

for (const event of events) {
  if (event.attempts < MAX_RETRIES) {
    await retryEvent(event);
  } else {
    await moveToDeadLetterQueue(event);
  }
}
```

#### 4. Complete Audit Trail ✅

Every state change is recorded:

```sql
SELECT * FROM events WHERE id = 'event-123';

-- Result:
id: event-123
status: COMPLETED
created_at: 2025-03-01 10:00:00
target_timestamp_utc: 2025-03-15 14:00:00
executed_at: 2025-03-15 14:00:27  -- Executed 27 seconds after target
attempts: 1
last_error: null
```

**Can answer questions like:**

- When was this event created?
- When was it supposed to execute?
- When did it actually execute?
- How many attempts were made?
- Did it fail? What was the error?

#### 5. Industry Standard Pattern ✅

This polling pattern is used by:

- **Airflow** - Workflow scheduler polls for DAGs ready to run
- **Kubernetes CronJobs** - Control plane polls for jobs ready to start
- **Quartz Scheduler (Java)** - Polls database every few seconds
- **Sidekiq (Ruby)** - Polls Redis for jobs ready to execute
- **Celery (Python)** - Beat scheduler polls for periodic tasks

**Why?** Simple, reliable, predictable, and easy to reason about.

---

## Option 2: AWS EventBridge Scheduled Events

### How It Works

Create a scheduled rule in AWS EventBridge for each event:

```typescript
// For each user, create a scheduled EventBridge rule
await eventBridge.putRule({
  Name: `birthday-user-${userId}`,
  ScheduleExpression: 'cron(0 9 15 3 ? 2025)', // 9 AM on March 15, 2025 UTC
  State: 'ENABLED',
  Description: `Birthday event for user ${userId}`
});

await eventBridge.putTargets({
  Rule: `birthday-user-${userId}`,
  Targets: [{
    Arn: lambdaArn,
    Input: JSON.stringify({
      userId: userId,
      eventType: 'BIRTHDAY',
      year: 2025
    })
  }]
});

// EventBridge automatically invokes Lambda at scheduled time
```

### Architecture Diagram

```
User A created (birthday: March 15, timezone: America/New_York)
                    ↓
┌─────────────────────────────────────────────────┐
│  Calculate: 9 AM America/New_York = 14:00 UTC  │
│  Create EventBridge Rule:                       │
│  cron(0 14 15 3 ? 2025)                        │
└─────────────────────────────────────────────────┘

User B created (birthday: March 15, timezone: Asia/Tokyo)
                    ↓
┌─────────────────────────────────────────────────┐
│  Calculate: 9 AM Asia/Tokyo = 00:00 UTC        │
│  Create EventBridge Rule:                       │
│  cron(0 0 15 3 ? 2025)                         │
└─────────────────────────────────────────────────┘

User C created (birthday: March 15, timezone: Europe/London)
                    ↓
┌─────────────────────────────────────────────────┐
│  Calculate: 9 AM Europe/London = 09:00 UTC     │
│  Create EventBridge Rule:                       │
│  cron(0 9 15 3 ? 2025)                         │
└─────────────────────────────────────────────────┘

Result: 1000 users = 1000 EventBridge rules
```

### Problems with EventBridge Per-Event Rules

#### 1. Not Timezone-Aware ❌

EventBridge cron expressions are in UTC:

- Must manually convert "9 AM America/New_York" → UTC
- Must recalculate every year (DST changes)
- Must update rule if user changes timezone

```typescript
// User updates timezone from New_York to Tokyo
// Must:
1. Delete old EventBridge rule
2. Calculate new UTC time
3. Create new EventBridge rule
4. Handle race condition if update happens near execution time
```

#### 2. One Rule Per Event ❌

Scale issues:

- 1,000 users = 1,000 EventBridge rules
- 10,000 users = 10,000 rules
- Must manage lifecycle of thousands of rules

**EventBridge limits:**

- Default: 300 rules per account
- Can request increase, but adds operational complexity

#### 3. Hard to Cancel/Update ❌

When user updates birthday:

```typescript
// Must:
1. Find the old EventBridge rule (store rule name in database)
2. Delete old rule
3. Calculate new time
4. Create new rule
5. Update database with new rule name

// What if user updates during the execution window?
// Race conditions!
```

#### 4. Still Need Database for State ⚠️

Even with EventBridge, you still need database to:

- Track "was this message sent?" (exactly-once delivery)
- Store user data (for message content)
- Handle failures (retry logic)
- Audit trail (when was it sent?)

**So you have:**

- EventBridge rules (1000s of them)
- Database records (for state tracking)
- Dual management overhead

#### 5. Cost 💰

EventBridge pricing:

- Custom event bus: $1.00 per million events
- Rule evaluations: Free for scheduled rules
- Lambda invocations: $0.20 per million requests

**For 10,000 users:**

- 10,000 Lambda invocations per year
- Minimal cost (~$0.002)

**But:** Management overhead doesn't scale well.

### When EventBridge IS Useful

EventBridge scheduled rules are great for:

- ✅ Small number of schedules (< 100)
- ✅ Infrastructure tasks (daily backups, cleanup jobs)
- ✅ Static schedules (same time every day)

**NOT good for:**

- ❌ Per-user dynamic schedules (1000s of rules)
- ❌ Timezone-aware scheduling
- ❌ Frequent schedule changes

---

## Efficiency Analysis

### "Isn't querying every minute wasteful?"

Let's analyze the database load:

#### Query Executed Every 60 Seconds

```sql
SELECT * FROM events
WHERE target_timestamp_utc <= NOW()
  AND status = 'PENDING'
FOR UPDATE SKIP LOCKED
LIMIT 100;
```

#### With Proper Indexing

```sql
-- Partial index (only includes PENDING events)
CREATE INDEX idx_events_ready
ON events(target_timestamp_utc, status)
WHERE status = 'PENDING';
```

**Index characteristics:**

- B-tree index: O(log n) lookup
- Partial index: Only indexes PENDING events
- Result: Query scans minimal rows

#### Performance Metrics

**Database load per hour:**

```
60 queries × 5ms per query = 300ms of database time per hour
= 0.0083% of 1 hour
= Negligible
```

**Even with 1 million events in database:**

- Index scan is still O(log n)
- Only PENDING events indexed (maybe 1000 out of 1M)
- Query time: < 10ms

**Comparison:**

| Metric | Polling (1 min) | EventBridge Per-Event |
|--------|-----------------|----------------------|
| Database queries/hour | 60 | 0 (but 1000s of rules to manage) |
| Query time | 5-10ms | N/A |
| Management overhead | Low | High (CRUD on 1000s of rules) |
| Complexity | Low | Medium |
| Cost | Minimal | Low (but operational overhead) |

### Real-World Example

**System with 10,000 users:**

- Average: ~27 birthdays per day (10,000 / 365)
- Peak day (Sept 16 - most common birthday): ~40 birthdays

**Scheduler activity:**

```
Most queries return: 0 events (nothing ready)
Peak hour (9 AM across timezones): 3-5 events per query
Database load: Still negligible
```

---

## Implementation Options

### Option A: Long-Running Scheduler Process (Simple)

**Best for:** Phase 1 MVP, local development

```typescript
// src/scheduler/index.ts
import { schedulerJob } from './scheduler-job';

async function startScheduler() {
  console.log('Scheduler starting...');

  // Run immediately on startup (catch up on missed events)
  await schedulerJob();

  // Then run every 60 seconds
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

**Run locally:**

```bash
# Terminal 1: API server
npm run dev

# Terminal 2: Scheduler
npm run scheduler
```

**Pros:**

- ✅ Simple to understand and debug
- ✅ Works locally without AWS
- ✅ Low latency (always running)
- ✅ Catches up on missed events at startup

**Cons:**

- ⚠️ Single point of failure (no high availability)
- ⚠️ Must manually restart if crashes
- ⚠️ Requires always-on server

### Option B: Serverless Scheduled Lambda (Production)

**Best for:** Production deployment on AWS

```yaml
# AWS EventBridge Rule (via CloudFormation/CDK)
SchedulerRule:
  Type: AWS::Events::Rule
  Properties:
    ScheduleExpression: rate(1 minute)
    State: ENABLED
    Targets:
      - Arn: !GetAtt SchedulerLambda.Arn
        Id: SchedulerTarget

SchedulerLambda:
  Type: AWS::Lambda::Function
  Properties:
    FunctionName: birthday-scheduler
    Runtime: nodejs20.x
    Handler: index.handler
```

**Lambda handler:**

```typescript
import { schedulerJob } from './scheduler-job';

export async function handler(event: EventBridgeEvent) {
  console.log('Scheduler triggered by EventBridge');

  try {
    await schedulerJob(); // Same code as Option A!
    return { statusCode: 200, body: 'Success' };
  } catch (error) {
    console.error('Scheduler failed:', error);
    throw error; // Lambda will retry automatically
  }
}
```

**Pros:**

- ✅ Fully managed (no server to maintain)
- ✅ Auto-scaling (handles load spikes)
- ✅ Pay per invocation (cost-effective)
- ✅ Built-in retries (Lambda dead-letter queue)

**Cons:**

- ⚠️ Cold starts (1-2 second delay on first invocation)
- ⚠️ AWS Lambda limits (15-minute max execution time)
- ⚠️ Requires AWS infrastructure

**Cost for 10,000 users:**

```
60 Lambda invocations per hour × 24 hours × 30 days = 43,200 invocations/month
43,200 × $0.0000002 per invocation = $0.008 per month
≈ Free (within free tier: 1M requests/month)
```

### Option C: Hybrid Approach (Recommended)

**Best for:** Flexibility during development and production

Use the **same scheduler code** but different deployment:

```typescript
// src/scheduler/scheduler-job.ts
// This file is shared between both approaches!

export async function schedulerJob() {
  const events = await findAndClaimReadyEvents(100);

  for (const event of events) {
    await executeEvent(event);
  }

  return { processed: events.length };
}
```

**Phase 1 (Local dev):** Use Option A (long-running process)

```bash
npm run scheduler
```

**Phase 2+ (Production):** Deploy as Option B (Lambda)

```bash
npm run deploy:scheduler
```

**Code is identical - just different entry points!**

---

## Decision: Polling Pattern

### Chosen Approach

**Use polling/cron with 1-minute interval for Phase 1 MVP**

**Specific implementation:**

1. **Pattern**: Polling with PostgreSQL `FOR UPDATE SKIP LOCKED`
2. **Frequency**: Every 60 seconds
3. **Batch size**: Up to 100 events per run
4. **Deployment**: Long-running process (Phase 1), migrate to Lambda later (Phase 2+)

### Why This Decision?

#### 1. Simplicity ✅

- ~50 lines of code for entire scheduler
- No complex AWS infrastructure needed (Phase 1)
- Easy to understand and debug

#### 2. Reliability ✅

- Events never lost (stay in database until completed)
- Automatic recovery on restart
- Built-in retry mechanism

#### 3. Precision ✅

- 1-minute granularity is perfect for birthday messages
- User won't notice 30-second variation in delivery time

#### 4. Scalability ✅

- Database query takes < 10ms even with millions of events
- Can run multiple scheduler instances (with `FOR UPDATE SKIP LOCKED`)
- Horizontal scaling if needed

#### 5. Cost-Effective ✅

- No additional AWS services needed (Phase 1)
- Minimal database load (60 queries/hour)
- Can migrate to Lambda later if needed

### Trade-offs Accepted

| Trade-off | Impact | Mitigation |
|-----------|--------|-----------|
| **Polling overhead** | 60 queries/hour (negligible) | Use partial index for efficiency |
| **Not "truly" event-driven** | 1-minute delay vs instant | Acceptable for birthday use case |
| **Requires always-on process** | Must run 24/7 (Phase 1) | Migrate to Lambda in Phase 2+ |
| **Single instance = SPOF** | Downtime if process crashes | Add monitoring, use systemd/PM2 for auto-restart |

### When to Reconsider

Re-evaluate if:

- ❌ Need sub-second precision (real-time notifications)
- ❌ Processing millions of events per minute
- ❌ Requirement changes to "instant" triggering

**For Phase 1 (1000 users, birthday messages):** Polling is perfect.

---

## Comparison Summary

| Aspect | Polling/Cron | EventBridge Rules |
|--------|--------------|-------------------|
| **Timing precision** | 1 minute | 1 minute |
| **Complexity** | Low | Medium |
| **Race conditions** | Handled by `FOR UPDATE SKIP LOCKED` | Must handle manually |
| **Failure recovery** | Automatic (events stay in DB) | Need separate tracking |
| **Audit trail** | Complete (all state in DB) | Need separate tracking |
| **Scalability** | Excellent (horizontal with multiple instances) | Poor (1000s of rules to manage) |
| **Cost** | Low (just DB queries) | Low (but high operational overhead) |
| **Setup complexity** | Low | Medium |
| **Phase 1 ready?** | ✅ Yes | ⚠️ Possible but not ideal |

---

## References

### Industry Examples of Polling Pattern

- **Kubernetes CronJobs**: Control plane polls for jobs ready to run
- **Apache Airflow**: Scheduler polls database every heartbeat interval
- **Quartz Scheduler (Java)**: Job store polling with lock acquisition
- **Sidekiq (Ruby)**: Redis polling for scheduled jobs
- **Celery (Python)**: Beat scheduler polls for periodic tasks

### AWS Documentation

- [EventBridge Scheduled Rules](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-create-rule-schedule.html)
- [Lambda Concurrency](https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html)

---

**Decision Date:** 2025-10-18

**Status:** ✅ Approved for Phase 1 Implementation

**Next Review:** After Phase 1 MVP completion, evaluate Lambda deployment for Phase 2
