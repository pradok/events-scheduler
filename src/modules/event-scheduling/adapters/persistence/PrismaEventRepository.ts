import { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { IEventRepository } from '../../application/ports/IEventRepository';
import { Event } from '../../domain/entities/Event';
import { eventToDomain, eventToPrisma } from './mappers/eventMapper';
import { OptimisticLockError } from '../../../../domain/errors/OptimisticLockError';
import { EventStatus } from '../../domain/value-objects/EventStatus';

/**
 * Prisma implementation of IEventRepository.
 * Adapts domain Event entities to/from Prisma Event models for PostgreSQL persistence.
 */
export class PrismaEventRepository implements IEventRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  /**
   * Creates a new event in the database
   */
  public async create(event: Event): Promise<Event> {
    const prismaData = eventToPrisma(event);

    const created = await this.prisma.event.create({
      data: prismaData as unknown as Prisma.EventUncheckedCreateInput,
    });

    return eventToDomain(created);
  }

  /**
   * Finds an event by its unique ID
   */
  public async findById(eventId: string): Promise<Event | null> {
    const prismaEvent = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!prismaEvent) {
      return null;
    }

    return eventToDomain(prismaEvent);
  }

  /**
   * Finds all events for a specific user
   */
  public async findByUserId(userId: string): Promise<Event[]> {
    const prismaEvents = await this.prisma.event.findMany({
      where: { userId },
      orderBy: { targetTimestampUTC: 'asc' },
    });

    return prismaEvents.map(eventToDomain);
  }

  /**
   * Updates an event with optimistic locking
   * Throws OptimisticLockError if version mismatch
   *
   * Note: The domain Event entity increments version when state changes (e.g., claim()),
   * but we need to check against the PREVIOUS version in the database.
   * So we check where version = event.version - 1 (the version before the domain operation).
   */
  public async update(event: Event): Promise<Event> {
    const prismaData = eventToPrisma(event);
    const previousVersion = event.version - 1; // Version before the domain operation

    try {
      const updated = await this.prisma.event.update({
        where: {
          id: event.id,
          version: previousVersion, // Check against OLD version in DB
        },
        data: {
          status: prismaData.status,
          targetTimestampUTC: prismaData.targetTimestampUTC,
          targetTimestampLocal: prismaData.targetTimestampLocal,
          targetTimezone: prismaData.targetTimezone,
          executedAt: prismaData.executedAt,
          failureReason: prismaData.failureReason,
          retryCount: prismaData.retryCount,
          version: event.version, // Set to NEW version (no increment needed, already done by domain)
          updatedAt: prismaData.updatedAt,
        },
      });

      return eventToDomain(updated);
    } catch (error) {
      // Prisma throws P2025 when no record found (version mismatch)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new OptimisticLockError(
          `Event ${event.id} was modified by another transaction (expected version ${previousVersion})`
        );
      }
      throw error;
    }
  }

  /**
   * Atomically claims ready events using FOR UPDATE SKIP LOCKED
   * Returns PENDING events where targetTimestampUTC <= now and transitions them to PROCESSING
   *
   * **Raw SQL Justification:**
   * Uses `$queryRaw` because Prisma doesn't support PostgreSQL row-level locking:
   * 1. FOR UPDATE - Row-level lock to prevent concurrent claims
   * 2. SKIP LOCKED - Skip rows already locked by other transactions (avoid deadlocks)
   *
   * **Why not Prisma query builder?**
   * - No native support for FOR UPDATE or SKIP LOCKED in Prisma
   * - Using findMany() + updateMany() would create race conditions:
   *   * Scheduler A reads events 1, 2, 3
   *   * Scheduler B reads events 1, 2, 3 (same events!)
   *   * Both claim and process the same events (duplicate processing)
   *
   * **Concurrency Safety:**
   * FOR UPDATE SKIP LOCKED ensures multiple scheduler instances can run safely:
   * - Instance A locks events 1, 2, 3
   * - Instance B skips locked rows, claims events 4, 5, 6
   * - No duplicate processing, no deadlocks
   *
   * **Two-Phase Operation:**
   * 1. SELECT ... FOR UPDATE SKIP LOCKED (atomically claims rows)
   * 2. UPDATE status to PROCESSING (releases locks after commit)
   *
   * @see docs/architecture/coding-standards.md - Section on Raw SQL Usage
   * @see docs/architecture/design-patterns.md - Distributed Scheduler Pattern
   */
  public async claimReadyEvents(limit: number): Promise<Event[]> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      // PostgreSQL row-level locking prevents race conditions in distributed scheduler
      const events = await tx.$queryRaw<
        Array<{
          id: string;
          user_id: string;
          event_type: string;
          status: string;
          target_timestamp_utc: Date;
          target_timestamp_local: Date;
          target_timezone: string;
          executed_at: Date | null;
          failure_reason: string | null;
          retry_count: number;
          version: number;
          idempotency_key: string;
          delivery_payload: Prisma.JsonValue;
          created_at: Date;
          updated_at: Date;
        }>
      >`
        SELECT * FROM events
        WHERE status = 'PENDING'
          AND target_timestamp_utc <= ${now}
        ORDER BY target_timestamp_utc ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `;

      if (events.length === 0) {
        return [];
      }

      // Transition claimed events to PROCESSING and increment version
      const eventIds = events.map((e) => e.id);
      await tx.event.updateMany({
        where: {
          id: { in: eventIds },
        },
        data: {
          status: 'PROCESSING',
          version: { increment: 1 },
        },
      });

      // Map raw SQL results (snake_case) to domain entities
      return events.map((e) =>
        eventToDomain({
          id: e.id,
          userId: e.user_id,
          eventType: e.event_type,
          status: EventStatus.PROCESSING, // Already transitioned
          targetTimestampUTC: e.target_timestamp_utc,
          targetTimestampLocal: e.target_timestamp_local,
          targetTimezone: e.target_timezone,
          executedAt: e.executed_at,
          failureReason: e.failure_reason,
          retryCount: e.retry_count,
          version: e.version + 1, // Version was incremented
          idempotencyKey: e.idempotency_key,
          deliveryPayload: e.delivery_payload,
          createdAt: e.created_at,
          updatedAt: e.updated_at,
        })
      );
    });
  }

  /**
   * Deletes all events for a specific user (cascade delete)
   *
   * This method is used by DeleteUserUseCase to ensure referential integrity
   * when a user is removed from the system.
   *
   * All events (PENDING, PROCESSING, COMPLETED, FAILED) are deleted.
   *
   * **Transaction Requirement:**
   * This method should be called within a transaction that also deletes the user,
   * to ensure atomic cascade deletion.
   *
   * @param userId - UUID of the user whose events should be deleted
   * @returns Promise that resolves when all events are deleted
   */
  public async deleteByUserId(userId: string): Promise<void> {
    await this.prisma.event.deleteMany({
      where: { userId },
    });
  }

  /**
   * Finds missed events that should have executed during system downtime
   *
   * **Query Logic:**
   * Returns events where:
   * - `status = 'PENDING'` (not yet executed)
   * - `targetTimestampUTC < NOW()` (should have already fired)
   * - Ordered by `targetTimestampUTC ASC` (oldest events first)
   * - Limited to `limit` parameter (prevents memory overflow)
   *
   * **Prisma Query Builder Usage:**
   * This implementation uses Prisma's query builder (NOT raw SQL) because:
   * - Simple query that Prisma fully supports
   * - No need for advanced PostgreSQL features (FOR UPDATE, SKIP LOCKED)
   * - Maintains database abstraction and portability
   * - Read-only query (no locking required)
   *
   * **Why NOT use raw SQL?**
   * Per coding standards (docs/architecture/coding-standards.md#5-raw-sql-usage-in-prisma-repositories),
   * raw SQL should only be used when Prisma's query builder cannot express the required operation.
   * This query is a straightforward WHERE + ORDER BY + LIMIT operation that Prisma handles well.
   *
   * **Difference from claimReadyEvents():**
   * - `claimReadyEvents()`: Uses raw SQL with FOR UPDATE SKIP LOCKED for atomic claiming
   * - `findMissedEvents()`: Uses Prisma query builder, read-only (no locking)
   *
   * @param limit - Maximum number of missed events to return
   * @returns Promise<Event[]> - Array of missed Event entities ordered by targetTimestampUTC ASC
   *
   * @see IEventRepository.findMissedEvents for contract details
   * @see Story 3.1: Recovery Service - Missed Event Detection
   */
  public async findMissedEvents(limit: number): Promise<Event[]> {
    // Query for PENDING events with targetTimestampUTC in the past
    const prismaEvents = await this.prisma.event.findMany({
      where: {
        status: EventStatus.PENDING,
        targetTimestampUTC: {
          lt: new Date(), // Less than NOW()
        },
      },
      orderBy: {
        targetTimestampUTC: 'asc', // Oldest events first (fair recovery order)
      },
      take: limit, // Batch limit to prevent memory overflow
    });

    // Map Prisma models to domain entities
    return prismaEvents.map(eventToDomain);
  }
}
