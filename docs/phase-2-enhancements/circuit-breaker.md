# Circuit Breaker Pattern

**Status:** Phase 2 Enhancement
**Priority:** High
**Category:** Resilience & Reliability

---

## Table of Contents

1. [Overview](#overview)
2. [Problem Statement](#problem-statement)
3. [Solution Design](#solution-design)
4. [Implementation Guide](#implementation-guide)
5. [When to Implement](#when-to-implement)
6. [Benefits](#benefits)
7. [Costs & Trade-offs](#costs--trade-offs)
8. [Monitoring](#monitoring)
9. [References](#references)

---

## Overview

A **Circuit Breaker** is a design pattern that prevents your application from repeatedly trying to execute an operation that's likely to fail. It acts like an electrical circuit breaker, stopping the flow of requests when a service is known to be unavailable.

### Quick Summary

**What it does:**
- Monitors webhook delivery failures
- Automatically stops calling failing webhooks ("opens the circuit")
- Periodically tests if the webhook recovered ("half-open state")
- Automatically resumes normal operation when recovered ("closes the circuit")

**Why it matters:**
- Saves Lambda execution time and costs
- Prevents cascading failures
- Enables automatic recovery
- Provides better observability into external service health

---

## Problem Statement

### Current State (Phase 1)

From [error-handling.md](../architecture/error-handling.md#L149-153):

```typescript
// Retry Policy (Phase 1)
- Attempts: 3 retries with exponential backoff
- Backoff: 1s, 2s, 4s
- Max Total Time: ~7 seconds
- Timeout per attempt: 10 seconds
```

### The Problem

When an external webhook service goes down:

**Scenario:** Customer's webhook server crashes, 1000 pending birthday events in queue

**Without Circuit Breaker:**
```
Event 1:  10s timeout + 10s retry + 10s retry = 30 seconds wasted
Event 2:  10s timeout + 10s retry + 10s retry = 30 seconds wasted
Event 3:  10s timeout + 10s retry + 10s retry = 30 seconds wasted
...
Event 1000: 10s timeout + 10s retry + 10s retry = 30 seconds wasted

Total wasted time: 1000 × 30s = 8.3 hours of Lambda runtime!
Total Lambda cost: 8.3 hours × Lambda cost
Impact: Other events delayed waiting for Lambda capacity
```

**With Circuit Breaker:**
```
Event 1-5:   Normal retry behavior (circuit learns about failures)
Event 6-1000: Fail immediately (circuit open, no timeout wait)

Total wasted time: ~30 seconds for first 5 events
Circuit automatically tests recovery every 30 seconds
When webhook recovers, circuit closes and processing resumes
```

### Cost Impact Example

**Without Circuit Breaker:**
- Lambda duration: 1000 events × 30 seconds = 30,000 seconds
- Lambda cost: 30,000s × $0.0000166667/second = **$5.00 wasted**
- DLQ messages: 1000 events (all failed after retries)
- Recovery time: Manual intervention required

**With Circuit Breaker:**
- Lambda duration: 5 events × 30 seconds = 150 seconds
- Lambda cost: 150s × $0.0000166667/second = **$0.025**
- DLQ messages: 5 events (circuit opened before others tried)
- Recovery time: Automatic (circuit tests every 30s)

**Savings: $4.98 per incident + automatic recovery**

---

## Solution Design

### Three-State State Machine

```
┌─────────────────────────────────────────────────────────────┐
│                    CIRCUIT BREAKER                          │
└─────────────────────────────────────────────────────────────┘

         Initial State
              │
              ▼
      ┌───────────────┐
      │    CLOSED     │◄──────────────────┐
      │  (Normal)     │                   │
      │               │                   │
      │ Allows all    │              Success rate
      │ requests      │              above threshold
      │               │                   │
      └───────┬───────┘                   │
              │                           │
        Failure rate                      │
        exceeds threshold                 │
              │                           │
              ▼                           │
      ┌───────────────┐                  │
      │     OPEN      │                  │
      │  (Failing)    │                  │
      │               │                  │
      │ Rejects all   │                  │
      │ requests      │                  │
      │ immediately   │                  │
      └───────┬───────┘                  │
              │                           │
        After timeout                     │
        period (30s)                      │
              │                           │
              ▼                           │
      ┌───────────────┐                  │
      │  HALF-OPEN    │                  │
      │  (Testing)    │                  │
      │               │                  │
      │ Allows        │                  │
      │ limited test  │──────────────────┘
      │ requests      │     All tests pass
      │               │
      └───────┬───────┘
              │
        Any test fails
              │
              └──────────────┐
                             │
                             ▼
                    Back to OPEN
```

### State Descriptions

#### 1. CLOSED (Normal Operation)
- **Behavior:** All requests flow through normally
- **Monitoring:** Tracks success/failure rate
- **Transition:** Opens circuit if failure rate exceeds 50% over 10-second window

**Example:**
```
Request 1: Success ✅
Request 2: Success ✅
Request 3: Failure ❌
Request 4: Failure ❌
Request 5: Failure ❌  → Failure rate = 60% → Circuit OPENS
```

#### 2. OPEN (Known Failure)
- **Behavior:** Rejects all requests immediately (no webhook call made)
- **Purpose:** Prevent wasted resources on known-failing service
- **Duration:** 30 seconds (configurable)
- **Transition:** After timeout, moves to HALF-OPEN

**Example:**
```
Request 6:  Circuit OPEN → Fail immediately ⚡ (no webhook call)
Request 7:  Circuit OPEN → Fail immediately ⚡ (no webhook call)
...
Request 100: Circuit OPEN → Fail immediately ⚡ (no webhook call)

After 30s: Circuit moves to HALF-OPEN
```

#### 3. HALF-OPEN (Testing Recovery)
- **Behavior:** Allows limited test requests (3 attempts)
- **Purpose:** Check if service recovered
- **Transition:**
  - If all 3 succeed → Circuit CLOSES (service recovered)
  - If any fail → Circuit OPENS again (not recovered yet)

**Example:**
```
Test 1: Success ✅
Test 2: Success ✅
Test 3: Success ✅  → Circuit CLOSES (service recovered!)

OR

Test 1: Failure ❌  → Circuit OPENS again (not ready yet)
```

### Configuration Parameters

```typescript
const circuitBreakerOptions = {
  // Failure threshold
  errorThresholdPercentage: 50,  // Open if 50% of requests fail

  // Time windows
  resetTimeout: 30000,            // Try recovery after 30s
  timeout: 10000,                 // Request timeout (10s)
  rollingCountTimeout: 10000,     // 10s rolling window

  // Volume threshold
  volumeThreshold: 5,             // Need 5+ requests before opening circuit

  // Half-open state
  halfOpenMaxAttempts: 3,         // 3 test requests in HALF-OPEN
};
```

---

## Implementation Guide

### Step 1: Install Dependencies

```bash
npm install opossum
npm install --save-dev @types/opossum
```

**Library:** [opossum](https://github.com/nodeshift/opossum) - Production-ready circuit breaker for Node.js

### Step 2: Create Circuit Breaker Error Classes

```typescript
// src/domain/errors/CircuitOpenError.ts
import { InfrastructureError } from './InfrastructureError';

/**
 * Thrown when circuit breaker is open and rejects requests
 */
export class CircuitOpenError extends InfrastructureError {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}
```

### Step 3: Implement Circuit Breaker Wrapper

```typescript
// src/modules/event-scheduling/adapters/delivery/WebhookDeliveryAdapter.ts
import CircuitBreaker from 'opossum';
import axios, { AxiosInstance } from 'axios';
import { IDeliveryAdapter, DeliveryResult } from '../../application/ports/IDeliveryAdapter';
import { Event } from '../../domain/entities/Event';
import { ILogger } from '../../../../shared/logging/ILogger';
import { CircuitOpenError } from '../../../../domain/errors/CircuitOpenError';
import { WebhookDeliveryError } from '../../../../domain/errors/WebhookDeliveryError';
import { DateTime } from 'luxon';

/**
 * Circuit Breaker configuration for webhook delivery
 *
 * Prevents cascading failures when external webhooks are down.
 * Opens circuit after 50% failure rate, closes after successful recovery tests.
 */
const CIRCUIT_BREAKER_OPTIONS = {
  // Failure threshold
  errorThresholdPercentage: 50,  // Open circuit if 50% of requests fail
  resetTimeout: 30000,            // Try again after 30 seconds
  timeout: 10000,                 // Request timeout (10 seconds)

  // Volume threshold
  rollingCountTimeout: 10000,     // 10 second rolling window
  rollingCountBuckets: 10,        // 10 buckets (1 second each)
  volumeThreshold: 5,             // Need at least 5 requests before opening circuit

  // Half-open state
  halfOpenMaxAttempts: 3,         // Allow 3 test requests in HALF-OPEN state
};

/**
 * Webhook delivery adapter with circuit breaker protection
 *
 * Wraps HTTP webhook calls in a circuit breaker to prevent wasted Lambda
 * execution time when external webhooks are down.
 */
export class WebhookDeliveryAdapter implements IDeliveryAdapter {
  private readonly httpClient: AxiosInstance;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly logger: ILogger;
  private readonly webhookUrl: string;

  public constructor(logger: ILogger, webhookUrl: string) {
    this.logger = logger;
    this.webhookUrl = webhookUrl;

    // Create HTTP client with timeout
    this.httpClient = axios.create({
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Create circuit breaker wrapping the HTTP call
    this.circuitBreaker = new CircuitBreaker(
      this.makeWebhookCall.bind(this),
      CIRCUIT_BREAKER_OPTIONS
    );

    // Register circuit breaker event listeners
    this.setupCircuitBreakerListeners();
  }

  /**
   * Setup event listeners for circuit breaker state changes
   */
  private setupCircuitBreakerListeners(): void {
    // Circuit opened (service failing)
    this.circuitBreaker.on('open', () => {
      this.logger.warn({
        circuitState: 'OPEN',
        webhookUrl: this.webhookUrl,
      }, 'Circuit breaker OPENED - webhook delivery failing');
    });

    // Circuit half-open (testing recovery)
    this.circuitBreaker.on('halfOpen', () => {
      this.logger.info({
        circuitState: 'HALF_OPEN',
        webhookUrl: this.webhookUrl,
      }, 'Circuit breaker HALF-OPEN - testing webhook recovery');
    });

    // Circuit closed (service recovered)
    this.circuitBreaker.on('close', () => {
      this.logger.info({
        circuitState: 'CLOSED',
        webhookUrl: this.webhookUrl,
      }, 'Circuit breaker CLOSED - webhook delivery recovered');
    });

    // Fallback when circuit is open
    this.circuitBreaker.fallback((event: Event) => {
      this.logger.warn({
        eventId: event.id,
        circuitState: this.circuitBreaker.status.name,
        webhookUrl: this.webhookUrl,
      }, 'Circuit breaker rejected webhook call - will retry later');

      // Throw error to trigger retry via SQS
      throw new CircuitOpenError('Webhook service unavailable, circuit open');
    });
  }

  /**
   * The actual webhook call wrapped by circuit breaker
   *
   * @private - Called by circuit breaker, not directly
   */
  private async makeWebhookCall(event: Event): Promise<DeliveryResult> {
    const response = await this.httpClient.post(
      this.webhookUrl,
      event.deliveryPayload,
      {
        headers: {
          'X-Idempotency-Key': event.idempotencyKey,
          'X-Event-Id': event.id,
          'X-Event-Type': event.eventType,
        },
      }
    );

    return {
      success: true,
      statusCode: response.status,
      deliveredAt: DateTime.now(),
    };
  }

  /**
   * Deliver event via webhook with circuit breaker protection
   *
   * Circuit breaker will:
   * - Allow requests when service is healthy (CLOSED state)
   * - Reject requests immediately when service is down (OPEN state)
   * - Test recovery periodically (HALF-OPEN state)
   */
  public async deliver(event: Event): Promise<DeliveryResult> {
    try {
      // Circuit breaker wraps the call
      const result = await this.circuitBreaker.fire(event);

      this.logger.info({
        eventId: event.id,
        statusCode: result.statusCode,
        circuitState: this.circuitBreaker.status.name,
      }, 'Webhook delivered successfully');

      return result;

    } catch (error) {
      // Circuit breaker is open - fail fast
      if (error instanceof CircuitOpenError) {
        this.logger.warn({
          eventId: event.id,
          circuitState: this.circuitBreaker.status.name,
        }, 'Circuit breaker open - marking event for retry');

        throw new WebhookDeliveryError(
          'Webhook service unavailable, will retry later',
          { retryable: true }
        );
      }

      // Handle HTTP errors
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status;

        // 4xx - permanent failure, don't retry
        if (statusCode && statusCode >= 400 && statusCode < 500) {
          this.logger.warn({
            eventId: event.id,
            statusCode,
          }, 'Webhook delivery failed with client error - no retry');

          throw new WebhookDeliveryError(
            `Webhook rejected with HTTP ${statusCode}`,
            { retryable: false }
          );
        }

        // 5xx or timeout - transient, retry later
        this.logger.error({
          eventId: event.id,
          statusCode,
          error: error.message,
        }, 'Webhook delivery failed - will retry');

        throw new WebhookDeliveryError(
          `Webhook failed with HTTP ${statusCode}`,
          { retryable: true }
        );
      }

      throw error;
    }
  }

  /**
   * Get current circuit breaker status for health checks
   *
   * Useful for admin UI and monitoring dashboards
   */
  public getCircuitStatus() {
    return {
      state: this.circuitBreaker.status.name,        // "CLOSED", "OPEN", "HALF_OPEN"
      stats: {
        failures: this.circuitBreaker.status.stats.failures,
        successes: this.circuitBreaker.status.stats.successes,
        fallbacks: this.circuitBreaker.status.stats.fallbacks,
        timeouts: this.circuitBreaker.status.stats.timeouts,
      },
    };
  }
}
```

### Step 4: Update Use Case

No changes needed! The circuit breaker is transparent to the use case:

```typescript
// src/modules/event-scheduling/application/use-cases/ExecuteEventUseCase.ts
export class ExecuteEventUseCase {
  constructor(
    private readonly eventRepository: IEventRepository,
    private readonly deliveryAdapter: WebhookDeliveryAdapter, // Has circuit breaker internally
    private readonly logger: ILogger
  ) {}

  public async execute(eventId: string): Promise<void> {
    const event = await this.eventRepository.findById(eventId);
    if (!event) throw new EventNotFoundError(eventId);

    try {
      // Delivery adapter has circuit breaker - transparent to use case
      const result = await this.deliveryAdapter.deliver(event);

      event.markCompleted(result.deliveredAt);
      await this.eventRepository.update(event);

    } catch (error) {
      if (error instanceof WebhookDeliveryError && error.retryable) {
        // SQS will retry this message automatically
        throw error;
      }

      // Permanent failure - mark event as failed
      event.markFailed(error.message);
      await this.eventRepository.update(event);
    }
  }
}
```

### Step 5: Add Health Check Endpoint

```typescript
// src/adapters/primary/api/routes/health.routes.ts
import { FastifyInstance } from 'fastify';
import { WebhookDeliveryAdapter } from '../../../modules/event-scheduling/adapters/delivery/WebhookDeliveryAdapter';

export async function healthRoutes(
  fastify: FastifyInstance,
  deliveryAdapter: WebhookDeliveryAdapter
) {
  /**
   * Circuit breaker health check
   *
   * GET /health/circuit-breaker
   *
   * Returns current state of circuit breaker
   */
  fastify.get('/health/circuit-breaker', async (request, reply) => {
    const status = deliveryAdapter.getCircuitStatus();

    const isHealthy = status.state === 'CLOSED' || status.state === 'HALF_OPEN';

    return reply.status(isHealthy ? 200 : 503).send({
      state: status.state,
      healthy: isHealthy,
      stats: status.stats,
    });
  });
}
```

### Step 6: Add Tests

```typescript
// src/__tests__/unit/adapters/delivery/WebhookDeliveryAdapter.test.ts
import { WebhookDeliveryAdapter } from '../../../../modules/event-scheduling/adapters/delivery/WebhookDeliveryAdapter';
import { CircuitOpenError } from '../../../../domain/errors/CircuitOpenError';
import { EventBuilder } from '../../../helpers/builders/EventBuilder';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WebhookDeliveryAdapter - Circuit Breaker', () => {
  let adapter: WebhookDeliveryAdapter;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    adapter = new WebhookDeliveryAdapter(
      mockLogger,
      'https://webhook.example.com'
    );

    mockedAxios.create.mockReturnValue(mockedAxios as any);
  });

  it('should open circuit after threshold failures', async () => {
    // Arrange: Mock 5 consecutive failures
    mockedAxios.post.mockRejectedValue(new Error('Connection refused'));

    const event = new EventBuilder().build();

    // Act: Trigger 5 failures to open circuit
    for (let i = 0; i < 5; i++) {
      try {
        await adapter.deliver(event);
      } catch (error) {
        // Expected
      }
    }

    // Assert: Circuit should be open
    const status = adapter.getCircuitStatus();
    expect(status.state).toBe('OPEN');

    // Next request should fail immediately without calling webhook
    await expect(adapter.deliver(event)).rejects.toThrow(CircuitOpenError);

    // Verify webhook wasn't called (still 5 from before, not 6)
    expect(mockedAxios.post).toHaveBeenCalledTimes(5);
  });

  it('should close circuit after successful recovery', async () => {
    // Arrange: Open the circuit
    mockedAxios.post.mockRejectedValue(new Error('Connection refused'));
    const event = new EventBuilder().build();

    for (let i = 0; i < 5; i++) {
      try { await adapter.deliver(event); } catch {}
    }

    expect(adapter.getCircuitStatus().state).toBe('OPEN');

    // Wait for circuit to transition to HALF-OPEN (30s in real, mocked in test)
    await new Promise(resolve => setTimeout(resolve, 35000));

    // Act: Successful request in HALF-OPEN state
    mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
    await adapter.deliver(event);

    // Assert: Circuit should close
    expect(adapter.getCircuitStatus().state).toBe('CLOSED');
  });
});
```

---

## When to Implement

Implement Circuit Breaker when you observe these conditions:

### Metrics-Based Triggers

✅ **High webhook timeout rate**
- Lambda CloudWatch logs show >10% webhook timeouts
- Average webhook latency >5 seconds

✅ **Significant Lambda cost from retries**
- Monthly Lambda cost >$50 for webhook delivery alone
- Lambda duration dominated by timeout waits

✅ **Frequent webhook service outages**
- External webhook down >2 times per month
- Each outage causes cascading DLQ buildup

✅ **Event processing delays**
- Events taking >5 minutes to process due to timeout retries
- Queue depth growing during webhook outages

### Traffic-Based Triggers

✅ **High event volume**
- Processing >1000 events/hour
- Multiple customers with different webhook endpoints

✅ **Production scale**
- Real production traffic with SLAs
- Cost optimization is a priority

### Operational Triggers

✅ **Incident history**
- Had at least one webhook outage incident
- Manual intervention was required for recovery

✅ **Multi-tenant system**
- Multiple webhook endpoints (different customers)
- One customer's failing webhook affects others

### Don't Implement Yet If:

❌ **Low volume** - <100 events/hour
❌ **Single reliable endpoint** - Your own controlled API
❌ **Phase 1 MVP** - Focus on core functionality first
❌ **No timeout issues observed** - Current retry logic working fine
❌ **Pre-production** - No real traffic yet

---

## Benefits

### 1. Cost Savings

**Lambda execution time:**
- Reduce wasted Lambda runtime by 90%+ during webhook outages
- Typical savings: $5-10 per incident

**Example:**
```
Incident: Webhook down for 1 hour, 1000 events pending

Without Circuit Breaker:
- Lambda runtime: 1000 × 30s = 8.3 hours = $5.00

With Circuit Breaker:
- Lambda runtime: 5 × 30s = 2.5 minutes = $0.025
- Savings: $4.98 (99.5% reduction)
```

### 2. Automatic Recovery

- No manual intervention needed
- Circuit tests recovery every 30 seconds
- Resumes processing automatically when service recovers

### 3. Resource Protection

- Free up Lambda capacity for other events
- Prevent DLQ from filling with temporary failures
- Reduce SQS visibility timeout churn

### 4. Better Observability

**Circuit state changes are events:**
- OPEN → Webhook service is down (alert ops)
- HALF-OPEN → Testing recovery (informational)
- CLOSED → Service recovered (all clear)

**Dashboards can show:**
- Current circuit state per webhook endpoint
- Frequency of circuit openings
- Recovery time (time spent in OPEN state)

### 5. Improved SLA

**Before Circuit Breaker:**
- Webhook outage → All events timeout → DLQ fills → Manual recovery
- Downtime: Hours (until manual intervention)

**After Circuit Breaker:**
- Webhook outage → Circuit opens → Events retry later → Auto recovery
- Downtime: Minutes (automatic recovery testing)

---

## Costs & Trade-offs

### Implementation Cost

**Development time:** 2-3 days
- Implement circuit breaker wrapper: 1 day
- Add monitoring and health checks: 0.5 day
- Write tests: 0.5 day
- Documentation: 0.5 day
- Testing in staging: 0.5 day

**Dependencies:**
- `opossum` library (~100KB, well-maintained)
- No additional AWS services required

### Operational Cost

**Runtime overhead:**
- Negligible (<1ms per request)
- In-memory state tracking only
- No database calls

**Maintenance:**
- Tune thresholds based on observed behavior
- Monitor circuit breaker metrics
- Update configuration as traffic patterns change

### Trade-offs

**Pros:**
- ✅ Significant cost savings during outages
- ✅ Automatic recovery
- ✅ Better resource utilization
- ✅ Improved observability

**Cons:**
- ❌ Additional complexity in delivery adapter
- ❌ Need to tune thresholds correctly
- ❌ False positives if thresholds too aggressive
- ❌ Requires monitoring to be effective

### Configuration Tuning

**Too aggressive (opens too easily):**
- Symptom: Circuit opens during temporary spikes
- Impact: Unnecessary event delays
- Fix: Increase `errorThresholdPercentage` or `volumeThreshold`

**Too lenient (opens too late):**
- Symptom: Many events timeout before circuit opens
- Impact: Some Lambda costs still wasted
- Fix: Decrease `errorThresholdPercentage` or `resetTimeout`

**Recommended starting values:**
```typescript
{
  errorThresholdPercentage: 50,  // Open after 50% failures
  volumeThreshold: 5,             // Need 5+ requests
  resetTimeout: 30000,            // Test recovery after 30s
}
```

Adjust based on production metrics.

---

## Monitoring

### CloudWatch Metrics

Create custom CloudWatch metrics:

```typescript
// In circuit breaker event handlers
this.circuitBreaker.on('open', () => {
  cloudwatch.putMetric({
    MetricName: 'CircuitBreakerState',
    Value: 1,  // 0=CLOSED, 1=OPEN, 0.5=HALF_OPEN
    Dimensions: [{ Name: 'WebhookURL', Value: this.webhookUrl }],
  });
});
```

### Recommended Alarms

1. **Circuit Open Alarm**
   ```
   Metric: CircuitBreakerState = 1
   Threshold: Duration > 5 minutes
   Action: SNS notification to ops team
   ```

2. **High Fallback Rate**
   ```
   Metric: CircuitBreakerFallbacks
   Threshold: > 100 per minute
   Action: SNS notification
   ```

### Dashboards

**Circuit Breaker Dashboard:**
- Current state (gauge: CLOSED/OPEN/HALF-OPEN)
- State transition timeline
- Success/failure rates
- Fallback count (requests rejected by open circuit)

**Sample CloudWatch Dashboard JSON:**
```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["CircuitBreaker", "State", { "stat": "Maximum" }],
          [".", "Successes", { "stat": "Sum" }],
          [".", "Failures", { "stat": "Sum" }],
          [".", "Fallbacks", { "stat": "Sum" }]
        ],
        "period": 60,
        "stat": "Average",
        "region": "us-east-1",
        "title": "Circuit Breaker Health"
      }
    }
  ]
}
```

### Health Check Endpoint

```bash
# Check circuit breaker status
curl https://api.example.com/health/circuit-breaker

# Response
{
  "state": "CLOSED",
  "healthy": true,
  "stats": {
    "failures": 0,
    "successes": 1234,
    "fallbacks": 0,
    "timeouts": 0
  }
}
```

---

## References

### Related Documentation

- [Error Handling Strategy](../architecture/error-handling.md#L154-155) - Circuit breaker mention in Phase 1
- [Design Patterns](../architecture/design-patterns.md) - Resilience patterns
- [Infrastructure](../architecture/infrastructure.md) - Lambda and webhook configuration

### External Resources

- **opossum library:** https://github.com/nodeshift/opossum
- **Martin Fowler - Circuit Breaker:** https://martinfowler.com/bliki/CircuitBreaker.html
- **AWS Lambda Best Practices:** https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html
- **Release It! by Michael Nygard** - Chapter on Circuit Breaker pattern

### Implementation Examples

- **Netflix Hystrix:** Java implementation (now in maintenance mode)
- **Resilience4j:** Modern Java implementation
- **opossum:** Node.js implementation (used in this doc)

---

**Status:** Ready for implementation when Phase 1 metrics indicate need
**Last Updated:** 2025-01-31
**Next Review:** After 1 month of Phase 1 production traffic
