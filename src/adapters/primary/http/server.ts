import fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { UserNotFoundError } from '../../../domain/errors/UserNotFoundError';

/**
 * Fastify Server Configuration
 *
 * This module configures the Fastify HTTP server with:
 * - Zod schema validation integration
 * - Global error handling for domain and validation errors
 * - CORS support
 * - JSON logging with Pino
 *
 * **Architecture:** This is a Primary Adapter in Hexagonal Architecture.
 * It translates HTTP requests into domain use case calls and domain responses
 * back into HTTP responses.
 *
 * **Zod Integration:**
 * Since we're using Zod v4 and fastify-type-provider-zod only supports v3,
 * we implement manual Zod validation in route handlers.
 */

/**
 * Create and configure a Fastify server instance
 *
 * @returns Configured Fastify instance ready to register routes
 */
export function createServer(): FastifyInstance {
  const server = fastify({
    logger:
      process.env['NODE_ENV'] === 'test'
        ? false // Disable logging in tests
        : {
            level: 'info',
          },
  });

  // Register CORS plugin
  void server.register(cors, {
    origin: true, // Allow all origins in development (configure properly for production)
  });

  // Global error handler
  server.setErrorHandler((error: Error, request: FastifyRequest, reply: FastifyReply) => {
    // Zod validation errors
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
    }

    // User not found (domain error)
    if (error instanceof UserNotFoundError) {
      return reply.status(404).send({
        error: {
          code: 'USER_NOT_FOUND',
          message: error.message,
        },
      });
    }

    // Log unexpected errors
    request.log.error(error);

    // Default 500 error
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  });

  return server;
}

/**
 * Start the Fastify server
 *
 * @param server - Fastify instance
 * @param port - Port to listen on (default: 3000)
 * @param host - Host to bind to (default: 0.0.0.0)
 */
export async function startServer(
  server: FastifyInstance,
  port = 3000,
  host = '0.0.0.0'
): Promise<void> {
  try {
    await server.listen({ port, host });
    server.log.info(`Server listening on ${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}
