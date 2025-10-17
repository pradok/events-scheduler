# Technology Choices Documentation

This directory contains detailed analysis and rationale for all major technology decisions in the time-based event scheduling system.

---

## Purpose

Each document in this folder explains:
- **What** technology was chosen
- **Why** it was chosen over alternatives
- **Trade-offs** accepted
- **When to reconsider** the decision

These documents serve as:
1. **Decision records** - Historical context for future developers
2. **Learning resources** - Deep dives into why certain patterns work better
3. **Migration guides** - Understanding what would be required to change choices

---

## Documents

### [Database Selection](./database-selection.md)
**Decision:** PostgreSQL (Phase 1) over DynamoDB

**Key Topics:**
- Database access patterns ("grab N items and lock them" vs "single-item transactions")
- PostgreSQL `FOR UPDATE SKIP LOCKED` for scheduler pattern
- DynamoDB transaction limitations
- ORM comparison (Prisma vs Drizzle vs TypeORM)
- Schema design for exactly-once delivery

**Read this if you're wondering:**
- Why not use DynamoDB with LocalStack?
- How does the scheduler prevent race conditions?
- What's the difference between optimistic locking in PostgreSQL vs DynamoDB?
- Why Prisma over other ORMs?

### [Event Triggering Mechanism](./event-triggering-mechanism.md)
**Decision:** Polling/Cron (1-minute interval) over DynamoDB TTL or EventBridge

**Key Topics:**
- DynamoDB TTL limitations (48-hour imprecision, no execute-on-expiry)
- Polling pattern with `FOR UPDATE SKIP LOCKED` for atomic event claiming
- AWS EventBridge per-event rules scalability issues
- Timing precision comparison (1 minute vs 48 hours)
- Efficiency analysis (database load, cost)
- Implementation options (long-running process vs Lambda)

**Read this if you're wondering:**
- Why not use DynamoDB TTL to auto-trigger events?
- Isn't polling every minute wasteful?
- How do multiple scheduler instances avoid processing duplicates?
- What about "true" event-driven architectures?

---

## Future Documents

As the project evolves, this folder will include:

### Phase 1 Planned Documents:
- **runtime-selection.md** - Node.js + TypeScript rationale (vs Deno, Bun)
- **testing-framework.md** - Jest vs Vitest comparison
- **datetime-library.md** - Luxon vs date-fns vs Day.js for timezone handling
- **logging-strategy.md** - Winston vs Pino vs Bunyan
- **http-framework.md** - Express vs Fastify vs Hono
- **docker-setup.md** - Docker Compose configuration strategy

### Phase 2+ Planned Documents:
- **message-queue.md** - SQS vs RabbitMQ vs Redis for event queue (if needed)
- **caching-strategy.md** - Redis vs in-memory for performance optimization
- **monitoring-observability.md** - Prometheus + Grafana vs DataDog vs New Relic
- **deployment-platform.md** - AWS vs Render vs Railway vs Fly.io

---

## How to Use These Documents

### For New Developers:
1. Start with [database-selection.md](./database-selection.md) to understand the core architectural choice
2. Read the "Why X over Y" sections to understand trade-offs
3. Look at code examples to see patterns in action

### For Architecture Reviews:
1. Check **Decision Date** and **Status** sections
2. Review **Trade-offs Accepted** tables
3. Consider if assumptions still hold (scale, requirements, etc.)

### For Proposing Changes:
1. Read the existing decision document
2. Identify what has changed (scale, requirements, technology landscape)
3. Propose new analysis following the same format
4. Update **Status** to reflect new decision

---

## Document Template

When adding new technology choice documents, use this structure:

```markdown
# [Technology Category] Selection

## Requirements Analysis
- What does the system need?
- What are the constraints?

## Options Considered
- Option 1: Pros/Cons
- Option 2: Pros/Cons
- Option 3: Pros/Cons

## Decision: [Chosen Technology]
- Why this choice?
- How does it fit our needs?
- Code examples

## Trade-offs Accepted
- What are we giving up?
- What are we gaining?

## When to Reconsider
- What would trigger a re-evaluation?
- What scale/requirements would change this decision?

---
**Decision Date:** YYYY-MM-DD
**Status:** ✅ Approved / 🚧 Proposed / ❌ Rejected
**Next Review:** [When to review this decision]
```

---

## Status Legend

| Status | Meaning |
|--------|---------|
| ✅ Approved | Decision finalized, implementation can proceed |
| 🚧 Proposed | Under discussion, seeking feedback |
| ⏭️ Deferred | Decision postponed to later phase |
| ❌ Rejected | Option considered but not chosen |
| 🔄 Under Review | Re-evaluating based on new information |

---

## Contributing

When making technology choices:

1. **Research thoroughly** - Understand trade-offs, not just hype
2. **Consider Phase 1 scope** - Don't over-engineer for hypothetical scale
3. **Prioritize developer experience** - We're learning and iterating
4. **Document decisions** - Future you will thank you
5. **Stay pragmatic** - Best tool for the job, not the newest tool

---

**Last Updated:** 2025-10-17
