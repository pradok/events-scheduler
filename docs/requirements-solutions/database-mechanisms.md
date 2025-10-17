# Solution: Leveraging Database Internal Mechanisms (Requirement #6)

**Requirement from [brief.md](../brief.md):**
> "You may use any database technology you'd like, and you are allowed to take advantage of the database's internal mechanisms."

---

## Table of Contents

1. [What This Means](#what-this-means)
2. [Database Mechanisms We Use](#database-mechanisms-we-use)
3. [Why Use Database Mechanisms](#why-use-database-mechanisms)
4. [Implementation Examples](#implementation-examples)
5. [Comparison: With vs Without Database Mechanisms](#comparison-with-vs-without-database-mechanisms)

---

## What This Means

### "Database Internal Mechanisms"

The requirement encourages using **built-in database features** to solve problems, rather than implementing everything in application code.

**Examples include:**
- Transactions (ACID guarantees)
- Row-level locking
- Constraints (unique, foreign key, check)
- Indexes for performance
- Triggers for automation
- Database-specific features (PostgreSQL extensions)

### Why Mention This?

The requirement signals that:
1. ✅ You can rely on database capabilities
2. ✅ You don't need to reinvent what databases do well
3. ✅ Database-specific features are acceptable (not limited to generic SQL)
4. ✅ Interviewers want to see knowledge of database capabilities

---

## Database Mechanisms We Use

### Overview Table

| Mechanism | Purpose | Benefit | Where Used |
|-----------|---------|---------|------------|
| **ACID Transactions** | Atomic operations | All-or-nothing updates | Event claiming, user operations |
| **Row-Level Locking** | Prevent concurrent access | Race condition prevention | Scheduler query |
| **Optimistic Locking** | Detect concurrent modifications | Exactly-once delivery | Event status updates |
| **Indexes** | Fast queries | Sub-10ms query time | Event lookup |
| **Foreign Keys** | Referential integrity | Automatic cascade delete | User → Events relationship |
| **Unique Constraints** | Prevent duplicates | One event per user/year | Event uniqueness |
| **Partial Indexes** | Efficient filtered queries | Index only PENDING events | Scheduler optimization |
| **Triggers** | Automatic actions | Auto-update timestamps | updated_at field |
| **Check Constraints** | Data validation | Database-level validation | Date must be in past |

---

## Why Use Database Mechanisms

### 1. Simplicity ✅

**With database mechanisms:**
```typescript
// 3 lines - database handles complexity
await db.query(`
  SELECT * FROM events WHERE ... FOR UPDATE SKIP LOCKED
`);
```

**Without database mechanisms:**
```typescript
// 30+ lines - manual distributed locking
const lockKey = `event-lock-${eventId}`;
const lock = await redis.set(lockKey, 'locked', 'NX', 'EX', 30);
if (!lock) {
  // Another process has lock
  return;
}
try {
  const event = await db.query('SELECT * FROM events WHERE ...');
  // Process event
} finally {
  await redis.del(lockKey);
}
// ⚠️ What if Redis is down? What if lock expires during processing?
```

### 2. Reliability ✅

Database mechanisms are **battle-tested** and handle edge cases:
- Network failures
- Process crashes
- Clock skew
- Concurrent access

### 3. Performance ✅

Database engines are **optimized** for these operations:
- Locking is implemented in C/C++ (faster than Node.js)
- Indexes use B-trees (optimal data structures)
- Query planner optimizes execution

### 4. Fewer Dependencies ✅

**With database mechanisms:**
- Just need PostgreSQL

**Without database mechanisms:**
- PostgreSQL (data storage)
- Redis (distributed locks)
- Additional coordination service

---

## Implementation Examples

### Mechanism 1: Row-Level Locking with `FOR UPDATE SKIP LOCKED`

**Problem:** Multiple scheduler instances must not process the same event.

**Solution using database mechanism:**

```typescript
// src/repositories/event-repository.ts
export class EventRepository {
  async findAndClaimReadyEvents(limit: number): Promise<BirthdayEvent[]> {
    return this.db.transaction(async (tx) => {
      const rows = await tx.query(`
        UPDATE events
        SET status = 'PROCESSING',
            version = version + 1
        WHERE id IN (
          SELECT id FROM events
          WHERE target_timestamp_utc <= NOW()
            AND status = 'PENDING'
          FOR UPDATE SKIP LOCKED  -- 🔑 PostgreSQL's row-level locking
          LIMIT $1
        )
        RETURNING *
      `, [limit]);

      return rows.map(row => this.mapToEntity(row));
    });
  }
}
```

**How it works:**

```
Scheduler #1 runs query:
  - Locks Event A, B, C
  - Returns [A, B, C]

Scheduler #2 runs same query (simultaneously):
  - Tries to lock Event A → LOCKED by #1 → SKIP IT
  - Tries to lock Event B → LOCKED by #1 → SKIP IT
  - Tries to lock Event C → LOCKED by #1 → SKIP IT
  - Locks Event D, E, F
  - Returns [D, E, F]

Result: No overlap, no duplicates ✅
```

**Without database mechanism:**

```typescript
// ❌ Manual locking with Redis (complex and error-prone)
const events = await db.query('SELECT * FROM events WHERE ...');

const claimed = [];
for (const event of events) {
  const lockKey = `event-lock-${event.id}`;
  const locked = await redis.set(lockKey, 'processing', 'NX', 'EX', 60);

  if (locked) {
    claimed.push(event);
  }
}

// Problems:
// - N+1 Redis calls (slow)
// - Lock expiration handling
// - Redis failure scenarios
// - Lock cleanup on crash
```

---

### Mechanism 2: ACID Transactions

**Problem:** Event claiming and status update must be atomic (all-or-nothing).

**Solution using database mechanism:**

```typescript
async createUserWithEvent(userData: UserData): Promise<User> {
  return this.db.transaction(async (tx) => {
    // Step 1: Create user
    const user = await tx.query(`
      INSERT INTO users (first_name, last_name, date_of_birth, timezone)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [userData.firstName, userData.lastName, userData.dob, userData.timezone]);

    // Step 2: Create birthday event for this year
    const event = await tx.query(`
      INSERT INTO events (user_id, target_timestamp_utc, status)
      VALUES ($1, $2, 'PENDING')
      RETURNING *
    `, [user.id, calculateTargetUTC(userData)]);

    // Both succeed or both fail (ACID)
    return user;
  });
}
```

**What database guarantees:**
- If user creation succeeds but event creation fails → **rollback user creation**
- If connection drops mid-transaction → **rollback everything**
- If database crashes → **transaction never happened**

**Without database mechanism:**

```typescript
// ❌ Manual transaction management (fragile)
let userId;
try {
  const user = await db.query('INSERT INTO users ...');
  userId = user.id;

  const event = await db.query('INSERT INTO events ...');

  await db.query('COMMIT');
} catch (error) {
  if (userId) {
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
  }
  throw error;
}

// Problems:
// - What if DELETE fails?
// - What if process crashes between INSERT and DELETE?
// - Race conditions during cleanup
```

---

### Mechanism 3: Unique Constraints

**Problem:** Prevent duplicate events for the same user/year.

**Solution using database mechanism:**

```sql
-- Schema definition
CREATE TABLE events (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  target_year INTEGER NOT NULL,
  event_type VARCHAR(50) NOT NULL,

  -- 🔑 Database enforces uniqueness
  UNIQUE (user_id, target_year, event_type)
);
```

```typescript
// Application code is simple
async createEvent(userId: string, year: number): Promise<Event> {
  try {
    return await db.query(`
      INSERT INTO events (user_id, target_year, event_type, ...)
      VALUES ($1, $2, 'BIRTHDAY', ...)
      RETURNING *
    `, [userId, year]);
  } catch (error) {
    if (error.code === '23505') { // PostgreSQL unique violation
      throw new DuplicateEventError(`Event already exists for user ${userId} in ${year}`);
    }
    throw error;
  }
}
```

**Without database mechanism:**

```typescript
// ❌ Manual duplicate checking (race condition!)
const existing = await db.query(`
  SELECT id FROM events
  WHERE user_id = $1 AND target_year = $2
`, [userId, year]);

if (existing.length > 0) {
  throw new DuplicateEventError('Event already exists');
}

// ⚠️ Race condition window here!
// Another request could insert between check and insert

await db.query(`
  INSERT INTO events (user_id, target_year, ...)
  VALUES ($1, $2, ...)
`, [userId, year]);
```

---

### Mechanism 4: Partial Indexes

**Problem:** Scheduler query needs to be fast even with millions of completed events.

**Solution using database mechanism:**

```sql
-- 🔑 Index only PENDING events (PostgreSQL partial index)
CREATE INDEX idx_events_ready
ON events(target_timestamp_utc, status)
WHERE status = 'PENDING';
```

**Benefits:**
- Index is much smaller (only PENDING events, not all 1M events)
- Query is faster (fewer index entries to scan)
- Less memory usage (smaller index footprint)

**Query automatically uses this index:**

```sql
-- Scheduler query
SELECT * FROM events
WHERE target_timestamp_utc <= NOW()
  AND status = 'PENDING'
LIMIT 100;

-- PostgreSQL query planner sees:
-- "Oh, status = 'PENDING' matches the partial index condition"
-- "I'll use idx_events_ready instead of full table scan"
-- Result: Sub-10ms query time even with 1M total events
```

**Without database mechanism:**

```sql
-- ❌ Full index on all rows
CREATE INDEX idx_events_all
ON events(target_timestamp_utc, status);

-- Index includes:
-- - 1000 PENDING events (useful)
-- - 999,000 COMPLETED events (useless for scheduler query)
-- Result: Slower queries, more memory
```

---

### Mechanism 5: Foreign Key Constraints with CASCADE

**Problem:** When a user is deleted, their events should be automatically deleted.

**Solution using database mechanism:**

```sql
-- Schema definition
CREATE TABLE events (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,

  -- 🔑 Database handles cascading deletes
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

```typescript
// Application code is simple
async deleteUser(userId: string): Promise<void> {
  // Just delete the user
  await db.query('DELETE FROM users WHERE id = $1', [userId]);

  // Database automatically deletes all events for this user ✅
  // No manual cleanup needed!
}
```

**Without database mechanism:**

```typescript
// ❌ Manual cascade deletion (error-prone)
async deleteUser(userId: string): Promise<void> {
  // Step 1: Delete all events
  await db.query('DELETE FROM events WHERE user_id = $1', [userId]);

  // Step 2: Delete user
  await db.query('DELETE FROM users WHERE id = $1', [userId]);

  // Problems:
  // - Not atomic (what if Step 2 fails?)
  // - Easy to forget in different parts of codebase
  // - New tables added later need manual updates
}
```

---

### Mechanism 6: Check Constraints

**Problem:** Validate data at database level (defense in depth).

**Solution using database mechanism:**

```sql
-- Schema definition
CREATE TABLE users (
  id UUID PRIMARY KEY,
  first_name VARCHAR(255) NOT NULL CHECK (first_name <> ''),
  last_name VARCHAR(255) NOT NULL CHECK (last_name <> ''),
  date_of_birth DATE NOT NULL CHECK (date_of_birth < CURRENT_DATE),
  timezone VARCHAR(100) NOT NULL
);

CREATE TABLE events (
  id UUID PRIMARY KEY,
  attempts INTEGER DEFAULT 0 CHECK (attempts >= 0),
  version INTEGER DEFAULT 0 CHECK (version >= 0),
  status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'))
);
```

**Benefits:**
- Database enforces rules even if application code has bugs
- Impossible to insert invalid data (e.g., negative attempts)
- Defense in depth (multiple validation layers)

---

### Mechanism 7: Triggers for Automatic Updates

**Problem:** Keep `updated_at` timestamp in sync automatically.

**Solution using database mechanism:**

```sql
-- Function to update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 🔑 Trigger automatically updates timestamp
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

```typescript
// Application code doesn't need to set updated_at
async updateUser(userId: string, updates: Partial<User>): Promise<void> {
  await db.query(`
    UPDATE users
    SET first_name = $2,
        last_name = $3
        -- No need to set updated_at here! Trigger handles it ✅
    WHERE id = $1
  `, [userId, updates.firstName, updates.lastName]);
}
```

**Without database mechanism:**

```typescript
// ❌ Manual timestamp management (easy to forget)
async updateUser(userId: string, updates: Partial<User>): Promise<void> {
  await db.query(`
    UPDATE users
    SET first_name = $2,
        last_name = $3,
        updated_at = NOW()  -- Must remember this everywhere!
    WHERE id = $1
  `, [userId, updates.firstName, updates.lastName]);
}

// Problems:
// - Easy to forget in different queries
// - Inconsistent across codebase
// - No guarantee timestamp is updated
```

---

## Comparison: With vs Without Database Mechanisms

### Scenario: Claim Events for Processing

#### ✅ With Database Mechanisms (Our Approach)

```typescript
// One query, database handles everything
const events = await db.query(`
  UPDATE events
  SET status = 'PROCESSING', version = version + 1
  WHERE id IN (
    SELECT id FROM events
    WHERE target_timestamp_utc <= NOW() AND status = 'PENDING'
    FOR UPDATE SKIP LOCKED
    LIMIT 100
  )
  RETURNING *
`);

// Lines of code: ~10
// Round trips to database: 1
// External dependencies: 0
// Race condition risk: None
// Performance: <10ms
```

#### ❌ Without Database Mechanisms (Manual Approach)

```typescript
// Query events (no locking)
const candidates = await db.query(`
  SELECT * FROM events
  WHERE target_timestamp_utc <= NOW() AND status = 'PENDING'
  LIMIT 100
`);

const claimed = [];

// Try to claim each event with Redis lock
for (const event of candidates) {
  const lockKey = `event-lock-${event.id}`;

  // Acquire distributed lock
  const locked = await redis.set(lockKey, 'processing', 'NX', 'EX', 60);
  if (!locked) continue;

  try {
    // Check version (optimistic locking)
    const current = await db.query(
      'SELECT version FROM events WHERE id = $1',
      [event.id]
    );

    if (current.version !== event.version) {
      await redis.del(lockKey);
      continue;
    }

    // Update status
    await db.query(`
      UPDATE events
      SET status = 'PROCESSING', version = version + 1
      WHERE id = $1 AND version = $2
    `, [event.id, event.version]);

    claimed.push(event);
  } catch (error) {
    await redis.del(lockKey);
    throw error;
  }
}

// Lines of code: ~40+
// Round trips to database: 1 + (2 × N) where N = candidates
// External dependencies: Redis
// Race condition risk: Medium (lock expiration, Redis failure)
// Performance: ~100-500ms (N Redis + N DB calls)
```

---

## Summary

### Database Mechanisms We Leverage

1. ✅ **Row-Level Locking** (`FOR UPDATE SKIP LOCKED`) - Prevents race conditions
2. ✅ **ACID Transactions** - Atomic operations
3. ✅ **Unique Constraints** - Prevents duplicates
4. ✅ **Partial Indexes** - Fast queries on subset of data
5. ✅ **Foreign Keys with CASCADE** - Automatic cleanup
6. ✅ **Check Constraints** - Database-level validation
7. ✅ **Triggers** - Automatic timestamp updates
8. ✅ **Optimistic Locking** - Version-based concurrency control

### Benefits

| Aspect | With DB Mechanisms | Without DB Mechanisms |
|--------|-------------------|----------------------|
| **Code complexity** | Low (~10-20 lines) | High (~40-100 lines) |
| **Dependencies** | PostgreSQL only | PostgreSQL + Redis + ... |
| **Performance** | <10ms queries | ~100-500ms (multiple calls) |
| **Reliability** | Battle-tested DB engine | Custom coordination logic |
| **Maintenance** | Low (DB handles it) | High (manual edge cases) |
| **Race conditions** | Prevented by DB | Must handle in code |

### Related Documents

- [Database Selection](../tech-choices/database-selection.md) - Why we chose PostgreSQL
- [Failure Recovery](./failure-recovery.md) - Uses transactions for atomic recovery
- [Architecture Design](../architecture-design.md) - Overall system architecture

---

**Requirement Status:** ✅ Solution Designed & Documented

**Implementation Status:** 🚧 Phase 1 MVP

**Last Updated:** 2025-10-18
