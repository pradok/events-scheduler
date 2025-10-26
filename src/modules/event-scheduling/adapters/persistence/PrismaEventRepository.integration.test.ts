import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import {
  startTestDatabase,
  stopTestDatabase,
  cleanDatabase,
} from '../../../../__tests__/integration/helpers/testDatabase';
import { PrismaEventRepository } from './PrismaEventRepository';
import { Event } from '../../domain/entities/Event';
import { EventStatus } from '../../domain/value-objects/EventStatus';
import { IdempotencyKey } from '../../domain/value-objects/IdempotencyKey';
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { OptimisticLockError } from '../../../../domain/errors/OptimisticLockError';

describe('PrismaEventRepository - Integration Tests', () => {
  let prisma: PrismaClient;
  let repository: PrismaEventRepository;
  let testUserId: string;

  beforeAll(async () => {
    prisma = await startTestDatabase();
    repository = new PrismaEventRepository(prisma);
  }, 60000);

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    // Create a test user for foreign key constraints
    testUserId = randomUUID();
    await prisma.user.create({
      data: {
        id: testUserId,
        firstName: 'Test',
        lastName: 'User',
        dateOfBirth: new Date('1990-01-01'),
        timezone: 'America/New_York',
      },
    });
  });

  describe('create()', () => {
    it('should persist event and return with generated ID', async () => {
      // Arrange
      const eventId = randomUUID();
      const targetTime = DateTime.now().plus({ days: 1 });
      const event = new Event({
        id: eventId,
        userId: testUserId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PENDING,
        targetTimestampUTC: targetTime,
        targetTimestampLocal: targetTime,
        targetTimezone: 'America/New_York',
        executedAt: null,
        failureReason: null,
        retryCount: 0,
        version: 1,
        idempotencyKey: IdempotencyKey.generate(testUserId, targetTime),
        deliveryPayload: { message: 'Happy Birthday!' },
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      // Act
      const createdEvent = await repository.create(event);

      // Assert
      expect(createdEvent).toBeInstanceOf(Event);
      expect(createdEvent.id).toBe(eventId);
      expect(createdEvent.status).toBe(EventStatus.PENDING);
      expect(createdEvent.version).toBe(1);
    });
  });

  describe('findById()', () => {
    it('should return event when exists', async () => {
      // Arrange
      const eventId = randomUUID();
      await prisma.event.create({
        data: {
          id: eventId,
          userId: testUserId,
          eventType: 'BIRTHDAY',
          status: 'PENDING',
          targetTimestampUTC: new Date(),
          targetTimestampLocal: new Date(),
          targetTimezone: 'America/New_York',
          idempotencyKey: `test-key-${randomUUID()}`,
          deliveryPayload: {},
        },
      });

      // Act
      const foundEvent = await repository.findById(eventId);

      // Assert
      expect(foundEvent).toBeInstanceOf(Event);
      expect(foundEvent?.id).toBe(eventId);
    });

    it('should return null when not exists', async () => {
      // Act
      const foundEvent = await repository.findById(randomUUID());

      // Assert
      expect(foundEvent).toBeNull();
    });
  });

  describe('findByUserId()', () => {
    it('should return all events for user', async () => {
      // Arrange
      const event1Id = randomUUID();
      const event2Id = randomUUID();
      await prisma.event.createMany({
        data: [
          {
            id: event1Id,
            userId: testUserId,
            eventType: 'BIRTHDAY',
            status: 'PENDING',
            targetTimestampUTC: new Date(),
            targetTimestampLocal: new Date(),
            targetTimezone: 'America/New_York',
            idempotencyKey: `test-key-${randomUUID()}`,
            deliveryPayload: {},
          },
          {
            id: event2Id,
            userId: testUserId,
            eventType: 'BIRTHDAY',
            status: 'COMPLETED',
            targetTimestampUTC: new Date(),
            targetTimestampLocal: new Date(),
            targetTimezone: 'America/New_York',
            idempotencyKey: `test-key-${randomUUID()}`,
            deliveryPayload: {},
          },
        ],
      });

      // Act
      const events = await repository.findByUserId(testUserId);

      // Assert
      expect(events.length).toBe(2);
      expect(events.some((e) => e.id === event1Id)).toBe(true);
      expect(events.some((e) => e.id === event2Id)).toBe(true);
    });

    it('should return empty array when no events', async () => {
      // Act
      const events = await repository.findByUserId(randomUUID());

      // Assert
      expect(events).toEqual([]);
    });
  });

  describe('update()', () => {
    it('should update event fields and increment version', async () => {
      // Arrange
      const eventId = randomUUID();
      const targetTime = DateTime.now().plus({ days: 1 });
      const event = new Event({
        id: eventId,
        userId: testUserId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PENDING,
        targetTimestampUTC: targetTime,
        targetTimestampLocal: targetTime,
        targetTimezone: 'America/New_York',
        executedAt: null,
        failureReason: null,
        retryCount: 0,
        version: 1,
        idempotencyKey: IdempotencyKey.generate(testUserId, targetTime),
        deliveryPayload: { message: 'Original' },
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });
      await repository.create(event);

      // Act - claim the event (PENDING → PROCESSING)
      const claimedEvent = event.claim();
      const updatedEvent = await repository.update(claimedEvent);

      // Assert
      expect(updatedEvent.status).toBe(EventStatus.PROCESSING);
      expect(updatedEvent.version).toBe(2);
    });

    it('should fail with stale version (optimistic locking)', async () => {
      // Arrange
      const eventId = randomUUID();
      const targetTime = DateTime.now().plus({ days: 1 });
      const event = new Event({
        id: eventId,
        userId: testUserId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PENDING,
        targetTimestampUTC: targetTime,
        targetTimestampLocal: targetTime,
        targetTimezone: 'America/New_York',
        executedAt: null,
        failureReason: null,
        retryCount: 0,
        version: 1,
        idempotencyKey: IdempotencyKey.generate(testUserId, targetTime),
        deliveryPayload: { message: 'Test' },
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });
      await repository.create(event);

      // Update event (version becomes 2)
      const claimedEvent = event.claim();
      await repository.update(claimedEvent);

      // Act - Try to update with stale version (still 1)
      const staleUpdate = event.claim(); // Still has version 1

      // Assert
      await expect(repository.update(staleUpdate)).rejects.toThrow(OptimisticLockError);
    });
  });

  describe('claimReadyEvents()', () => {
    it('should atomically claim PENDING events with targetTimestampUTC <= now', async () => {
      // Arrange - create events in past
      const pastTime = DateTime.now().minus({ minutes: 5 });
      const event1Id = randomUUID();
      const event2Id = randomUUID();

      await prisma.event.createMany({
        data: [
          {
            id: event1Id,
            userId: testUserId,
            eventType: 'BIRTHDAY',
            status: 'PENDING',
            targetTimestampUTC: pastTime.toJSDate(),
            targetTimestampLocal: pastTime.toJSDate(),
            targetTimezone: 'America/New_York',
            idempotencyKey: `test-key-${randomUUID()}`,
            deliveryPayload: {},
          },
          {
            id: event2Id,
            userId: testUserId,
            eventType: 'BIRTHDAY',
            status: 'PENDING',
            targetTimestampUTC: pastTime.toJSDate(),
            targetTimestampLocal: pastTime.toJSDate(),
            targetTimezone: 'America/New_York',
            idempotencyKey: `test-key-${randomUUID()}`,
            deliveryPayload: {},
          },
        ],
      });

      // Act
      const claimedEvents = await repository.claimReadyEvents(10);

      // Assert
      expect(claimedEvents.length).toBe(2);
      expect(claimedEvents.every((e) => e.status === EventStatus.PROCESSING)).toBe(true);
      expect(claimedEvents.every((e) => e.version === 2)).toBe(true); // Version incremented
    });

    it('should respect limit parameter', async () => {
      // Arrange - create 5 events
      const pastTime = DateTime.now().minus({ minutes: 5 });
      for (let i = 0; i < 5; i++) {
        await prisma.event.create({
          data: {
            id: randomUUID(),
            userId: testUserId,
            eventType: 'BIRTHDAY',
            status: 'PENDING',
            targetTimestampUTC: pastTime.toJSDate(),
            targetTimestampLocal: pastTime.toJSDate(),
            targetTimezone: 'America/New_York',
            idempotencyKey: `test-key-${randomUUID()}`,
            deliveryPayload: {},
          },
        });
      }

      // Act - claim only 3
      const claimedEvents = await repository.claimReadyEvents(3);

      // Assert
      expect(claimedEvents.length).toBe(3);
    });

    it('should not return future events', async () => {
      // Arrange - create event in future
      const futureTime = DateTime.now().plus({ days: 1 });
      await prisma.event.create({
        data: {
          id: randomUUID(),
          userId: testUserId,
          eventType: 'BIRTHDAY',
          status: 'PENDING',
          targetTimestampUTC: futureTime.toJSDate(),
          targetTimestampLocal: futureTime.toJSDate(),
          targetTimezone: 'America/New_York',
          idempotencyKey: `test-key-${randomUUID()}`,
          deliveryPayload: {},
        },
      });

      // Act
      const claimedEvents = await repository.claimReadyEvents(10);

      // Assert
      expect(claimedEvents.length).toBe(0);
    });

    it('should not return non-PENDING events', async () => {
      // Arrange
      const pastTime = DateTime.now().minus({ minutes: 5 });
      await prisma.event.create({
        data: {
          id: randomUUID(),
          userId: testUserId,
          eventType: 'BIRTHDAY',
          status: 'PROCESSING',
          targetTimestampUTC: pastTime.toJSDate(),
          targetTimestampLocal: pastTime.toJSDate(),
          targetTimezone: 'America/New_York',
          idempotencyKey: `test-key-${randomUUID()}`,
          deliveryPayload: {},
        },
      });

      // Act
      const claimedEvents = await repository.claimReadyEvents(10);

      // Assert
      expect(claimedEvents.length).toBe(0);
    });

    it('should prevent duplicate claims when called concurrently (FOR UPDATE SKIP LOCKED)', async () => {
      /**
       * This test verifies the critical concurrency guarantee of claimReadyEvents():
       * When multiple scheduler instances run simultaneously, each event should be
       * claimed by EXACTLY ONE instance (no duplicates, no missed events).
       *
       * This is the PRIMARY reason we use raw SQL with FOR UPDATE SKIP LOCKED:
       * - FOR UPDATE: Locks rows during transaction
       * - SKIP LOCKED: Skips rows already locked by other transactions (no deadlocks)
       *
       * Without this mechanism, multiple schedulers would process the same events,
       * resulting in duplicate birthday messages, emails, etc.
       */

      // Arrange - create 10 ready-to-process events (targetTimestampUTC in the past)
      const pastTime = DateTime.now().minus({ minutes: 5 });
      const eventIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const id = randomUUID();
        eventIds.push(id);
        await prisma.event.create({
          data: {
            id,
            userId: testUserId,
            eventType: 'BIRTHDAY',
            status: 'PENDING',
            targetTimestampUTC: pastTime.toJSDate(),
            targetTimestampLocal: pastTime.toJSDate(),
            targetTimezone: 'America/New_York',
            idempotencyKey: `test-key-${randomUUID()}`,
            deliveryPayload: {},
          },
        });
      }

      // Act - simulate 3 concurrent scheduler instances claiming events
      // This mimics a production scenario with multiple worker pods/processes
      // Each instance tries to claim up to 5 events (total request = 15 events)
      const [claimed1, claimed2, claimed3] = await Promise.all([
        repository.claimReadyEvents(5), // Instance 1: request 5 events
        repository.claimReadyEvents(5), // Instance 2: request 5 events
        repository.claimReadyEvents(5), // Instance 3: request 5 events
      ]);

      // Assert - collect all claimed event IDs from all instances
      const allClaimedIds = [
        ...claimed1.map((e) => e.id),
        ...claimed2.map((e) => e.id),
        ...claimed3.map((e) => e.id),
      ];

      // CRITICAL: Verify no duplicates across instances
      // If FOR UPDATE SKIP LOCKED wasn't working, we'd see duplicate IDs here
      const uniqueClaimedIds = new Set(allClaimedIds);
      expect(uniqueClaimedIds.size).toBe(10); // All 10 events claimed
      expect(allClaimedIds.length).toBe(uniqueClaimedIds.size); // No duplicates

      // Verify all original events were claimed (none missed)
      eventIds.forEach((id) => {
        expect(uniqueClaimedIds.has(id)).toBe(true);
      });

      // Verify database state: all events transitioned to PROCESSING with version 2
      // This confirms the UPDATE portion of claimReadyEvents() executed correctly
      const dbEvents = await prisma.event.findMany({
        where: { id: { in: eventIds } },
      });
      expect(dbEvents.length).toBe(10);
      expect(dbEvents.every((e) => e.status === 'PROCESSING')).toBe(true);
      expect(dbEvents.every((e) => e.version === 2)).toBe(true); // Version incremented from 1 to 2
    });
  });

  describe('optimistic locking - concurrent updates', () => {
    it('should detect concurrent update when same event loaded twice and both modified', async () => {
      /**
       * Scenario: Two workers load the same event, both attempt to modify it.
       * The first update should succeed, the second should fail with OptimisticLockError.
       *
       * This is the classic optimistic locking use case: preventing lost updates.
       */

      // Arrange - Create event in PENDING state
      const eventId = randomUUID();
      const targetTime = DateTime.now().plus({ days: 1 });
      const event = new Event({
        id: eventId,
        userId: testUserId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PENDING,
        targetTimestampUTC: targetTime,
        targetTimestampLocal: targetTime,
        targetTimezone: 'America/New_York',
        executedAt: null,
        failureReason: null,
        retryCount: 0,
        version: 1,
        idempotencyKey: IdempotencyKey.generate(testUserId, targetTime),
        deliveryPayload: { message: 'Test' },
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });
      await repository.create(event);

      // Act - Load event twice (simulating two workers)
      const eventInstance1 = await repository.findById(eventId);
      const eventInstance2 = await repository.findById(eventId);

      // Both instances have version 1 at this point
      expect(eventInstance1!.version).toBe(1);
      expect(eventInstance2!.version).toBe(1);

      // Worker 1 claims the event (version 1 → 2)
      const claimedEvent1 = eventInstance1!.claim();
      await repository.update(claimedEvent1);

      // Worker 2 attempts to claim the event (still has version 1, should fail)
      const claimedEvent2 = eventInstance2!.claim();

      // Assert - Worker 2 should get OptimisticLockError
      await expect(repository.update(claimedEvent2)).rejects.toThrow(OptimisticLockError);
      await expect(repository.update(claimedEvent2)).rejects.toThrow(
        /was modified by another transaction.*expected version 1/
      );

      // Verify database state: only worker 1's update persisted
      const finalEvent = await repository.findById(eventId);
      expect(finalEvent!.status).toBe(EventStatus.PROCESSING);
      expect(finalEvent!.version).toBe(2);
    });

    it('should increment version correctly through full event lifecycle', async () => {
      /**
       * Scenario: Verify version increments at each state transition:
       * PENDING (v1) → PROCESSING (v2) → COMPLETED (v3)
       */

      // Arrange - Create event in PENDING state with version 1
      const eventId = randomUUID();
      const targetTime = DateTime.now().plus({ days: 1 });
      const event = new Event({
        id: eventId,
        userId: testUserId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PENDING,
        targetTimestampUTC: targetTime,
        targetTimestampLocal: targetTime,
        targetTimezone: 'America/New_York',
        executedAt: null,
        failureReason: null,
        retryCount: 0,
        version: 1,
        idempotencyKey: IdempotencyKey.generate(testUserId, targetTime),
        deliveryPayload: { message: 'Test' },
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });
      await repository.create(event);

      // Verify initial state
      const initialEvent = await repository.findById(eventId);
      expect(initialEvent!.status).toBe(EventStatus.PENDING);
      expect(initialEvent!.version).toBe(1);

      // Act - Claim event (PENDING → PROCESSING, v1 → v2)
      const claimedEvent = initialEvent!.claim();
      await repository.update(claimedEvent);

      const processingEvent = await repository.findById(eventId);
      expect(processingEvent!.status).toBe(EventStatus.PROCESSING);
      expect(processingEvent!.version).toBe(2);

      // Act - Mark completed (PROCESSING → COMPLETED, v2 → v3)
      const completedEvent = processingEvent!.markCompleted(DateTime.now());
      await repository.update(completedEvent);

      const finalEvent = await repository.findById(eventId);
      expect(finalEvent!.status).toBe(EventStatus.COMPLETED);
      expect(finalEvent!.version).toBe(3);

      // Assert - Full lifecycle progression
      expect(finalEvent!.executedAt).not.toBeNull();
    });

    it('should include event ID and version in OptimisticLockError message for debugging', async () => {
      /**
       * Verify error messages provide useful context for debugging concurrent update issues.
       */

      // Arrange
      const eventId = randomUUID();
      const targetTime = DateTime.now().plus({ days: 1 });
      const event = new Event({
        id: eventId,
        userId: testUserId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PENDING,
        targetTimestampUTC: targetTime,
        targetTimestampLocal: targetTime,
        targetTimezone: 'America/New_York',
        executedAt: null,
        failureReason: null,
        retryCount: 0,
        version: 1,
        idempotencyKey: IdempotencyKey.generate(testUserId, targetTime),
        deliveryPayload: { message: 'Test' },
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });
      await repository.create(event);

      // Update event (version 1 → 2)
      const claimedEvent = event.claim();
      await repository.update(claimedEvent);

      // Act - Try to update with stale version 1
      const staleUpdate = event.claim();

      // Assert - Error message includes event ID and expected version
      try {
        await repository.update(staleUpdate);
        fail('Should have thrown OptimisticLockError');
      } catch (error) {
        expect(error).toBeInstanceOf(OptimisticLockError);
        const errorMessage = (error as Error).message;
        expect(errorMessage).toContain(eventId); // Event ID for correlation
        expect(errorMessage).toContain('expected version 1'); // Expected version
        expect(errorMessage).toContain('modified by another transaction'); // Clear explanation
      }
    });
  });

  describe('idempotency key persistence', () => {
    it('should persist idempotency key and retrieve it correctly', async () => {
      // Arrange
      const eventId = randomUUID();
      const targetTime = DateTime.now().plus({ days: 1 });
      const idempotencyKey = IdempotencyKey.generate(testUserId, targetTime);
      const event = new Event({
        id: eventId,
        userId: testUserId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PENDING,
        targetTimestampUTC: targetTime,
        targetTimestampLocal: targetTime,
        targetTimezone: 'America/New_York',
        executedAt: null,
        failureReason: null,
        retryCount: 0,
        version: 1,
        idempotencyKey,
        deliveryPayload: { message: 'Happy Birthday!' },
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      // Act - Create event
      await repository.create(event);

      // Act - Retrieve event
      const retrievedEvent = await repository.findById(eventId);

      // Assert
      expect(retrievedEvent).not.toBeNull();
      expect(retrievedEvent!.idempotencyKey.toString()).toBe(idempotencyKey.toString());
      expect(retrievedEvent!.idempotencyKey.equals(idempotencyKey)).toBe(true);
    });

    it('should enforce unique constraint on idempotency key', async () => {
      // Arrange
      const targetTime = DateTime.now().plus({ days: 1 });
      const sharedIdempotencyKey = IdempotencyKey.generate(testUserId, targetTime);

      const event1 = new Event({
        id: randomUUID(),
        userId: testUserId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PENDING,
        targetTimestampUTC: targetTime,
        targetTimestampLocal: targetTime,
        targetTimezone: 'America/New_York',
        executedAt: null,
        failureReason: null,
        retryCount: 0,
        version: 1,
        idempotencyKey: sharedIdempotencyKey,
        deliveryPayload: { message: 'Happy Birthday!' },
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      const event2 = new Event({
        id: randomUUID(), // Different ID
        userId: testUserId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PENDING,
        targetTimestampUTC: targetTime,
        targetTimestampLocal: targetTime,
        targetTimezone: 'America/New_York',
        executedAt: null,
        failureReason: null,
        retryCount: 0,
        version: 1,
        idempotencyKey: sharedIdempotencyKey, // Same idempotency key!
        deliveryPayload: { message: 'Happy Birthday!' },
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      // Act - Create first event (should succeed)
      await repository.create(event1);

      // Act & Assert - Create second event with same idempotency key (should fail)
      await expect(repository.create(event2)).rejects.toThrow();
      // Prisma will throw a unique constraint violation error
    });
  });

  describe('findMissedEvents()', () => {
    it('should find events with targetTimestampUTC in the past and PENDING status', async () => {
      // Arrange
      const pastTime1 = DateTime.now().minus({ days: 7 });
      const pastTime2 = DateTime.now().minus({ days: 3 });
      const futureTime = DateTime.now().plus({ days: 1 });

      // Create PENDING events in the past (should be found)
      const missedEvent1 = new Event({
        id: randomUUID(),
        userId: testUserId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PENDING,
        targetTimestampUTC: pastTime1,
        targetTimestampLocal: pastTime1,
        targetTimezone: 'America/New_York',
        executedAt: null,
        failureReason: null,
        retryCount: 0,
        version: 1,
        idempotencyKey: IdempotencyKey.generate(testUserId, pastTime1),
        deliveryPayload: { message: 'Missed event 1' },
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      const missedEvent2 = new Event({
        id: randomUUID(),
        userId: testUserId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PENDING,
        targetTimestampUTC: pastTime2,
        targetTimestampLocal: pastTime2,
        targetTimezone: 'America/New_York',
        executedAt: null,
        failureReason: null,
        retryCount: 0,
        version: 1,
        idempotencyKey: IdempotencyKey.generate(testUserId, pastTime2),
        deliveryPayload: { message: 'Missed event 2' },
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      // Create PENDING event in the future (should NOT be found)
      const futureEvent = new Event({
        id: randomUUID(),
        userId: testUserId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PENDING,
        targetTimestampUTC: futureTime,
        targetTimestampLocal: futureTime,
        targetTimezone: 'America/New_York',
        executedAt: null,
        failureReason: null,
        retryCount: 0,
        version: 1,
        idempotencyKey: IdempotencyKey.generate(testUserId, futureTime),
        deliveryPayload: { message: 'Future event' },
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      await repository.create(missedEvent1);
      await repository.create(missedEvent2);
      await repository.create(futureEvent);

      // Act
      const missedEvents = await repository.findMissedEvents(10);

      // Assert
      expect(missedEvents).toHaveLength(2);
      expect(missedEvents.map((e) => e.id)).toContain(missedEvent1.id);
      expect(missedEvents.map((e) => e.id)).toContain(missedEvent2.id);
      expect(missedEvents.map((e) => e.id)).not.toContain(futureEvent.id);
    });

    it('should exclude PROCESSING, COMPLETED, and FAILED events from results', async () => {
      // Arrange
      const pastTime = DateTime.now().minus({ days: 1 });

      // Create PENDING event (should be found)
      const pendingEvent = new Event({
        id: randomUUID(),
        userId: testUserId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PENDING,
        targetTimestampUTC: pastTime,
        targetTimestampLocal: pastTime,
        targetTimezone: 'America/New_York',
        executedAt: null,
        failureReason: null,
        retryCount: 0,
        version: 1,
        idempotencyKey: IdempotencyKey.generate(testUserId, pastTime),
        deliveryPayload: { message: 'Pending event' },
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      // Create PROCESSING event (should NOT be found)
      const processingEvent = new Event({
        id: randomUUID(),
        userId: testUserId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PROCESSING,
        targetTimestampUTC: pastTime,
        targetTimestampLocal: pastTime,
        targetTimezone: 'America/New_York',
        executedAt: null,
        failureReason: null,
        retryCount: 0,
        version: 1,
        idempotencyKey: IdempotencyKey.generate(testUserId, pastTime.plus({ seconds: 1 })),
        deliveryPayload: { message: 'Processing event' },
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      // Create COMPLETED event (should NOT be found)
      const completedEvent = new Event({
        id: randomUUID(),
        userId: testUserId,
        eventType: 'BIRTHDAY',
        status: EventStatus.COMPLETED,
        targetTimestampUTC: pastTime,
        targetTimestampLocal: pastTime,
        targetTimezone: 'America/New_York',
        executedAt: DateTime.now(),
        failureReason: null,
        retryCount: 0,
        version: 1,
        idempotencyKey: IdempotencyKey.generate(testUserId, pastTime.plus({ seconds: 2 })),
        deliveryPayload: { message: 'Completed event' },
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      // Create FAILED event (should NOT be found)
      const failedEvent = new Event({
        id: randomUUID(),
        userId: testUserId,
        eventType: 'BIRTHDAY',
        status: EventStatus.FAILED,
        targetTimestampUTC: pastTime,
        targetTimestampLocal: pastTime,
        targetTimezone: 'America/New_York',
        executedAt: null,
        failureReason: 'Test failure',
        retryCount: 3,
        version: 1,
        idempotencyKey: IdempotencyKey.generate(testUserId, pastTime.plus({ seconds: 3 })),
        deliveryPayload: { message: 'Failed event' },
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      await repository.create(pendingEvent);
      await repository.create(processingEvent);
      await repository.create(completedEvent);
      await repository.create(failedEvent);

      // Act
      const missedEvents = await repository.findMissedEvents(10);

      // Assert
      expect(missedEvents).toHaveLength(1);
      expect(missedEvents[0]!.id).toBe(pendingEvent.id);
      expect(missedEvents[0]!.status).toBe(EventStatus.PENDING);
    });

    it('should return events ordered by targetTimestampUTC ASC', async () => {
      // Arrange - Create events with different timestamps (insert in random order)
      const oldestTime = DateTime.now().minus({ days: 7 });
      const middleTime = DateTime.now().minus({ days: 3 });
      const newestTime = DateTime.now().minus({ hours: 1 });

      const oldestEvent = new Event({
        id: randomUUID(),
        userId: testUserId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PENDING,
        targetTimestampUTC: oldestTime,
        targetTimestampLocal: oldestTime,
        targetTimezone: 'America/New_York',
        executedAt: null,
        failureReason: null,
        retryCount: 0,
        version: 1,
        idempotencyKey: IdempotencyKey.generate(testUserId, oldestTime),
        deliveryPayload: { message: 'Oldest event' },
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      const middleEvent = new Event({
        id: randomUUID(),
        userId: testUserId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PENDING,
        targetTimestampUTC: middleTime,
        targetTimestampLocal: middleTime,
        targetTimezone: 'America/New_York',
        executedAt: null,
        failureReason: null,
        retryCount: 0,
        version: 1,
        idempotencyKey: IdempotencyKey.generate(testUserId, middleTime),
        deliveryPayload: { message: 'Middle event' },
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      const newestEvent = new Event({
        id: randomUUID(),
        userId: testUserId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PENDING,
        targetTimestampUTC: newestTime,
        targetTimestampLocal: newestTime,
        targetTimezone: 'America/New_York',
        executedAt: null,
        failureReason: null,
        retryCount: 0,
        version: 1,
        idempotencyKey: IdempotencyKey.generate(testUserId, newestTime),
        deliveryPayload: { message: 'Newest event' },
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      // Insert in random order (not chronological)
      await repository.create(middleEvent);
      await repository.create(newestEvent);
      await repository.create(oldestEvent);

      // Act
      const missedEvents = await repository.findMissedEvents(10);

      // Assert
      expect(missedEvents).toHaveLength(3);
      // Verify ASC order: oldest first, newest last
      expect(missedEvents[0]!.id).toBe(oldestEvent.id);
      expect(missedEvents[1]!.id).toBe(middleEvent.id);
      expect(missedEvents[2]!.id).toBe(newestEvent.id);
    });

    it('should respect batch limit parameter', async () => {
      // Arrange - Create 5 missed events
      const pastTime = DateTime.now().minus({ days: 1 });
      const events = [];

      for (let i = 0; i < 5; i++) {
        const event = new Event({
          id: randomUUID(),
          userId: testUserId,
          eventType: 'BIRTHDAY',
          status: EventStatus.PENDING,
          targetTimestampUTC: pastTime.plus({ seconds: i }),
          targetTimestampLocal: pastTime.plus({ seconds: i }),
          targetTimezone: 'America/New_York',
          executedAt: null,
          failureReason: null,
          retryCount: 0,
          version: 1,
          idempotencyKey: IdempotencyKey.generate(testUserId, pastTime.plus({ seconds: i })),
          deliveryPayload: { message: `Event ${i}` },
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        });
        events.push(event);
        await repository.create(event);
      }

      // Act - Request only 3 events
      const missedEvents = await repository.findMissedEvents(3);

      // Assert
      expect(missedEvents).toHaveLength(3);
      // Verify we get the oldest 3 events (due to ASC ordering)
      expect(missedEvents[0]!.id).toBe(events[0]!.id);
      expect(missedEvents[1]!.id).toBe(events[1]!.id);
      expect(missedEvents[2]!.id).toBe(events[2]!.id);
    });

    it('should return empty array when no missed events exist', async () => {
      // Arrange - Only create future or non-PENDING events
      const futureTime = DateTime.now().plus({ days: 1 });
      const futureEvent = new Event({
        id: randomUUID(),
        userId: testUserId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PENDING,
        targetTimestampUTC: futureTime,
        targetTimestampLocal: futureTime,
        targetTimezone: 'America/New_York',
        executedAt: null,
        failureReason: null,
        retryCount: 0,
        version: 1,
        idempotencyKey: IdempotencyKey.generate(testUserId, futureTime),
        deliveryPayload: { message: 'Future event' },
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      await repository.create(futureEvent);

      // Act
      const missedEvents = await repository.findMissedEvents(10);

      // Assert
      expect(missedEvents).toHaveLength(0);
    });
  });
});
