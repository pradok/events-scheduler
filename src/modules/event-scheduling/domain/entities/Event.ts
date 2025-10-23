import { DateTime } from 'luxon';
import { EventStatus, validateTransition } from '../value-objects/EventStatus';
import { IdempotencyKey } from '../value-objects/IdempotencyKey';
import { EventProps } from '../../../../domain/schemas/EntitySchemas';

/**
 * Event entity
 * Represents a scheduled event with state machine enforcement
 * Immutable - all state change methods return new instances
 */
export class Event {
  public readonly id: string;
  public readonly userId: string;
  public readonly eventType: string;
  public readonly status: EventStatus;
  public readonly targetTimestampUTC: DateTime;
  public readonly targetTimestampLocal: DateTime;
  public readonly targetTimezone: string;
  public readonly executedAt: DateTime | null;
  public readonly failureReason: string | null;
  public readonly retryCount: number;
  public readonly version: number;
  public readonly idempotencyKey: IdempotencyKey;
  public readonly deliveryPayload: Record<string, unknown>;
  public readonly createdAt: DateTime;
  public readonly updatedAt: DateTime;

  public constructor(props: EventProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.eventType = props.eventType;
    this.status = props.status;
    this.targetTimestampUTC = props.targetTimestampUTC;
    this.targetTimestampLocal = props.targetTimestampLocal;
    this.targetTimezone = props.targetTimezone;
    this.executedAt = props.executedAt;
    this.failureReason = props.failureReason;
    this.retryCount = props.retryCount;
    this.version = props.version;
    this.idempotencyKey = props.idempotencyKey;
    this.deliveryPayload = props.deliveryPayload;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /**
   * Claims the event for processing (PENDING → PROCESSING)
   * @returns A new Event instance in PROCESSING state
   */
  public claim(): Event {
    validateTransition(this.status, EventStatus.PROCESSING);

    return new Event({
      ...this,
      status: EventStatus.PROCESSING,
      version: this.version + 1,
      updatedAt: DateTime.now(),
    });
  }

  /**
   * Marks the event as completed (PROCESSING → COMPLETED)
   * @param executedAt The timestamp when the event was executed
   * @returns A new Event instance in COMPLETED state
   */
  public markCompleted(executedAt: DateTime): Event {
    validateTransition(this.status, EventStatus.COMPLETED);

    return new Event({
      ...this,
      status: EventStatus.COMPLETED,
      executedAt,
      version: this.version + 1,
      updatedAt: DateTime.now(),
    });
  }

  /**
   * Marks the event as failed (PROCESSING → FAILED)
   * @param reason The failure reason
   * @returns A new Event instance in FAILED state with incremented retry count
   */
  public markFailed(reason: string): Event {
    validateTransition(this.status, EventStatus.FAILED);

    return new Event({
      ...this,
      status: EventStatus.FAILED,
      failureReason: reason,
      retryCount: this.retryCount + 1,
      version: this.version + 1,
      updatedAt: DateTime.now(),
    });
  }

  /**
   * Checks if the event can be retried
   * @returns True if retry count < 3 and status is FAILED
   */
  public canRetry(): boolean {
    return this.retryCount < 3 && this.status === EventStatus.FAILED;
  }

  /**
   * Reschedules the event to a new target timestamp (immutable - returns new instance)
   *
   * This method is used when a user changes their birthday or timezone,
   * requiring PENDING events to be rescheduled.
   *
   * **Business Rule:** Only PENDING events can be rescheduled.
   * PROCESSING, COMPLETED, and FAILED events are historical records and must not be modified.
   *
   * @param newTargetTimestampUTC - New target timestamp in UTC
   * @param newTargetTimestampLocal - New target timestamp in user's local time
   * @param newTargetTimezone - New timezone identifier (IANA format)
   * @returns A new Event instance with updated timestamps
   * @throws Error if event status is not PENDING
   */
  public reschedule(
    newTargetTimestampUTC: DateTime,
    newTargetTimestampLocal: DateTime,
    newTargetTimezone: string
  ): Event {
    if (this.status !== EventStatus.PENDING) {
      throw new Error(
        `Cannot reschedule event with status ${this.status}. Only PENDING events can be rescheduled.`
      );
    }

    return new Event({
      ...this,
      targetTimestampUTC: newTargetTimestampUTC,
      targetTimestampLocal: newTargetTimestampLocal,
      targetTimezone: newTargetTimezone,
      version: this.version + 1,
      updatedAt: DateTime.now(),
    });
  }
}
