# Scaling to 1M Users - Infrastructure Analysis & Recommendations

**Author:** System Architecture Team
**Date:** 2025-10-31
**Status:** Planning Document
**Related:** [Infrastructure](infrastructure.md) | [Workflows](workflows.md) | [Design Patterns](design-patterns.md)

---

## Executive Summary

This document analyzes the current infrastructure architecture with focus on queues, messaging, and event processing, then provides detailed recommendations for scaling to **1 million users** with **multiple event types** (birthdays, anniversaries, reminders, notifications).

**Current State:** Phase 1 (Local Development)
- Single PostgreSQL database
- LocalStack SQS queue
- 2 Lambda functions (Scheduler + Worker)
- EventBridge trigger (1 minute interval)

**Target State:** 1M+ users, multiple event types
- Distributed database architecture
- Multi-queue system with prioritization
- Horizontal scaling for all components
- Enhanced monitoring and observability

---

## Table of Contents

1. [Current Infrastructure Overview](#current-infrastructure-overview)
2. [Queue Architecture Analysis](#queue-architecture-analysis)
3. [Scalability Constraints & Bottlenecks](#scalability-constraints--bottlenecks)
4. [Scaling to 1M Users - Requirements](#scaling-to-1m-users---requirements)
5. [Infrastructure Changes Required](#infrastructure-changes-required)
6. [Queue Architecture for Scale](#queue-architecture-for-scale)
7. [SNS Fan-Out Pattern - When and How to Use](#sns-fan-out-pattern---when-and-how-to-use)
8. [Database Scaling Strategy](#database-scaling-strategy)
9. [Lambda & Compute Scaling](#lambda--compute-scaling)
10. [Cost Analysis](#cost-analysis)
11. [Migration Path](#migration-path)
12. [Monitoring & Observability](#monitoring--observability)

---

## Current Infrastructure Overview

### Components

```text
┌─────────────────────────────────────────────────────────────────────┐
│                    Current Architecture (Phase 1)                    │
└─────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────┐
                    │   EventBridge    │
                    │   (1 min rate)   │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  Scheduler Lambda │
                    │   (512 MB RAM)    │
                    │  Claim 100 events │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │   PostgreSQL     │
                    │   (16.1)         │
                    │   Single Instance│
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  SQS Queue       │
                    │  bday-events-queue│
                    │  Batch: 10       │
                    │  DLQ: Yes        │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  Worker Lambda   │
                    │   (512 MB RAM)   │
                    │  Process & Deliver│
                    └──────────────────┘
```

### Current Queue Configuration

**Main Queue: `bday-events-queue`**
- Type: Standard SQS (unordered, at-least-once delivery)
- Visibility Timeout: 30 seconds
- Message Retention: 24 hours (86400 seconds)
- Dead Letter Queue: Yes (maxReceiveCount: 3)
- Batch Size: 10 messages per Lambda invocation

**Dead Letter Queue: `bday-events-dlq`**
- Message Retention: 14 days (1209600 seconds)
- Purpose: Store failed events after 3 retry attempts

### Current Event Flow

1. **EventBridge** triggers Scheduler Lambda every 1 minute
2. **Scheduler Lambda** claims up to 100 PENDING events using `FOR UPDATE SKIP LOCKED`
3. Events are sent to **SQS queue** (`bday-events-queue`)
4. **Worker Lambda** is triggered by SQS (batch of 10 messages)
5. Worker processes events and delivers to webhook endpoints
6. Failed events (after 3 retries) move to **DLQ**

### Current Capacity

**Theoretical Throughput:**
- Scheduler runs: 60 times/hour
- Events per run: 100
- **Max events/hour: 6,000**
- **Max events/day: 144,000**

**Actual Throughput (with concurrency):**
- If Scheduler Lambda can run 10 concurrent instances: **60,000 events/hour**
- Worker Lambda auto-scales based on SQS queue depth

---

## Queue Architecture Analysis

### SQS Queue Characteristics

**Advantages:**
- ✅ Fully managed (no infrastructure maintenance)
- ✅ Auto-scaling (handles millions of messages)
- ✅ At-least-once delivery guarantee
- ✅ Built-in retry logic (visibility timeout)
- ✅ Dead Letter Queue support
- ✅ Cost-effective ($0.40 per million requests after free tier)

**Limitations:**
- ⚠️ Standard queue: No ordering guarantees
- ⚠️ FIFO queue: Limited throughput (300 TPS with batching, 3000 TPS with high-throughput mode)
- ⚠️ No priority queues (all messages equal priority)
- ⚠️ Visibility timeout-based retry (can lead to delays)

### Current Queue Metrics (Estimated for 10K Users)

```text
Scenario: 10,000 users, 1 birthday event per user per year

Daily Events: 10,000 / 365 ≈ 27 events/day
Peak Load (Birthday clusters): 100-200 events/hour
Queue Depth (average): < 10 messages
Queue Depth (peak): < 50 messages
```

**Verdict:** Current single-queue architecture is **sufficient for current scale** (10K-50K users).

---

## Scalability Constraints & Bottlenecks

### 1. Database Bottlenecks

**Problem: Single PostgreSQL Instance**

Current Configuration:
- Single RDS instance (no read replicas)
- Connection limit: ~100 connections (default for t3.micro)
- CPU/Memory: Limited by instance size

**At 1M Users:**
- Daily events: 1,000,000 / 365 ≈ **2,740 events/day**
- Peak hour (birthday clusters): **500-1,000 events/hour**
- Peak minute: **15-30 events/minute**

**Bottlenecks:**
- ❌ Connection exhaustion (100 connections for all Lambdas)
- ❌ Write contention on `events` table (high INSERT rate)
- ❌ Index maintenance overhead (5 indexes on `events` table)
- ❌ No read replicas (all queries hit primary)

**Impact: CRITICAL** - Database will become bottleneck at 100K+ users

---

### 2. Lambda Concurrency Limits

**Problem: AWS Account Limits**

Current Limits:
- Regional Lambda concurrency: 1,000 (default, can be increased)
- Per-function reserved concurrency: None configured

**At 1M Users:**
- Scheduler Lambda: 10-20 concurrent instances (OK)
- Worker Lambda: **300-500 concurrent instances** (approaching limit)

**Bottlenecks:**
- ❌ Worker Lambda may hit concurrency limits during peak hours
- ❌ Cold starts increase latency (2-3 seconds per cold start)
- ❌ No reserved concurrency = potential throttling

**Impact: HIGH** - Will cause throttling and increased latency at 500K+ users

---

### 3. Single Queue Limitation

**Problem: No Priority Differentiation**

Current Design:
- Single queue for ALL event types (birthday, anniversary, reminder)
- FIFO processing (no priority)
- All events treated equally

**At 1M Users with Multiple Event Types:**
- Birthday events: 2,740/day
- Anniversary events: 2,740/day
- Reminders (custom): 5,000-10,000/day
- Notifications (transactional): 50,000-100,000/day

**Total daily events: ~60,000-120,000**

**Bottlenecks:**
- ❌ High-priority events (birthday) blocked by low-priority (notifications)
- ❌ No SLA differentiation (all events have same delivery guarantee)
- ❌ DLQ treats all event types the same (no separate failure handling)

**Impact: MEDIUM** - Affects user experience, not system stability

---

### 4. EventBridge Scheduler Frequency

**Problem: Fixed 1-Minute Interval**

Current Design:
- EventBridge triggers Scheduler Lambda every 1 minute
- 100 events claimed per run
- Total capacity: **6,000 events/hour** (single instance)

**At 1M Users:**
- Peak hour: 1,000 events
- With 10 concurrent schedulers: 10,000 events/hour capacity

**Bottlenecks:**
- ⚠️ EventBridge has 5-minute minimum for cron expressions
- ⚠️ 1-minute rate rule is at minimum frequency
- ⚠️ Cannot increase frequency further

**Impact: LOW** - Can scale horizontally with concurrency

---

### 5. Webhook Delivery Performance

**Problem: External API Dependencies**

Current Design:
- Worker Lambda waits for webhook response (blocking)
- Timeout: 60 seconds
- No circuit breaker for failing endpoints

**At 1M Users:**
- External API failures impact throughput
- Slow webhooks (2-5 seconds) reduce Lambda efficiency
- No bulkhead pattern (one slow endpoint affects all)

**Bottlenecks:**
- ❌ Blocking I/O reduces throughput
- ❌ No circuit breaker = wasted retries on failing endpoints
- ❌ No webhook performance monitoring

**Impact: MEDIUM** - Affects cost and reliability

---

## Scaling to 1M Users - Requirements

### Volume Projections

**1 Million Users - Event Volume:**

| Event Type | Events/User/Year | Total Events/Year | Daily Average | Peak Hour |
|-----------|------------------|-------------------|---------------|-----------|
| Birthday | 1 | 1,000,000 | 2,740 | 500-1,000 |
| Anniversary | 1 | 1,000,000 | 2,740 | 300-500 |
| Reminder (avg) | 3 | 3,000,000 | 8,220 | 1,000-2,000 |
| Notification | 50 | 50,000,000 | 137,000 | 10,000-20,000 |

**Total:**
- **55M events/year**
- **~150,000 events/day**
- **~6,250 events/hour** (average)
- **~15,000-25,000 events/hour** (peak)

### Performance Requirements

**Latency:**
- Event claiming: < 1 second (database query)
- Queue processing: < 5 seconds (SQS → Lambda)
- Webhook delivery: < 10 seconds (external API)
- End-to-end latency: **< 30 seconds from targetTimestampUTC**

**Availability:**
- System uptime: **99.9%** (8.76 hours downtime/year)
- Database availability: **99.95%** (RDS Multi-AZ)
- Queue availability: **99.9%** (SQS SLA)

**Data Durability:**
- Event data: **99.999999999%** (RDS backups + replication)
- Queue messages: **99.9%** (SQS durability)

---

## Infrastructure Changes Required

### Summary of Changes

| Component | Current | Target (1M Users) | Change |
|-----------|---------|-------------------|--------|
| **Database** | Single PostgreSQL | Multi-AZ Primary + 2 Read Replicas | Add replicas + RDS Proxy |
| **SQS Queues** | 1 queue | 4 queues (priority-based) | Multi-queue architecture |
| **Scheduler Lambda** | 512 MB, no reserved concurrency | 1024 MB, reserved 20 | Increase memory + reserve |
| **Worker Lambda** | 512 MB, no reserved concurrency | 1024 MB, reserved 500 | Increase memory + reserve |
| **EventBridge** | 1 rule (1 min) | 1 rule (1 min) | No change |
| **RDS Proxy** | None | Required | Add connection pooling |
| **Monitoring** | Basic CloudWatch | Enhanced monitoring + alarms | Add custom metrics |
| **Caching** | None | Redis/ElastiCache | Add for user/event data |

---

## Queue Architecture for Scale

### Multi-Queue Strategy

**Problem:** Single queue treats all events equally, no priority differentiation.

**Solution:** Priority-based queue architecture with separate queues for different event types.

```text
┌─────────────────────────────────────────────────────────────────────┐
│              Multi-Queue Architecture (1M+ Users)                    │
└─────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────┐
                    │   EventBridge    │
                    │   (1 min rate)   │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  Scheduler Lambda │
                    │   Concurrency: 20 │
                    │  Claim 100 events │
                    └────┬───┬───┬───┬─┘
                         │   │   │   │
        ┌────────────────┘   │   │   └────────────────┐
        │                    │   │                     │
┌───────▼───────┐  ┌────────▼───────┐  ┌──────────▼───────┐  ┌────────▼────────┐
│ CRITICAL Queue│  │ HIGH Queue     │  │ NORMAL Queue     │  │ LOW Queue       │
│ (Birthday,    │  │ (Anniversary)  │  │ (Reminders)      │  │ (Notifications) │
│  Important)   │  │                │  │                  │  │                 │
│ Batch: 5      │  │ Batch: 10      │  │ Batch: 10        │  │ Batch: 20       │
│ Workers: 100  │  │ Workers: 50    │  │ Workers: 100     │  │ Workers: 200    │
└───────┬───────┘  └────────┬───────┘  └──────────┬───────┘  └────────┬────────┘
        │                   │                      │                   │
        └───────────────────┴──────────────────────┴───────────────────┘
                                        │
                              ┌─────────▼─────────┐
                              │  Worker Lambdas   │
                              │  (Priority-aware) │
                              └───────────────────┘
```

### Queue Configuration

#### 1. CRITICAL Queue (`bday-events-critical`)

**Purpose:** High-priority time-sensitive events (birthdays, important anniversaries)

**Configuration:**
```yaml
QueueName: bday-events-critical
VisibilityTimeout: 30 seconds
MessageRetentionPeriod: 24 hours
MaxReceiveCount: 3 (DLQ: bday-events-critical-dlq)
ReservedConcurrency: 100 (Worker Lambda)
BatchSize: 5 messages (lower batch = faster processing)
```

**Characteristics:**
- ✅ Dedicated worker pool (reserved concurrency = guaranteed capacity)
- ✅ Smaller batch size = lower latency
- ✅ Higher monitoring frequency (alarms for queue depth > 10)
- ✅ Priority webhook endpoints (configured endpoints only)

**Volume (1M users):**
- ~2,740 events/day (birthdays)
- Peak: 1,000 events/hour

---

#### 2. HIGH Queue (`bday-events-high`)

**Purpose:** Important but less time-critical events (anniversaries, urgent reminders)

**Configuration:**
```yaml
QueueName: bday-events-high
VisibilityTimeout: 30 seconds
MessageRetentionPeriod: 48 hours
MaxReceiveCount: 3 (DLQ: bday-events-high-dlq)
ReservedConcurrency: 50
BatchSize: 10 messages
```

**Characteristics:**
- ✅ Dedicated worker pool (smaller than CRITICAL)
- ✅ Standard batch size (10 messages)
- ✅ 48-hour retention (longer than CRITICAL)

**Volume (1M users):**
- ~2,740 events/day (anniversaries)
- Peak: 500 events/hour

---

#### 3. NORMAL Queue (`bday-events-normal`)

**Purpose:** Standard reminders and scheduled notifications

**Configuration:**
```yaml
QueueName: bday-events-normal
VisibilityTimeout: 60 seconds
MessageRetentionPeriod: 72 hours
MaxReceiveCount: 5 (DLQ: bday-events-normal-dlq)
ReservedConcurrency: 100
BatchSize: 10 messages
```

**Characteristics:**
- ✅ Shared worker pool (auto-scales based on queue depth)
- ✅ Longer visibility timeout (allows complex processing)
- ✅ More retries (5 vs 3) before DLQ

**Volume (1M users):**
- ~8,220 events/day
- Peak: 2,000 events/hour

---

#### 4. LOW Queue (`bday-events-low`)

**Purpose:** Non-critical notifications, bulk messages, analytics events

**Configuration:**
```yaml
QueueName: bday-events-low
VisibilityTimeout: 120 seconds
MessageRetentionPeriod: 7 days
MaxReceiveCount: 5
ReservedConcurrency: None (burstable capacity)
BatchSize: 20 messages (higher batch = more efficient)
```

**Characteristics:**
- ✅ No reserved concurrency (uses available capacity)
- ✅ Larger batch size (higher throughput, lower cost)
- ✅ Longer retention (7 days vs 24 hours)

**Volume (1M users):**
- ~137,000 events/day
- Peak: 20,000 events/hour

---

### Queue Routing Logic

**In Scheduler Lambda:**

```typescript
// Route event to appropriate queue based on event type and priority
function routeEventToQueue(event: Event): string {
  if (event.eventType === 'BIRTHDAY' || event.priority === 'CRITICAL') {
    return process.env.SQS_QUEUE_URL_CRITICAL!;
  }

  if (event.eventType === 'ANNIVERSARY' || event.priority === 'HIGH') {
    return process.env.SQS_QUEUE_URL_HIGH!;
  }

  if (event.eventType === 'REMINDER' || event.priority === 'NORMAL') {
    return process.env.SQS_QUEUE_URL_NORMAL!;
  }

  return process.env.SQS_QUEUE_URL_LOW!; // Default: LOW priority
}

// Send to appropriate queue
const queueUrl = routeEventToQueue(claimedEvent);
await sqsAdapter.sendMessage(payload, queueUrl);
```

---

### Alternative: SQS FIFO with Message Groups

**Consideration:** Use FIFO queues with message groups for per-user ordering

**Pros:**
- ✅ Exactly-once delivery (deduplication)
- ✅ Per-user ordering (message group = userId)
- ✅ No duplicate event processing

**Cons:**
- ❌ Limited throughput: 3,000 TPS (with high-throughput mode)
- ❌ Higher cost: FIFO queues more expensive than Standard
- ❌ Regional limitation (FIFO not available in all regions)

**Verdict:** **Not recommended for this use case**
- Event ordering within user is not critical (birthdays are yearly)
- Throughput limitation (3,000 TPS = 10.8M events/hour) may not be sufficient for LOW queue
- Idempotency key already provides deduplication at application level

---

## SNS Fan-Out Pattern - When and How to Use

### Overview

**SNS (Simple Notification Service)** enables a pub/sub fan-out pattern where a single event can be distributed to multiple subscribers (SQS queues, Lambda functions, HTTP endpoints) simultaneously.

**Key Question: Should we use SNS for event distribution?**

**Answer: YES, with specific use cases** - SNS is highly beneficial for certain scenarios in your architecture.

---

### Use Case 1: Topic Per Event Type (RECOMMENDED - SIMPLIFIED)

**Problem:** Need to route different event types to different consumers (queues, lambdas, analytics)

**Solution:** One SNS Topic per event type - natural, simple, no complex filtering needed

```text
┌─────────────────────────────────────────────────────────────────────┐
│        SNS Topic-Per-Event-Type Architecture (SIMPLE)                │
└─────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────┐
                    │   EventBridge    │
                    │   (1 min rate)   │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  Scheduler Lambda │
                    │  Claim 100 events │
                    └────┬───┬───┬───┬──┘
                         │   │   │   │
      Publish based on   │   │   │   │
      event.eventType    │   │   │   │
                         │   │   │   │
        ┌────────────────┘   │   │   └────────────────┐
        │                    │   │                     │
        ▼                    ▼   ▼                     ▼
┌──────────────┐  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
│ SNS Topic    │  │ SNS Topic   │  │ SNS Topic    │  │ SNS Topic    │
│ BIRTHDAY     │  │ ANNIVERSARY │  │ REMINDER     │  │ NOTIFICATION │
└──────┬───────┘  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │                 │
       │ Fan-out         │ Fan-out         │ Fan-out         │ Fan-out
       │                 │                 │                 │
   ┌───┴───┬──────┐  ┌───┴───┐        ┌───┴───┐        ┌───┴───┐
   │       │      │  │       │        │       │        │       │
   ▼       ▼      ▼  ▼       ▼        ▼       ▼        ▼       ▼
┌──────┐ ┌────┐ ┌──┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐
│Worker│ │Anal│ │Email│Webhk│ │Logs │ │Webhk│ │Logs │ │Webhk│ │Queue│
│Queue │ │ytics│ │SQS │Queue│ │Λ    │ │Queue│ │Λ    │ │Queue│ │(bulk│
└──────┘ └────┘ └──┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘
```

#### Why This Is Better

✅ **Natural mapping** - Event type = Topic (1:1, obvious)
✅ **No filtering needed** - Each topic knows what it handles
✅ **Easy debugging** - Clear which topic processes which events
✅ **Independent scaling** - Each event type scales independently
✅ **Simple Lambda code** - Just map eventType to topic ARN

#### Implementation

**Scheduler Lambda publishes to appropriate topic:**

```typescript
// In Scheduler Lambda
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const snsClient = new SNSClient({
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_ENDPOINT_URL,
});

// Simple mapping: event type → topic ARN
const TOPIC_ARNS = {
  BIRTHDAY: process.env.SNS_TOPIC_BIRTHDAY_ARN!,
  ANNIVERSARY: process.env.SNS_TOPIC_ANNIVERSARY_ARN!,
  REMINDER: process.env.SNS_TOPIC_REMINDER_ARN!,
  NOTIFICATION: process.env.SNS_TOPIC_NOTIFICATION_ARN!,
};

async function publishEventToSNS(event: Event): Promise<void> {
  const payload: SQSMessagePayload = {
    eventId: event.id,
    eventType: event.eventType,
    idempotencyKey: event.idempotencyKey.toString(),
    metadata: {
      userId: event.userId,
      targetTimestampUTC: event.targetTimestampUTC.toISO()!,
      deliveryPayload: event.deliveryPayload,
    },
  };

  // Publish to appropriate topic based on event type
  const topicArn = TOPIC_ARNS[event.eventType];

  await snsClient.send(
    new PublishCommand({
      TopicArn: topicArn,
      Message: JSON.stringify(payload),
      MessageAttributes: {
        eventId: {
          DataType: 'String',
          StringValue: event.id,
        },
        userId: {
          DataType: 'String',
          StringValue: event.userId,
        },
      },
    })
  );
}
```

**SNS Topics configuration (CDK):**

```typescript
// Create one topic per event type
const birthdayTopic = new sns.Topic(this, 'BirthdayEventsTopic', {
  displayName: 'Birthday Events',
  topicName: 'bday-birthday-events',
});

const anniversaryTopic = new sns.Topic(this, 'AnniversaryEventsTopic', {
  displayName: 'Anniversary Events',
  topicName: 'bday-anniversary-events',
});

const reminderTopic = new sns.Topic(this, 'ReminderEventsTopic', {
  displayName: 'Reminder Events',
  topicName: 'bday-reminder-events',
});

const notificationTopic = new sns.Topic(this, 'NotificationEventsTopic', {
  displayName: 'Notification Events',
  topicName: 'bday-notification-events',
});

// Each topic can have multiple subscribers (fan-out)
// Birthday topic subscribers: high-priority queue + analytics + email
birthdayTopic.addSubscription(
  new subscriptions.SqsSubscription(birthdayQueue, {
    rawMessageDelivery: true,
  })
);
birthdayTopic.addSubscription(
  new subscriptions.LambdaSubscription(analyticsLambda)
);
birthdayTopic.addSubscription(
  new subscriptions.SqsSubscription(emailQueue, {
    rawMessageDelivery: true,
  })
);

// Anniversary topic subscribers: standard queue + analytics
anniversaryTopic.addSubscription(
  new subscriptions.SqsSubscription(anniversaryQueue, {
    rawMessageDelivery: true,
  })
);
anniversaryTopic.addSubscription(
  new subscriptions.LambdaSubscription(analyticsLambda)
);

// Reminder topic subscribers: standard queue + logs
reminderTopic.addSubscription(
  new subscriptions.SqsSubscription(reminderQueue, {
    rawMessageDelivery: true,
  })
);

// Notification topic subscribers: bulk queue only
notificationTopic.addSubscription(
  new subscriptions.SqsSubscription(notificationQueue, {
    rawMessageDelivery: true,
  })
);
```

#### Benefits

✅ **Crystal clear architecture** - No guessing which topic handles what
✅ **Easy to add subscribers per event type** - Birthday events can fan out to email, webhook, analytics
✅ **No message filtering complexity** - Subscription = automatic delivery
✅ **Independent monitoring** - Track metrics per event type easily
✅ **Natural DDD alignment** - Event types are your domain events

#### Cost

- SNS publish: $0.50 per million publishes
- SNS to SQS delivery: $0 (free within same region)
- For 4.5M events/month: **$2.25/month** (same cost, simpler architecture!)

#### When to Use This Pattern

✅ **Always use topic-per-event-type if:**

- You have distinct event types (birthday, anniversary, etc.)
- Each event type may need different downstream processing
- You want clear separation of concerns
- You want easy extensibility (add new subscriber = add subscription, no code change)

❌ **Don't use this pattern if:**

- All events are processed identically (then you need just 1 queue)
- You have 20+ event types (too many topics to manage)

---

### Use Case 2: Multi-Channel Event Delivery (FUTURE)

**Scenario:** When you want to deliver events via multiple channels simultaneously

```text
                    ┌────────────────────┐
                    │   SNS Topic        │
                    │  bday-events-topic │
                    └────┬───┬───┬───┬───┘
                         │   │   │   │
        ┌────────────────┘   │   │   └────────────────┐
        │                    │   │                     │
        ▼                    ▼   ▼                     ▼
┌───────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ SQS Queue     │  │ Lambda       │  │ HTTP Endpoint│  │ Email/SMS    │
│ (Webhook)     │  │ (Analytics)  │  │ (Partner API)│  │ (SNS → SES)  │
└───────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

**Use Cases:**
- ✅ Send webhook + store in analytics database
- ✅ Deliver to partner APIs + internal systems
- ✅ Send email/SMS notifications + log events
- ✅ Trigger multiple Lambdas (alerting, metrics, audit)

**Example: Birthday event triggers multiple actions:**

```typescript
// SNS Topic fans out to:
// 1. SQS Queue → Worker Lambda → Webhook delivery
// 2. Lambda (direct) → Store in Analytics DB (Redshift/BigQuery)
// 3. Lambda (direct) → Update user engagement metrics
// 4. HTTP endpoint → Partner notification service
// 5. SQS Queue → Email service (for VIP users)
```

---

### Use Case 3: Domain Event Bus Pattern (ADVANCED)

**Scenario:** Implement event-driven architecture with domain events

```text
┌─────────────────────────────────────────────────────────────────────┐
│           Domain Event Bus with SNS (Microservices)                  │
└─────────────────────────────────────────────────────────────────────┘

                    ┌────────────────────┐
                    │   SNS Topic        │
                    │  domain-events     │
                    └────┬───┬───┬───┬───┘
                         │   │   │   │
        ┌────────────────┘   │   │   └────────────────┐
        │ Filter:            │   │ Filter:            │ Filter:
        │ eventType=         │   │ eventType=         │ eventType=
        │ UserBirthday       │   │ EventScheduled     │ EventCompleted
        │ Changed            │   │                    │
        ▼                    ▼   ▼                    ▼
┌───────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ User Service  │  │ Event Service│  │ Analytics    │  │ Notification │
│ (SQS Queue)   │  │ (SQS Queue)  │  │ (Lambda)     │  │ (SQS Queue)  │
└───────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

**Domain Events:**
- `UserBirthdayChanged` → Reschedule events (your current use case!)
- `UserTimezoneChanged` → Reschedule events
- `EventScheduled` → Send to analytics, update metrics
- `EventCompleted` → Generate next year's event, log success
- `EventFailed` → Send alert, retry logic, update metrics

**Benefits:**
- ✅ Loose coupling between bounded contexts (DDD)
- ✅ Easy to add new event handlers (observers)
- ✅ Event sourcing foundation
- ✅ Audit trail (SNS can log all events to S3)

---

### Use Case 4: Dead Letter Queue Fan-Out (MONITORING)

**Scenario:** Fan out DLQ events to multiple monitoring/alerting systems

```text
                    ┌────────────────────┐
                    │   DLQ Events       │
                    │   SNS Topic        │
                    └────┬───┬───────┬───┘
                         │   │       │
        ┌────────────────┘   │       └────────────────┐
        │                    │                        │
        ▼                    ▼                        ▼
┌───────────────┐  ┌──────────────┐  ┌──────────────┐
│ PagerDuty     │  │ Slack Webhook│  │ Lambda       │
│ (Alert)       │  │ (Notification│  │ (Store in DB)│
└───────────────┘  └──────────────┘  └──────────────┘
```

**Benefits:**
- ✅ Alert multiple systems simultaneously
- ✅ Centralized failure monitoring
- ✅ Easy to add new alerting channels

---

### Comparison: Direct SQS vs SNS Fan-Out

| Aspect | Direct SQS Routing (Current) | SNS + SQS Fan-Out (Recommended) |
|--------|------------------------------|----------------------------------|
| **Routing Logic** | In Lambda code (if/else) | SNS message filtering (declarative) |
| **Extensibility** | Add queue = change Lambda code | Add queue = update SNS subscription (no code change) |
| **Multiple Subscribers** | Not possible | Native support (fan-out) |
| **Complexity** | Low (simple, straightforward) | Medium (additional SNS layer) |
| **Cost** | SQS only ($4/month) | SNS + SQS ($6/month) |
| **Debugging** | Easier (direct flow) | Harder (SNS adds indirection) |
| **Best for** | Simple 1-to-1 routing | Complex 1-to-many routing |

---

### Recommendation: When to Use SNS

**Use SNS if:**
1. ✅ You have 3+ queues (multi-queue architecture)
2. ✅ You need fan-out (1 event → multiple destinations)
3. ✅ You want to add analytics, monitoring, or logging subscribers
4. ✅ You plan to implement event-driven architecture (domain events)
5. ✅ You want declarative routing (filter policies vs code)

**Skip SNS if:**
1. ❌ You have only 1-2 queues (simple routing in code is fine)
2. ❌ No fan-out needed (1 event → 1 queue only)
3. ❌ Team unfamiliar with SNS (adds complexity)

---

### Recommendation for Your Architecture

**Phase 2-3 (10K-100K users):** Skip SNS, use direct SQS routing
- Simpler to understand and debug
- Lower cost ($4 vs $6/month)
- Sufficient for 1-2 queues

**Phase 4 (1M users, multi-queue):** Add SNS fan-out
- Cleaner architecture with 4 queues
- Enables future extensibility (analytics, monitoring)
- Declarative routing via filter policies
- Worth the $2/month cost and complexity

**Phase 5+ (5M+ users, event-driven):** Full SNS event bus
- Domain event bus pattern
- Multi-channel delivery (webhook + email + SMS)
- Analytics and monitoring integrations
- Event sourcing foundation

---

### Cost Impact

**SNS Pricing:**
- Publishes: $0.50 per million
- Deliveries to SQS: Free (same region)
- Deliveries to Lambda: $0.20 per million
- Deliveries to HTTP: $0.60 per million

**For 1M Users (4.5M events/month):**
- SNS publishes: 4.5M × $0.50 = **$2.25/month**
- SNS to SQS: Free
- **Total SNS cost: $2.25/month**

**Total queue cost with SNS: $6.25/month** (vs $4/month direct SQS)

**Verdict:** Worth the $2.25/month for cleaner architecture at 1M+ users scale.

---

### Migration Strategy

**Phase 2-3: Direct SQS (Current Approach)**
```typescript
// Scheduler Lambda - direct routing
const queueUrl = routeEventToQueue(event);
await sqsAdapter.sendMessage(payload, queueUrl);
```

**Phase 4: Migrate to SNS Fan-Out**
```typescript
// Step 1: Create SNS topic
// Step 2: Subscribe all SQS queues to topic
// Step 3: Update Scheduler Lambda to publish to SNS
const topicArn = process.env.SNS_TOPIC_ARN!;
await snsClient.send(
  new PublishCommand({
    TopicArn: topicArn,
    Message: JSON.stringify(payload),
    MessageAttributes: { priority: { DataType: 'String', StringValue: priority } },
  })
);
```

**Phase 5: Add Additional Subscribers**
```typescript
// No Lambda code changes required!
// Just add new SNS subscriptions via CDK/CloudFormation:
// - Analytics Lambda
// - Monitoring HTTP endpoint
// - Partner API webhook
// - Email/SMS notifications
```

---

## Database Scaling Strategy

### Current Limitations

**Single PostgreSQL Instance:**
- No read replicas (all reads/writes hit primary)
- Limited connection pool (~100 connections)
- No connection pooling layer (direct Lambda → RDS)
- Single point of failure (no Multi-AZ yet)

### Target Architecture: Read Replicas + RDS Proxy

```text
┌─────────────────────────────────────────────────────────────────────┐
│              Database Architecture (1M+ Users)                       │
└─────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────┐
                    │   RDS Proxy      │
                    │ Connection Pool  │
                    │ Max: 1000 conns  │
                    └────┬─────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        │ WRITES         │ READS          │ READS
        ▼                ▼                ▼
┌───────────────┐  ┌──────────────┐  ┌──────────────┐
│  Primary RDS  │  │ Read Replica │  │ Read Replica │
│  PostgreSQL   │  │  (Region 1)  │  │  (Region 2)  │
│  Multi-AZ     │  │              │  │              │
│  r6g.xlarge   │  │  r6g.large   │  │  r6g.large   │
└───────────────┘  └──────────────┘  └──────────────┘
        │
        ▼
┌───────────────┐
│  S3 Backups   │
│  (Daily)      │
└───────────────┘
```

### 1. RDS Proxy Configuration

**Purpose:** Connection pooling and management for Lambda functions

**Benefits:**
- ✅ Reuses database connections (reduces connection overhead)
- ✅ Handles Lambda concurrency spikes (up to 1000 concurrent Lambdas)
- ✅ Automatic failover to standby (Multi-AZ)
- ✅ IAM authentication (no plaintext credentials)

**Configuration:**
```yaml
MaxConnectionsPercent: 100
MaxIdleConnectionsPercent: 50
ConnectionBorrowTimeout: 30 seconds
SessionPinningFilters: EXCLUDE_VARIABLE_SETS
```

**Cost:** ~$0.015/hour per vCPU = **$43/month** (for r6g.xlarge: 4 vCPUs)

---

### 2. Read Replicas for Read-Heavy Workloads

**Purpose:** Offload read queries from primary database

**Use Cases:**
- ✅ Event queries (findByUserId, findPendingEvents)
- ✅ User queries (findById, findByEmail)
- ✅ Analytics queries (dashboard, metrics)
- ❌ Event claiming (requires writes, must use primary)

**Configuration:**
- 2 Read Replicas (different AZs for redundancy)
- Async replication (< 1 second lag)
- Instance size: r6g.large (smaller than primary)

**Query Routing:**
```typescript
// In PrismaEventRepository
class PrismaEventRepository implements IEventRepository {
  constructor(
    private primaryClient: PrismaClient,    // For writes
    private replicaClient: PrismaClient,    // For reads
  ) {}

  // Reads: Use replica
  async findById(id: string): Promise<Event | null> {
    return this.replicaClient.event.findUnique({ where: { id } });
  }

  // Writes: Use primary
  async create(event: Event): Promise<Event> {
    return this.primaryClient.event.create({ data: eventToPersistence(event) });
  }

  // Critical reads requiring freshness: Use primary
  async claimReadyEvents(limit: number): Promise<Event[]> {
    return this.primaryClient.$transaction(async (tx) => {
      // FOR UPDATE SKIP LOCKED requires primary
      return tx.$queryRaw`...`;
    });
  }
}
```

**Cost:** 2 × r6g.large = **~$200/month**

---

### 3. Database Instance Sizing

**Current:** PostgreSQL 16 (likely t3.micro or t3.small in dev)

**Target (1M Users):**

**Primary Instance:**
- Instance Type: **r6g.xlarge** (Graviton2, 4 vCPUs, 32 GB RAM)
- Storage: **500 GB** General Purpose SSD (gp3)
- IOPS: **12,000** provisioned IOPS
- Multi-AZ: **Enabled** (automatic failover)

**Capacity Estimates:**
- 1M users = ~1 GB (users table)
- 55M events/year = ~100 GB (events table + indexes)
- Backups + retention = ~200 GB
- **Total: ~300-400 GB** (500 GB with headroom)

**Cost:** r6g.xlarge Multi-AZ = **~$600-700/month**

---

### 4. Connection Pooling Strategy

**Lambda Connection Pooling:**

```typescript
// Singleton Prisma client with connection pooling
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL, // Points to RDS Proxy endpoint
    },
  },
  connection_limit: 10, // Max connections per Lambda instance
});

// Prisma connection pool configuration
// connection_limit: 10 connections per Lambda instance
// With 500 concurrent Lambdas: 5,000 connection attempts
// RDS Proxy pools to 1,000 actual connections to database
```

**PgBouncer (Alternative for non-AWS environments):**

If not using RDS Proxy, deploy PgBouncer in ECS:

```yaml
# PgBouncer configuration
default_pool_size: 25
max_client_conn: 1000
pool_mode: transaction  # More aggressive pooling
server_lifetime: 3600
server_idle_timeout: 600
```

**Cost:** ECS Fargate task = **~$30/month**

---

### 5. Database Indexes Optimization

**Current Indexes:**
```sql
CREATE INDEX idx_events_user_id ON events(user_id);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_target_timestamp_utc ON events(target_timestamp_utc);
CREATE INDEX idx_events_scheduler_query ON events(target_timestamp_utc, status);
CREATE INDEX idx_events_user_pending ON events(user_id, status);
```

**Additional Indexes for 1M Users:**

```sql
-- Partial index for PENDING events (scheduler query optimization)
CREATE INDEX idx_events_pending_only
ON events(target_timestamp_utc)
WHERE status = 'PENDING';

-- Composite index for recovery queries
CREATE INDEX idx_events_recovery
ON events(status, target_timestamp_utc)
WHERE status = 'PENDING' AND target_timestamp_utc < NOW();

-- Index for event type routing (multi-queue)
CREATE INDEX idx_events_type_status
ON events(event_type, status, target_timestamp_utc);

-- Partial index for user pending events (smaller, faster)
CREATE INDEX idx_events_user_pending_partial
ON events(user_id, target_timestamp_utc)
WHERE status IN ('PENDING', 'PROCESSING');
```

**Index Maintenance:**
- Run `ANALYZE` daily (update table statistics)
- Run `VACUUM` weekly (reclaim space, update visibility maps)
- Monitor index bloat (pg_stat_user_indexes)

---

### 6. Partitioning Strategy (Future - 5M+ Users)

**Problem:** At 5M+ users, `events` table will exceed 500M rows

**Solution:** Table partitioning by date range

```sql
-- Partition by target_timestamp_utc (monthly partitions)
CREATE TABLE events (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  target_timestamp_utc TIMESTAMPTZ NOT NULL,
  ...
) PARTITION BY RANGE (target_timestamp_utc);

-- Create monthly partitions
CREATE TABLE events_2025_01 PARTITION OF events
FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE events_2025_02 PARTITION OF events
FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

-- Auto-create partitions with pg_partman extension
```

**Benefits:**
- ✅ Faster queries (scans only relevant partition)
- ✅ Easier archival (drop old partitions)
- ✅ Better vacuum performance (smaller tables)

**Cost:** Same hardware, better performance (no additional cost)

**When to Implement:** At **5M+ users** or **500M+ events**

---

## Lambda & Compute Scaling

### 1. Scheduler Lambda Optimization

**Current Configuration:**
- Memory: 512 MB
- Timeout: 60 seconds
- Reserved Concurrency: None
- Provisioned Concurrency: None

**Target Configuration (1M Users):**
```yaml
SchedulerLambda:
  Memory: 1024 MB          # More memory = faster CPU
  Timeout: 120 seconds     # Handle larger batches
  ReservedConcurrency: 20  # Limit concurrent executions
  ProvisionedConcurrency: 2 # Keep 2 instances warm
  Environment:
    BATCH_SIZE: 100        # Events per invocation
    MAX_EXECUTION_TIME: 100000  # 100 seconds (leave buffer)
```

**Rationale:**
- **1024 MB memory:** More memory = more CPU (Lambda allocates CPU proportionally)
- **Reserved concurrency 20:** Prevents runaway scaling, limits database load
- **Provisioned concurrency 2:** Eliminates cold starts for scheduled invocations
- **Batch size 100:** Good balance between throughput and transaction size

**Cost Impact:**
- Provisioned concurrency: 2 instances × $0.0000041/GB-s = **~$15/month**
- Reserved concurrency: No additional cost (limits, doesn't add)

---

### 2. Worker Lambda Optimization

**Current Configuration:**
- Memory: 512 MB
- Timeout: 60 seconds
- Reserved Concurrency: None
- Batch Size: 10 messages

**Target Configuration (1M Users):**
```yaml
WorkerLambda:
  Memory: 1024 MB           # More memory = faster webhook calls
  Timeout: 120 seconds      # Handle slow webhooks
  ReservedConcurrency: 500  # High capacity for peak loads
  ProvisionedConcurrency: 10 # Keep 10 instances warm
  BatchSize: 10             # Good balance for error handling
  MaximumConcurrency: 50    # Per SQS event source mapping
  Environment:
    WEBHOOK_TIMEOUT: 30000  # 30 seconds max per webhook
    MAX_RETRIES: 3
```

**Rationale:**
- **1024 MB memory:** Faster webhook HTTP calls (more CPU)
- **Reserved 500:** Ensures capacity during peak hours (15K events/hour)
- **Provisioned 10:** Reduces cold starts during traffic ramps
- **Batch size 10:** Allows partial success (process 10 events, fail 2, succeed 8)

**Cost Impact:**
- Provisioned concurrency: 10 instances × $0.0000041/GB-s = **~$75/month**
- Reserved concurrency: No additional cost

---

### 3. Multi-Queue Worker Configuration

**Strategy:** Different worker configurations for different queues

```yaml
CriticalWorkerLambda:
  Memory: 1024 MB
  ReservedConcurrency: 100
  BatchSize: 5              # Lower batch = faster processing
  MaximumConcurrency: 20    # Per event source mapping
  Timeout: 60 seconds

HighWorkerLambda:
  Memory: 1024 MB
  ReservedConcurrency: 50
  BatchSize: 10
  MaximumConcurrency: 10
  Timeout: 90 seconds

NormalWorkerLambda:
  Memory: 512 MB            # Lower memory for cost savings
  ReservedConcurrency: 100
  BatchSize: 10
  MaximumConcurrency: 20
  Timeout: 120 seconds

LowWorkerLambda:
  Memory: 512 MB
  ReservedConcurrency: None # Burstable capacity
  BatchSize: 20             # Higher batch for efficiency
  MaximumConcurrency: 50
  Timeout: 180 seconds
```

**Benefits:**
- ✅ Priority queues get dedicated resources
- ✅ Cost optimization (low-priority events use smaller memory)
- ✅ Independent scaling (high-priority not blocked by low-priority)

**Cost:** Total reserved concurrency: **250 instances** = **~$200/month** (provisioned)

---

### 4. EventBridge Configuration

**Current:**
- Rule: `rate(1 minute)`
- Target: Scheduler Lambda

**No changes required for 1M users**

EventBridge can trigger Lambda thousands of times per minute if needed. The 1-minute rate is a policy decision, not a technical limit.

**Alternative: Increase frequency (if needed at 5M+ users):**
```yaml
EventBridgeRule:
  ScheduleExpression: "rate(30 seconds)"  # Not recommended
  # OR
  ScheduleExpression: "cron(*/1 * * * ? *)"  # Every 1 minute
```

**Verdict:** Keep current 1-minute rate. Scale horizontally with concurrency instead.

---

### 5. Alternative: ECS/EKS for Scheduler

**At very high scale (10M+ users), consider replacing Scheduler Lambda with ECS/EKS**

**Benefits:**
- ✅ No cold starts
- ✅ Simpler connection pooling
- ✅ Longer running processes (no 15-minute timeout)

**Architecture:**
```text
┌─────────────────────────────────────┐
│  ECS Task: Event Scheduler          │
│  - Continuously polls database      │
│  - Claims events every 10 seconds   │
│  - Sends to SQS queues              │
│  - Auto-scales based on queue depth │
└─────────────────────────────────────┘
```

**Cost:** ECS Fargate: 1 vCPU, 2 GB RAM = **~$30/month** (always-on)

**Recommendation:** Keep Lambda for now. Consider ECS at **10M+ users**.

---

## Cost Analysis

### Current Costs (10K Users, Phase 1 - Local)

```text
PostgreSQL (local Docker): $0
LocalStack (local Docker): $0
Lambda (not deployed yet): $0

Total: $0/month (local development only)
```

---

### Projected Costs (1M Users, Phase 2 - AWS Production)

#### Database Costs

| Component | Configuration | Monthly Cost |
|-----------|--------------|--------------|
| **Primary RDS** | r6g.xlarge Multi-AZ, 500 GB gp3 | $700 |
| **Read Replica 1** | r6g.large, 500 GB gp3 | $200 |
| **Read Replica 2** | r6g.large, 500 GB gp3 | $200 |
| **RDS Proxy** | 4 vCPUs | $45 |
| **Backups** | 500 GB × 7 days retention | $50 |
| **Total Database** | | **$1,195** |

---

#### Lambda Costs

**Assumptions:**
- 150,000 events/day = 4.5M events/month
- Scheduler invocations: 43,200/month (every 1 minute)
- Worker invocations: ~450,000/month (10 events per batch = 4.5M / 10)

| Component | Configuration | Monthly Cost |
|-----------|--------------|--------------|
| **Scheduler Lambda** | 1024 MB, 2s avg duration, 43K invocations | $3 |
| **Provisioned (Scheduler)** | 2 instances × 730 hours | $15 |
| **Worker Lambda** | 1024 MB, 3s avg duration, 450K invocations | $40 |
| **Provisioned (Worker)** | 10 instances × 730 hours | $75 |
| **Total Lambda** | | **$133** |

---

#### SQS Costs

**Assumptions:**
- 4.5M events/month sent to queues
- 4.5M messages received by workers
- Total requests: 9M (send + receive)

| Component | Monthly Cost |
|-----------|--------------|
| **Standard Queue Requests** | 9M requests × $0.40/million = $3.60 |
| **Data Transfer** | Negligible (within same region) |
| **Total SQS** | **$4** |

---

#### Other AWS Services

| Service | Configuration | Monthly Cost |
|---------|--------------|--------------|
| **EventBridge** | 43,200 events/month | $1 (free tier: 1M) |
| **CloudWatch Logs** | 50 GB ingestion, 7-day retention | $25 |
| **CloudWatch Alarms** | 20 alarms | $10 |
| **NAT Gateway** | 1 NAT Gateway (for Lambda VPC) | $32 |
| **VPC Endpoints** | 2 endpoints (RDS, SQS) | $14 |
| **Total Other** | | **$82** |

---

### Total Monthly Cost (1M Users)

| Category | Monthly Cost |
|----------|--------------|
| Database | $1,195 |
| Lambda | $133 |
| SQS | $4 |
| Other Services | $82 |
| **TOTAL** | **$1,414/month** |

**Per-User Cost:** $1,414 / 1,000,000 = **$0.0014/user/month**

**Cost Per Event:** $1,414 / 4,500,000 = **$0.00031/event**

---

### Cost Optimization Strategies

1. **Use Reserved Instances for RDS**
   - 1-year RI: ~30% discount = Save **$360/month**
   - 3-year RI: ~50% discount = Save **$600/month**

2. **Use Savings Plans for Lambda**
   - Compute Savings Plan: ~15% discount = Save **$20/month**

3. **Reduce Provisioned Concurrency**
   - Remove during off-peak hours (scheduled scaling)
   - Save: **$40-60/month**

4. **Use S3 Intelligent-Tiering for Backups**
   - Automatically move old backups to cheaper storage
   - Save: **$10-15/month**

5. **Optimize CloudWatch Log Retention**
   - Reduce retention from 7 days to 3 days (non-prod)
   - Save: **$10-15/month**

**Total Potential Savings: $440-710/month**

**Optimized Cost: ~$1,000/month** ($0.001/user/month)

---

## Migration Path

### Phase 1: Current State (DONE)

- ✅ Local development with Docker Compose
- ✅ Single PostgreSQL database
- ✅ LocalStack for SQS + Lambda + EventBridge
- ✅ Basic monitoring (console logs)

---

### Phase 2: AWS Deployment (Next - 10K-50K Users)

**Timeline: 2-4 weeks**

**Tasks:**
1. **Set up AWS infrastructure (CDK)**
   - RDS PostgreSQL (t3.medium, no replicas yet)
   - SQS queue (single queue, add DLQ)
   - Lambda deployment (Scheduler + Worker)
   - EventBridge rule
   - IAM roles and policies

2. **Deploy application to AWS**
   - Build Lambda packages (esbuild)
   - Deploy via CDK
   - Configure environment variables
   - Test E2E flow

3. **Set up monitoring**
   - CloudWatch Logs
   - CloudWatch Alarms (error rate, queue depth)
   - Dashboard (basic metrics)

**Cost:** ~$100-200/month (t3.medium RDS + Lambda)

---

### Phase 3: Scale to 100K Users

**Timeline: 4-6 weeks**

**Tasks:**
1. **Upgrade RDS instance**
   - Increase to r6g.large
   - Enable Multi-AZ
   - Add 1 read replica

2. **Add RDS Proxy**
   - Deploy RDS Proxy for connection pooling
   - Update Lambda connection strings

3. **Optimize Lambda**
   - Increase memory to 1024 MB
   - Add reserved concurrency (20 scheduler, 100 worker)
   - Add provisioned concurrency (2 scheduler, 5 worker)

4. **Enhanced monitoring**
   - Custom metrics (events/minute, claim latency)
   - Alarms (database CPU, Lambda throttles)
   - Dashboard (detailed metrics)

**Cost:** ~$500-700/month

---

### Phase 4: Scale to 1M Users

**Timeline: 6-8 weeks**

**Tasks:**
1. **Upgrade RDS infrastructure**
   - Primary: r6g.xlarge Multi-AZ
   - Add 2nd read replica
   - Increase storage to 500 GB gp3
   - Optimize indexes (add partial indexes)

2. **Implement multi-queue architecture**
   - Create 4 SQS queues (CRITICAL, HIGH, NORMAL, LOW)
   - Update Scheduler Lambda for queue routing
   - Deploy separate Worker Lambdas per queue
   - Configure reserved concurrency per queue

3. **Advanced monitoring**
   - Queue depth per priority
   - Latency per event type
   - Database replication lag
   - Custom CloudWatch dashboard

4. **Load testing**
   - Simulate 1M users
   - Test peak load (25K events/hour)
   - Validate failover scenarios
   - Stress test database connections

**Cost:** ~$1,400/month (full production infrastructure)

---

### Phase 5: Beyond 1M Users (5M+ Users)

**Timeline: 8-12 weeks**

**Tasks:**
1. **Database partitioning**
   - Partition `events` table by date
   - Implement pg_partman for auto-partitioning
   - Migrate existing data

2. **Consider ECS/EKS for scheduler**
   - Replace EventBridge + Lambda with ECS tasks
   - Continuous polling (every 10 seconds)
   - Better connection management

3. **Add caching layer**
   - Redis/ElastiCache for user data
   - Cache frequently accessed events
   - Reduce database read load

4. **Multi-region deployment**
   - Deploy to 2nd AWS region (disaster recovery)
   - Route53 failover routing
   - Cross-region read replicas

**Cost:** ~$3,000-5,000/month (multi-region, caching, larger instances)

---

## Monitoring & Observability

### Key Metrics to Monitor

#### 1. Queue Metrics

**SQS CloudWatch Metrics:**
- `ApproximateNumberOfMessagesVisible` (queue depth)
  - Alarm: > 1000 for CRITICAL queue
  - Alarm: > 5000 for other queues
- `ApproximateAgeOfOldestMessage` (message age)
  - Alarm: > 300 seconds (5 minutes)
- `NumberOfMessagesSent` (throughput)
- `NumberOfMessagesDeleted` (successful processing)
- `NumberOfMessagesReceived` (worker consumption rate)

**Custom Metrics:**
- Events queued per minute (by priority)
- Queue processing rate (events/minute)
- Queue latency (time from targetTimestampUTC to delivery)

---

#### 2. Lambda Metrics

**Scheduler Lambda:**
- `Invocations` (should be 60/hour)
- `Errors` (should be 0)
- `Duration` (p50, p95, p99)
- `ConcurrentExecutions` (should be < 20)
- `Throttles` (should be 0)

**Worker Lambda:**
- `Invocations` (scales with queue depth)
- `Errors` (retry rate)
- `Duration` (webhook latency)
- `ConcurrentExecutions` (should be < 500)
- `Throttles` (should be 0)

**Custom Metrics:**
- Events claimed per invocation (avg, max)
- Events processed per invocation (avg, max)
- Webhook delivery success rate (%)
- Webhook delivery latency (p50, p95, p99)

---

#### 3. Database Metrics

**RDS CloudWatch Metrics:**
- `CPUUtilization` (should be < 80%)
  - Alarm: > 80% for 15 minutes
- `DatabaseConnections` (should be < 80% of max)
  - Alarm: > 800 connections (for 1000 max)
- `FreeableMemory` (should have 20%+ free)
- `ReadLatency` / `WriteLatency` (p95, p99)
- `ReplicationLag` (read replicas, should be < 1 second)

**Custom Metrics:**
- Event claiming latency (duration of FOR UPDATE SKIP LOCKED query)
- Events by status (PENDING, PROCESSING, COMPLETED, FAILED)
- Failed event rate (FAILED events / total events)

---

#### 4. Application Metrics

**Event Processing:**
- End-to-end latency (targetTimestampUTC to delivery)
  - Target: < 30 seconds (p95)
- Event failure rate (FAILED / total events)
  - Target: < 1%
- DLQ message count
  - Alarm: > 100 messages

**Webhook Delivery:**
- Webhook success rate (2xx responses)
  - Target: > 95%
- Webhook timeout rate (requests > 30 seconds)
  - Alarm: > 5%
- Circuit breaker trips (failing webhooks)
  - Alarm: any occurrence

---

### Alerting Strategy

#### Critical Alerts (Page on-call engineer)

1. **Database down or unreachable**
   - RDS instance status != available
   - All database connections failing

2. **Lambda throttling (CRITICAL queue)**
   - Worker Lambda throttles > 10/minute
   - Scheduler Lambda throttles > 0/minute

3. **Queue depth critical**
   - CRITICAL queue depth > 1,000 messages
   - Any queue depth > 10,000 messages

4. **High error rate**
   - Lambda error rate > 10% (sustained 5 minutes)
   - Database connection errors > 50/minute

---

#### Warning Alerts (Email/Slack)

1. **Database CPU high**
   - CPU > 80% for 15 minutes
   - Connections > 80% of max

2. **Queue backlog building**
   - Queue depth > 500 for CRITICAL
   - Queue depth > 5,000 for other queues
   - Message age > 300 seconds

3. **Webhook delivery issues**
   - Success rate < 95% for 10 minutes
   - Timeout rate > 5%

4. **Lambda performance degradation**
   - Duration p95 > 5 seconds (scheduler)
   - Duration p95 > 10 seconds (worker)

---

### Dashboards

#### Operations Dashboard

**Real-time System Health:**
- Queue depths (all queues)
- Lambda concurrency (all functions)
- Database connections
- Error rates (all components)
- Event processing rate (events/minute)

#### Business Metrics Dashboard

**Event Delivery Metrics:**
- Events delivered (by type: birthday, anniversary, etc.)
- Success rate (%)
- Latency (p50, p95, p99)
- Failed events (DLQ count)

#### Cost Dashboard

**AWS Spend:**
- RDS costs (daily, monthly)
- Lambda costs (by function)
- SQS costs (by queue)
- Total infrastructure cost

---

## Summary & Recommendations

### Immediate Actions (Next 2 Weeks)

1. ✅ **Deploy to AWS** (Phase 2)
   - Set up RDS (t3.medium, single instance)
   - Deploy Lambda functions
   - Configure SQS + EventBridge
   - Basic monitoring (CloudWatch Logs + Alarms)

2. ✅ **Load testing**
   - Test with 10K simulated users
   - Measure baseline performance (latency, throughput)
   - Identify bottlenecks early

---

### Short-Term (3-6 Months) - 100K Users

1. ✅ **Upgrade database infrastructure**
   - RDS Multi-AZ (r6g.large)
   - Add 1 read replica
   - Deploy RDS Proxy

2. ✅ **Optimize Lambda configuration**
   - Increase memory (1024 MB)
   - Add reserved concurrency
   - Add provisioned concurrency (2-5 instances)

3. ✅ **Enhanced monitoring**
   - Custom metrics
   - Detailed dashboards
   - Alerting strategy

---

### Medium-Term (6-12 Months) - 1M Users

1. ✅ **Multi-queue architecture**
   - 4 priority queues (CRITICAL, HIGH, NORMAL, LOW)
   - Separate worker Lambdas per queue
   - Queue routing logic in Scheduler

2. ✅ **Database scaling**
   - Upgrade primary to r6g.xlarge
   - Add 2nd read replica
   - Implement partial indexes

3. ✅ **Advanced monitoring**
   - Per-queue metrics
   - Per-event-type metrics
   - Business intelligence dashboard

---

### Long-Term (12+ Months) - 5M+ Users

1. ✅ **Database partitioning**
   - Partition `events` table by date
   - Implement pg_partman

2. ✅ **Consider ECS/EKS for scheduler**
   - Replace Lambda with long-running containers
   - Better connection management
   - No cold starts

3. ✅ **Add caching layer**
   - Redis/ElastiCache for user data
   - Reduce database read load

4. ✅ **Multi-region deployment**
   - Disaster recovery
   - Reduced latency for global users

---

### Key Takeaways

**Current Architecture (Phase 1):**
- ✅ Good foundation for 10K-50K users
- ✅ Solid design patterns (DDD, Hexagonal Architecture, FOR UPDATE SKIP LOCKED)
- ✅ Local development environment (Docker + LocalStack)

**Scaling to 1M Users:**
- ⚠️ **Database is the primary bottleneck** → RDS Proxy + Read Replicas
- ⚠️ **Single queue limits priority** → Multi-queue architecture
- ⚠️ **Lambda concurrency needs management** → Reserved + Provisioned concurrency

**Cost:**
- **1M users:** ~$1,400/month ($0.0014/user/month)
- **Optimized:** ~$1,000/month with reserved instances and savings plans

**Timeline:**
- **Phase 2 (AWS deployment):** 2-4 weeks
- **Phase 3 (100K users):** 4-6 weeks
- **Phase 4 (1M users):** 6-8 weeks
- **Total: 3-4 months** from Phase 1 to 1M users

---

## Next Steps

1. **Review this document** with team (architecture, cost, timeline)
2. **Prioritize Phase 2** (AWS deployment)
3. **Create CDK infrastructure code** (database, Lambda, SQS, EventBridge)
4. **Set up CI/CD pipeline** (GitHub Actions)
5. **Deploy to AWS dev environment** (test with small dataset)
6. **Load test** (simulate 10K users, measure baseline)
7. **Iterate and optimize** based on real-world data

---

**Document Version:** 1.0
**Last Updated:** 2025-10-31
**Next Review:** After Phase 2 deployment
