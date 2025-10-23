import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createServer } from '../server';
import { registerUserRoutes } from './user.routes';
import { execSync } from 'child_process';
import { DateTime } from 'luxon';

// Type definitions for API responses
interface UserResponse {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Array<{ path: string; message: string }>;
  };
}

describe('User Routes Integration Tests', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let server: FastifyInstance;

  beforeAll(async () => {
    // Start PostgreSQL container
    container = await new PostgreSqlContainer('postgres:16').withExposedPorts(5432).start();

    const connectionString = container.getConnectionUri();

    // Create Prisma client
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: connectionString,
        },
      },
    });

    // Run migrations
    process.env['DATABASE_URL'] = connectionString;
    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: connectionString },
      stdio: 'inherit',
    });

    // Create and configure server
    server = createServer();
    registerUserRoutes(server, prisma);
  }, 120000); // 2 minute timeout for container startup

  afterAll(async () => {
    await server.close();
    await prisma.$disconnect();
    await container.stop();
  });

  afterEach(async () => {
    // Clean up data between tests
    await prisma.event.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('GET /user/:id', () => {
    it('should return 200 with user data when user exists', async () => {
      // Arrange: Create test user
      const user = await prisma.user.create({
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: new Date('1990-01-15'),
          timezone: 'America/New_York',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Act
      const response = await server.inject({
        method: 'GET',
        url: `/user/${user.id}`,
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as UserResponse;
      expect(body.id).toBe(user.id);
      expect(body.firstName).toBe('John');
      expect(body.lastName).toBe('Doe');
      expect(body.dateOfBirth).toBe('1990-01-15');
      expect(body.timezone).toBe('America/New_York');
      expect(body.createdAt).toBeDefined();
      expect(body.updatedAt).toBeDefined();
    });

    it('should return 404 when user not found', async () => {
      // Act
      const response = await server.inject({
        method: 'GET',
        url: '/user/550e8400-e29b-41d4-a716-446655440000',
      });

      // Assert
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body) as ErrorResponse;
      expect(body.error.code).toBe('USER_NOT_FOUND');
    });

    it('should return 400 for invalid UUID format', async () => {
      // Act
      const response = await server.inject({
        method: 'GET',
        url: '/user/invalid-uuid',
      });

      // Assert
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as ErrorResponse;
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('PUT /user/:id', () => {
    it('should update firstName and lastName successfully', async () => {
      // Arrange
      const user = await prisma.user.create({
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: new Date('1990-01-15'),
          timezone: 'America/New_York',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Act
      const response = await server.inject({
        method: 'PUT',
        url: `/user/${user.id}`,
        payload: {
          firstName: 'Jane',
          lastName: 'Smith',
        },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as UserResponse;
      expect(body.firstName).toBe('Jane');
      expect(body.lastName).toBe('Smith');
      expect(body.dateOfBirth).toBe('1990-01-15'); // Unchanged

      // Verify in database
      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser?.firstName).toBe('Jane');
      expect(updatedUser?.lastName).toBe('Smith');
    });

    it('should update dateOfBirth and reschedule PENDING events', async () => {
      // Arrange: Create user with PENDING birthday event
      const user = await prisma.user.create({
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: new Date('1990-01-15'),
          timezone: 'America/New_York',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const originalEvent = await prisma.event.create({
        data: {
          id: '550e8400-e29b-41d4-a716-446655440001',
          userId: user.id,
          eventType: 'BIRTHDAY',
          status: 'PENDING',
          targetTimestampUTC: new Date('2026-01-15T14:00:00Z'),
          targetTimestampLocal: new Date('2026-01-15T09:00:00'),
          targetTimezone: 'America/New_York',
          idempotencyKey: 'key-123',
          deliveryPayload: { message: 'Happy Birthday' },
          version: 1,
          retryCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Act: Update birthday to Feb 14
      const response = await server.inject({
        method: 'PUT',
        url: `/user/${user.id}`,
        payload: {
          dateOfBirth: '1990-02-14',
        },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as UserResponse;
      expect(body.dateOfBirth).toBe('1990-02-14');

      // Verify event was rescheduled
      const rescheduledEvent = await prisma.event.findUnique({
        where: { id: originalEvent.id },
      });
      expect(rescheduledEvent).toBeDefined();

      // Verify the timestamp changed to Feb 14
      const rescheduledDate = DateTime.fromJSDate(rescheduledEvent!.targetTimestampUTC, {
        zone: 'utc',
      });

      // Should be Feb 14 (day changed from 15 to 14)
      expect(rescheduledDate.month).toBe(2); // February
      expect(rescheduledDate.day).toBe(14);
    });

    it('should update timezone and recalculate event UTC times', async () => {
      // Arrange
      const user = await prisma.user.create({
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: new Date('1990-01-15'),
          timezone: 'America/New_York',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const originalEvent = await prisma.event.create({
        data: {
          id: '550e8400-e29b-41d4-a716-446655440001',
          userId: user.id,
          eventType: 'BIRTHDAY',
          status: 'PENDING',
          targetTimestampUTC: new Date('2026-01-15T14:00:00Z'), // 9AM ET = 2PM UTC
          targetTimestampLocal: new Date('2026-01-15T09:00:00Z'), // Store as UTC for consistency
          targetTimezone: 'America/New_York',
          idempotencyKey: 'key-123',
          deliveryPayload: { message: 'Happy Birthday' },
          version: 1,
          retryCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Act: Change timezone to Pacific
      const response = await server.inject({
        method: 'PUT',
        url: `/user/${user.id}`,
        payload: {
          timezone: 'America/Los_Angeles',
        },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as UserResponse;
      expect(body.timezone).toBe('America/Los_Angeles');

      // Verify event UTC time changed and timezone updated
      const rescheduledEvent = await prisma.event.findUnique({
        where: { id: originalEvent.id },
      });
      expect(rescheduledEvent).toBeDefined();
      expect(rescheduledEvent!.targetTimezone).toBe('America/Los_Angeles');

      // UTC time should be 3 hours later (ET to PT = +3 hours)
      const timeDiff =
        rescheduledEvent!.targetTimestampUTC.getTime() - originalEvent.targetTimestampUTC.getTime();
      expect(timeDiff).toBe(3 * 60 * 60 * 1000); // 3 hours in milliseconds
    });

    it('should NOT modify COMPLETED events when birthday updated', async () => {
      // Arrange
      const user = await prisma.user.create({
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: new Date('1990-01-15'),
          timezone: 'America/New_York',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const completedEvent = await prisma.event.create({
        data: {
          id: '550e8400-e29b-41d4-a716-446655440001',
          userId: user.id,
          eventType: 'BIRTHDAY',
          status: 'COMPLETED',
          targetTimestampUTC: new Date('2025-01-15T14:00:00Z'),
          targetTimestampLocal: new Date('2025-01-15T09:00:00'),
          targetTimezone: 'America/New_York',
          idempotencyKey: 'key-123',
          deliveryPayload: { message: 'Happy Birthday' },
          version: 2,
          retryCount: 0,
          executedAt: new Date('2025-01-15T14:05:00Z'),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Act
      const response = await server.inject({
        method: 'PUT',
        url: `/user/${user.id}`,
        payload: {
          dateOfBirth: '1990-02-14',
        },
      });

      // Assert
      expect(response.statusCode).toBe(200);

      // Verify COMPLETED event was NOT modified
      const unchangedEvent = await prisma.event.findUnique({
        where: { id: completedEvent.id },
      });
      expect(unchangedEvent!.targetTimestampUTC).toEqual(completedEvent.targetTimestampUTC);
      expect(unchangedEvent!.status).toBe('COMPLETED');
    });

    it('should return 404 when user not found', async () => {
      // Act
      const response = await server.inject({
        method: 'PUT',
        url: '/user/550e8400-e29b-41d4-a716-446655440000',
        payload: {
          firstName: 'Jane',
        },
      });

      // Assert
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body) as ErrorResponse;
      expect(body.error.code).toBe('USER_NOT_FOUND');
    });

    it('should return 400 for invalid input', async () => {
      // Arrange
      const user = await prisma.user.create({
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: new Date('1990-01-15'),
          timezone: 'America/New_York',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Act: Invalid date format
      const response = await server.inject({
        method: 'PUT',
        url: `/user/${user.id}`,
        payload: {
          dateOfBirth: 'invalid-date',
        },
      });

      // Assert
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as ErrorResponse;
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('DELETE /user/:id', () => {
    it('should return 204 and delete user + all events', async () => {
      // Arrange: Create user with multiple events
      const user = await prisma.user.create({
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: new Date('1990-01-15'),
          timezone: 'America/New_York',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await prisma.event.createMany({
        data: [
          {
            id: '550e8400-e29b-41d4-a716-446655440011',
            userId: user.id,
            eventType: 'BIRTHDAY',
            status: 'PENDING',
            targetTimestampUTC: new Date('2026-01-15T14:00:00Z'),
            targetTimestampLocal: new Date('2026-01-15T09:00:00'),
            targetTimezone: 'America/New_York',
            idempotencyKey: 'key-1',
            deliveryPayload: {},
            version: 1,
            retryCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: '550e8400-e29b-41d4-a716-446655440012',
            userId: user.id,
            eventType: 'BIRTHDAY',
            status: 'COMPLETED',
            targetTimestampUTC: new Date('2025-01-15T14:00:00Z'),
            targetTimestampLocal: new Date('2025-01-15T09:00:00'),
            targetTimezone: 'America/New_York',
            idempotencyKey: 'key-2',
            deliveryPayload: {},
            version: 2,
            retryCount: 0,
            executedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      // Act
      const response = await server.inject({
        method: 'DELETE',
        url: `/user/${user.id}`,
      });

      // Assert
      expect(response.statusCode).toBe(204);
      expect(response.body).toBe(''); // No content

      // Verify user deleted
      const deletedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(deletedUser).toBeNull();

      // Verify all events deleted
      const events = await prisma.event.findMany({
        where: { userId: user.id },
      });
      expect(events).toHaveLength(0);
    });

    it('should return 404 when user not found', async () => {
      // Act
      const response = await server.inject({
        method: 'DELETE',
        url: '/user/550e8400-e29b-41d4-a716-446655440000',
      });

      // Assert
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body) as ErrorResponse;
      expect(body.error.code).toBe('USER_NOT_FOUND');
    });

    it('should return 400 for invalid UUID format', async () => {
      // Act
      const response = await server.inject({
        method: 'DELETE',
        url: '/user/invalid-uuid',
      });

      // Assert
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as ErrorResponse;
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });
  });
});
