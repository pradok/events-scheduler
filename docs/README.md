# Documentation Guide

This directory contains all technical documentation for the Time-Based Event Scheduling System.

---

## 📖 Documentation Map

### 🎯 Start Here

- [Main README](../README.md) - Project overview and quick start
- **You are here!** - Documentation guide

### 📚 Understanding the Problem

| Document | Purpose | Audience |
|----------|---------|----------|
| [Brief](brief.md) | Original project requirements | Everyone |
| [Problem Statement](problem-statement.md) | Abstract problem definition, why this matters | Product, Engineering |
| [Challenges](challenges.md) | 8 major technical challenges to solve | Engineering, Architecture |

### 🏗️ Architecture & Design

| Document | Purpose | Audience |
|----------|---------|----------|
| [Architecture Design](architecture-design.md) | System architecture, patterns, domain model, data flows | Engineering, Architecture |
| [Phase 1 MVP Scope](phase1-mvp-scope.md) | What we're building first, in/out scope, timeline | Everyone |

### 🔧 Technology Choices

| Document | Purpose | Audience |
|----------|---------|----------|
| [Tech Choices Overview](tech-choices/README.md) | Guide to all technology decisions | Engineering, Architecture |
| [Database Selection](tech-choices/database-selection.md) | PostgreSQL vs DynamoDB analysis, ORM comparison | Engineering, Architecture |
| [Event Triggering](tech-choices/event-triggering-mechanism.md) | Polling vs EventBridge analysis | Engineering, Architecture |
| [Date/Time Library](tech-choices/datetime-library.md) | Luxon vs alternatives for timezone handling | Engineering |

### 💡 Requirements & Solutions

