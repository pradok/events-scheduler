# Database Schema

Complete PostgreSQL database schema for the Time-Based Event Scheduling System, including tables, indexes, triggers, and constraints.

Reference: [Full Architecture Document](../architecture.md)

---

## Overview

Based on PostgreSQL 16.1 and the data models defined in the architecture:

```sql
-- Database Schema for Time-Based Event Scheduling System
-- PostgreSQL 16.1

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name VARCHAR(100) NOT NULL CHECK (LENGTH(first_name) > 0),
    last_name VARCHAR(100) NOT NULL CHECK (LENGTH(last_name) > 0),
    date_of_birth DATE NOT NULL CHECK (date_of_birth < CURRENT_DATE),
    timezone VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Events table
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL DEFAULT 'BIRTHDAY',
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    target_timestamp_utc TIMESTAMPTZ NOT NULL,
    target_timestamp_local TIMESTAMPTZ NOT NULL,
    target_timezone VARCHAR(100) NOT NULL,
    executed_at TIMESTAMPTZ,
    failure_reason TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0 AND retry_count <= 3),
    version INTEGER NOT NULL DEFAULT 1,
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    delivery_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_events_user_id ON events(user_id);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_target_timestamp_utc ON events(target_timestamp_utc);
CREATE INDEX idx_events_scheduler_query ON events(target_timestamp_utc, status) WHERE status = 'PENDING';
CREATE INDEX idx_events_user_pending ON events(user_id, status) WHERE status = 'PENDING';

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to users
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply updated_at trigger to events
CREATE TRIGGER update_events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE users IS 'Stores user information including birthday and timezone';
COMMENT ON TABLE events IS 'Stores scheduled birthday events with lifecycle tracking';
COMMENT ON COLUMN events.version IS 'Optimistic locking version for concurrency control';
COMMENT ON COLUMN events.idempotency_key IS 'Unique key for external API idempotency';
COMMENT ON INDEX idx_events_scheduler_query IS 'Optimized for scheduler query: ready events with FOR UPDATE SKIP LOCKED';
```

---

## Key Design Decisions

### CASCADE DELETE
Events are deleted when a user is deleted (orphan removal). This ensures data integrity and prevents orphaned events.

### Partial Index
The `idx_events_scheduler_query` index only indexes PENDING events, optimizing the scheduler's hot path query. This reduces index size and improves query performance for the most common scheduler operation.

### JSONB for Payload
Flexible storage for different event types in future phases. JSONB provides efficient storage and querying capabilities for structured data.

### TIMESTAMPTZ
All timestamps are stored with timezone information (UTC) for consistency across different timezones and deployments.

### Check Constraints
Enforce domain rules at the database level:
- Status must be one of: PENDING, PROCESSING, COMPLETED, FAILED
- Retry count must be between 0 and 3
- First name and last name must not be empty
- Date of birth must be in the past

### Unique Idempotency Key
Prevents duplicate event creation and ensures idempotent webhook delivery. Each event has a unique idempotency key derived from user ID and target timestamp.

---

## Indexes Explanation

### idx_events_user_id
Supports queries that filter events by user (e.g., finding all events for a specific user).

### idx_events_status
Supports queries that filter events by status (e.g., finding all PENDING or FAILED events).

### idx_events_target_timestamp_utc
Supports queries that sort or filter events by their scheduled time.

### idx_events_scheduler_query (Composite Index)
**Most Critical Index**: Optimized for the scheduler's main query:
```sql
SELECT * FROM events
WHERE status = 'PENDING'
  AND target_timestamp_utc <= NOW()
ORDER BY target_timestamp_utc ASC
FOR UPDATE SKIP LOCKED
LIMIT 100;
```

This is a **composite index on `(target_timestamp_utc, status)`** that indexes both columns together.

**Current Implementation:** Regular composite index (indexes ALL events regardless of status)

**Future Optimization:** Convert to a partial index with `WHERE status = 'PENDING'` to reduce index size and improve performance at scale (see [Database Locking Strategies](./database-locking.md) for details).

### idx_events_user_pending (Composite Index)

This is a **composite index on `(user_id, status)`** that indexes both columns together in that specific order.

**What queries it supports:**
```sql
-- ✅ Uses index efficiently (filters by user_id, then status)
SELECT * FROM events WHERE user_id = 'abc' AND status = 'PENDING';

-- ✅ Uses index efficiently (filters by user_id only - prefix match)
SELECT * FROM events WHERE user_id = 'abc';

-- ❌ Cannot use this index (status is second column, user_id not specified)
SELECT * FROM events WHERE status = 'PENDING';
```

**Use case:** Finding pending events for a specific user (e.g., during timezone updates when rescheduling is needed).

**Index order matters:** PostgreSQL can use a composite index `(userId, status)` for queries filtering by `userId` alone OR `userId + status`, but NOT for queries filtering by `status` alone.

---

## Triggers

### update_updated_at_column()
Automatically updates the `updated_at` timestamp whenever a record is modified. This trigger is applied to both the `users` and `events` tables, ensuring audit trails without requiring application-level logic.

---

## Constraints

### Foreign Key Constraints
- `events.user_id` references `users.id` with CASCADE DELETE
- Ensures referential integrity between events and users

### Check Constraints
- `users.first_name` and `users.last_name` must have length > 0
- `users.date_of_birth` must be in the past
- `events.status` must be one of the valid enum values
- `events.retry_count` must be between 0 and 3

### Unique Constraints
- `events.idempotency_key` must be unique across all events
- Prevents duplicate event creation and enables idempotent operations

---

## Locking Strategies

The database schema supports both pessimistic and optimistic locking:

### Pessimistic Locking (FOR UPDATE SKIP LOCKED)
The `idx_events_scheduler_query` partial index is optimized for the scheduler's atomic claiming query that uses PostgreSQL row-level locking to prevent duplicate event processing in distributed systems.

### Optimistic Locking (Version-Based)
The `version` column in the `events` table implements optimistic locking for general event updates:

```sql
UPDATE events
SET status = 'COMPLETED', version = version + 1
WHERE id = ? AND version = ?;
```

If the update affects 0 rows, it means another process has already modified the event (version mismatch), and an `OptimisticLockError` is thrown.

**For comprehensive documentation on both locking strategies, see:** [Database Locking Strategies](./database-locking.md)

---
