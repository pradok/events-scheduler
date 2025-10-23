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
}
