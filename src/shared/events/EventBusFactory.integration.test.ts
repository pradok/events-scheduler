import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import {
  startTestDatabase,
  stopTestDatabase,
  cleanDatabase,
} from '../../__tests__/integration/helpers/testDatabase';
import { createEventBus } from './EventBusFactory';
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { UserCreatedEvent } from '../../modules/user/domain/events/UserCreated';

describe('EventBusFactory - Integration Tests with FAST_TEST_DELIVERY_OFFSET', () => {
  let prisma: PrismaClient;
  let originalEnv: string | undefined;

  beforeAll(async () => {
    prisma = await startTestDatabase();
    // Save original env var
    originalEnv = process.env.FAST_TEST_DELIVERY_OFFSET;
  }, 60000);

  afterAll(async () => {
    // Restore original env var
    if (originalEnv) {
      process.env.FAST_TEST_DELIVERY_OFFSET = originalEnv;
    } else {
      delete process.env.FAST_TEST_DELIVERY_OFFSET;
    }
    await stopTestDatabase();
    // Restore real timers
    jest.useRealTimers();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  describe('UserCreated event with FAST_TEST_DELIVERY_OFFSET', () => {
    it('should create birthday event with 5 second offset', async () => {
      // Arrange - Set fast test override to 5 seconds
      process.env.FAST_TEST_DELIVERY_OFFSET = '5s';

      // IMPORTANT: Create EventBus AFTER setting env var
      // Config is read once during createEventBus() call
      const eventBus = createEventBus(prisma);

      const userId = randomUUID();

      // Use TODAY as birthday in UTC - event will be scheduled for today at (now + 5s) UTC
      const now = DateTime.utc();
      const birthdayToday = now.toFormat('yyyy-MM-dd');

      const userCreatedEvent: UserCreatedEvent = {
        eventType: 'UserCreated',
        context: 'user',
        occurredAt: now.toISO(),
        aggregateId: userId,
        userId: userId,
        firstName: 'Test',
        lastName: 'User',
        dateOfBirth: birthdayToday, // Birthday is TODAY
        timezone: 'UTC', // Use UTC to match the config's timezone
      };

      // Create user in DB first (for foreign key constraint)
      await prisma.user.create({
        data: {
          id: userId,
          firstName: 'Test',
          lastName: 'User',
          dateOfBirth: new Date(`${birthdayToday}T00:00:00Z`),
          timezone: 'UTC',
        },
      });

      // Capture time before publishing event in UTC for consistent comparison
      const beforePublish = DateTime.utc();

      // Act - Publish UserCreated event
      await eventBus.publish(userCreatedEvent);

      // Wait a moment for async handler to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert - Retrieve the event from database
      const events = await prisma.event.findMany({
        where: { userId },
      });

      expect(events).toHaveLength(1);
      const createdEvent = events[0]!;

      // Verify event type
      expect(createdEvent.eventType).toBe('BIRTHDAY');
      expect(createdEvent.status).toBe('PENDING');

      // Verify the event is scheduled for approximately 5 seconds from now in UTC
      const targetTimeUTC = DateTime.fromJSDate(createdEvent.targetTimestampUTC, { zone: 'utc' });
      const diffSeconds = targetTimeUTC.diff(beforePublish, 'seconds').seconds;

      // Should be approximately 5 seconds (allow 3-7 seconds for test execution)
      expect(diffSeconds).toBeGreaterThanOrEqual(3);
      expect(diffSeconds).toBeLessThanOrEqual(7);

      // Clean up env var for next test
      delete process.env.FAST_TEST_DELIVERY_OFFSET;
    });

    it('should create birthday event with 30 second offset', async () => {
      // Arrange - Set fast test override to 30 seconds
      process.env.FAST_TEST_DELIVERY_OFFSET = '30s';
      const eventBus = createEventBus(prisma);

      const userId = randomUUID();
      const now = DateTime.utc();
      const birthdayToday = now.toFormat('yyyy-MM-dd');

      const userCreatedEvent: UserCreatedEvent = {
        eventType: 'UserCreated',
        context: 'user',
        occurredAt: now.toISO(),
        aggregateId: userId,
        userId: userId,
        firstName: 'Test',
        lastName: 'User',
        dateOfBirth: birthdayToday,
        timezone: 'UTC',
      };

      await prisma.user.create({
        data: {
          id: userId,
          firstName: 'Test',
          lastName: 'User',
          dateOfBirth: new Date(`${birthdayToday}T00:00:00Z`),
          timezone: 'UTC',
        },
      });

      const beforePublish = DateTime.utc();

      // Act
      await eventBus.publish(userCreatedEvent);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      const events = await prisma.event.findMany({
        where: { userId },
      });

      expect(events).toHaveLength(1);
      const createdEvent = events[0]!;

      const targetTimeUTC = DateTime.fromJSDate(createdEvent.targetTimestampUTC, { zone: 'utc' });
      const diffSeconds = targetTimeUTC.diff(beforePublish, 'seconds').seconds;

      expect(diffSeconds).toBeGreaterThanOrEqual(28);
      expect(diffSeconds).toBeLessThanOrEqual(32);

      delete process.env.FAST_TEST_DELIVERY_OFFSET;
    });

    it('should create birthday event with 2 minute offset', async () => {
      // Arrange - Set fast test override to 2 minutes
      process.env.FAST_TEST_DELIVERY_OFFSET = '2m';
      const eventBus = createEventBus(prisma);

      const userId = randomUUID();
      const now = DateTime.utc();
      const birthdayToday = now.toFormat('yyyy-MM-dd');

      const userCreatedEvent: UserCreatedEvent = {
        eventType: 'UserCreated',
        context: 'user',
        occurredAt: now.toISO(),
        aggregateId: userId,
        userId: userId,
        firstName: 'Test',
        lastName: 'User',
        dateOfBirth: birthdayToday,
        timezone: 'UTC',
      };

      await prisma.user.create({
        data: {
          id: userId,
          firstName: 'Test',
          lastName: 'User',
          dateOfBirth: new Date(`${birthdayToday}T00:00:00Z`),
          timezone: 'UTC',
        },
      });

      const beforePublish = DateTime.utc();

      // Act
      await eventBus.publish(userCreatedEvent);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      const events = await prisma.event.findMany({
        where: { userId },
      });

      expect(events).toHaveLength(1);
      const createdEvent = events[0]!;

      const targetTimeUTC = DateTime.fromJSDate(createdEvent.targetTimestampUTC, { zone: 'utc' });
      const diffMinutes = targetTimeUTC.diff(beforePublish, 'minutes').minutes;

      expect(diffMinutes).toBeGreaterThanOrEqual(1.9);
      expect(diffMinutes).toBeLessThanOrEqual(2.2);

      delete process.env.FAST_TEST_DELIVERY_OFFSET;
    });

    it('should fallback to default (9am) when env var is invalid', async () => {
      // Arrange - Set invalid format
      process.env.FAST_TEST_DELIVERY_OFFSET = 'invalid';
      const eventBus = createEventBus(prisma); // Must create AFTER setting env var

      const userId = randomUUID();

      // Use a future date (June 15) so we can test default 9am behavior
      // The event will be scheduled for next birthday occurrence at 9am
      const userCreatedEvent: UserCreatedEvent = {
        eventType: 'UserCreated',
        context: 'user',
        occurredAt: DateTime.now().toISO(),
        aggregateId: userId,
        userId: userId,
        firstName: 'Test',
        lastName: 'User',
        dateOfBirth: '1990-06-15',
        timezone: 'America/New_York',
      };

      await prisma.user.create({
        data: {
          id: userId,
          firstName: 'Test',
          lastName: 'User',
          dateOfBirth: new Date('1990-06-15'),
          timezone: 'America/New_York',
        },
      });

      // Act
      await eventBus.publish(userCreatedEvent);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert - Should use default delivery time (9am)
      const events = await prisma.event.findMany({
        where: { userId },
      });

      expect(events).toHaveLength(1);
      const createdEvent = events[0]!;

      // Convert UTC timestamp to America/New_York timezone
      const targetTimeLocal = DateTime.fromJSDate(createdEvent.targetTimestampUTC, {
        zone: 'utc',
      }).setZone('America/New_York');

      // Should be 9am (default time) on next birthday
      expect(targetTimeLocal.hour).toBe(9);
      expect(targetTimeLocal.minute).toBe(0);
      expect(targetTimeLocal.month).toBe(6); // June
      expect(targetTimeLocal.day).toBe(15);

      delete process.env.FAST_TEST_DELIVERY_OFFSET;
    });

    it('should use default (9am) when env var is not set', async () => {
      // Arrange - No env var set
      delete process.env.FAST_TEST_DELIVERY_OFFSET;
      const eventBus = createEventBus(prisma);

      const userId = randomUUID();

      const userCreatedEvent: UserCreatedEvent = {
        eventType: 'UserCreated',
        context: 'user',
        occurredAt: DateTime.now().toISO(),
        aggregateId: userId,
        userId: userId,
        firstName: 'Test',
        lastName: 'User',
        dateOfBirth: '1990-06-15',
        timezone: 'America/New_York',
      };

      await prisma.user.create({
        data: {
          id: userId,
          firstName: 'Test',
          lastName: 'User',
          dateOfBirth: new Date('1990-06-15'),
          timezone: 'America/New_York',
        },
      });

      // Act
      await eventBus.publish(userCreatedEvent);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert - Should use default delivery time (9am)
      const events = await prisma.event.findMany({
        where: { userId },
      });

      expect(events).toHaveLength(1);
      const createdEvent = events[0]!;

      const targetTimeLocal = DateTime.fromJSDate(createdEvent.targetTimestampUTC, {
        zone: 'utc',
      }).setZone('America/New_York');

      // Should be 9am (default time)
      expect(targetTimeLocal.hour).toBe(9);
      expect(targetTimeLocal.minute).toBe(0);
      expect(targetTimeLocal.month).toBe(6);
      expect(targetTimeLocal.day).toBe(15);
    });
  });
});
