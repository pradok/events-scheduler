import { logger } from './logger';

describe('Logger', () => {
  it('should be defined', () => {
    expect(logger).toBeDefined();
  });

  it('should have standard log methods', () => {
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('should log error messages with context', () => {
    // Suppress output during test
    const logSpy = jest.spyOn(logger, 'error');

    logger.error({
      msg: 'Test error message',
      userId: 'test-user-123',
      context: 'unit-test',
    });

    expect(logSpy).toHaveBeenCalledWith({
      msg: 'Test error message',
      userId: 'test-user-123',
      context: 'unit-test',
    });

    logSpy.mockRestore();
  });

  it('should log info messages', () => {
    const logSpy = jest.spyOn(logger, 'info');

    logger.info({ msg: 'Test info message' });

    expect(logSpy).toHaveBeenCalledWith({ msg: 'Test info message' });

    logSpy.mockRestore();
  });
});
