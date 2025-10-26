import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import {
  startTestDatabase,
  stopTestDatabase,
  cleanDatabase,
} from '../../../../__tests__/integration/helpers/testDatabase';
import { ExecuteEventUseCase } from './ExecuteEventUseCase';
import { PrismaEventRepository } from '../../adapters/persistence/PrismaEventRepository';
import { PrismaUserRepository } from '../../../user/adapters/persistence/PrismaUserRepository';
import { BirthdayEventHandler } from '../../domain/services/event-handlers/BirthdayEventHandler';
import { TimezoneService } from '../../domain/services/TimezoneService';
import { Event } from '../../domain/entities/Event';
import { EventStatus } from '../../domain/value-objects/EventStatus';
import { IdempotencyKey } from '../../domain/value-objects/IdempotencyKey';
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import type { IWebhookClient } from '../ports/IWebhookClient';
import type { WebhookResponse, WebhookPayload } from '../../../../shared/validation/schemas';
import { InfrastructureError } from '../../../../domain/errors/InfrastructureError';

/**
 * Mock WebhookClient that captures request details for verification
 */
class MockWebhookClient implements IWebhookClient {
  public calls: Array<{ payload: WebhookPayload; idempotencyKey: string }> = [];
  public shouldFail = false;
  public failureType: 'transient' | 'permanent' = 'transient';

  public async deliver(payload: WebhookPayload, idempotencyKey: string): Promise<WebhookResponse> {
    // Capture the call details
    this.calls.push({ payload, idempotencyKey });

    if (this.shouldFail) {
      if (this.failureType === 'transient') {
        throw new InfrastructureError('Service temporarily unavailable');
      } else {
        throw new Error('Bad request');
      }
    }

    // Simulate async operation
    return Promise.resolve({
      success: true,
      timestamp: new Date().toISOString(),
    });
  }

  public reset(): void {
    this.calls = [];
    this.shouldFail = false;
    this.failureType = 'transient';
  }
}

