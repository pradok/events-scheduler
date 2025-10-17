# Phase 1 MVP Scope: Birthday Messaging System

This document defines the Minimum Viable Product (MVP) scope for Phase 1, focusing on birthday messaging while maintaining architectural extensibility for future event types.

---

## MVP Philosophy

**Build for birthday, architect for events.**

Phase 1 implements a fully functional birthday messaging system while establishing the architectural patterns and abstractions needed for future event types (anniversaries, reminders, etc.).

---

## In Scope for Phase 1

### 1. Core Functionality

#### User Management API
- **POST /user** - Create new user
  - Fields: firstName, lastName, dateOfBirth, timezone
  - Validation: Valid date, valid IANA timezone
  - Returns: User ID

- **DELETE /user/:id** - Delete user
  - Soft delete or hard delete (to be decided in architecture)
  - Cleanup associated events

- **PUT /user/:id** - Update user details (Bonus feature)
  - Update any user field
  - Recalculate birthday events if dateOfBirth or timezone changes

- **GET /user/:id** - Retrieve user details
  - For testing and verification purposes

#### Birthday Event Execution
- Send birthday message at exactly 9:00 AM user's local time
- Message format: "Hey, {firstName} {lastName} it's your birthday"
- Delivery via HTTP POST to RequestBin (or similar webhook service)
- Support multiple timezones simultaneously

#### Event Scheduling
- Automatic event generation when user is created
- Timezone-aware scheduling (convert local 9am to UTC)
- Handle Daylight Saving Time transitions
- Daily/periodic check for events ready to execute

#### Exactly-Once Delivery Guarantee
- No duplicate birthday messages
- Idempotency mechanisms
- Atomic state transitions for event processing

#### Failure Recovery
- System recovers from downtime (up to 24 hours tested)
- Send all missed birthday messages when system restarts
- No duplicates during recovery
- Grace period for "late" messages (e.g., within 1 hour of target time)

### 2. Data Model

