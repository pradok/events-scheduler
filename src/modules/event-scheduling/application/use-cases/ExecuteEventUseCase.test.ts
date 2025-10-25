import { DateTime } from 'luxon';
import { ExecuteEventUseCase } from './ExecuteEventUseCase';
import type { IEventRepository } from '../ports/IEventRepository';
import type { IWebhookClient } from '../ports/IWebhookClient';
import type { IUserRepository } from '../../../user/application/ports/IUserRepository';
import { Event } from '../../domain/entities/Event';
import { User } from '../../../user/domain/entities/User';
import { DateOfBirth } from '../../../user/domain/value-objects/DateOfBirth';
import { EventStatus } from '../../domain/value-objects/EventStatus';
import { IdempotencyKey } from '../../domain/value-objects/IdempotencyKey';
import { Timezone } from '../../../../shared/value-objects/Timezone';
import { BirthdayEventHandler } from '../../domain/services/event-handlers/BirthdayEventHandler';
import { TimezoneService } from '../../domain/services/TimezoneService';
import { PermanentDeliveryError } from '../../../../domain/errors/PermanentDeliveryError';
import { InfrastructureError } from '../../../../domain/errors/InfrastructureError';
import { logger } from '../../../../shared/logger';
import type { WebhookPayload, WebhookResponse } from '../../../../shared/validation/schemas';

