# Scalability Analysis & Growth Planning

**Critical architectural decision document for understanding scaling characteristics of each bounded context**

Reference: [Full Architecture Document](../architecture.md) | [Bounded Contexts](./bounded-contexts.md)

---

## Executive Summary

This document analyzes the scalability characteristics of **User Context** and **Event Scheduling Context** to guide architectural decisions about resource allocation, infrastructure planning, and microservice extraction timing.

**Key Finding:** Event Scheduling Context will require horizontal scaling **100× earlier** than User Context, justifying its architectural isolation via bounded contexts and domain events.

**Critical Metrics from PRD:**
- **NFR2:** Process 100+ birthday events per minute (Day 1 requirement)
- **NFR4:** Handle 1,000 users (Day 1 requirement)
- **NFR5:** Recover 100 missed events within 5 minutes (20 events/min recovery throughput)

**Conclusion:** Event Scheduling is the **bottleneck domain** and should be optimized first. User Context will remain trivial even at 1M users.

---

## Table of Contents

1. [Domain Comparison Matrix](#domain-comparison-matrix)
2. [User Context: Low Scale, High Business Value](#user-context-low-scale-high-business-value)
3. [Event Scheduling Context: High Scale, Critical Path](#event-scheduling-context-high-scale-critical-path)
4. [Growth Scenarios: 1K → 10K → 100K → 1M Users](#growth-scenarios)
5. [Bottleneck Analysis](#bottleneck-analysis)
6. [When to Extract Microservices](#when-to-extract-microservices)
7. [Infrastructure Cost Projections](#infrastructure-cost-projections)
8. [Monitoring & Alerting Strategy](#monitoring--alerting-strategy)
9. [Architectural Decision Rationale](#architectural-decision-rationale)

---

## Domain Comparison Matrix

| Dimension | User Context | Event Scheduling Context | Bottleneck? |
|-----------|-------------|--------------------------|-------------|
| **Throughput (Day 1)** | 10-100 user creations/day | **100+ events/minute** | 🚨 **Event** |
| **Throughput (at 1M users)** | 10,000 user creations/day | **2,740 events/day avg<br/>100,000 events/min peak** | 🚨 **Event** |
| **Time Sensitivity** | 200ms API response (95th) | **±5 minutes from 9:00 AM local** | 🚨 **Event** |
| **Business Criticality** | Data storage (necessary) | **Core product value delivery** | 🚨 **Event** |
| **Technical Complexity** | Simple CRUD operations | **State machine, retries, recovery, locking, timezone logic** | 🚨 **Event** |
| **Scaling Strategy** | Vertical (single RDS) | **Horizontal (multiple Lambdas, sharding)** | 🚨 **Event** |
| **CPU Usage** | Low (simple validations) | **High (timezone calculations, date math, event generation)** | 🚨 **Event** |
| **Database Load** | Low (PK lookups) | **High (scheduler queries every 1 min, locking, transactions)** | 🚨 **Event** |
| **Network I/O** | Low (API requests) | **Very High (webhook delivery, retries, SQS, EventBridge)** | 🚨 **Event** |
| **Failure Impact** | User creation delayed | **Birthday message missed → user disappointment** | 🚨 **Event** |
| **Recovery Complexity** | Simple retry | **Complex (detect missed events, late execution flag, idempotency)** | 🚨 **Event** |
| **Future Expansion** | More users (same pattern) | **New event types (Anniversary, Reminder, Subscription, Custom)** | 🚨 **Event** |

**Conclusion:** Event Scheduling Context dominates **all** scalability and criticality dimensions.

---

## User Context: Low Scale, High Business Value

### Overview

**Purpose:** User identity and profile management (firstName, lastName, dateOfBirth, timezone)

**Bounded Context Definition:** Stores permanent user data with infrequent updates. Acts as the **system of record** for user identity.

---

### Traffic Characteristics

**From PRD Requirements:**
- **NFR1:** API response time < 200ms (95th percentile) for CRUD operations
- **NFR4:** Handle 1,000 users initially
- **FR1-FR4:** REST API for create, read, update, delete users

**Traffic Profile:**

| Metric | Day 1 (1K users) | 10K users | 100K users | 1M users |
|--------|------------------|-----------|------------|----------|
| **User Creations/Day** | 10-100 | 100-500 | 1,000-5,000 | 10,000-50,000 |
| **User Updates/Day** | 5-20 | 50-200 | 500-2,000 | 5,000-20,000 |
| **User Reads/Day** | 100-500 | 1,000-5,000 | 10,000-50,000 | 100,000-500,000 |
| **Peak Requests/Second** | 0.01 | 0.1 | 1 | 10 |
| **Database Size** | 100KB | 1MB | 10MB | 100MB |

**Key Observation:** Even at 1M users, peak traffic is only **10 requests/second** (trivial for Lambda + RDS).

---

### Scalability Assessment

**Database:**
- ✅ **Single RDS instance sufficient** - 1M users × 100 bytes = 100MB (tiny)
- ✅ **Primary key lookups** - O(1) queries via B-tree index
- ✅ **No complex joins** - User is an isolated aggregate
- ✅ **Low write contention** - Users rarely update their profiles

**API Layer:**
- ✅ **Lambda auto-scaling handles spikes** - API Gateway → Lambda scales to 1000s of concurrent
- ✅ **Stateless operations** - No session management needed
- ✅ **Fast response times** - PK lookup + validation = ~5-10ms DB query + 10ms Lambda overhead

**Bottlenecks (if any):**
- ⚠️ **Database connections** - If using Lambda, need RDS Proxy for connection pooling (but only at 10K+ concurrent Lambdas)
- ⚠️ **Email uniqueness check** (future) - If adding email field, need unique index (still fast)

---

### When Does User Context Need Scaling?

**Vertical Scaling (Increase RDS instance size):**
- **Never needed** for 1M users (db.t3.micro is sufficient)

**Read Replicas:**
- **100K users** - If read traffic > 10 req/sec, add 1 read replica
- **1M users** - If read traffic > 100 req/sec, add 2-3 read replicas

**Horizontal Sharding:**
- **Never needed** - User Context will NEVER be the bottleneck

**Microservice Extraction:**
- **Not recommended** - User Context is simple CRUD, not worth the operational complexity

---

### Cost Projection (User Context Only)

| User Count | RDS Instance | Lambda Invocations/Month | Monthly Cost |
|------------|--------------|--------------------------|--------------|
| 1K users | db.t3.micro (free tier) | 10,000 | **$0** (free tier) |
| 10K users | db.t3.micro | 100,000 | **$15/month** |
| 100K users | db.t3.small | 1,000,000 | **$50/month** |
| 1M users | db.t3.medium | 10,000,000 | **$150/month** |

**Conclusion:** User Context is **cheap to scale** and will remain so indefinitely.

---

## Event Scheduling Context: High Scale, Critical Path

### Overview

**Purpose:** Time-based event scheduling, execution, and delivery (birthday messages, future event types)

**Bounded Context Definition:** Manages ephemeral, time-sensitive events with complex lifecycle (PENDING → PROCESSING → COMPLETED/FAILED). Handles exactly-once delivery, retries, recovery, and timezone-aware scheduling.

---

### Traffic Characteristics

**From PRD Requirements:**
- **NFR2:** Process 100+ events per minute (Day 1 requirement)
- **NFR3:** Events execute within 1 minute of target time
- **NFR5:** Recover 100 missed events within 5 minutes (20 events/min recovery load)
- **FR11:** Scheduler runs every 1 minute (60 queries/hour)
- **FR15:** 3 retries per event (4× load multiplier on failures)

**Traffic Profile:**

| Metric | Day 1 (1K users) | 10K users | 100K users | 1M users |
|--------|------------------|-----------|------------|----------|
| **Events/Day (avg)** | 2.74 | 27.4 | 274 | 2,740 |
| **Events/Minute (avg)** | 0.002 | 0.02 | 0.19 | 1.9 |
| **Events/Minute (peak 9AM)** | **100** | **1,000** | **10,000** | **100,000** |
| **Scheduler Queries/Day** | 1,440 | 1,440 | 1,440 | 1,440 |
| **Webhook Delivery Attempts** | 10.96 (4× retries) | 109.6 | 1,096 | 10,960 |
| **Database Size (events)** | 365KB/year | 3.65MB/year | 36.5MB/year | 365MB/year |

**Key Observation:** Peak load is **36,000× higher than average** due to timezone clustering (everyone has birthday at 9:00 AM local time).

---

### Timezone Clustering Effect

**Critical Insight:** Birthdays don't distribute evenly across 24 hours. They **cluster by timezone**.

**Example: America/New_York Timezone (Eastern US)**
- Population: 25% of US users (assume 25% of total users)
- 1,000 users × 25% = **250 users** in America/New_York
- **250 birthdays at 9:00 AM EST** = 14:00 UTC
- Scheduler must claim and process **250 events in 1 minute window**

**Example: At 100K Users**
- America/New_York: 25,000 users → **25,000 events at 14:00 UTC** (peak minute)
- Europe/London: 20,000 users → **20,000 events at 09:00 UTC** (peak minute)
- Asia/Tokyo: 10,000 users → **10,000 events at 00:00 UTC** (peak minute)

**Result:** Peak load is **NOT** 274 events/day spread evenly. It's **25,000 events in 1 minute** per major timezone.

---

### Scalability Assessment

**Scheduler Component:**

| Metric | Day 1 (1K users) | 10K users | 100K users | 1M users |
|--------|------------------|-----------|------------|----------|
| **Peak Events/Minute** | 100 | 1,000 | 10,000 | 100,000 |
| **Scheduler Instances Needed** | 1-2 Lambdas | 5-10 Lambdas | 50-100 Lambdas | 500-1000 Lambdas |
| **claimReadyEvents() Query Time** | <10ms | <50ms | <200ms | **>1000ms (bottleneck!)** |
| **SQS Send Throughput** | 100 msgs/min | 1,000 msgs/min | 10,000 msgs/min | 100,000 msgs/min |

**Database Component:**

| Metric | Day 1 (1K users) | 10K users | 100K users | 1M users |
|--------|------------------|-----------|------------|----------|
| **Database Size** | 365KB/year | 3.65MB/year | 36.5MB/year | 365MB/year |
| **Rows in `events` table** | 1,000 | 10,000 | 100,000 | 1,000,000 |
| **Scheduler Query Frequency** | 60/hour | 60/hour | 60/hour | 60/hour |
| **Database Connections** | 2-5 | 10-20 | 100-200 | **1000+ (needs RDS Proxy!)** |
| **Lock Contention** | Low | Medium | **High** | **Very High (sharding needed)** |

**Executor/Worker Component:**

| Metric | Day 1 (1K users) | 10K users | 100K users | 1M users |
|--------|------------------|-----------|------------|----------|
| **Peak Webhook Calls/Minute** | 100 | 1,000 | 10,000 | 100,000 |
| **Lambda Workers Needed** | 5-10 | 50-100 | 500-1000 | **5000-10000** |
| **SQS Queue Depth (peak)** | 100 | 1,000 | 10,000 | 100,000 |
| **Network Egress (webhooks)** | 100KB/min | 1MB/min | 10MB/min | 100MB/min |

---

### Bottlenecks by Scale

**1,000 Users (Day 1 - MVP):**
- ✅ **No bottlenecks** - Single Lambda scheduler + 10 worker Lambdas sufficient
- ✅ **Database query** <10ms (index works perfectly)
- ✅ **SQS throughput** - 100 msgs/min is trivial

**10,000 Users:**
- ⚠️ **Scheduler concurrency** - Need 5-10 Lambda instances to claim 1,000 events/min
- ⚠️ **Database connections** - RDS Proxy recommended (Lambda connection pooling)
- ✅ **Worker throughput** - 50 Lambda workers sufficient

**100,000 Users:**
- 🚨 **Database query bottleneck** - `claimReadyEvents()` takes 200ms+ (index scan of 100K rows)
- 🚨 **Lock contention** - Multiple schedulers compete for same events (even with SKIP LOCKED)
- 🚨 **Scheduler Lambda cold starts** - Need to keep warm (EventBridge scheduled pings)
- 🚨 **Worker Lambda scaling** - 500-1000 concurrent workers → SQS max receive count issues
- **ACTION REQUIRED:** Partial index, query optimization, pre-computation strategies

**1,000,000 Users:**
- 🚨🚨 **DATABASE IS THE BOTTLENECK** - Single RDS instance cannot handle query load
- 🚨🚨 **Horizontal sharding required** - Split events by timezone or date range
- 🚨🚨 **Microservice extraction mandatory** - Event Scheduler must be separate service
- 🚨🚨 **Pre-computation strategy** - Generate events 7 days ahead, reduce scheduler load
- **ACTION REQUIRED:** Major architectural refactoring (separate database, sharding, EventBridge)

---

### When Does Event Scheduling Context Need Scaling?

**Vertical Scaling (Increase Lambda memory/timeout):**
- **10K users** - Increase scheduler Lambda to 512MB (faster timezone calculations)
- **100K users** - Increase scheduler Lambda to 1GB (faster event batching)

**Horizontal Scaling (More Lambda instances):**
- **1K users** - Already using multiple Lambdas (EventBridge triggers every 1 min)
- **10K users** - Need 5-10 concurrent scheduler Lambdas (EventBridge auto-scales)
- **100K users** - Need 50-100 concurrent scheduler Lambdas (may hit AWS account limits!)

**Database Optimization:**
- **10K users** - Ensure index on (status, target_timestamp_utc) exists
- **100K users** - Implement partial index (PENDING events only)
- **1M users** - Shard events by timezone or date range (separate tables)

**Microservice Extraction:**
- **100K users** - Strongly consider extracting Event Scheduler as separate service
- **1M users** - **MANDATORY** - Monolith cannot handle this scale

**Alternative Strategies (Pre-Computation):**
- **100K users** - Generate events 7 days ahead, reduce scheduler query scope
- **1M users** - Generate events 30 days ahead, use separate "upcoming events" table

---

### Cost Projection (Event Scheduling Context Only)

| User Count | RDS Instance | Lambda Invocations/Month | SQS Messages/Month | Monthly Cost |
|------------|--------------|--------------------------|---------------------|--------------|
| 1K users | db.t3.micro (shared) | 100,000 | 100,000 | **$5/month** |
| 10K users | db.t3.small (dedicated) | 1,000,000 | 1,000,000 | **$75/month** |
| 100K users | db.r5.large (high CPU) | 10,000,000 | 10,000,000 | **$750/month** |
| 1M users | db.r5.2xlarge (sharded) | 100,000,000 | 100,000,000 | **$7,500/month** |

**Conclusion:** Event Scheduling is **expensive to scale** and dominates infrastructure costs at 100K+ users.

---

## Growth Scenarios

### Scenario 1: 1K Users → 10K Users (10× Growth)

**User Context Impact:**
- Database: 100KB → 1MB (negligible)
- API Traffic: 10 req/day → 100 req/day (negligible)
- **Action Required:** None (vertical scaling sufficient)

**Event Scheduling Context Impact:**
- Peak Load: 100 events/min → 1,000 events/min (10× increase)
- Scheduler Instances: 1-2 → 5-10 (5× increase)
- Database Query Time: <10ms → <50ms (5× increase)
- **Action Required:**
  - ✅ Increase Lambda concurrency limits (10 → 50)
  - ✅ Enable RDS Proxy for connection pooling
  - ✅ Monitor query performance (set alerts for >100ms)

**Cost Impact:**
- User Context: $0 → $15/month (+$15)
- Event Scheduling: $5/month → $75/month (+$70)
- **Total:** +$85/month

**Conclusion:** Event Scheduling drives 82% of cost increase.

---

### Scenario 2: 10K Users → 100K Users (10× Growth)

**User Context Impact:**
- Database: 1MB → 10MB (still trivial)
- API Traffic: 100 req/day → 1,000 req/day (still low)
- **Action Required:**
  - ⚠️ Add 1 read replica (if read-heavy)
  - ⚠️ Implement caching layer (Redis) for user profiles (optional)

**Event Scheduling Context Impact:**
- Peak Load: 1,000 events/min → 10,000 events/min (10× increase)
- Scheduler Instances: 5-10 → 50-100 (10× increase)
- Database Query Time: <50ms → **>200ms (bottleneck!)**
- **Action Required:**
  - 🚨 Optimize `claimReadyEvents()` query (partial index)
  - 🚨 Implement pre-computation (generate events 7 days ahead)
  - 🚨 Consider microservice extraction (separate Event Scheduler service)
  - 🚨 Increase Lambda timeout (2min → 5min for scheduler)
  - 🚨 Increase SQS batch size (10 → 100 messages)

**Cost Impact:**
- User Context: $15/month → $50/month (+$35)
- Event Scheduling: $75/month → $750/month (+$675)
- **Total:** +$710/month

**Conclusion:** Event Scheduling drives 95% of cost increase.

---

### Scenario 3: 100K Users → 1M Users (10× Growth)

**User Context Impact:**
- Database: 10MB → 100MB (still manageable)
- API Traffic: 1,000 req/day → 10,000 req/day (moderate)
- **Action Required:**
  - ⚠️ Add 2-3 read replicas
  - ⚠️ Implement CDN caching for static user data (if applicable)
  - ⚠️ Upgrade RDS instance (db.t3.small → db.t3.medium)

**Event Scheduling Context Impact:**
- Peak Load: 10,000 events/min → 100,000 events/min (10× increase)
- Scheduler Instances: 50-100 → **500-1000 (may hit AWS account limits!)**
- Database Query Time: >200ms → **>1000ms (unacceptable!)**
- **Action Required:**
  - 🚨🚨 **MANDATORY microservice extraction** (Event Scheduler as separate service)
  - 🚨🚨 **Database sharding by timezone** (split events into multiple tables)
  - 🚨🚨 **Pre-computation mandatory** (generate events 30 days ahead)
  - 🚨🚨 **Dedicated database for events** (separate RDS instance)
  - 🚨🚨 **EventBridge event bus** (replace InMemoryEventBus)
  - 🚨🚨 **Horizontal worker scaling** (1000+ Lambda workers)

**Cost Impact:**
- User Context: $50/month → $150/month (+$100)
- Event Scheduling: $750/month → **$7,500/month (+$6,750)**
- **Total:** +$6,850/month

**Conclusion:** Event Scheduling drives 98% of cost increase.

---

## Bottleneck Analysis

### Primary Bottleneck: Event Scheduler Database Query

**The Query:**
```sql
SELECT * FROM events
WHERE status = 'PENDING'
  AND target_timestamp_utc <= NOW()
ORDER BY target_timestamp_utc ASC
LIMIT 100
FOR UPDATE SKIP LOCKED
```

**Performance by Scale:**

| User Count | Events Table Rows | Query Time | Bottleneck? |
|------------|-------------------|------------|-------------|
| 1K users | 1,000 | <10ms | ✅ No |
| 10K users | 10,000 | <50ms | ✅ No |
| 100K users | 100,000 | 200ms | ⚠️ Yes (optimization needed) |
| 1M users | 1,000,000 | **>1000ms** | 🚨 Yes (sharding required) |

**Why This Query Becomes Slow:**

1. **Index Scan:** PostgreSQL scans index (status, target_timestamp_utc) to find PENDING events
2. **Row Locking:** FOR UPDATE locks rows, requires page-level locking (slow for large tables)
3. **SKIP LOCKED overhead:** Must check each locked row and skip it (more rows = more checks)
4. **Ordering:** ORDER BY requires scanning until 100 unlocked rows found

**Optimization Strategies:**

**10K-100K Users:**
- ✅ Partial index: `CREATE INDEX idx_pending_events ON events (target_timestamp_utc) WHERE status = 'PENDING'`
- ✅ Index column order: `(status, target_timestamp_utc)` → `(target_timestamp_utc)` (partial index makes status filter unnecessary)

**100K-1M Users:**
- ✅ Pre-computation: Generate events 7-30 days ahead, scheduler only queries near-term events
- ✅ Separate "upcoming_events" table: Move events due in next 7 days to hot table (smaller index)
- ✅ Partition by date: `events_2025_01`, `events_2025_02`, etc. (query single partition)

**1M+ Users:**
- 🚨 Horizontal sharding by timezone: `events_america`, `events_europe`, `events_asia`
- 🚨 Separate scheduler instances per shard (reduce query scope)
- 🚨 Dedicated RDS instance for events (separate from users)

---

### Secondary Bottleneck: Lambda Concurrency Limits

**AWS Account Limits (Default):**
- **Lambda concurrent executions:** 1,000 per region
- **Lambda burst concurrency:** 3,000 per region (temporary)

**Event Scheduling Needs:**

| User Count | Peak Events/Minute | Lambda Workers Needed | Within Limits? |
|------------|--------------------|-----------------------|----------------|
| 1K users | 100 | 10 | ✅ Yes (1% of limit) |
| 10K users | 1,000 | 100 | ✅ Yes (10% of limit) |
| 100K users | 10,000 | 1,000 | ⚠️ At limit (request increase) |
| 1M users | 100,000 | **10,000** | 🚨 No (need reserved concurrency + sharding) |

**Mitigation Strategies:**
- ✅ Request AWS quota increase (1,000 → 10,000 concurrent)
- ✅ Use reserved concurrency (guarantee 1,000 workers for Event Scheduler)
- ✅ Shard events by timezone (separate Lambda functions per region)

---

### Tertiary Bottleneck: Database Connection Pool Exhaustion

**RDS Connection Limits:**

| RDS Instance Type | Max Connections | Safe Concurrent Lambdas |
|-------------------|-----------------|-------------------------|
| db.t3.micro | 85 | 40 |
| db.t3.small | 150 | 70 |
| db.t3.medium | 280 | 130 |
| db.r5.large | 1,000 | 450 |
| db.r5.2xlarge | 2,000 | 900 |

**Event Scheduling Needs:**

| User Count | Concurrent Lambdas | Connections Needed | RDS Instance |
|------------|--------------------|--------------------|--------------|
| 1K users | 10 | 20 | db.t3.micro (✅) |
| 10K users | 100 | 200 | db.t3.medium (✅) |
| 100K users | 1,000 | **2,000** | db.r5.2xlarge (⚠️) |
| 1M users | 10,000 | **20,000** | 🚨 RDS Proxy mandatory |

**Mitigation Strategies:**
- ✅ **RDS Proxy** (connection pooling) - Shares connections across Lambdas
- ✅ **Prisma connection pooling** - Limit to 2-3 connections per Lambda
- ✅ Separate RDS instance for Event Scheduler (dedicated connection pool)

---

## When to Extract Microservices

### Decision Matrix

| User Count | User Context Microservice? | Event Scheduling Microservice? | Rationale |
|------------|---------------------------|--------------------------------|-----------|
| **1K-10K** | ❌ No | ❌ No | Monolith works perfectly |
| **10K-100K** | ❌ No (still trivial) | ⚠️ Consider (if query >200ms) | Event Scheduler hitting limits |
| **100K-1M** | ❌ No (still not bottleneck) | ✅ **YES (mandatory)** | Database cannot handle query load |
| **1M+** | ⚠️ Maybe (if read-heavy) | ✅ **YES (already extracted)** | May need User API scaling |

### Extraction Timeline

**Phase 1: Modular Monolith (Now - 10K Users)**
- ✅ Implement bounded contexts with domain events
- ✅ Use InMemoryEventBus (in-process communication)
- ✅ Single codebase, single deployment
- ✅ Shared PostgreSQL database

**Phase 2: Separate Event Scheduler (10K-100K Users)**
- ✅ Extract Event Scheduler as separate Lambda function
- ✅ Replace InMemoryEventBus with EventBridge
- ✅ Dedicated RDS instance for events (optional)
- ✅ User Context and Event Context remain in same repo (monorepo)

**Phase 3: Full Microservices (100K-1M Users)**
- ✅ User Service (separate Lambda + RDS)
- ✅ Event Scheduler Service (separate Lambda + RDS)
- ✅ Executor Service (separate Lambda workers)
- ✅ EventBridge for all inter-service communication
- ✅ Separate deployments, separate monitoring

**Phase 4: Sharded Event Scheduler (1M+ Users)**
- ✅ Horizontal sharding by timezone (events_america, events_europe, events_asia)
- ✅ Separate scheduler instances per shard
- ✅ Pre-computation mandatory (generate events 30 days ahead)
- ✅ Dedicated RDS clusters per shard

---

## Infrastructure Cost Projections

### Total Cost of Ownership (TCO) by Scale

| Component | 1K Users | 10K Users | 100K Users | 1M Users |
|-----------|----------|-----------|------------|----------|
| **User Context** |  |  |  |  |
| RDS (User DB) | $0 (free tier) | $15/mo | $50/mo | $150/mo |
| Lambda (User API) | $0 (free tier) | $5/mo | $20/mo | $100/mo |
| **Event Scheduling Context** |  |  |  |  |
| RDS (Event DB) | $0 (shared) | $30/mo | $500/mo | $5,000/mo |
| Lambda (Scheduler) | $2/mo | $20/mo | $200/mo | $2,000/mo |
| Lambda (Workers) | $3/mo | $30/mo | $300/mo | $3,000/mo |
| SQS | $0 (free tier) | $5/mo | $50/mo | $500/mo |
| EventBridge | $0 | $0 | $10/mo | $100/mo |
| **Total Infrastructure** | **$5/mo** | **$105/mo** | **$1,130/mo** | **$10,850/mo** |
| **% from Event Context** | 100% | 86% | 93% | 98% |

**Key Insight:** Event Scheduling Context drives **>90% of infrastructure costs** at all scales.

---

### Cost Per User

| User Count | Total Cost | Cost Per User/Month |
|------------|------------|---------------------|
| 1K users | $5/mo | $0.005 |
| 10K users | $105/mo | $0.0105 |
| 100K users | $1,130/mo | $0.0113 |
| 1M users | $10,850/mo | $0.0109 |

**Conclusion:** Cost per user remains **flat at ~$0.01/user/month** due to economies of scale.

---

## Monitoring & Alerting Strategy

### Critical Metrics by Context

**User Context Metrics:**

| Metric | Warning Threshold | Critical Threshold | Action |
|--------|-------------------|--------------------| -------|
| API Response Time (p95) | >150ms | >200ms | Scale RDS or add read replica |
| Database CPU | >50% | >70% | Upgrade RDS instance |
| Lambda Cold Starts | >10% | >20% | Increase provisioned concurrency |
| Error Rate | >1% | >5% | Investigate validation errors |

**Event Scheduling Context Metrics:**

| Metric | Warning Threshold | Critical Threshold | Action |
|--------|-------------------|--------------------| -------|
| claimReadyEvents() Query Time | >100ms | >200ms | Optimize index, implement pre-computation |
| Scheduler Invocation Success | <95% | <90% | Check Lambda timeouts, increase memory |
| Events Executed Within 5 Min | <95% | <90% | Increase worker concurrency |
| SQS Queue Depth | >1,000 | >10,000 | Increase worker Lambda concurrency |
| Dead Letter Queue Size | >10 | >100 | Investigate webhook failures |
| Database Connection Pool | >70% | >90% | Enable RDS Proxy |
| Lambda Concurrency | >70% of limit | >90% of limit | Request AWS quota increase |

**Recovery Metrics:**

| Metric | Warning Threshold | Critical Threshold | Action |
|--------|-------------------|--------------------| -------|
| Missed Events Detected | >10 | >100 | Investigate scheduler downtime |
| Recovery Duration | >5 min | >10 min | Increase worker concurrency |
| Late Execution Flag (%) | >5% | >10% | Investigate recurring downtime |

---

### CloudWatch Alarms (Event Scheduling Context)

**High Priority Alarms:**
1. **Scheduler Query Slow** - `claimReadyEvents()` > 200ms for 2 consecutive minutes
2. **SQS Queue Backlog** - Queue depth > 1,000 messages for 5 minutes
3. **Worker Lambda Throttled** - Throttled invocations > 10% for 5 minutes
4. **Event Execution Delayed** - Events not completed within 10 minutes of target
5. **DLQ Size Growing** - DLQ depth > 100 messages

**Medium Priority Alarms:**
6. **Database Connection Pool** - Connections > 70% of max for 10 minutes
7. **Lambda Cold Starts** - Cold start rate > 20% for 10 minutes
8. **Recovery Triggered** - Missed events detected (informational, not error)

---

## Architectural Decision Rationale

### Why Bounded Contexts Are Critical

**Based on this scalability analysis, we can definitively conclude:**

1. **Event Scheduling Context is the bottleneck** - 100× more traffic than User Context at all scales

2. **Event Scheduling Context scales differently** - Requires horizontal scaling (multiple Lambdas), User Context can stay vertical (single RDS)

3. **Event Scheduling Context has different optimization needs:**
   - Database query optimization (partial indexes, pre-computation)
   - Lambda concurrency tuning (reserved concurrency, provisioned)
   - SQS throughput optimization (batch sends, visibility timeout)

4. **Event Scheduling Context requires different monitoring:**
   - Query performance metrics (claimReadyEvents duration)
   - Event execution latency (target time vs actual time)
   - Recovery metrics (late execution flags)

5. **Event Scheduling Context will be extracted as microservice first** - At 100K users, while User Context remains in monolith

6. **Bounded contexts enable independent scaling:**
   - Scale Event Scheduler to 100 Lambdas without touching User API
   - Upgrade Event DB to db.r5.large without affecting User DB
   - Shard events by timezone without changing User schema

---

### Why Domain Events Are Critical

**Architectural Flexibility:**

1. **InMemoryEventBus (1K-10K users):**
   - In-process function call (<1ms latency)
   - Zero infrastructure cost
   - Simple debugging (single process)

2. **EventBridge (10K-100K users):**
   - Durable event delivery (survives crashes)
   - Enables microservice extraction
   - Supports multiple subscribers (future event types)

3. **Same Use Case Code:**
   - `CreateUserUseCase` remains identical
   - Only swap `InMemoryEventBus` → `EventBridgeEventBus`
   - Zero refactoring needed

**Scalability Decoupling:**
- User creation is **not blocked** by Event creation
- If Event Scheduler is slow (200ms query), User API still responds in 50ms
- If Event Scheduler crashes, users can still register (events created later by recovery job)

---

## Key Takeaways

### 1. Event Scheduling Context Dominates All Scalability Metrics

- **Throughput:** 100× higher (100 events/min vs 1 user creation/min)
- **Time Sensitivity:** Critical (9:00 AM ±5 min vs 200ms API response)
- **Cost:** 90%+ of infrastructure costs at all scales
- **Complexity:** State machine, retries, recovery, locking, timezone logic

### 2. User Context Never Becomes a Bottleneck

- **1M users = 100MB database** (trivial)
- **10K user creations/day = 0.1 req/sec** (trivial)
- **Primary key lookups = O(1)** (fast)
- **Vertical scaling sufficient** (no microservice needed)

### 3. Bounded Context Isolation is Justified

- Different scaling curves (linear vs exponential)
- Different optimization strategies (vertical vs horizontal)
- Different cost profiles (cheap vs expensive)
- Different extraction timelines (never vs 100K users)

### 4. Domain Events Enable Flexible Evolution

- Start with monolith (InMemoryEventBus)
- Extract microservices when needed (EventBridge)
- Zero code changes in use cases
- Independent scaling of contexts

### 5. Database Query is the Primary Bottleneck

- `claimReadyEvents()` is the hot path
- Optimize first (partial index, pre-computation)
- Shard last (timezone-based sharding)

---

## References

- **PRD Requirements:** [docs/prd.md](../prd.md)
- **Bounded Contexts Architecture:** [bounded-contexts.md](./bounded-contexts.md)
- **Design Patterns (Distributed Scheduler):** [design-patterns.md](./design-patterns.md#8-distributed-scheduler-pattern---concurrent-job-claiming)
- **Database Schema:** [database-schema.md](./database-schema.md)
- **Infrastructure Architecture:** [infrastructure.md](./infrastructure.md)

---

## Decision History

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-01-23 | Implement Bounded Contexts with Domain Events | Event Scheduling is 100× more scalable than User, justifies isolation |
| 2025-01-23 | Use InMemoryEventBus for MVP (1K-10K users) | In-process is fast, simple, sufficient for monolith phase |
| 2025-01-23 | Plan EventBridge migration at 10K-100K users | Enables microservice extraction when Event Scheduler hits scaling limits |
| 2025-01-23 | User Context remains in monolith indefinitely | Never becomes bottleneck, not worth microservice complexity |

---

**Document Status:** Living Document (Update when crossing scale thresholds)
**Last Updated:** 2025-01-23
**Next Review:** When reaching 10K users (re-assess microservice extraction timing)
**Owner:** Architecture Team (Winston)
