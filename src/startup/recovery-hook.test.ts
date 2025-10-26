import { RecoveryService } from '../modules/event-scheduling/domain/services/RecoveryService';
import type { RecoveryResult } from '../modules/event-scheduling/domain/services/RecoveryService';

// Mock dependencies
jest.mock('../modules/event-scheduling/domain/services/RecoveryService');
jest.mock('@prisma/client');
jest.mock('@aws-sdk/client-sqs');

// Mock logger
jest.mock('../shared/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Import after mocking
import { runRecoveryOnStartup } from './recovery-hook';
import { logger } from '../shared/logger';

describe('runRecoveryOnStartup', () => {
  let mockRecoveryService: jest.Mocked<RecoveryService>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock RecoveryService
    mockRecoveryService = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<RecoveryService>;

    // Mock RecoveryService constructor to return our mock
    (RecoveryService as jest.MockedClass<typeof RecoveryService>).mockImplementation(
      () => mockRecoveryService
    );
  });

  it('should call RecoveryService.execute()', async () => {
    // Arrange
    const mockResult: RecoveryResult = {
      missedEventsCount: 0,
      eventsQueued: 0,
      eventsFailed: 0,
      oldestEventTimestamp: null,
      newestEventTimestamp: null,
    };
    mockRecoveryService.execute.mockResolvedValue(mockResult);

    // Act
    await runRecoveryOnStartup();

    // Assert
    expect(mockRecoveryService.execute).toHaveBeenCalledTimes(1);
  });

  it('should log "Running recovery check..." at start', async () => {
    // Arrange
    const mockResult: RecoveryResult = {
      missedEventsCount: 0,
      eventsQueued: 0,
      eventsFailed: 0,
      oldestEventTimestamp: null,
      newestEventTimestamp: null,
    };
    mockRecoveryService.execute.mockResolvedValue(mockResult);

    // Act
    await runRecoveryOnStartup();

    // Assert
    expect(logger.info).toHaveBeenCalledWith('Running recovery check...');
  });

  it('should log "No missed events found" when count is 0', async () => {
    // Arrange
    const mockResult: RecoveryResult = {
      missedEventsCount: 0,
      eventsQueued: 0,
      eventsFailed: 0,
      oldestEventTimestamp: null,
      newestEventTimestamp: null,
    };
    mockRecoveryService.execute.mockResolvedValue(mockResult);

    // Act
    await runRecoveryOnStartup();

    // Assert
    expect(logger.info).toHaveBeenCalledWith('No missed events found');
  });

  it('should log "Recovery check complete" when events queued', async () => {
    // Arrange
    const mockResult: RecoveryResult = {
      missedEventsCount: 5,
      eventsQueued: 5,
      eventsFailed: 0,
      oldestEventTimestamp: null,
      newestEventTimestamp: null,
    };
    mockRecoveryService.execute.mockResolvedValue(mockResult);

    // Act
    await runRecoveryOnStartup();

    // Assert
    expect(logger.info).toHaveBeenCalledWith({
      msg: 'Recovery check complete',
      eventsQueued: 5,
      eventsFailed: 0,
    });
  });

  it('should log "Recovery check complete" with partial failure', async () => {
    // Arrange
    const mockResult: RecoveryResult = {
      missedEventsCount: 10,
      eventsQueued: 8,
      eventsFailed: 2,
      oldestEventTimestamp: null,
      newestEventTimestamp: null,
    };
    mockRecoveryService.execute.mockResolvedValue(mockResult);

    // Act
    await runRecoveryOnStartup();

    // Assert
    expect(logger.info).toHaveBeenCalledWith({
      msg: 'Recovery check complete',
      eventsQueued: 8,
      eventsFailed: 2,
    });
  });

  it('should handle errors gracefully without throwing', async () => {
    // Arrange
    const error = new Error('Database connection failed');
    mockRecoveryService.execute.mockRejectedValue(error);

    // Act & Assert - Should NOT throw
    await expect(runRecoveryOnStartup()).resolves.toBeUndefined();
  });

  it('should log error when recovery fails', async () => {
    // Arrange
    const error = new Error('Database connection failed');
    mockRecoveryService.execute.mockRejectedValue(error);

    // Act
    await runRecoveryOnStartup();

    // Assert
    expect(logger.error).toHaveBeenCalledWith({
      msg: 'Recovery check failed',
      error: 'Database connection failed',
    });
  });

  it('should log error for non-Error exceptions', async () => {
    // Arrange
    mockRecoveryService.execute.mockRejectedValue('String error');

    // Act
    await runRecoveryOnStartup();

    // Assert
    expect(logger.error).toHaveBeenCalledWith({
      msg: 'Recovery check failed',
      error: 'String error',
    });
  });

  it('should not throw even if recovery service throws', async () => {
    // Arrange
    mockRecoveryService.execute.mockRejectedValue(new Error('SQS unavailable'));

    // Act - Should complete without throwing
    await runRecoveryOnStartup();

    // Assert - Verify error was logged but function completed
    expect(logger.error).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Running recovery check...');
  });
});