// Mock the logger
jest.mock('../../../../shared/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ExecuteEventUseCase', () => {
  let useCase: ExecuteEventUseCase;
  let mockEventRepository: jest.Mocked<IEventRepository>;
  let mockWebhookClient: jest.Mocked<IWebhookClient>;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let birthdayEventHandler: BirthdayEventHandler;
  let timezoneService: TimezoneService;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock event repository
    mockEventRepository = {
      findById: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      findByUserId: jest.fn(),
      claimReadyEvents: jest.fn(),
      deleteByUserId: jest.fn(),
    };

    // Create mock webhook client
    mockWebhookClient = {
      deliver: jest.fn(),
    };

    // Create mock user repository
    mockUserRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findUsersWithUpcomingBirthdays: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    // Create real instances (not mocked - these are domain services)
    birthdayEventHandler = new BirthdayEventHandler();
    timezoneService = new TimezoneService();

    // Create use case with mocked dependencies
    useCase = new ExecuteEventUseCase(
      mockEventRepository,
      mockWebhookClient,
      mockUserRepository,
      birthdayEventHandler,
      timezoneService
    );
  });

  describe('execute', () => {
    describe('Successful Execution', () => {
      it('should mark event as COMPLETED when webhook delivery succeeds', async () => {
        // Arrange
        const event = createMockEvent({
          id: 'event-123',
          status: EventStatus.PROCESSING,
        });
        const webhookResponse: WebhookResponse = {
          success: true,
          timestamp: DateTime.now().toISO(),
          message: 'Webhook delivered successfully',
        };

        mockEventRepository.findById.mockResolvedValue(event);
        mockWebhookClient.deliver.mockResolvedValue(webhookResponse);

        // Act
        await useCase.execute('event-123');

        // Assert
        expect(mockEventRepository.findById).toHaveBeenCalledWith('event-123');
        expect(mockWebhookClient.deliver).toHaveBeenCalledWith(
          event.deliveryPayload,
          event.idempotencyKey.toString()
        );
        expect(mockEventRepository.update).toHaveBeenCalledTimes(1);

        // Verify the updated event
        const updateCall = mockEventRepository.update.mock.calls[0];
        expect(updateCall).toBeDefined();
        const updatedEvent = updateCall?.[0];
        expect(updatedEvent).toBeDefined();
        expect(updatedEvent?.status).toBe(EventStatus.COMPLETED);
        expect(updatedEvent?.executedAt).toBeInstanceOf(DateTime);
        expect(updatedEvent?.executedAt).not.toBeNull();
      });

      it('should include correct payload and idempotency key in webhook delivery', async () => {
        // Arrange
        const payload: WebhookPayload = { message: "Hey, John Doe it's your birthday" };
        const idempotencyKey = IdempotencyKey.generate('user-123', DateTime.now());
        const event = createMockEvent({
          deliveryPayload: payload,
          idempotencyKey,
        });

        mockEventRepository.findById.mockResolvedValue(event);
        mockWebhookClient.deliver.mockResolvedValue({ success: true });
        mockEventRepository.update.mockResolvedValue(event);

        // Act
        await useCase.execute(event.id);

        // Assert
        expect(mockWebhookClient.deliver).toHaveBeenCalledWith(payload, idempotencyKey.toString());
      });

      it('should set executedAt timestamp on successful completion', async () => {
        // Arrange
        const event = createMockEvent({ status: EventStatus.PROCESSING });
        mockEventRepository.findById.mockResolvedValue(event);
        mockWebhookClient.deliver.mockResolvedValue({ success: true });
        mockEventRepository.update.mockResolvedValue(event);

        const beforeExecution = DateTime.now();

        // Act
        await useCase.execute(event.id);

        const afterExecution = DateTime.now();

        // Assert
        const updateCall = mockEventRepository.update.mock.calls[0];
        expect(updateCall).toBeDefined();
        const updatedEvent = updateCall?.[0];
        expect(updatedEvent).toBeDefined();
        expect(updatedEvent?.executedAt).not.toBeNull();
        expect(updatedEvent?.executedAt).toBeInstanceOf(DateTime);

        // Verify executedAt is within reasonable time window
        const executedAt = updatedEvent?.executedAt;
        if (executedAt && DateTime.isDateTime(executedAt)) {
          expect(executedAt.toMillis()).toBeGreaterThanOrEqual(beforeExecution.toMillis());
          expect(executedAt.toMillis()).toBeLessThanOrEqual(afterExecution.toMillis());
        }
      });

      it('should log successful execution with correct metadata', async () => {
        // Arrange
        const event = createMockEvent({ status: EventStatus.PROCESSING });
        mockEventRepository.findById.mockResolvedValue(event);
        mockWebhookClient.deliver.mockResolvedValue({ success: true });
        mockEventRepository.update.mockResolvedValue(event);

        // Act
        await useCase.execute(event.id);

        // Assert
        expect(logger.info).toHaveBeenCalledWith({
          msg: 'Event execution started',
          eventId: event.id,
        });

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Event execution completed successfully',
            eventId: event.id,
            idempotencyKey: event.idempotencyKey.toString(),
            status: EventStatus.COMPLETED,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            durationMs: expect.any(Number),
          })
        );
      });
    });

    describe('Permanent Failure Scenarios', () => {
      it('should mark event as FAILED when webhook returns 4xx permanent error', async () => {
        // Arrange
        const event = createMockEvent({ status: EventStatus.PROCESSING });
        const permanentError = new PermanentDeliveryError('Webhook endpoint returned 404', 404);

        mockEventRepository.findById.mockResolvedValue(event);
        mockWebhookClient.deliver.mockRejectedValue(permanentError);
        mockEventRepository.update.mockResolvedValue(event);

        // Act
        await useCase.execute(event.id);

        // Assert
        expect(mockEventRepository.update).toHaveBeenCalledTimes(1);
        const updateCall = mockEventRepository.update.mock.calls[0];
        const updatedEvent = updateCall?.[0];
        expect(updatedEvent).toBeDefined();
        expect(updatedEvent?.status).toBe(EventStatus.FAILED);
        expect(updatedEvent?.failureReason).toBe('Webhook endpoint returned 404');
        expect(updatedEvent?.retryCount).toBe(1);
      });

      it('should set failureReason on permanent failure', async () => {
        // Arrange
        const event = createMockEvent({ status: EventStatus.PROCESSING });
        const errorMessage = 'Bad Request: Invalid payload format';
        const permanentError = new PermanentDeliveryError(errorMessage, 400);

        mockEventRepository.findById.mockResolvedValue(event);
        mockWebhookClient.deliver.mockRejectedValue(permanentError);
        mockEventRepository.update.mockResolvedValue(event);

        // Act
        await useCase.execute(event.id);

        // Assert
        const updateCall = mockEventRepository.update.mock.calls[0];
        const updatedEvent = updateCall?.[0];
        expect(updatedEvent?.failureReason).toBe(errorMessage);
      });

      it('should not throw error on permanent failure (prevents SQS retry)', async () => {
        // Arrange
        const event = createMockEvent({ status: EventStatus.PROCESSING });
        const permanentError = new PermanentDeliveryError('Forbidden', 403);

        mockEventRepository.findById.mockResolvedValue(event);
        mockWebhookClient.deliver.mockRejectedValue(permanentError);
        mockEventRepository.update.mockResolvedValue(event);

        // Act & Assert - should NOT throw
        await expect(useCase.execute(event.id)).resolves.not.toThrow();
      });

      it('should log permanent failure with error details and status code', async () => {
        // Arrange
        const event = createMockEvent({ status: EventStatus.PROCESSING });
        const permanentError = new PermanentDeliveryError('Not Found', 404);

        mockEventRepository.findById.mockResolvedValue(event);
        mockWebhookClient.deliver.mockRejectedValue(permanentError);
        mockEventRepository.update.mockResolvedValue(event);

        // Act
        await useCase.execute(event.id);

        // Assert
        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Event execution failed permanently',
            eventId: event.id,
            status: EventStatus.FAILED,
            error: 'Not Found',
            statusCode: 404,
          })
        );
      });
    });

    describe('Transient Failure Scenarios', () => {
      it('should leave event in PROCESSING when webhook returns 5xx transient error', async () => {
        // Arrange
        const event = createMockEvent({ status: EventStatus.PROCESSING });
        const infrastructureError = new InfrastructureError('Service Unavailable (503)');

        mockEventRepository.findById.mockResolvedValue(event);
        mockWebhookClient.deliver.mockRejectedValue(infrastructureError);

        // Act & Assert
        await expect(useCase.execute(event.id)).rejects.toThrow(InfrastructureError);

        // Event should NOT be updated (remains in PROCESSING for SQS retry)
        expect(mockEventRepository.update).not.toHaveBeenCalled();
      });

      it('should rethrow InfrastructureError to trigger SQS retry', async () => {
        // Arrange
        const event = createMockEvent({ status: EventStatus.PROCESSING });
        const infrastructureError = new InfrastructureError('Timeout after 10s');

        mockEventRepository.findById.mockResolvedValue(event);
        mockWebhookClient.deliver.mockRejectedValue(infrastructureError);

        // Act & Assert
        await expect(useCase.execute(event.id)).rejects.toThrow(InfrastructureError);
        await expect(useCase.execute(event.id)).rejects.toThrow('Timeout after 10s');
      });

      it('should log transient failure with SQS retry message', async () => {
        // Arrange
        const event = createMockEvent({ status: EventStatus.PROCESSING });
        const infrastructureError = new InfrastructureError('Gateway Timeout');

        mockEventRepository.findById.mockResolvedValue(event);
        mockWebhookClient.deliver.mockRejectedValue(infrastructureError);

        // Act
        try {
          await useCase.execute(event.id);
        } catch {
          // Expected to throw
        }

        // Assert
        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Event execution failed with transient error - SQS will retry',
            eventId: event.id,
            status: EventStatus.PROCESSING,
            error: 'Gateway Timeout',
          })
        );
      });

      it('should not update event status on transient failure', async () => {
        // Arrange
        const event = createMockEvent({ status: EventStatus.PROCESSING });
        const infrastructureError = new InfrastructureError('Network error');

        mockEventRepository.findById.mockResolvedValue(event);
        mockWebhookClient.deliver.mockRejectedValue(infrastructureError);

        // Act
        try {
          await useCase.execute(event.id);
        } catch {
          // Expected to throw
        }

        // Assert - update should NOT be called
        expect(mockEventRepository.update).not.toHaveBeenCalled();
      });
    });

    describe('Edge Cases', () => {
      it('should log warning and return when event not found', async () => {
        // Arrange
        mockEventRepository.findById.mockResolvedValue(null);

        // Act
        await useCase.execute('non-existent-id');

        // Assert
        expect(logger.warn).toHaveBeenCalledWith({
          msg: 'Event not found for execution',
          eventId: 'non-existent-id',
        });
        expect(mockWebhookClient.deliver).not.toHaveBeenCalled();
        expect(mockEventRepository.update).not.toHaveBeenCalled();
      });

      it('should not throw error when event not found (idempotent)', async () => {
        // Arrange
        mockEventRepository.findById.mockResolvedValue(null);

        // Act & Assert - should NOT throw
        await expect(useCase.execute('non-existent-id')).resolves.not.toThrow();
      });

      it('should log error and return when event status is not PROCESSING', async () => {
        // Arrange
        const event = createMockEvent({ status: EventStatus.PENDING });
        mockEventRepository.findById.mockResolvedValue(event);

        // Act
        await useCase.execute(event.id);

        // Assert
        expect(logger.error).toHaveBeenCalledWith({
          msg: 'Event status is not PROCESSING - cannot execute',
          eventId: event.id,
          currentStatus: EventStatus.PENDING,
          expectedStatus: EventStatus.PROCESSING,
        });
        expect(mockWebhookClient.deliver).not.toHaveBeenCalled();
        expect(mockEventRepository.update).not.toHaveBeenCalled();
      });

      it('should not execute webhook when event status is COMPLETED', async () => {
        // Arrange
        const event = createMockEvent({ status: EventStatus.COMPLETED });
        mockEventRepository.findById.mockResolvedValue(event);

        // Act
        await useCase.execute(event.id);

        // Assert
        expect(mockWebhookClient.deliver).not.toHaveBeenCalled();
        expect(mockEventRepository.update).not.toHaveBeenCalled();
      });

      it('should not execute webhook when event status is FAILED', async () => {
        // Arrange
        const event = createMockEvent({ status: EventStatus.FAILED });
        mockEventRepository.findById.mockResolvedValue(event);

        // Act
        await useCase.execute(event.id);

        // Assert
        expect(mockWebhookClient.deliver).not.toHaveBeenCalled();
        expect(mockEventRepository.update).not.toHaveBeenCalled();
      });

      it('should throw validation error when event payload is invalid', async () => {
        // Arrange
        const event = createMockEvent({
          status: EventStatus.PROCESSING,
          deliveryPayload: { invalidField: 'missing message field' }, // Missing required 'message' field
        });
        mockEventRepository.findById.mockResolvedValue(event);

        // Act & Assert
        await expect(useCase.execute(event.id)).rejects.toThrow();

        // Should log validation error
        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Invalid webhook payload schema',
            eventId: event.id,
          })
        );

        // Should NOT call webhook or update event
        expect(mockWebhookClient.deliver).not.toHaveBeenCalled();
        expect(mockEventRepository.update).not.toHaveBeenCalled();
      });

      it('should handle unexpected errors and log with stack trace', async () => {
        // Arrange
        const event = createMockEvent({ status: EventStatus.PROCESSING });
        const unexpectedError = new Error('Unexpected database error');

        mockEventRepository.findById.mockResolvedValue(event);
        mockWebhookClient.deliver.mockRejectedValue(unexpectedError);

        // Act & Assert
        await expect(useCase.execute(event.id)).rejects.toThrow('Unexpected database error');

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Event execution failed with unexpected error',
            error: 'Unexpected database error',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            stack: expect.any(String),
          })
        );
      });
    });

    describe('Logging and Observability', () => {
      it('should log event execution start', async () => {
        // Arrange
        const event = createMockEvent({ status: EventStatus.PROCESSING });
        mockEventRepository.findById.mockResolvedValue(event);
        mockWebhookClient.deliver.mockResolvedValue({ success: true });
        mockEventRepository.update.mockResolvedValue(event);

        // Act
        await useCase.execute(event.id);

        // Assert
        expect(logger.info).toHaveBeenCalledWith({
          msg: 'Event execution started',
          eventId: event.id,
        });
      });

      it('should log webhook delivery attempt with payload', async () => {
        // Arrange
        const payload: WebhookPayload = { message: 'Test message' };
        const event = createMockEvent({
          status: EventStatus.PROCESSING,
          deliveryPayload: payload,
        });
        mockEventRepository.findById.mockResolvedValue(event);
        mockWebhookClient.deliver.mockResolvedValue({ success: true });
        mockEventRepository.update.mockResolvedValue(event);

        // Act
        await useCase.execute(event.id);

        // Assert
        expect(logger.info).toHaveBeenCalledWith({
          msg: 'Delivering webhook',
          eventId: event.id,
          idempotencyKey: event.idempotencyKey.toString(),
          payload,
        });
      });

      it('should include duration in success log', async () => {
        // Arrange
        const event = createMockEvent({ status: EventStatus.PROCESSING });
        mockEventRepository.findById.mockResolvedValue(event);
        mockWebhookClient.deliver.mockResolvedValue({ success: true });
        mockEventRepository.update.mockResolvedValue(event);

        // Act
        await useCase.execute(event.id);

        // Assert
        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Event execution completed successfully',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            durationMs: expect.any(Number),
          })
        );

        // Extract the logged duration
        const logCalls = (logger.info as jest.MockedFunction<typeof logger.info>).mock.calls;
        const successLog = logCalls.find((call) => {
          const logObj = call[0] as Record<string, unknown>;
          return logObj?.msg === 'Event execution completed successfully';
        });
        expect(successLog).toBeDefined();
        if (successLog?.[0]) {
          const logData = successLog[0] as Record<string, unknown>;
          expect(logData.durationMs).toBeGreaterThanOrEqual(0);
        }
      });

      it('should include duration in failure logs', async () => {
        // Arrange
        const event = createMockEvent({ status: EventStatus.PROCESSING });
        mockEventRepository.findById.mockResolvedValue(event);
        mockWebhookClient.deliver.mockRejectedValue(new PermanentDeliveryError('Test error', 400));
        mockEventRepository.update.mockResolvedValue(event);

        // Act
        await useCase.execute(event.id);

        // Assert
        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Event execution failed permanently',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            durationMs: expect.any(Number),
          })
        );
      });
    });

    describe('Next Year Event Generation (Story 2.9)', () => {
      it('should generate next year event when current event completes successfully', async () => {
        // Arrange - Create event with birthday March 15, 2025
        const currentDate = DateTime.fromObject(
          { year: 2025, month: 3, day: 15, hour: 14, minute: 0 },
          { zone: 'utc' }
        );
        const event = createMockEvent({
          id: 'event-2025',
          status: EventStatus.PROCESSING,
          targetTimestampUTC: currentDate,
        });

        const user = createMockUser({
          id: 'user-123',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1990-03-15',
          timezone: 'America/New_York',
        });

        mockEventRepository.findById.mockResolvedValue(event);
        mockWebhookClient.deliver.mockResolvedValue({ success: true });
        mockUserRepository.findById.mockResolvedValue(user);
        mockEventRepository.update.mockResolvedValue(event);
        mockEventRepository.create.mockImplementation((e) => Promise.resolve(e));

        // Act
        await useCase.execute('event-2025');

        // Assert - Event should be marked completed
        expect(mockEventRepository.update).toHaveBeenCalledTimes(1);
        const updatedEvent = mockEventRepository.update.mock.calls[0]?.[0];
        expect(updatedEvent?.status).toBe(EventStatus.COMPLETED);

        // Assert - Next year event should be created
        expect(mockEventRepository.create).toHaveBeenCalledTimes(1);
        const nextYearEvent = mockEventRepository.create.mock.calls[0]?.[0];
        expect(nextYearEvent).toBeDefined();
        expect(nextYearEvent?.userId).toBe('user-123');
        expect(nextYearEvent?.eventType).toBe('BIRTHDAY');
        expect(nextYearEvent?.status).toBe(EventStatus.PENDING);

        // Verify next birthday is March 15, 2026 at 9:00 AM EST (14:00 UTC)
        expect(nextYearEvent?.targetTimestampLocal.year).toBe(2026);
        expect(nextYearEvent?.targetTimestampLocal.month).toBe(3);
        expect(nextYearEvent?.targetTimestampLocal.day).toBe(15);
        expect(nextYearEvent?.targetTimestampLocal.hour).toBe(9);
        expect(nextYearEvent?.targetTimestampLocal.minute).toBe(0);
      });

      it('should handle leap year birthdays (Feb 29 → Feb 28 in non-leap years)', async () => {
        // Arrange - User with Feb 29 birthday, current event is in 2024 (leap year)
        const currentDateUTC = DateTime.fromObject(
          { year: 2024, month: 2, day: 29, hour: 14, minute: 0 },
          { zone: 'utc' }
        );
        const currentDateLocal = DateTime.fromObject(
          { year: 2024, month: 2, day: 29, hour: 9, minute: 0 },
          { zone: 'America/New_York' }
        );
        const event = createMockEvent({
          id: 'event-2024',
          status: EventStatus.PROCESSING,
          targetTimestampUTC: currentDateUTC,
          targetTimestampLocal: currentDateLocal,
        });

        const user = createMockUser({
          id: 'user-leap',
          dateOfBirth: '1992-02-29',
          timezone: 'America/New_York',
        });

        mockEventRepository.findById.mockResolvedValue(event);
        mockWebhookClient.deliver.mockResolvedValue({ success: true });
        mockUserRepository.findById.mockResolvedValue(user);
        mockEventRepository.update.mockResolvedValue(event);
        mockEventRepository.create.mockImplementation((e) => Promise.resolve(e));

        // Act
        await useCase.execute('event-2024');

        // Assert - Next year event should be Feb 28, 2025 (non-leap year)
        expect(mockEventRepository.create).toHaveBeenCalledTimes(1);
        const nextYearEvent = mockEventRepository.create.mock.calls[0]?.[0];
        expect(nextYearEvent?.targetTimestampLocal.year).toBe(2025);
        expect(nextYearEvent?.targetTimestampLocal.month).toBe(2);
        expect(nextYearEvent?.targetTimestampLocal.day).toBe(28); // Feb 28, not Feb 29
        expect(nextYearEvent?.targetTimestampLocal.hour).toBe(9);
      });

      it('should NOT generate next year event when event fails permanently', async () => {
        // Arrange
        const event = createMockEvent({ status: EventStatus.PROCESSING });
        mockEventRepository.findById.mockResolvedValue(event);
        mockWebhookClient.deliver.mockRejectedValue(
          new PermanentDeliveryError('Webhook failed', 404)
        );
        mockEventRepository.update.mockResolvedValue(event);

        // Act
        await useCase.execute(event.id);

        // Assert - Event should be marked FAILED
        const updatedEvent = mockEventRepository.update.mock.calls[0]?.[0];
        expect(updatedEvent?.status).toBe(EventStatus.FAILED);

        // Assert - Next year event should NOT be created
        expect(mockUserRepository.findById).not.toHaveBeenCalled();
        expect(mockEventRepository.create).not.toHaveBeenCalled();
      });

      it('should handle user deleted before next year generation', async () => {
        // Arrange
        const event = createMockEvent({ status: EventStatus.PROCESSING });
        mockEventRepository.findById.mockResolvedValue(event);
        mockWebhookClient.deliver.mockResolvedValue({ success: true });
        mockUserRepository.findById.mockResolvedValue(null); // User deleted
        mockEventRepository.update.mockResolvedValue(event);

        // Act
        await useCase.execute(event.id);

        // Assert - Event should still be marked COMPLETED
        expect(mockEventRepository.update).toHaveBeenCalledTimes(1);
        const updatedEvent = mockEventRepository.update.mock.calls[0]?.[0];
        expect(updatedEvent?.status).toBe(EventStatus.COMPLETED);

        // Assert - No next year event created (user deleted)
        expect(mockEventRepository.create).not.toHaveBeenCalled();

        // Assert - Warning should be logged
        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'User deleted after event execution, skipping next year event generation',
            userId: 'user-123',
          })
        );
      });

      it('should rethrow error if next year event creation fails', async () => {
        // Arrange
        const event = createMockEvent({ status: EventStatus.PROCESSING });
        const user = createMockUser();
        const createError = new Error('Database error during event creation');

        mockEventRepository.findById.mockResolvedValue(event);
        mockWebhookClient.deliver.mockResolvedValue({ success: true });
        mockUserRepository.findById.mockResolvedValue(user);
        mockEventRepository.update.mockResolvedValue(event);
        mockEventRepository.create.mockRejectedValue(createError);

        // Act & Assert - Should rethrow error for SQS retry
        await expect(useCase.execute(event.id)).rejects.toThrow(
          'Database error during event creation'
        );

        // Assert - Error should be logged
        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Failed to generate next year event',
            eventId: event.id,
          })
        );
      });

      it('should use current user timezone for next year event (not old event timezone)', async () => {
        // Arrange - User changed timezone from EST to PST
        const event = createMockEvent({
          status: EventStatus.PROCESSING,
          targetTimezone: 'America/New_York', // Old timezone
        });

        const user = createMockUser({
          timezone: 'America/Los_Angeles', // New timezone
        });

        mockEventRepository.findById.mockResolvedValue(event);
        mockWebhookClient.deliver.mockResolvedValue({ success: true });
        mockUserRepository.findById.mockResolvedValue(user);
        mockEventRepository.update.mockResolvedValue(event);
        mockEventRepository.create.mockImplementation((e) => Promise.resolve(e));

        // Act
        await useCase.execute(event.id);

        // Assert - Next year event should use new timezone (PST)
        const nextYearEvent = mockEventRepository.create.mock.calls[0]?.[0];
        expect(nextYearEvent?.targetTimezone).toBe('America/Los_Angeles');
      });
    });
  });
});