| Document | Purpose | Audience |
|----------|---------|----------|
| [Requirements Solutions Map](requirements-solutions/README.md) | How each requirement is solved | Everyone |
| [Failure Recovery Solution](requirements-solutions/failure-recovery.md) | Downtime recovery mechanism (Req #5) | Engineering, Architecture |

### 🔍 Meta Documents

| Document | Purpose | Audience |
|----------|---------|----------|
| [Brief Coverage Mapping](brief-coverage-mapping.md) | Traceability from requirements to docs | Project Management |
| [Documentation Roadmap](documentation-roadmap.md) | What's covered and what's still needed | Engineering Leadership |

---

## 🏗️ Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                    API Server (Express)                 │
│         User Management + Event Generation              │
└─────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    Database (TBD)                       │
│            Users + Events + State Tracking              │
└─────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────┐
│            Background Scheduler (Every 1 min)           │
│   Finds ready events → Executes → Updates state        │
└─────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────┐
│               External Webhook/API                      │
│           (RequestBin or similar service)               │
└─────────────────────────────────────────────────────────┘
```

### Layered Architecture

The system follows a five-layer architecture (detailed in [Architecture Design](architecture-design.md)):

1. **Event Registry** - Event type definitions & configuration
2. **Event Materialization** - Generate event instances from definitions
3. **Event Scheduler** - Time-based event selection
4. **Event Executor** - Process events & call handlers
5. **Recovery & Monitoring** - Detect & reprocess failed events

### Core Flow

1. **User Created** → Birthday event auto-generated with target UTC timestamp
2. **Scheduler Runs** (every minute) → Queries events where `targetTime <= NOW()` and `status = PENDING`
3. **Event Executed** → Webhook called, event marked `COMPLETED`, next year's event generated
4. **Failure Recovery** → On startup, catch up on any missed events

---

## 💡 How It Works

### Timezone-Aware Scheduling

When a user is created with `dateOfBirth: "1990-03-15"` and `timezone: "America/New_York"`:

1. System calculates: "9:00 AM on March 15, 2025 in America/New_York timezone"
2. Converts to UTC: `2025-03-15T14:00:00Z` (or `13:00:00Z` depending on DST)
3. Stores event with `targetTimestampUTC = 2025-03-15T14:00:00Z`
4. Scheduler queries: `WHERE targetTimestampUTC <= NOW() AND status = 'PENDING'`
5. Event executes at exactly 9:00 AM New York time

Multiple users in different timezones (Tokyo, Melbourne, London) all receive messages at their respective 9:00 AM.

### Exactly-Once Delivery

Race conditions prevented through:
- **Optimistic Locking**: Version number on each event, atomic updates
- **State Machine**: Enforce valid state transitions (PENDING → PROCESSING → COMPLETED)
- **Idempotency Keys**: External API calls tracked to prevent duplicates

### Failure Recovery

If system goes down for 24 hours:
1. On startup, query: `WHERE targetTimestampUTC < NOW() AND status = 'PENDING'`
2. Execute all missed events
3. Mark as "late execution" in logs
4. No duplicates sent (status tracking prevents re-execution)

---

## 🎯 Key Design Principles

1. **Build for Birthday, Architect for Events**
   - Phase 1 is birthday-specific, but architecture supports any event type

2. **Separation of Concerns**
   - Event Definition → Event Scheduling → Event Execution (decoupled)

3. **Immutable Events**
   - Once event is created, its schedule is fixed (snapshot user data)
   - User updates create new events, don't modify existing ones

4. **Eventual Consistency**
   - Accept slight delays (within grace period) for better scalability

5. **Fail-Safe Defaults**
   - Prefer missing a message over sending duplicates
   - Log everything for debugging

---

## 🧪 Testing Strategy

Comprehensive testing at three levels (detailed in [Architecture Design](architecture-design.md#testing-strategy)):

- **Unit Tests** - Domain entities, services, handlers, state machine
- **Integration Tests** - API endpoints, repositories, scheduler with database
- **End-to-End Tests** - Full flows, recovery scenarios, multi-timezone, race conditions

**Target**: 80%+ code coverage, 100% for critical paths

---

## 📊 Technology Stack

### Core Technologies
- **Node.js** with **TypeScript** (strict mode)
- **Express.js** for REST API
- **Luxon** for timezone handling
- **Jest** for testing

### Infrastructure
- **Database**: PostgreSQL 16 (see [Database Selection](tech-choices/database-selection.md))
- **ORM**: Prisma (type-safe, excellent DX)
- **Docker Compose** for container orchestration
- **LocalStack** not required for Phase 1 (direct PostgreSQL Docker container)

### Design Patterns Used
- Strategy (event handlers)
- Repository (data access)
- State Machine (event status)
- Factory (event creation)
- Observer (lifecycle hooks)
- Dependency Injection

---

## 📅 Development Phases

### ✅ Phase 0: Planning & Design (Complete)
- Problem definition and technical challenges documented
- Architecture designed with extensibility in mind
- Domain model and design patterns established
- Phase 1 MVP scope defined

### 🚧 Phase 1: Birthday Messaging MVP (4 weeks)
See [Phase 1 MVP Scope](phase1-mvp-scope.md) for detailed week-by-week breakdown:
- **Week 1**: Foundation (setup, LocalStack, database, basic API)
- **Week 2**: Core Scheduling (events, timezone logic, scheduler, executor)
- **Week 3**: Reliability (exactly-once delivery, retries, recovery)
- **Week 4**: Polish (user updates, testing, documentation, performance)

### 🔮 Phase 2-4: Future Enhancements
- Event extensibility (anniversary, custom events)
- Advanced features (auth, dashboard, audit trail)
- Production readiness (multi-tenancy, monitoring, performance)

---

## ⚡ Performance Targets

### Phase 1 MVP
- API Latency: < 200ms for CRUD operations
- Scheduler Throughput: 100+ events per minute
- User Capacity: Tested with 1000+ users
- Daily Events: Handle 100+ birthdays on same day

See [Phase 1 MVP Scope](phase1-mvp-scope.md#non-functional-requirements) for detailed requirements.

---

## 🚀 Coming Soon

These documents are planned but not yet created:

| Document | Purpose |
|----------|---------|
| Infrastructure Design | Docker setup, deployment model, production considerations |
| API Specification | Request/response schemas, error codes, examples |
| Security Design | PII handling, authentication, audit logging |
| Operational Guide | Deployment, monitoring, troubleshooting runbooks |

### ✅ Recently Completed
- **Database Schema** - See [Database Selection](tech-choices/database-selection.md#schema-design)
- **Database Choice** - PostgreSQL selected (see [Database Selection](tech-choices/database-selection.md))

See [Documentation Roadmap](documentation-roadmap.md) for detailed gap analysis and priorities.

---

## 🔄 Document Lifecycle

### Active Documents (Current Phase)
All documents in the "Understanding the Problem" and "Architecture & Design" sections are active and up-to-date.

### Superseded Documents
None yet - this is Phase 0 (Planning & Design).

### Archived Documents
None yet.

---

## 📝 Contributing to Documentation

### Documentation Standards
- Use Markdown format
- Include table of contents for long documents
- Add cross-references between related docs
- Keep examples concrete and runnable
- Update this guide when adding new docs

### Review Process
All documentation changes should:
1. Be reviewed for accuracy
2. Check for redundancy with existing docs
3. Update cross-references
4. Update this README if adding new docs

---

## 📧 Questions?

If you have questions about the documentation:
1. Check the [Documentation Map](#-documentation-map) above
2. Review the [Coverage Analysis](coverage-analysis.md) for known gaps
3. Consult the [Architecture Design](architecture-design.md) for technical details

---

**Last Updated**: 2025-10-17
