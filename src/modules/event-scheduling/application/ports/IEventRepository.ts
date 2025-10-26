import { Event } from '../../domain/entities/Event';

/**
 * Repository interface for Event persistence operations.
 *
 * This port abstracts event data access, allowing the application layer
 * to remain independent of specific database implementations (PostgreSQL,
 * MongoDB, DynamoDB, in-memory, etc.).
 *
 * All methods use domain entities (Event) rather than database-specific
 * models, enforcing clean architecture boundaries.
 *
 * Note: The 'I' prefix for port interfaces is required by the project's
 * architecture standards (Hexagonal Architecture pattern).
 * See: docs/architecture/coding-standards.md
 */
/* eslint-disable @typescript-eslint/naming-convention */
export interface IEventRepository {
  /**
   * Creates a new event in the persistence layer.
   *
   * @param event - The Event domain entity to persist
   * @returns Promise resolving to the created Event with generated fields (id, timestamps)
   */
  create(event: Event): Promise<Event>;

  /**
   * Finds an event by its unique identifier.
   *
   * @param eventId - The unique event ID (UUID)
   * @returns Promise resolving to the Event entity if found, null otherwise
   */
  findById(eventId: string): Promise<Event | null>;

  /**
   * Finds all events associated with a specific user.
   *
   * This method supports querying a user's event history and upcoming events.
   *
   * @param userId - The unique user ID (UUID)
   * @returns Promise resolving to array of Event entities for the user (may be empty)
   */
  findByUserId(userId: string): Promise<Event[]>;

  /**
   * Updates an existing event in the persistence layer.
   *
   * Implementation may use optimistic locking via the version field
   * to prevent concurrent modification issues.
   *
   * @param event - The Event domain entity with updated fields
   * @returns Promise resolving to the updated Event entity
   */
  update(event: Event): Promise<Event>;

  /**
   * Atomically claims ready events for execution.
   *
   * **DUAL PURPOSE:**
   * 1. **Normal Operation:** Scheduler polls every minute to claim events ready NOW
   *    (events whose targetTimestampUTC has just arrived)
   * 2. **Recovery Mode:** After system downtime, claims ALL backlogged events from the past
   *    (events that should have fired while system was down)
   *
   * **Implementation Requirements:**
   * - MUST return only events where `targetTimestampUTC <= now` (past OR present)
   * - MUST return only events where `status = PENDING`
   * - MUST atomically lock events to prevent duplicate claiming by concurrent scheduler instances
   *   (Implementation will use database-specific locking like `FOR UPDATE SKIP LOCKED` in PostgreSQL)
   * - MUST use optimistic locking via version field to prevent race conditions
   *
   * **Why "claim" not "find"?**
   * The word "claim" is semantically important - this method both FINDS and LOCKS events
   * in a single atomic operation. This prevents race conditions in distributed systems where
   * multiple scheduler instances might run concurrently.
   *
   * **How it handles missed events:**
   * The method doesn't distinguish between "ready now" and "missed from the past" - both
   * are simply events where `targetTimestampUTC <= now`. When the system recovers from downtime,
   * calling this method will automatically claim all backlogged events without needing a separate
   * "findMissedEvents" method.
   *
   * @param limit - Maximum number of events to claim (prevents overwhelming the system during recovery)
   * @returns Promise resolving to array of claimed Event entities (may be empty if no events ready)
   */
  claimReadyEvents(limit: number): Promise<Event[]>;

  /**
   * Deletes all events associated with a specific user.
   *
   * This method supports cascade deletion when a user is removed from the system.
   * All events (PENDING, PROCESSING, COMPLETED, FAILED) for the user are deleted.
   *
   * **Usage in DeleteUserUseCase:**
   * This method is called before deleting the user to maintain referential integrity.
   * It should be wrapped in a transaction with user deletion to ensure atomicity.
   *
   * @param userId - The unique user ID (UUID)
   * @returns Promise that resolves when all events are deleted
   */
  deleteByUserId(userId: string): Promise<void>;

  /**
   * Finds missed events that should have executed during system downtime.
   *
   * **Purpose:**
   * Detects PENDING events with targetTimestampUTC in the past, indicating
   * they were scheduled to execute but missed due to system downtime, deployment,
   * or other service interruptions.
   *
   * **Query Specification:**
   * Returns events where:
   * - `status = 'PENDING'` (not yet executed)
   * - `targetTimestampUTC < NOW()` (should have already fired)
   * - Ordered by `targetTimestampUTC ASC` (oldest events first for fair recovery)
   * - Limited to `limit` parameter (prevents memory overflow during recovery)
   *
   * **Why ORDER BY targetTimestampUTC ASC?**
   * - Ensures fairness: Users with birthdays 7 days ago get priority over 1 hour ago
   * - Matches scheduler's query pattern (oldest first)
   * - Allows incremental recovery (process oldest batch, then next oldest batch)
   *
   * **Why limit parameter?**
   * - Prevents overwhelming system during recovery from extended downtime
   * - Enables batch processing (Story 3.2 will process via SQS in batches)
   * - Typical usage: `findMissedEvents(1000)` for 1000 events per batch
   *
   * **Difference from claimReadyEvents():**
   * - `findMissedEvents()`: Read-only query, does NOT modify event status
   * - `claimReadyEvents()`: Atomically locks events and updates status to PROCESSING
   *
   * **Usage in RecoveryService:**
   * This method is called on system startup to detect backlogged events.
   * The RecoveryService logs statistics about missed events, then Story 3.2
   * will handle sending them to SQS for execution.
   *
   * @param limit - Maximum number of missed events to return (typically 1000)
   * @returns Promise<Event[]> - Array of missed Event entities ordered by targetTimestampUTC ASC (may be empty)
   *
   * @see RecoveryService for detection workflow
   * @see Story 3.1: Recovery Service - Missed Event Detection
   * @see Story 3.2: Recovery Service - Batch Execution (future)
   */
  findMissedEvents(limit: number): Promise<Event[]>;
}
