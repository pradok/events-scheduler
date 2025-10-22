import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import {
  startTestDatabase,
  stopTestDatabase,
  cleanDatabase,
} from '../../../__tests__/integration/helpers/testDatabase';
import { PrismaEventRepository } from './PrismaEventRepository';
import { Event } from '../../../domain/entities/Event';
import { EventStatus } from '../../../domain/value-objects/EventStatus';
import { IdempotencyKey } from '../../../domain/value-objects/IdempotencyKey';
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { OptimisticLockError } from '../../../domain/errors/OptimisticLockError';

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
});