> **Note**: This shows the basic schema for Phase 1. See [Architecture Design - Domain Model](architecture-design.md#domain-model) for the full domain model with methods, invariants, and relationships.

#### User Entity
```
User {
  id: UUID
  firstName: string
  lastName: string
  dateOfBirth: Date (YYYY-MM-DD)
  timezone: string (IANA timezone, e.g., "America/New_York")
  createdAt: timestamp
  updatedAt: timestamp
}
```

#### Event Instance (Birthday Occurrence)
```
BirthdayEvent {
  id: UUID
  userId: UUID (foreign key)
  eventType: "BIRTHDAY" (enum, extensible)
  targetYear: number
  targetDate: Date (YYYY-MM-DD)
  targetTime: string ("09:00:00")
  timezone: string (snapshot from user at creation time)
  targetTimestampUTC: timestamp (calculated)
  status: enum (PENDING, PROCESSING, COMPLETED, FAILED)
  executedAt: timestamp (nullable)
  createdAt: timestamp
  attempts: number (retry counter)
  lastError: string (nullable)
}
```

### 3. System Components

#### API Layer
- RESTful API using Express.js
- TypeScript for type safety
- Request validation
- Error handling

#### Event Scheduler
- Periodic job (runs every 1 minute)
- Query for events where `targetTimestampUTC <= NOW()` and `status = PENDING`
- Mark events as PROCESSING atomically
- Handle timezone conversions

#### Event Executor
- Execute event action (send HTTP POST)
- Retry logic with exponential backoff (3 attempts)
- Mark events as COMPLETED or FAILED
- Log execution results

#### Event Generator
- Generate birthday events when user is created
- Generate next year's event when current year completes
- Update/cancel events when user data changes (PUT endpoint)

#### Database
- Store users and events
- Support transactions for atomic updates
- Indexed queries for time-based lookups

### 4. Technical Requirements

#### Technology Stack
See [Technology Stack in main README](../README.md#technology-stack) and [docs/README.md](README.md#-technology-stack) for complete details.

#### Infrastructure
- LocalStack for local AWS services
- Docker Compose setup
- Environment configuration
- Database migrations/setup scripts

#### Testing
- Unit tests for core business logic
- Integration tests for API endpoints
- Time-based scenario tests (mock clock)
- Timezone conversion tests
- Recovery scenario tests

### 5. Non-Functional Requirements

#### Performance
- API response time: < 200ms for CRUD operations
- Event processing: Handle at least 100 events per minute
- Database queries optimized with proper indexes

#### Reliability
- 99% uptime (for MVP testing purposes)
- Automatic retry for failed webhook calls (3 attempts)
- Dead letter queue for permanently failed events

#### Observability
- Structured logging (JSON format)
- Log levels: DEBUG, INFO, WARN, ERROR
- Key events logged:
  - User created/updated/deleted
  - Event generated
  - Event scheduled
  - Event executed (success/failure)
  - System startup/shutdown

#### Scalability
- System tested with 1000 users
- Proven to handle 100+ birthdays on same day
- Architecture supports horizontal scaling (future)

---

## Out of Scope for Phase 1 (Future Phases)

### Explicitly Deferred Features

#### Additional Event Types
- Anniversary messages
- Custom reminders
- Recurring events (beyond annual birthdays)
- Multi-event scheduling per user

#### Advanced Scheduling
- Custom time preferences (not just 9am)
- Multiple messages per event
- Conditional events
- Event dependencies

#### Enhanced User Management
- User authentication/authorization
- Bulk user import
- User groups/organizations
- User preferences dashboard

#### Advanced Recovery
- Manual event replay
- Event history browsing
- Audit trail UI
- Admin dashboard

#### Production Features
- Rate limiting
- API authentication (API keys)
- Multi-tenancy
- CDN for static assets
- Monitoring/alerting (Prometheus, Grafana)
- Distributed tracing

#### Edge Cases (Documented but Not Handled)
- Leap year birthdays (Feb 29) - MVP sends on Mar 1 in non-leap years
- Timezone changes mid-day (user traveling) - Uses timezone at event generation time
- Historical timezone data changes - Uses current timezone database

---

## Architectural Extensibility Points

While Phase 1 focuses on birthdays, the following abstractions enable future expansion:

### 1. Event Type Abstraction
```typescript
interface EventType {
  name: string;
  handler: EventHandler;
  recurrenceRule: RecurrenceRule;
}
```

**Phase 1**: Hardcoded "BIRTHDAY" event type
**Future**: Registry of event types with pluggable handlers

### 2. Event Handler Interface
```typescript
interface EventHandler {
  execute(event: EventInstance, context: ExecutionContext): Promise<Result>;
  validate(event: EventInstance): boolean;
}
```

**Phase 1**: Single BirthdayMessageHandler
**Future**: Strategy pattern with multiple handlers

### 3. Recurrence Rule System
```typescript
interface RecurrenceRule {
  calculateNextOccurrence(baseDate: Date, timezone: string): Date;
}
```

**Phase 1**: Simple annual recurrence
**Future**: Complex recurrence patterns (RFC 5545)

### 4. Message Template System
**Phase 1**: Hardcoded message string
**Future**: Template engine with variables, localization

### 5. Delivery Channel Abstraction
**Phase 1**: HTTP POST webhook only
**Future**: SMS, Email, Push notifications, Multiple channels

### 6. Entity Abstraction
**Phase 1**: User entity only
**Future**: Generic entity system (User, Subscription, Contract, etc.)

---

## Success Criteria for Phase 1 MVP

### Functional
- ✅ Create, read, update, delete users via API
- ✅ Birthday message sent at 9am local time for each user
- ✅ Multiple users in different timezones receive messages at correct local times
- ✅ System recovers from 24-hour downtime and sends all missed messages
- ✅ No duplicate messages sent under any scenario
- ✅ User can update birthday and message still sent on correct day

### Technical
- ✅ 80%+ test coverage
- ✅ All tests passing (unit + integration)
- ✅ Runs successfully on LocalStack
- ✅ Docker Compose setup works end-to-end
- ✅ Documentation complete (README, API docs, architecture)

### Performance
- ✅ System handles 1000 users without issues
- ✅ 100+ birthdays on same day processed successfully
- ✅ API responds within 200ms

### Quality
- ✅ TypeScript with strict mode
- ✅ ESLint + Prettier configured
- ✅ No critical security vulnerabilities
- ✅ Proper error handling and logging
- ✅ Code reviewed and follows best practices

---

## Phase 1 Deliverables

### 1. Source Code
- TypeScript application
- Unit tests
- Integration tests
- Test utilities (time mocking, etc.)

### 2. Infrastructure
- Docker Compose file
- LocalStack configuration
- Database setup scripts
- Environment variable templates

### 3. Documentation
- README with setup instructions
- API documentation (OpenAPI/Swagger)
- Architecture diagram
- Database schema diagram
- Developer guide
- Testing guide

### 4. Deployment
- Local development setup guide
- LocalStack deployment instructions
- AWS deployment guide (optional)

---

## Implementation Phases

### Phase 1.1: Foundation (Week 1)
- Project setup (TypeScript, Express, testing framework)
- Docker Compose + LocalStack setup
- Database setup (schema, migrations)
- Basic user CRUD API (without events)

### Phase 1.2: Core Scheduling (Week 2)
- Event data model
- Event generation on user creation
- Timezone conversion logic
- Scheduler component (periodic job)
- Event executor (webhook HTTP POST)

### Phase 1.3: Reliability (Week 3)
- Exactly-once delivery mechanism
- Retry logic
- Failure recovery on restart
- State management improvements

### Phase 1.4: Polish (Week 4)
- PUT /user endpoint with event recalculation
- Comprehensive testing
- Documentation
- Performance testing
- Edge case handling

---

## Risk Mitigation

### Risk 1: Timezone Complexity
**Mitigation**: Use battle-tested library (Luxon), extensive test coverage for timezone scenarios

### Risk 2: Race Conditions
**Mitigation**: Database transactions, optimistic locking, idempotency keys

### Risk 3: LocalStack Limitations
**Mitigation**: Abstract AWS service interactions, test against real AWS (optional), document LocalStack quirks

### Risk 4: Scope Creep
**Mitigation**: Strict adherence to this scope document, defer features to future phases

### Risk 5: Time-Based Testing
**Mitigation**: Clock mocking utilities, deterministic test scenarios, CI/CD time-based test suite

---

## Future Phase Preview

### Phase 2: Event Extensibility
- Generic event type system
- Anniversary message support
- Custom message templates
- Multiple delivery channels

### Phase 3: Advanced Features
- User authentication
- Admin dashboard
- Event history/audit trail
- Manual event triggering

### Phase 4: Production Readiness
- Multi-tenancy
- Advanced monitoring
- Rate limiting
- API authentication
- Performance optimization

---

## Conclusion

Phase 1 delivers a fully functional birthday messaging system that:
- Meets all requirements from the brief
- Handles edge cases and failure scenarios
- Provides exactly-once delivery guarantees
- Scales to handle thousands of users
- Establishes architectural patterns for future expansion

The MVP is **production-ready for birthday use case** while maintaining **architectural flexibility for future event types**.
