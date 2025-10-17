# Technical Challenges & Problems to Solve

This document outlines the key technical challenges that must be addressed to build a robust time-based event scheduling system.

---

## 1. Timezone & Time Management

### Challenge: Multi-Timezone Coordination
**Problem**: Events must trigger at specific local times across different timezones simultaneously.

**Complexities**:
- Multiple users in different timezones can have events at "9am local time"
- This means different UTC timestamps for the same "logical time"
- Must continuously evaluate "Is it 9am anywhere right now?"

**Considerations**:
- Store times in UTC but evaluate against local time
- Handle timezone offset calculations
- Account for timezone abbreviation ambiguities (EST vs AEST)

### Challenge: Daylight Saving Time (DST)
**Problem**: DST transitions can cause times to skip forward or repeat.

**Scenarios**:
- Spring forward: 2am → 3am (9am still exists, no issue)
- Fall back: 2am → 1am (times repeat, but 9am is unaffected in most cases)
- Edge case: Event scheduled during the "missing" hour
- Different regions transition on different dates

**Considerations**:
- Use timezone database (IANA tz database)
- Handle DST transitions for future event scheduling
- Consider what happens when user changes timezone

### Challenge: Leap Years & Special Dates
**Problem**: February 29th only exists in leap years.

**Questions**:
- When do Feb 29 birthdays get celebrated in non-leap years?
  - Feb 28?
  - Mar 1?
  - Skip the year entirely?
- Should this be configurable per event?

**Considerations**:
- Date normalization logic
- Policy configuration for edge dates

---

## 2. Exactly-Once Execution Guarantee

### Challenge: Preventing Duplicate Event Execution
**Problem**: The system must never send duplicate messages/execute duplicate actions.

**Race Condition Scenarios**:
1. **Concurrent Scheduler Invocations**: Multiple scheduler instances run simultaneously and both see the same event as "ready to execute"
2. **Retry Logic**: Event execution fails, system retries, but first attempt actually succeeded
3. **Clock Skew**: Distributed system clocks differ, causing overlapping time window evaluations
4. **Downtime Recovery**: System restarts and re-processes recent events

**Solutions to Consider**:
- Idempotency keys per event instance
- Atomic state transitions (PENDING → PROCESSING → COMPLETED)
- Distributed locks or database-level locking
- Version vectors or timestamps to detect concurrent modifications
- Deduplication windows

### Challenge: State Management
**Problem**: Track which events have been executed and their status.

**State Transitions**:
```
SCHEDULED → PENDING → PROCESSING → COMPLETED
                   ↓
                FAILED → RETRYING
```

**Considerations**:
- State must be persisted transactionally
- Failed events need retry logic with backoff
- Need audit trail of state transitions
- Handle partial failures (event processed but status update fails)

---

## 3. Failure Recovery & Resilience

### Challenge: Downtime Recovery Without Duplicates
**Problem**: If the system is down for hours/days, it must catch up without sending duplicates.

**Scenarios**:
1. System down for 24 hours, comes back online
   - Must identify all events that should have triggered
   - Must send them without duplicating already-sent events

2. System down from 8:59am to 9:01am in user's timezone
   - Event window passed during downtime
   - Must still trigger the event

3. Partial failure: Some events processed, some not
   - Need to resume from last successful point
   - Must not re-process successful events

**Solutions to Consider**:
- Watermark tracking (last successfully processed timestamp)
- Event instance status flags with timestamps
- Catch-up mode vs real-time mode
- Dead letter queue for persistently failing events

### Challenge: Retry Logic & Failure Handling
**Problem**: External dependencies (webhooks, APIs) can fail.

**Questions**:
- How many retries?
- What backoff strategy?
- When to give up and mark as permanently failed?
- Should retries respect the original time constraint or execute ASAP?

**Considerations**:
- Exponential backoff
- Maximum retry attempts
- Circuit breaker pattern for cascading failures
- Manual intervention queue for human review

---

## 4. Scalability & Performance

### Challenge: Uneven Load Distribution
**Problem**: Events are not uniformly distributed.

**Realities**:
- Some dates have more birthdays (statistically proven patterns)
- Peak times: Multiple timezones hit 9:00am within same minute
- Burst processing required for catch-up scenarios

**Implications**:
- System must scale horizontally
- Need queue-based architecture to buffer spikes
- Consider event batching for efficiency

### Challenge: Continuous Time Evaluation
**Problem**: Need to constantly check "Is it time to trigger events?"

**Approaches**:
1. **Polling**: Run scheduler every X seconds/minutes
   - Simple but inefficient
   - Could miss events if interval too long

2. **Pre-computed Triggers**: Calculate next trigger time for each event
   - Efficient but complex to maintain
   - Requires updating on timezone/data changes

3. **Time Bucket Partitioning**: Group events by target time windows
   - Balance between approaches 1 and 2
   - Query only relevant time buckets

