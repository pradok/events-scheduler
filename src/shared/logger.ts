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
const isLambda = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);
const logLevel = process.env.LOG_LEVEL || 'info';

export const logger = pino({
  level: logLevel,
  // Only use pino-pretty in local development (NOT in Lambda or tests)
  transport:
    isDevelopment && !isLambda
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined, // JSON output in Lambda/production/tests
  base: {
    env: process.env.NODE_ENV || 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
