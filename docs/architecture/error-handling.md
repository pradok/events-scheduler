# Error Handling Strategy

Comprehensive error handling approach for the Time-Based Event Scheduling System, including error models, logging standards, and handling patterns.

Reference: [Full Architecture Document](../architecture.md)

---

## General Approach

### Error Model
Layered error hierarchy with domain, application, and infrastructure errors.

### Exception Hierarchy

```typescript
// Base error classes
class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

class ApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApplicationError';
  }
}

class InfrastructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InfrastructureError';
  }
}
```

### Error Categories

#### DomainError
Base for business rule violations that occur within the domain layer:
- Invalid value objects (e.g., invalid timezone)
- Business rule violations (e.g., date of birth in the future)
- Entity state validation failures

#### ApplicationError
Use case orchestration failures:
- Resource not found (e.g., user not found)
- Concurrent modification conflicts
- State transition errors (e.g., event already processed)

#### InfrastructureError
Database, network, and external API failures:
- Database connection failures
- Network timeouts
- External API errors

### Error Propagation
Errors bubble up from domain → application → adapters. Adapters translate errors to:
- HTTP status codes (for API endpoints)
- Retry logic (for background jobs)
- Logging entries (for observability)

---

## Logging Standards

### Library
**Pino 8.17.2** - High-performance JSON logger

### Format
JSON structured logs for CloudWatch compatibility

### Log Levels
- **ERROR**: System errors requiring immediate attention
- **WARN**: Degraded functionality or unexpected conditions
- **INFO**: Normal operational messages
- **DEBUG**: Detailed debugging information (dev/staging only)

Levels are configurable per environment:
- Production: INFO and above
- Staging: DEBUG and above
- Development: DEBUG and above

### Required Context

Every log entry must include:

#### Correlation ID
- API requests: `req-{uuid}`
- Background jobs: `evt-{eventId}`
- System operations: `sys-{uuid}`

#### Service Context
- `serviceName`: Name of the service (e.g., "api-gateway", "scheduler", "worker")
- `environment`: Environment name (e.g., "production", "staging", "local")
- `version`: Application version (from package.json)

#### User Context
- `userId`: User ID when available (no PII)
- Never log: passwords, API keys, full names, email addresses, phone numbers

### Example Log Entry

```json
{
  "level": "info",
  "time": "2025-10-18T14:00:00.000Z",
  "correlationId": "req-550e8400-e29b-41d4-a716-446655440000",
  "serviceName": "api-gateway",
  "environment": "production",
  "version": "1.0.0",
  "userId": "660e8400-e29b-41d4-a716-446655440001",
  "msg": "User created successfully",
  "duration": 142
}
```

### Error Log Entry Example

```json
{
  "level": "error",
  "time": "2025-10-18T14:05:00.000Z",
  "correlationId": "evt-770e8400-e29b-41d4-a716-446655440002",
  "serviceName": "worker",
  "environment": "production",
  "version": "1.0.0",
  "eventId": "770e8400-e29b-41d4-a716-446655440002",
  "msg": "Webhook delivery failed",
  "error": {
    "type": "WebhookDeliveryError",
    "message": "HTTP 503 Service Unavailable",
    "statusCode": 503,
    "retryable": true
  },
  "duration": 5200
}
```

---

## Error Handling Patterns

### External API Errors

#### Retry Policy
- **Attempts**: 3 retries with exponential backoff
- **Backoff**: 1s, 2s, 4s
- **Max Total Time**: ~7 seconds

#### Circuit Breaker
Not implemented in Phase 1. Deferred to Phase 2+ when monitoring data indicates need.

**See:** [Phase 2 Enhancement: Circuit Breaker](../phase-2-enhancements/circuit-breaker.md) for detailed implementation guide.

#### Timeout Configuration
- **Webhook Calls**: 10 seconds
- **Database Queries**: 5 seconds
- **SQS Operations**: 30 seconds

#### Error Translation

| Response | Classification | Action |
|----------|---------------|---------|
| 2xx | Success | Mark event COMPLETED |
| 4xx | Permanent failure | Mark event FAILED, no retry |
| 5xx | Transient failure | Retry via SQS |
| Timeout | Transient failure | Retry via SQS |
| Network error | Transient failure | Retry via SQS |

#### Implementation Example

```typescript
async function deliverWebhook(event: Event): Promise<void> {
  try {
    const response = await httpClient.post(webhookUrl, {
      body: event.deliveryPayload,
      headers: {
        'X-Idempotency-Key': event.idempotencyKey
      },
      timeout: 10000
    });

    if (response.status >= 200 && response.status < 300) {
      // Success - mark completed
      await eventRepository.update(event.markCompleted());
    } else if (response.status >= 400 && response.status < 500) {
      // Permanent failure - don't retry
      await eventRepository.update(event.markFailed(`HTTP ${response.status}`));
    } else {
      // Transient failure - throw to trigger retry
      throw new WebhookDeliveryError(`HTTP ${response.status}`);
    }
  } catch (error) {
    if (error instanceof TimeoutError || error instanceof NetworkError) {
      // Transient - throw to trigger retry
      throw new WebhookDeliveryError('Timeout or network error', error);
    }
    throw error;
  }
}
```