**Considerations**:
- Granularity: Check every minute? Every 10 seconds?
- Index optimization for time-based queries
- Partition pruning for large event datasets

### Challenge: Database Performance
**Problem**: Frequent reads/writes for event status updates.

**Query Patterns**:
- Find all events where `target_time <= NOW()` and `status = PENDING`
- Update event status atomically
- Handle concurrent updates

**Considerations**:
- Index on `(target_time, status)` for efficient queries
- Use database transactions for atomic updates
- Consider optimistic locking vs pessimistic locking
- Read replicas for query scaling vs write consistency

---

## 5. Data Consistency & Concurrency

### Challenge: Entity Updates During Event Processing
**Problem**: What happens if a user updates their details while an event is being processed?

**Scenarios**:
1. **Birthday Date Change**: User changes birthday from Mar 15 to Mar 20
   - What if today is Mar 15 and event already triggered?
   - What if event is queued but not yet processed?

2. **Timezone Change**: User moves from New York to Tokyo
   - Event scheduled for "9am New York time"
   - User changes timezone before event triggers
   - Should next year's event use new timezone?

3. **Entity Deletion**: User deleted mid-processing
   - Event handler tries to reference non-existent user
   - Need graceful handling

**Solutions to Consider**:
- Event versioning (capture entity state at event generation time)
- Immutable event instances (schedule stays fixed once created)
- Cancel-and-reschedule strategy for updates
- Snapshot entity data into event payload

### Challenge: Race Conditions on Entity Operations
**Problem**: API allows user creation/deletion/updates concurrently.

**Scenarios**:
- User created → Event generated → User deleted → Event triggers
- User updated → Multiple event instances recalculated concurrently
- Two updates to same user happen simultaneously

**Considerations**:
- Optimistic locking with version numbers
- Event generation as part of entity transaction
- Eventual consistency vs strong consistency trade-offs

---

## 6. Extensibility & Maintainability

### Challenge: Adding New Event Types
**Problem**: System should support new event types without modifying core logic.

**Requirements**:
- Plugin architecture for event handlers
- Configuration-driven event definitions
- Separation of scheduling logic from execution logic

**Design Patterns**:
- Strategy pattern for handlers
- Factory pattern for event creation
- Registry pattern for handler lookup

### Challenge: Complex Recurrence Rules
**Problem**: Birthday is simple (annual), but other events may have complex patterns.

**Examples**:
- Monthly on the 15th
- Every weekday at 9am
- First Monday of every month
- Custom cron-like expressions

**Solutions to Consider**:
- Adopt RFC 5545 (iCalendar) recurrence rules
- Use library like `rrule` for recurrence calculation
- Balance flexibility vs complexity

---

## 7. Observability & Debugging

### Challenge: Event Lifecycle Tracking
**Problem**: Need visibility into what events are scheduled, executing, completed, or failed.

**Requirements**:
- Audit trail of all state transitions
- Timestamps for each lifecycle stage
- Reason codes for failures
- Correlation IDs across distributed components

### Challenge: Debugging Time-Based Issues
**Problem**: Time-dependent bugs are hard to reproduce.

**Challenges**:
- "It only fails on February 29th"
- "DST transition caused duplicate event"
- "Timezone conversion bug for Pacific/Auckland"

**Solutions**:
- Comprehensive logging with timezone context
- Ability to simulate different dates/times in testing
- Replay capability for failed events
- Time travel testing utilities

---

## 8. Edge Cases & Boundary Conditions

### Challenge: Clock Skew & Time Synchronization
**Problem**: Distributed systems may have slight clock differences.

**Impact**:
- Scheduler on server A thinks it's 9:00:01
- Scheduler on server B thinks it's 8:59:59
- Both process overlapping time windows

**Solutions**:
- Idempotency mechanisms
- Rely on database server time as source of truth
- Accept small timing inaccuracies (event triggers within ±1 minute acceptable)

### Challenge: Event Window Definition
**Problem**: What if an event should trigger "at 9am" but system checks at 9:01am?

**Questions**:
- Is the event "missed"?
- Should it still trigger (late execution)?
- How late is acceptable?

**Considerations**:
- Define grace period (e.g., trigger if within 5 minutes of target time)
- Mark as "late execution" vs "on-time execution"
- Different SLAs for different event types

### Challenge: Zero-Downtime Updates
**Problem**: Deploying new code without missing events.

**Requirements**:
- Graceful shutdown (finish processing current events)
- Event queue persistence
- Blue-green deployment compatibility
- Database migration compatibility

---

## Summary of Critical Problems

The three hardest problems to solve:

1. **Exactly-once execution guarantee in a distributed system**
   - Requires careful state management, idempotency, and atomic operations

2. **Timezone-aware scheduling with DST and edge cases**
   - Complex temporal logic with many corner cases

3. **Failure recovery without duplicates or missed events**
   - Must balance catching up with maintaining guarantees

These form the foundation that the architecture must address.
