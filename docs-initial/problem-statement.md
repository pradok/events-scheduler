# Problem Statement: Time-Based Event Scheduling System

## Abstract Problem

At its core, this is **not** a birthday messaging application. It is a **distributed, timezone-aware event scheduling system** that can trigger arbitrary events at specific local times for different entities.

## The Crux

Build a system that can schedule and execute events based on:
- **Temporal criteria** (specific date/time patterns)
- **Timezone context** (local time, not just UTC)
- **Recurrence patterns** (annual, monthly, one-time, custom)
- **Pluggable actions** (message sending, API calls, webhooks, etc.)

## Why This Matters

The birthday use case is just one instance of a broader pattern:
- Happy birthday at 9am user's local time
- Happy anniversary at 9am couple's local time
- Subscription renewal reminder at 10am user's timezone
- Contract expiry notification at midnight company's timezone
- Scheduled maintenance alert at 8am regional time
- Daily report generation at 9am per office location

## Key Insight

The system must **decouple three concerns**:

### 1. Event Definition (What & When)
- What needs to happen
- When it should happen (temporal pattern)
- In what timezone context

### 2. Event Scheduling (Time Evaluation)
- Continuously evaluate: "Is it time to trigger this event?"
- Handle timezone conversions
- Manage recurrence calculations
- Detect missed events

### 3. Event Execution (Action)
- Execute the actual event action
- Ensure exactly-once execution
- Handle failures and retries
- Maintain audit trail

## Core Requirements

### Functional
1. **Temporal Precision**: Events must trigger at the exact local time specified
2. **Timezone Awareness**: Handle multiple timezones with DST transitions
3. **Recurrence Support**: Support various recurrence patterns
4. **Extensibility**: Easy to add new event types and handlers
5. **Reliability**: Guarantee event execution (no missed events)
6. **Idempotency**: Guarantee exactly-once execution (no duplicates)

### Non-Functional
1. **Scalability**: Handle thousands of events per day
2. **Fault Tolerance**: Recover from downtime without missing or duplicating events
3. **Consistency**: Maintain event state correctly across distributed components
4. **Observability**: Track event lifecycle and execution status
5. **Performance**: Low latency for event triggering and execution

## Conceptual Model

```
Event Type (Template)
    ↓ (generates)
Event Instance (Specific Occurrence)
    ↓ (triggers at target time)
Event Handler (Executes Action)
    ↓ (produces)
Event Result (Success/Failure/Audit)
```

## Example Scenarios

### Birthday Message
- **Event Type**: "Birthday Greeting"
- **Recurrence**: Annual (same day each year)
- **Trigger Time**: 9:00 AM local time
- **Handler**: Send HTTP POST to webhook with message
- **Context**: User entity with timezone

### Anniversary Notification
- **Event Type**: "Anniversary Reminder"
- **Recurrence**: Annual (anniversary date)
- **Trigger Time**: 9:00 AM local time
- **Handler**: Send email notification
- **Context**: Couple/relationship entity with timezone

### Subscription Renewal
- **Event Type**: "Renewal Reminder"
- **Recurrence**: Monthly (subscription period)
- **Trigger Time**: 10:00 AM user timezone
- **Handler**: Send SMS + Email
- **Context**: Subscription entity with user timezone

## Success Criteria

A successful solution will:
1. Abstract away the birthday domain into a general event system
2. Support adding new event types without modifying core scheduling logic
3. Handle edge cases (leap years, DST transitions, timezone changes)
4. Scale horizontally as event volume increases
5. Provide clear separation of concerns and high testability
6. Enable future extensions (custom recurrence rules, multiple actions per event, conditional triggers)