---

## Business Logic Errors

### Custom Exceptions

#### Domain Layer Errors
```typescript
class InvalidTimezoneError extends DomainError {
  constructor(timezone: string) {
    super(`Invalid timezone: ${timezone}`);
    this.name = 'InvalidTimezoneError';
  }
}

class InvalidDateOfBirthError extends DomainError {
  constructor(dateOfBirth: string) {
    super(`Invalid date of birth: ${dateOfBirth}. Must be in the past.`);
    this.name = 'InvalidDateOfBirthError';
  }
}
```

#### Application Layer Errors
```typescript
class UserNotFoundError extends ApplicationError {
  constructor(userId: string) {
    super(`User not found: ${userId}`);
    this.name = 'UserNotFoundError';
  }
}

class EventAlreadyProcessedError extends ApplicationError {
  constructor(eventId: string) {
    super(`Event already processed: ${eventId}`);
    this.name = 'EventAlreadyProcessedError';
  }
}
```

### User-Facing Error Format

JSON format with error code, message, and field validation details:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Invalid input data",
    "details": [
      {
        "field": "dateOfBirth",
        "message": "Date of birth must be in the past"
      },
      {
        "field": "timezone",
        "message": "Invalid IANA timezone identifier"
      }
    ]
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| VALIDATION_FAILED | 400 | Input validation failed |
| INVALID_TIMEZONE | 400 | Invalid IANA timezone |
| INVALID_DATE_OF_BIRTH | 400 | Date of birth must be in past |
| USER_NOT_FOUND | 404 | User does not exist |
| EVENT_NOT_FOUND | 404 | Event does not exist |
| EVENT_ALREADY_PROCESSED | 409 | Event cannot be modified |
| INTERNAL_ERROR | 500 | Unexpected system error |

### Error Response Middleware

```typescript
function errorHandler(error: Error, req: Request, res: Response, next: NextFunction) {
  const correlationId = req.correlationId;

  if (error instanceof ValidationError) {
    logger.warn({ correlationId, error }, 'Validation error');
    return res.status(400).json({
      error: {
        code: 'VALIDATION_FAILED',
        message: error.message,
        details: error.details
      }
    });
  }

  if (error instanceof UserNotFoundError) {
    logger.warn({ correlationId, error }, 'User not found');
    return res.status(404).json({
      error: {
        code: 'USER_NOT_FOUND',
        message: error.message
      }
    });
  }

  // Default to 500 for unexpected errors
  logger.error({ correlationId, error }, 'Unexpected error');
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    }
  });
}
```

---

## Data Consistency

### Transaction Strategy
- **Approach**: ACID transactions for all write operations
- **Tool**: Prisma transaction API
- **Scope**: All operations that modify multiple entities must be wrapped in a transaction

#### Example: User Creation with Event

```typescript
async function createUserWithEvent(userDto: CreateUserDto): Promise<User> {
  return await prisma.$transaction(async (tx) => {
    // Create user
    const user = await tx.users.create({
      data: {
        firstName: userDto.firstName,
        lastName: userDto.lastName,
        dateOfBirth: userDto.dateOfBirth,
        timezone: userDto.timezone
      }
    });

    // Generate birthday event
    const event = await tx.events.create({
      data: {
        userId: user.id,
        eventType: 'BIRTHDAY',
        status: 'PENDING',
        targetTimestampUTC: calculateNextBirthday(user),
        // ... other fields
      }
    });

    return user;
  });
}
```

### Compensation Logic
Not required for Phase 1 due to simple CRUD operations. All operations are either:
- Single-entity updates (naturally atomic)
- Multi-entity updates wrapped in transactions

### Idempotency

#### Event Delivery
- Uses idempotency keys in webhook headers
- External systems should deduplicate based on idempotency key
- Format: `{userId}-{targetTimestampUTC.getTime()}`

#### API Operations
All API operations are designed to be idempotent:
- **POST /user**: Create is idempotent if user already exists (returns existing user)
- **PUT /user/:id**: Update is naturally idempotent
- **DELETE /user/:id**: Delete is naturally idempotent (returns 204 even if already deleted)

---

## Error Recovery

### Automatic Recovery
- **SQS Retries**: Automatic for transient failures
- **Dead Letter Queue**: Captures events after max retries
- **System Startup Recovery**: Finds and reprocesses missed events

### Manual Recovery
For events in the DLQ:
1. Investigate root cause via CloudWatch logs
2. Fix underlying issue (e.g., invalid webhook URL)
3. Manually requeue events or mark as failed
4. Document incident and resolution

### Alerting
Phase 2+ will include CloudWatch alarms for:
- High error rates
- DLQ depth exceeding threshold
- Failed event count exceeding threshold

---