describe('ExecuteEventUseCase - Integration Tests (Retry Consistency)', () => {
  let prisma: PrismaClient;
  let repository: PrismaEventRepository;
  let userRepository: PrismaUserRepository;
  let mockWebhookClient: MockWebhookClient;
  let useCase: ExecuteEventUseCase;
  let testUserId: string;

  beforeAll(async () => {
    prisma = await startTestDatabase();
    repository = new PrismaEventRepository(prisma);
    userRepository = new PrismaUserRepository(prisma);
    mockWebhookClient = new MockWebhookClient();
    const birthdayEventHandler = new BirthdayEventHandler();
    const timezoneService = new TimezoneService();
    useCase = new ExecuteEventUseCase(
      repository,
      mockWebhookClient,
      userRepository,
      birthdayEventHandler,
      timezoneService
    );
  }, 60000);

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    mockWebhookClient.reset();

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

  describe('idempotency key consistency on retries', () => {
    it('should send same idempotency key on retry attempts after transient failure', async () => {
      // Arrange - Create event with idempotency key
      const eventId = randomUUID();
      const targetTime = DateTime.now().plus({ days: 1 });
      const idempotencyKey = IdempotencyKey.generate(testUserId, targetTime);

      const event = new Event({
        id: eventId,
        userId: testUserId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PROCESSING, // Already claimed
        targetTimestampUTC: targetTime,
        targetTimestampLocal: targetTime,
        targetTimezone: 'America/New_York',
        executedAt: null,
        failureReason: null,
        retryCount: 0,
        version: 1,
        idempotencyKey,
        deliveryPayload: {
          message: 'Happy Birthday Test User!',
          webhookUrl: 'https://webhook.test/endpoint',
        },
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      await repository.create(event);

      // Configure mock to fail on first attempt with transient error
      mockWebhookClient.shouldFail = true;
      mockWebhookClient.failureType = 'transient';

      // Act - First attempt (will fail)
      await expect(useCase.execute(eventId)).rejects.toThrow(InfrastructureError);

      // Assert - First attempt captured idempotency key
      expect(mockWebhookClient.calls).toHaveLength(1);
      const firstAttemptKey = mockWebhookClient.calls[0]!.idempotencyKey;
      expect(firstAttemptKey).toBe(idempotencyKey.toString());

      // Arrange - Configure mock to succeed on retry
      mockWebhookClient.shouldFail = false;

      // Act - Second attempt (retry, will succeed)
      await useCase.execute(eventId);

      // Assert - Second attempt uses SAME idempotency key
      expect(mockWebhookClient.calls).toHaveLength(2);
      const secondAttemptKey = mockWebhookClient.calls[1]!.idempotencyKey;
      expect(secondAttemptKey).toBe(idempotencyKey.toString());

      // Assert - Both attempts used identical idempotency key
      expect(firstAttemptKey).toBe(secondAttemptKey);
    });

    it('should preserve idempotency key through multiple retry attempts', async () => {
      // Arrange - Create event
      const eventId = randomUUID();
      const targetTime = DateTime.now().plus({ days: 1 });
      const idempotencyKey = IdempotencyKey.generate(testUserId, targetTime);

      const event = new Event({
        id: eventId,
        userId: testUserId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PROCESSING,
        targetTimestampUTC: targetTime,
        targetTimestampLocal: targetTime,
        targetTimezone: 'America/New_York',
        executedAt: null,
        failureReason: null,
        retryCount: 0,
        version: 1,
        idempotencyKey,
        deliveryPayload: {
          message: 'Happy Birthday!',
          webhookUrl: 'https://webhook.test/endpoint',
        },
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      await repository.create(event);

      // Act - Attempt 1 (fail)
      mockWebhookClient.shouldFail = true;
      await expect(useCase.execute(eventId)).rejects.toThrow();

      // Act - Attempt 2 (fail)
      mockWebhookClient.shouldFail = true;
      await expect(useCase.execute(eventId)).rejects.toThrow();

      // Act - Attempt 3 (succeed)
      mockWebhookClient.shouldFail = false;
      await useCase.execute(eventId);

      // Assert - All three attempts used same idempotency key
      expect(mockWebhookClient.calls).toHaveLength(3);
      const keys = mockWebhookClient.calls.map((call) => call.idempotencyKey);

      expect(keys[0]).toBe(idempotencyKey.toString());
      expect(keys[1]).toBe(idempotencyKey.toString());
      expect(keys[2]).toBe(idempotencyKey.toString());

      // All keys are identical
      expect(new Set(keys).size).toBe(1);
    });

    it('should include idempotency key in webhook payload headers', async () => {
      // Arrange
      const eventId = randomUUID();
      const targetTime = DateTime.now().plus({ days: 1 });
      const idempotencyKey = IdempotencyKey.generate(testUserId, targetTime);

      const event = new Event({
        id: eventId,
        userId: testUserId,
        eventType: 'BIRTHDAY',
        status: EventStatus.PROCESSING,
        targetTimestampUTC: targetTime,
        targetTimestampLocal: targetTime,
        targetTimezone: 'America/New_York',
        executedAt: null,
        failureReason: null,
        retryCount: 0,
        version: 1,
        idempotencyKey,
        deliveryPayload: {
          message: 'Happy Birthday!',
          webhookUrl: 'https://webhook.test/endpoint',
        },
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      });

      await repository.create(event);

      // Act
      await useCase.execute(eventId);

      // Assert - WebhookClient received idempotency key
      expect(mockWebhookClient.calls).toHaveLength(1);
      expect(mockWebhookClient.calls[0]!.idempotencyKey).toBe(idempotencyKey.toString());
      expect(mockWebhookClient.calls[0]!.idempotencyKey).toMatch(/^event-[a-f0-9]{16}$/);
    });

    it('should retrieve idempotency key from database on each retry', async () => {
      // Arrange - Create event directly in database
      const eventId = randomUUID();
      const targetTime = DateTime.now().plus({ days: 1 });
      const idempotencyKey = IdempotencyKey.generate(testUserId, targetTime);

      await prisma.event.create({
        data: {
          id: eventId,
          userId: testUserId,
          eventType: 'BIRTHDAY',
          status: 'PROCESSING',
          targetTimestampUTC: targetTime.toJSDate(),
          targetTimestampLocal: targetTime.toJSDate(),
          targetTimezone: 'America/New_York',
          idempotencyKey: idempotencyKey.toString(),
          deliveryPayload: {
            message: 'Happy Birthday!',
            webhookUrl: 'https://webhook.test/endpoint',
          },
          version: 1,
          retryCount: 0,
        },
      });

      // Act - Execute twice (simulating retry)
      mockWebhookClient.shouldFail = true;
      await expect(useCase.execute(eventId)).rejects.toThrow();

      mockWebhookClient.shouldFail = false;
      await useCase.execute(eventId);

      // Assert - Both executions retrieved same idempotency key from database
      expect(mockWebhookClient.calls).toHaveLength(2);
      expect(mockWebhookClient.calls[0]!.idempotencyKey).toBe(idempotencyKey.toString());
      expect(mockWebhookClient.calls[1]!.idempotencyKey).toBe(idempotencyKey.toString());
    });
  });
});
