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