/**
 * Helper function to create a mock Event for testing
 */
function createMockEvent(overrides: Partial<Event> = {}): Event {
  const now = DateTime.now();
  const userId = 'user-123';
  const eventId = overrides.id || 'event-456';

  return new Event({
    id: eventId,
    userId,
    eventType: 'BIRTHDAY',
    status: EventStatus.PROCESSING,
    targetTimestampUTC: now,
    targetTimestampLocal: now,
    targetTimezone: 'America/New_York',
    executedAt: null,
    failureReason: null,
    retryCount: 0,
    version: 1,
    idempotencyKey: IdempotencyKey.generate(userId, now),
    deliveryPayload: { message: "Hey, John Doe it's your birthday" },
    createdAt: now.minus({ days: 1 }),
    updatedAt: now.minus({ days: 1 }),
    ...overrides,
  });
}

function createMockUser(
  overrides: Partial<{
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    timezone: string;
  }> = {}
): User {
  const now = DateTime.now();
  const userId = overrides.id || 'user-123';

  return new User({
    id: userId,
    firstName: overrides.firstName || 'John',
    lastName: overrides.lastName || 'Doe',
    dateOfBirth: new DateOfBirth(overrides.dateOfBirth || '1990-03-15'),
    timezone: new Timezone(overrides.timezone || 'America/New_York'),
    createdAt: now.minus({ days: 30 }),
    updatedAt: now.minus({ days: 30 }),
  });
}
