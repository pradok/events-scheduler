import { z } from 'zod';

/**
 * Zod schema for CreateUser input validation
 *
 * This schema serves as the single source of truth for:
 * - Runtime validation (via schema.parse())
 * - Compile-time types (via z.infer<>)
 * - API request validation (via Fastify integration in Story 1.9)
 *
 * Validation Rules:
 * - firstName: required, 1-100 characters
 * - lastName: required, 1-100 characters
 * - dateOfBirth: required, YYYY-MM-DD format
 * - timezone: required, IANA timezone identifier (validated by Timezone value object)
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- Zod schemas use PascalCase by convention
export const CreateUserSchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(100, 'First name cannot exceed 100 characters'),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(100, 'Last name cannot exceed 100 characters'),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format'),
  timezone: z.string().min(1, 'Timezone is required'),
});

/**
 * TypeScript type derived from CreateUserSchema
 *
 * This type is automatically inferred from the Zod schema, ensuring:
 * - Schema changes automatically propagate to all code using this type
 * - No drift between validation rules and type definitions
 * - Single location to update when requirements change
 *
 * DO NOT manually define this type - always derive it from the schema using z.infer<>
 */
export type CreateUserDTO = z.infer<typeof CreateUserSchema>;

/**
 * Zod schema for UpdateUser input validation
 *
 * All fields are optional to allow partial updates.
 * Validation rules match CreateUserSchema for consistency.
 *
 * Validation Rules:
 * - firstName: optional, 1-100 characters if provided
 * - lastName: optional, 1-100 characters if provided
 * - dateOfBirth: optional, YYYY-MM-DD format if provided
 * - timezone: optional, IANA timezone identifier if provided
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- Zod schemas use PascalCase by convention
export const UpdateUserSchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name cannot be empty')
    .max(100, 'First name cannot exceed 100 characters')
    .optional(),
  lastName: z
    .string()
    .min(1, 'Last name cannot be empty')
    .max(100, 'Last name cannot exceed 100 characters')
    .optional(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
    .optional(),
  timezone: z.string().min(1, 'Timezone cannot be empty').optional(),
});

/**
 * TypeScript type derived from UpdateUserSchema
 */
export type UpdateUserDTO = z.infer<typeof UpdateUserSchema>;

/**
 * Zod schema for URL parameters containing user ID
 *
 * Used by GET /user/:id, PUT /user/:id, DELETE /user/:id endpoints
 *
 * Validation Rules:
 * - id: required, must be valid UUID format
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- Zod schemas use PascalCase by convention
export const GetUserParamsSchema = z.object({
  id: z.string().uuid(),
});

/**
 * TypeScript type derived from GetUserParamsSchema
 */
export type GetUserParams = z.infer<typeof GetUserParamsSchema>;

/**
 * Zod schema for User response serialization
 *
 * This schema validates the response body sent to clients.
 * Ensures consistent API contract and catches serialization errors.
 *
 * Response Fields:
 * - id: UUID string
 * - firstName: string
 * - lastName: string
 * - dateOfBirth: ISO date string (YYYY-MM-DD)
 * - timezone: IANA timezone identifier string
 * - createdAt: ISO 8601 datetime string
 * - updatedAt: ISO 8601 datetime string
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- Zod schemas use PascalCase by convention
export const UserResponseSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  dateOfBirth: z.string(),
  timezone: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * TypeScript type derived from UserResponseSchema
 */
export type UserResponse = z.infer<typeof UserResponseSchema>;

/**
 * Zod schema for error responses
 *
 * Standard error format for all API error responses.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- Zod schemas use PascalCase by convention
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.any()).optional(),
  }),
});

/**
 * TypeScript type derived from ErrorResponseSchema
 */
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
