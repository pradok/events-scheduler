import pino from 'pino';

/**
 * Structured Logger using Pino
 *
 * Provides high-performance structured JSON logging for production systems.
 *
 * **Configuration:**
 * - LOG_LEVEL: Set log level (error, warn, info, debug) - defaults to 'info'
 * - NODE_ENV: 'development' uses pretty-printing, 'production' uses JSON
 *
 * **Usage:**
 * ```typescript
 * import { logger } from '@/shared/logger';
 *
 * logger.error({
 *   msg: 'Failed to process event',
 *   userId: 'user-123',
 *   eventType: 'UserCreated',
 *   error: error.message,
 *   stack: error.stack
 * });
 * ```
 *
 * @see docs/architecture/coding-standards.md - Section 1: No Console.log in Production
 */

const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
const logLevel = process.env.LOG_LEVEL || 'info';

export const logger = pino({
  level: logLevel,
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      }
    : undefined, // JSON output in production
  base: {
    env: process.env.NODE_ENV || 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
