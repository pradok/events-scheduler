import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { CreateUserUseCase } from '../../../../modules/user/application/use-cases/CreateUserUseCase';
import { GetUserUseCase } from '../../../../modules/user/application/use-cases/GetUserUseCase';
import { UpdateUserUseCase } from '../../../../modules/user/application/use-cases/UpdateUserUseCase';
import { DeleteUserUseCase } from '../../../../modules/user/application/use-cases/DeleteUserUseCase';
import { PrismaUserRepository } from '../../../../modules/user/adapters/persistence/PrismaUserRepository';
import { createEventBus } from '../../../../shared/events/EventBusFactory';
import {
  CreateUserSchema,
  GetUserParamsSchema,
  UpdateUserSchema,
  UserResponseSchema,
  type UserResponse,
} from '../../../../shared/validation/schemas';
import type { User } from '../../../../modules/user/domain/entities/User';

/**
 * User Routes Module
 *
 * Implements REST API endpoints for user CRUD operations:
 * - POST /user - Create new user (publishes UserCreated event)
 * - GET /user/:id - Retrieve user by ID
 * - PUT /user/:id - Update user (with event rescheduling)
 * - DELETE /user/:id - Delete user (with cascade delete of events)
 *
 * **Architecture:**
 * This is a Primary Adapter that:
 * 1. Validates requests using Zod schemas
 * 2. Instantiates use cases with dependencies
 * 3. Calls use case execute() methods
 * 4. Maps domain entities to HTTP responses
 *
 * **Dependency Injection:**
 * Dependencies are manually constructed in each route handler.
 * In production, consider using a DI container (e.g., Awilix, TSyringe).
 */

/**
 * Map User domain entity to UserResponse DTO
 *
 * @param user - User domain entity
 * @returns UserResponse DTO for HTTP response
 */
function mapUserToResponse(user: User): UserResponse {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    dateOfBirth: user.dateOfBirth.toString(),
    timezone: user.timezone.toString(),
    createdAt: user.createdAt.toISO()!,
    updatedAt: user.updatedAt.toISO()!,
  };
}

/**
 * Register user routes on Fastify server
 *
 * @param server - Fastify instance
 * @param prisma - Prisma client for database access
 */
export function registerUserRoutes(server: FastifyInstance, prisma: PrismaClient): void {
  /**
   * POST /user - Create a new user
   *
   * **Request Body:** CreateUserDTO
   * - firstName: string (1-100 characters, required)
   * - lastName: string (1-100 characters, required)
   * - dateOfBirth: string (YYYY-MM-DD format, required)
   * - timezone: string (IANA timezone, required)
   *
   * **Business Logic:**
   * - Creates user in database
   * - Publishes UserCreated event
   * - Event handler will create birthday event asynchronously
   *
   * **Response Codes:**
   * - 201: User created successfully
   * - 400: Invalid input (validation failed)
   * - 500: Internal server error
   */
  server.post<{
    Body: unknown;
  }>('/user', async (request, reply) => {
    // Validate body
    const body = CreateUserSchema.parse(request.body);

    // Instantiate dependencies
    const userRepository = new PrismaUserRepository(prisma);
    const eventBus = createEventBus(prisma);

    const createUserUseCase = new CreateUserUseCase(userRepository, eventBus);

    // Execute use case
    const createdUser = await createUserUseCase.execute(body);

    // Map to response schema and validate
    const response = UserResponseSchema.parse(mapUserToResponse(createdUser));

    return reply.status(201).send(response);
  });

  /**
   * GET /user/:id - Retrieve a user by ID
   *
   * **Response Codes:**
   * - 200: User found and returned
   * - 400: Invalid UUID format
   * - 404: User not found
   * - 500: Internal server error
   */
  server.get<{
    Params: { id: string };
  }>('/user/:id', async (request, reply) => {
    // Validate params
    const params = GetUserParamsSchema.parse(request.params);

    // Instantiate dependencies
    const userRepository = new PrismaUserRepository(prisma);
    const getUserUseCase = new GetUserUseCase(userRepository);

    // Execute use case
    const user = await getUserUseCase.execute(params.id);

    if (!user) {
      return reply.status(404).send({
        error: {
          code: 'USER_NOT_FOUND',
          message: `User not found: ${params.id}`,
        },
      });
    }

    // Map to response schema and validate
    const response = UserResponseSchema.parse(mapUserToResponse(user));

    return reply.status(200).send(response);
  });

  /**
   * PUT /user/:id - Update a user
   *
   * **Request Body:** UpdateUserDTO (partial update)
   * - firstName?: string (1-100 characters)
   * - lastName?: string (1-100 characters)
   * - dateOfBirth?: string (YYYY-MM-DD format)
   * - timezone?: string (IANA timezone)
   *
   * **Business Logic:**
   * - If dateOfBirth updated: Reschedules PENDING birthday events to new date
   * - If timezone updated: Recalculates PENDING event times for new timezone
   * - Only PENDING events rescheduled (PROCESSING/COMPLETED/FAILED unchanged)
   *
   * **Response Codes:**
   * - 200: User updated successfully
   * - 400: Invalid input (validation failed)
   * - 404: User not found
   * - 500: Internal server error
   */
  server.put<{
    Params: { id: string };
    Body: unknown;
  }>('/user/:id', async (request, reply) => {
    // Validate params and body
    const params = GetUserParamsSchema.parse(request.params);
    const body = UpdateUserSchema.parse(request.body);

    // Instantiate dependencies
    const userRepository = new PrismaUserRepository(prisma);
    const eventBus = createEventBus(prisma);

    const updateUserUseCase = new UpdateUserUseCase(userRepository, eventBus);

    // Execute use case
    const updatedUser = await updateUserUseCase.execute(params.id, body);

    // Map to response schema and validate
    const response = UserResponseSchema.parse(mapUserToResponse(updatedUser));

    return reply.status(200).send(response);
  });

  /**
   * DELETE /user/:id - Delete a user and all associated events
   *
   * **Business Logic:**
   * - Deletes all events for the user (cascade delete)
   * - Transaction ensures both user AND events deleted atomically
   * - If user doesn't exist, returns 404 (not 204)
   *
   * **Response Codes:**
   * - 204: User deleted successfully (no content)
   * - 400: Invalid UUID format
   * - 404: User not found
   * - 500: Internal server error
   */
  server.delete<{
    Params: { id: string };
  }>('/user/:id', async (request, reply) => {
    // Validate params
    const params = GetUserParamsSchema.parse(request.params);

    // Instantiate dependencies
    const userRepository = new PrismaUserRepository(prisma);
    const eventBus = createEventBus(prisma);

    const deleteUserUseCase = new DeleteUserUseCase(userRepository, eventBus);

    // Execute use case
    await deleteUserUseCase.execute(params.id);

    // 204 No Content
    return reply.status(204).send();
  });
}
