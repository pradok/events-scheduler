import { DateTime } from 'luxon';
import { DeleteEventsOnUserDeletedHandler } from './DeleteEventsOnUserDeletedHandler';
import { UserDeletedEvent } from '../../../user/domain/events/UserDeleted';
import { IEventRepository } from '../ports/IEventRepository';
import { logger } from '../../../../shared/logger';

describe('DeleteEventsOnUserDeletedHandler', () => {
  let handler: DeleteEventsOnUserDeletedHandler;
  let mockEventRepository: jest.Mocked<IEventRepository>;

  beforeEach(() => {
    // Mock event repository
    mockEventRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      update: jest.fn(),
      claimReadyEvents: jest.fn(),
      deleteByUserId: jest.fn(),
    } as jest.Mocked<IEventRepository>;

    // Create handler
    handler = new DeleteEventsOnUserDeletedHandler(mockEventRepository);
  });

  function createUserDeletedEvent(overrides: Partial<UserDeletedEvent> = {}): UserDeletedEvent {
    return {
      eventType: 'UserDeleted',
      context: 'user',
      occurredAt: DateTime.now().toISO(),
      aggregateId: 'user-123',
      userId: 'user-123',
      ...overrides,
    };
  }

  describe('handle()', () => {
    it('should delete all events for deleted user', async () => {
      // Arrange
      const event = createUserDeletedEvent();
      mockEventRepository.deleteByUserId.mockResolvedValue();

      // Act
      await handler.handle(event);

      // Assert
      expect(mockEventRepository.deleteByUserId).toHaveBeenCalledTimes(1); // eslint-disable-line @typescript-eslint/unbound-method
      expect(mockEventRepository.deleteByUserId).toHaveBeenCalledWith('user-123'); // eslint-disable-line @typescript-eslint/unbound-method
    });

    it('should handle user with no events', async () => {
      // Arrange
      const event = createUserDeletedEvent();
      mockEventRepository.deleteByUserId.mockResolvedValue(); // No error if no events

      // Act
      await handler.handle(event);

      // Assert
      expect(mockEventRepository.deleteByUserId).toHaveBeenCalledWith('user-123'); // eslint-disable-line @typescript-eslint/unbound-method
    });

    it('should log error and rethrow if delete fails', async () => {
      // Arrange
      const event = createUserDeletedEvent();
      mockEventRepository.deleteByUserId.mockRejectedValue(new Error('Database error'));
      const loggerErrorSpy = jest.spyOn(logger, 'error').mockImplementation();

      // Act & Assert
      await expect(handler.handle(event)).rejects.toThrow('Database error');

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Failed to delete events from UserDeleted event',
          eventType: 'UserDeleted',
          userId: 'user-123',
          aggregateId: 'user-123',
          error: 'Database error',
        })
      );

      loggerErrorSpy.mockRestore();
    });

    it('should delete events for correct user ID', async () => {
      // Arrange
      const event = createUserDeletedEvent({ userId: 'user-456', aggregateId: 'user-456' });
      mockEventRepository.deleteByUserId.mockResolvedValue();

      // Act
      await handler.handle(event);

      // Assert
      expect(mockEventRepository.deleteByUserId).toHaveBeenCalledWith('user-456'); // eslint-disable-line @typescript-eslint/unbound-method
    });

    it('should complete successfully even if repository returns void', async () => {
      // Arrange
      const event = createUserDeletedEvent();
      mockEventRepository.deleteByUserId.mockResolvedValue(undefined);

      // Act & Assert
      await expect(handler.handle(event)).resolves.toBeUndefined();
    });
  });
});
