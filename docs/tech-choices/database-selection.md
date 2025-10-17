# Database Technology Selection

This document analyzes database options for the time-based event scheduling system and explains the rationale behind choosing PostgreSQL for Phase 1.

---

## Table of Contents

1. [Requirements Analysis](#requirements-analysis)
2. [Database Access Patterns](#database-access-patterns)
3. [PostgreSQL vs DynamoDB](#postgresql-vs-dynamodb)
4. [Decision: PostgreSQL](#decision-postgresql)
5. [Schema Design](#schema-design)
6. [ORM/Query Builder Options](#ormquery-builder-options)

---

## Requirements Analysis

### Critical Requirements from Architecture

Based on [architecture-design.md](../architecture-design.md), our database must support:

1. **Atomic State Transitions**
   - Event status: PENDING → PROCESSING → COMPLETED/FAILED
   - Prevents race conditions when multiple scheduler instances run

2. **Optimistic Locking**
   - Version-based concurrency control
   - Essential for exactly-once delivery guarantee

3. **Efficient Time-Based Queries**
   - Find events where `targetTimestampUTC <= NOW()` and `status = 'PENDING'`
   - Must be fast even with thousands of events

4. **ACID Transactions**
   - Atomic event generation when user is created
   - Transactional status updates

5. **LocalStack Compatibility**
   - For local development and testing

6. **Relational Data Model**
   - User entity (1) → Birthday Events (N)
   - Clear foreign key relationships

---

## Database Access Patterns

### Pattern 1: "Grab N Items and Lock Them"

This is the **scheduler's core operation** - the most critical pattern in our system.

#### What the Scheduler Needs to Do:

```typescript
// Every 1 minute, the scheduler runs:
async function schedulerRun() {
  // 1. Find up to 100 events ready to execute
  // 2. Mark them as "PROCESSING" so other schedulers don't touch them
  // 3. Return those events for processing
  const events = await eventRepository.findAndClaimReadyEvents(100);

  // 4. Process each event (send birthday messages)
  for (const event of events) {
    await executeEvent(event);
  }
}
```

#### The Challenge: Multiple Scheduler Instances

For high availability, we run **multiple scheduler instances** simultaneously:

```
Time: 9:00:00 AM UTC

Database has these events ready:
- Event A (status: PENDING, ready to execute)
- Event B (status: PENDING, ready to execute)
- Event C (status: PENDING, ready to execute)
- Event D (status: PENDING, ready to execute)

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Scheduler #1   │    │  Scheduler #2   │    │  Scheduler #3   │
│  (Server 1)     │    │  (Server 2)     │    │  (Server 3)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                       │                       │
        │ All wake up at same time!                    │
        ▼                       ▼                       ▼
   Find ready events      Find ready events      Find ready events
```

**WITHOUT proper locking:**
```
❌ BAD SCENARIO:

Scheduler #1 finds: [Event A, Event B, Event C, Event D]
Scheduler #2 finds: [Event A, Event B, Event C, Event D]  // Same events!
Scheduler #3 finds: [Event A, Event B, Event C, Event D]  // Same events!

All three schedulers process Event A
Result: User gets 3 birthday messages! 😱
```

**WITH proper locking:**
```
✅ GOOD SCENARIO:

Scheduler #1 claims and locks: [Event A, Event B]
Scheduler #2 claims and locks: [Event C]
Scheduler #3 claims and locks: [Event D]

Result: Each event processed exactly once ✅
```

#### How PostgreSQL Handles This:

PostgreSQL has a **built-in feature** specifically for this pattern:

```sql
-- This is ATOMIC - happens in one database operation
BEGIN TRANSACTION;

SELECT * FROM events
WHERE target_timestamp_utc <= NOW()
  AND status = 'PENDING'
FOR UPDATE SKIP LOCKED  -- ⭐ The magic keyword
LIMIT 100;

-- At this point:
-- - These 100 rows are LOCKED to this transaction only
-- - Other schedulers running the same query will SKIP these rows
-- - No race conditions possible

UPDATE events
SET status = 'PROCESSING', version = version + 1
WHERE id IN (...);

COMMIT;
```

**What `FOR UPDATE SKIP LOCKED` does:**

```
Database state at 9:00:00 AM:
┌────────┬─────────┬──────────────────────┐
│ Event  │ Status  │ Locked By            │
├────────┼─────────┼──────────────────────┤
│ A      │ PENDING │ (none)               │
│ B      │ PENDING │ (none)               │
│ C      │ PENDING │ (none)               │
│ D      │ PENDING │ (none)               │
└────────┴─────────┴──────────────────────┘

Step 1: Scheduler #1 executes SELECT ... FOR UPDATE SKIP LOCKED
┌────────┬─────────┬──────────────────────┐
│ Event  │ Status  │ Locked By            │
├────────┼─────────┼──────────────────────┤
│ A      │ PENDING │ 🔒 Scheduler #1      │
│ B      │ PENDING │ 🔒 Scheduler #1      │
│ C      │ PENDING │ (none)               │
│ D      │ PENDING │ (none)               │
└────────┴─────────┴──────────────────────┘

Step 2: Scheduler #2 runs same query (while #1 is still processing)
- Sees Event A → LOCKED by #1 → SKIP IT
- Sees Event B → LOCKED by #1 → SKIP IT
- Sees Event C → Available → GRAB IT
- Sees Event D → Available → GRAB IT

┌────────┬─────────┬──────────────────────┐
│ Event  │ Status  │ Locked By            │
├────────┼─────────┼──────────────────────┤
│ A      │ PENDING │ 🔒 Scheduler #1      │
│ B      │ PENDING │ 🔒 Scheduler #1      │
│ C      │ PENDING │ 🔒 Scheduler #2      │
│ D      │ PENDING │ 🔒 Scheduler #2      │
└────────┴─────────┴──────────────────────┘

Result: NO DUPLICATES! Each scheduler gets different events ✅
```

#### How DynamoDB Handles This:

DynamoDB does **NOT** have row-level locking like PostgreSQL. Instead, you must implement the pattern manually:

```typescript
// Step 1: Query to find ready events (this is just a read, NO locking)
const result = await dynamodb.query({
  IndexName: 'status-timestamp-index',
  KeyConditionExpression: 'status = :pending AND targetTimestampUTC <= :now',
  ExpressionAttributeValues: {
    ':pending': 'PENDING',
    ':now': new Date().toISOString()
  },
  Limit: 100
}).promise();
// ⚠️ Problem: Multiple schedulers can all read the same 100 events!

// Step 2: Try to claim each event one-by-one using optimistic locking
const claimed: BirthdayEvent[] = [];

for (const event of result.Items || []) {
  try {
    // This is a SEPARATE database operation for EACH event
    await dynamodb.update({
      TableName: 'Events',
      Key: { id: event.id },
      UpdateExpression: 'SET #status = :processing, #version = #version + :inc',
      ConditionExpression: '#version = :expected',  // Optimistic locking
      ExpressionAttributeNames: { '#status': 'status', '#version': 'version' },
      ExpressionAttributeValues: {
        ':processing': 'PROCESSING',
        ':expected': event.version,
        ':inc': 1
      }
    }).promise();

    // Success! This scheduler claimed this event
    claimed.push(event);
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      // Another scheduler already claimed this event - skip it
      continue;
    }
    throw error;
  }
}

// Step 3: Process the events we successfully claimed
await processEvents(claimed);
```

**Visualizing DynamoDB's approach:**

```
Scheduler #1:
  1. Query: "Give me 100 PENDING events" → [A, B, C, D, ...]
  2. Try to claim A: ✅ Success (update version 0 → 1)
  3. Try to claim B: ✅ Success (update version 0 → 1)
  4. Try to claim C: ❌ Failed! (Scheduler #2 beat us to it)
  5. Try to claim D: ✅ Success (update version 0 → 1)
  ...
  Result: Claimed [A, B, D]

Scheduler #2 (running at exact same time):
  1. Query: "Give me 100 PENDING events" → [A, B, C, D, ...]  // Same list!
  2. Try to claim A: ❌ Failed! (Scheduler #1 already got it)
  3. Try to claim B: ❌ Failed! (Scheduler #1 already got it)
  4. Try to claim C: ✅ Success (got it before Scheduler #1 tried)
  5. Try to claim D: ❌ Failed! (Scheduler #1 already got it)
  ...
  Result: Claimed [C]

Final result: ✅ No duplicates, but required 200+ database operations!
```

**Problems with DynamoDB approach:**
1. **N+1 queries**: 1 query + N conditional updates = 101 round-trips for 100 events
2. **No atomic claim**: Can't lock during the query like PostgreSQL
3. **Application complexity**: Must handle `ConditionalCheckFailedException` in code
4. **Wasted work**: Many failed claim attempts (schedulers compete for same events)

---

### Pattern 2: "Single-Item Transactions"

This is where DynamoDB excels:

```typescript
// Update a single user's birthday
await dynamodb.updateItem({
  TableName: 'Users',
  Key: { id: 'user-123' },
  UpdateExpression: 'SET dateOfBirth = :newDate',
  ConditionExpression: 'version = :expectedVersion',  // Optimistic locking
  ExpressionAttributeValues: {
    ':newDate': '1990-05-15',
    ':expectedVersion': 5
  }
});

// ✅ This is fast and efficient in DynamoDB
```

**Both PostgreSQL and DynamoDB handle this pattern well.**

---

## PostgreSQL vs DynamoDB

### Comparison Table

| Feature | PostgreSQL | DynamoDB |
|---------|-----------|----------|
| **"Grab N items and lock them"** | ✅ Native support via `FOR UPDATE SKIP LOCKED` | ❌ Manual implementation with loops + optimistic locking |
| **Atomic claim operation** | ✅ One query | ❌ N+1 queries (1 read + N writes) |
| **Race condition handling** | ✅ Database-level row locking | ⚠️ Application-level retry logic |
| **ACID Transactions** | ✅ Full ACID, no limits | ⚠️ ACID but limited to 100 items, 4MB total |
| **Relational data model** | ✅ Native foreign keys, joins | ❌ Must denormalize or use multiple queries |
| **Time-based queries** | ✅ Efficient with indexes | ⚠️ Requires Global Secondary Index (GSI) |
| **Local development** | ✅ Simple Docker container | ⚠️ Requires LocalStack |
| **Cost (development)** | ✅ Free (self-hosted) | ⚠️ LocalStack free, but AWS charges 2x for transactions |
| **Optimistic locking** | ✅ Built-in (version column in WHERE clause) | ✅ Built-in (ConditionExpression) |
| **Horizontal scaling** | ⚠️ Requires replication setup | ✅ Automatic (serverless) |
| **Single-item operations** | ✅ Fully supported | ✅ Optimized for this |
| **Developer experience** | ✅ Familiar SQL, great TypeScript ORMs | ⚠️ Verbose API, steeper learning curve |

---

### Code Comparison: Scheduler Repository

#### PostgreSQL Implementation

```typescript
class PostgresEventRepository implements EventRepository {
  async findAndClaimReadyEvents(limit: number): Promise<BirthdayEvent[]> {
    return this.db.transaction(async (tx) => {
      // Single atomic operation - query and lock in one go
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
}

// ✅ ~20 lines of code
// ✅ Bulletproof - impossible to have duplicates
// ✅ One database round-trip
// ✅ Simple to understand and maintain
```

#### DynamoDB Implementation

```typescript
class DynamoDBEventRepository implements EventRepository {
  async findAndClaimReadyEvents(limit: number): Promise<BirthdayEvent[]> {
    // Step 1: Query for candidate events
    const queryResult = await this.client.query({
      IndexName: 'status-timestamp-index',
      KeyConditionExpression: 'status = :pending AND targetTimestampUTC <= :now',
      ExpressionAttributeValues: {
        ':pending': { S: 'PENDING' },
        ':now': { S: new Date().toISOString() }
      },
      Limit: limit
    }).promise();

    if (!queryResult.Items || queryResult.Items.length === 0) {
      return [];
    }

    // Step 2: Try to claim each event with optimistic locking
    const claimPromises = queryResult.Items.map(async (item) => {
      try {
        const result = await this.client.update({
          TableName: 'Events',
          Key: { id: { S: item.id.S } },
          UpdateExpression: 'SET #status = :processing, #version = #version + :inc, updatedAt = :now',
          ConditionExpression: '#version = :expected',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#version': 'version'
          },
          ExpressionAttributeValues: {
            ':processing': { S: 'PROCESSING' },
            ':expected': { N: item.version.N },
            ':inc': { N: '1' },
            ':now': { S: new Date().toISOString() }
          },
          ReturnValues: 'ALL_NEW'
        }).promise();

        return this.mapToEntity(result.Attributes);
      } catch (error) {
        if (error.code === 'ConditionalCheckFailedException') {
          // Another scheduler claimed this event - skip it
          return null;
        }
        // Rethrow unexpected errors
        throw error;
      }
    });

    // Step 3: Wait for all claim attempts and filter successes
    const results = await Promise.all(claimPromises);
    return results.filter(result => result !== null) as BirthdayEvent[];
  }
}

// ❌ ~60 lines of code
// ⚠️ More complex error handling
// ❌ 1 + N database round-trips (N = number of events)
// ⚠️ Harder to reason about race conditions
```

---

### DynamoDB Transaction Support

**Yes, DynamoDB supports ACID transactions**, but with important limitations:

#### What DynamoDB Transactions Provide:

```typescript
// TransactWriteItems - atomic operation across multiple items
await dynamodb.transactWriteItems({
  TransactItems: [
    {
      Update: {
        TableName: 'Events',
        Key: { id: 'event-123' },
        UpdateExpression: 'SET #status = :completed',
        ConditionExpression: '#version = :expected'
      }
    },
    {
      Put: {
        TableName: 'AuditLog',
        Item: {
          id: 'log-456',
          eventId: 'event-123',
          action: 'COMPLETED',
          timestamp: new Date().toISOString()
        }
      }
    }
  ]
}).promise();

// ✅ Both operations succeed or both fail (ACID)
```

#### DynamoDB Transaction Limitations:

1. **100 item limit** - Can only include up to 100 items per transaction
2. **4 MB total size limit** - All items combined cannot exceed 4MB
3. **2x cost** - Transactions consume twice the read/write capacity units
4. **No row-level locking** - Can't lock items during a query (no `FOR UPDATE`)
5. **Single-region** - Transactions don't work across regions

**For our scheduler pattern**: DynamoDB transactions don't solve the "grab N items and lock them" problem because:
- The initial query (find ready events) is **not part of the transaction**
- Multiple schedulers can read the same events before any transaction starts
- Must still use the loop + conditional update approach

---

## Decision: PostgreSQL

**Recommendation: Use PostgreSQL for Phase 1 MVP**

### Why PostgreSQL Wins for This Project:

#### 1. Perfect Fit for Scheduler Pattern
- `FOR UPDATE SKIP LOCKED` is exactly what we need
- No race conditions, guaranteed exactly-once delivery
- Simple, maintainable code

#### 2. Relational Model Matches Our Domain
```
User (1) ───── (N) BirthdayEvent
```
- Natural foreign key relationship
- Easy joins if needed (future reporting)
- Referential integrity enforced by database

#### 3. Simpler Development Experience
- Familiar SQL syntax
- Excellent TypeScript ORMs (Prisma, Drizzle, TypeORM)
- Better debugging tools (pgAdmin, psql)
- More Stack Overflow answers

#### 4. Easier Local Development
```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: bday
      POSTGRES_USER: bday_user
      POSTGRES_PASSWORD: dev_password
    ports:
      - "5432:5432"
```
- No LocalStack needed
- Just `docker-compose up` and you're running
- Identical to production PostgreSQL

#### 5. Better for Phase 1 Requirements
- ✅ 1000 users: PostgreSQL handles this trivially
- ✅ 100+ events per minute: PostgreSQL can do 10,000+ writes/sec
- ✅ API response < 200ms: Simple indexed queries are sub-10ms
- ✅ Timezone support: Native `TIMESTAMP WITH TIME ZONE` type

#### 6. Cost-Effective
- Free for development (self-hosted Docker)
- Managed PostgreSQL (AWS RDS, Render, etc.) is cheaper than DynamoDB at Phase 1 scale
- No 2x transaction costs

#### 7. Future-Proof
- If you outgrow PostgreSQL, you'll know (millions of events/sec)
- Easy to add read replicas for scaling reads
- Can migrate to DynamoDB later if needed (repository pattern abstracts DB)

### When to Consider DynamoDB:

**Consider DynamoDB for Phase 2+ if:**
- ❌ You need to process **millions of events per minute**
- ❌ You require **global multi-region active-active** setup
- ❌ You're committed to **AWS serverless** architecture (Lambda + DynamoDB)
- ❌ You have **budget for 2x transaction costs**
- ❌ Your access patterns change to **primarily key-value lookups**

**For Phase 1 (1000 users, 100 events/min):** PostgreSQL is the clear winner.

---

## Schema Design

### PostgreSQL Schema (Phase 1)

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name VARCHAR(255) NOT NULL CHECK (first_name <> ''),
  last_name VARCHAR(255) NOT NULL CHECK (last_name <> ''),
  date_of_birth DATE NOT NULL CHECK (date_of_birth < CURRENT_DATE),
  timezone VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Birthday events table
CREATE TABLE birthday_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL DEFAULT 'BIRTHDAY',
  target_year INTEGER NOT NULL,
  target_date DATE NOT NULL,
  target_time TIME NOT NULL DEFAULT '09:00:00',
  timezone VARCHAR(100) NOT NULL,
  target_timestamp_utc TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  executed_at TIMESTAMP WITH TIME ZONE,
  attempts INTEGER DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  version INTEGER DEFAULT 0 CHECK (version >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Prevent duplicate events for same user/year
  UNIQUE (user_id, target_year, event_type)
);

-- ⭐ Critical index for scheduler query
-- Partial index only on PENDING events for efficiency
CREATE INDEX idx_events_ready ON birthday_events(target_timestamp_utc, status)
WHERE status = 'PENDING';

-- Index for user lookups (find all events for a user)
CREATE INDEX idx_events_user ON birthday_events(user_id);

-- Index for event type (extensibility for Phase 2+)
CREATE INDEX idx_events_type ON birthday_events(event_type);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at on users
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger to auto-update updated_at on events
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON birthday_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### Key Schema Features:

1. **Foreign Key Cascade**: `ON DELETE CASCADE` automatically cleans up events when user is deleted
2. **Check Constraints**: Enforce business rules at database level
3. **Partial Index**: `WHERE status = 'PENDING'` makes scheduler query extremely fast
4. **Composite Unique Constraint**: Prevents duplicate events for same user/year
5. **Timezone Support**: `TIMESTAMP WITH TIME ZONE` for proper timezone handling
6. **Auto-Timestamps**: Triggers keep `updated_at` in sync

---

## ORM/Query Builder Options

Two excellent TypeScript options for PostgreSQL:

### Option 1: Prisma (Recommended)

**Best for:** Developer experience, rapid prototyping, type safety

```typescript
// schema.prisma
model User {
  id          String   @id @default(uuid())
  firstName   String   @map("first_name")
  lastName    String   @map("last_name")
  dateOfBirth DateTime @map("date_of_birth") @db.Date
  timezone    String
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  events BirthdayEvent[]

  @@map("users")
}

model BirthdayEvent {
  id                 String    @id @default(uuid())
  userId             String    @map("user_id")
  eventType          String    @default("BIRTHDAY") @map("event_type")
  targetYear         Int       @map("target_year")
  targetTimestampUtc DateTime  @map("target_timestamp_utc")
  status             String    @default("PENDING")
  version            Int       @default(0)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, targetYear, eventType])
  @@index([targetTimestampUtc, status], name: "idx_events_ready")
  @@map("birthday_events")
}

// Usage in code
const events = await prisma.$queryRaw<BirthdayEvent[]>`
  UPDATE birthday_events
  SET status = 'PROCESSING', version = version + 1
  WHERE id IN (
    SELECT id FROM birthday_events
    WHERE target_timestamp_utc <= NOW() AND status = 'PENDING'
    FOR UPDATE SKIP LOCKED
    LIMIT ${limit}
  )
  RETURNING *
`;
```

**Pros:**
- ✅ Best-in-class type safety
- ✅ Auto-generated TypeScript types
- ✅ Great migration system
- ✅ Excellent documentation

**Cons:**
- ❌ Adds query engine overhead (small performance cost)
- ❌ Can't customize all SQL features (must use raw SQL for complex queries)

### Option 2: TypeORM

**Best for:** Java/Spring developers, enterprise patterns

```typescript
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ type: 'date', name: 'date_of_birth' })
  dateOfBirth: Date;

  @OneToMany(() => BirthdayEvent, event => event.user)
  events: BirthdayEvent[];
}

@Entity('birthday_events')
export class BirthdayEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, user => user.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  status: string;

  @Column({ name: 'target_timestamp_utc' })
  targetTimestampUtc: Date;

  @VersionColumn()
  version: number;
}

// Usage
const events = await manager.query(`
  UPDATE birthday_events
  SET status = 'PROCESSING', version = version + 1
  WHERE id IN (
    SELECT id FROM birthday_events
    WHERE target_timestamp_utc <= NOW() AND status = 'PENDING'
    FOR UPDATE SKIP LOCKED
    LIMIT $1
  )
  RETURNING *
`, [limit]);
```

**Pros:**

- ✅ Mature, battle-tested
- ✅ Active Record or Data Mapper patterns
- ✅ Great for Java/C# developers

**Cons:**

- ❌ Heavier than Prisma
- ❌ Decorator syntax not everyone's preference
- ❌ TypeScript support not as good as Prisma

### Recommendation: **Prisma for Phase 1**

**Why Prisma:**
- Best developer experience for rapid Phase 1 development
- Migrations are straightforward
- Type safety catches bugs early
- Large community and excellent docs
- Can always add raw SQL for `FOR UPDATE SKIP LOCKED` queries

**Alternative:** TypeORM is also a solid choice if you prefer Active Record patterns or come from a Java/Spring background. Repository pattern makes switching between ORMs possible if needed.

---

## Summary

### Phase 1 Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Database** | PostgreSQL 16 | Perfect for "grab N items and lock" pattern, ACID, relational model |
| **ORM** | Prisma | Best DX, type safety, rapid development |
| **Local Dev** | Docker Compose | Simple `postgres:16` image, no LocalStack needed |
| **Production** | AWS RDS PostgreSQL (future) | Managed, scalable, familiar |

### Key Decisions

1. ✅ **PostgreSQL over DynamoDB** for Phase 1
   - Native support for scheduler pattern via `FOR UPDATE SKIP LOCKED`
   - Simpler implementation, fewer database round-trips
   - Better fit for relational data model

2. ✅ **Prisma for ORM**
   - Excellent TypeScript support
   - Good migration system
   - Large community

3. ✅ **Docker Compose for local dev**
   - No LocalStack dependency
   - Simple, fast, identical to production

4. ⏭️ **Re-evaluate for Phase 2+**
   - If scale requires it (millions of events/min)
   - Repository pattern makes migration possible
   - Would require rewriting repository layer only

### Trade-offs Accepted

| Trade-off | Impact | Mitigation |
|-----------|--------|-----------|
| PostgreSQL requires more ops than serverless DynamoDB | Must manage database (backups, scaling) | Use managed service (RDS, Render) in production |
| Single database instance is a bottleneck | Limited vertical scaling | Add read replicas if needed; sufficient for Phase 1 scale |
| Prisma adds small performance overhead | ~5-10ms query overhead | Acceptable for Phase 1; can optimize later |

---

**Decision Date:** 2025-10-17
**Status:** ✅ Approved for Phase 1 Implementation
**Next Review:** After Phase 1 MVP completion (evaluate if DynamoDB makes sense for Phase 2)
