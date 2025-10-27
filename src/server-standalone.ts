/**
 * Standalone Fastify API Server Entry Point
 *
 * This file starts the User API server for local development and manual testing.
 *
 * **Usage:**
 * - Development (with hot-reload): `npm run dev`
 * - Production: `npm run build:server && npm start`
 *
 * **Architecture:**
 * This server provides HTTP REST API for User CRUD operations.
 * It is separate from the Lambda-based event processing system.
 *
 * **Local Development Setup:**
 * 1. Start Docker services: `npm run docker:start`
 * 2. Run migrations: `npm run prisma:migrate`
 * 3. Start API server: `npm run dev`
 * 4. API available at: http://localhost:3000
 *
 * **Endpoints:**
 * - GET    /user/:id  - Retrieve user by ID
 * - PUT    /user/:id  - Update user (reschedules events)
 * - DELETE /user/:id  - Delete user and events
 *
 * **Environment Variables:**
 * - PORT: Server port (default: 3000)
 * - DATABASE_URL: PostgreSQL connection string (from .env)
 */

import { PrismaClient } from '@prisma/client';
import { createServer, startServer } from './adapters/primary/http/server';
import { registerUserRoutes } from './adapters/primary/http/routes/user.routes';
import { isDeliveryTimeOverrideActive } from './modules/event-scheduling/config/delivery-time-config';

/**
 * Initialize Prisma client
 */
const prisma = new PrismaClient({
  log: process.env['NODE_ENV'] === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

/**
 * Create and configure Fastify server
 */
const server = createServer();

/**
 * Story 4.5: Log delivery time configuration status
 */
if (isDeliveryTimeOverrideActive()) {
  if (process.env['EVENT_DELIVERY_TIMES_OVERRIDE']) {
    server.log.warn(
      `⚠️  EVENT_DELIVERY_TIMES_OVERRIDE active: ${process.env['EVENT_DELIVERY_TIMES_OVERRIDE']} - Events will trigger at this time (TESTING ONLY)`
    );
  } else if (process.env['FAST_TEST_DELIVERY_OFFSET']) {
    server.log.warn(
      `⚠️  FAST_TEST_DELIVERY_OFFSET active: ${process.env['FAST_TEST_DELIVERY_OFFSET']} - Events will trigger soon (TESTING ONLY)`
    );
  }
} else {
  server.log.info('✓ Using default delivery times (9:00 AM for birthdays)');
}

/**
 * Register routes
 */
registerUserRoutes(server, prisma);

/**
 * Health check endpoint
 */
server.get('/health', () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

/**
 * Start server
 */
const PORT = Number(process.env['PORT']) || 3000;

startServer(server, PORT).catch((err) => {
  server.log.error('Failed to start server:', err);
  process.exit(1);
});

/**
 * Graceful shutdown handler
 */
const shutdown = async (): Promise<void> => {
  server.log.info('Gracefully shutting down...');
  await server.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', () => {
  void shutdown();
});

process.on('SIGTERM', () => {
  void shutdown();
});
