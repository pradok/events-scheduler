import { z } from 'zod';
import { DateTime } from 'luxon';
import { Timezone } from '../value-objects/Timezone';
import { DateOfBirth } from '../value-objects/DateOfBirth';
import { IdempotencyKey } from '../value-objects/IdempotencyKey';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { EventStatus } from '../value-objects/EventStatus';
import { UserSchema as GeneratedUserSchema } from './generated/schemas/models/User.schema';
import { EventSchema as GeneratedEventSchema } from './generated/schemas/models/Event.schema';

/**
 * Domain Entity Schemas
 *
 * These Zod schemas are derived from auto-generated Prisma schemas and extended
 * with domain-specific types (Luxon DateTime, value objects).
 *
 * Architecture:
 * 1. Prisma generates base schemas from database models → src/domain/schemas/generated/
 * 2. We extend those schemas with domain types for the domain layer
 * 3. Structure stays in sync automatically via Prisma generator
 *
 * When Prisma schema changes:
 * 1. Run `npm run prisma:generate`
 * 2. Generated schemas update automatically
 * 3. TypeScript compiler catches any breaking changes in our domain schemas
 *
 * Domain vs Database Types:
 * - Luxon DateTime (domain) vs JavaScript Date (Prisma/DB)
 * - Value objects (Timezone, DateOfBirth, IdempotencyKey) vs primitives (Prisma/DB)
 * - EventStatus enum (shared between domain and DB)
 *
 * Validation Strategy:
 * - Runtime validation: Performed at adapter boundaries (API, Repository)
 * - Type derivation: Used in domain layer via z.infer<typeof Schema>
 * - Domain constructors: Trust input (already validated at adapters)
 *
 * Benefits:
 * - Auto-sync with Prisma schema (no manual updates needed)
 * - Compile-time safety across all layers
 * - Single source of truth for structure (Prisma schema)
 * - Domain-specific types in domain layer
 *
 * @see prisma/schema.prisma - Database schema (source of truth)
 * @see src/domain/schemas/generated/schemas/models/ - Auto-generated base schemas
 * @see docs/architecture/coding-standards.md - Section 8: Zod Schemas as Single Source of Truth
 */

/**
 * Custom Zod schema for Luxon DateTime instances
 */
const DateTimeSchema = z.custom<DateTime>((val) => val instanceof DateTime, {
  message: 'Must be a Luxon DateTime instance',
});

/**
 * Custom Zod schema for Timezone value object
 */
const TimezoneSchema = z.custom<Timezone>((val) => val instanceof Timezone, {
  message: 'Must be a Timezone value object',
});

/**
 * Custom Zod schema for DateOfBirth value object
 */
const DateOfBirthSchema = z.custom<DateOfBirth>((val) => val instanceof DateOfBirth, {
  message: 'Must be a DateOfBirth value object',
});

/**
 * Custom Zod schema for IdempotencyKey value object
 */
const IdempotencyKeySchema = z.custom<IdempotencyKey>((val) => val instanceof IdempotencyKey, {
  message: 'Must be an IdempotencyKey value object',
});

/**
 * Zod schema for User entity properties
 *
 * Extends auto-generated UserSchema from Prisma with domain-specific types.
 * Structure is automatically synced with prisma/schema.prisma User model.
 *
 * Type transformations:
 * - Date → Luxon DateTime
 * - string (timezone) → Timezone value object
 * - Date (dateOfBirth) → DateOfBirth value object
 *
 * @see src/domain/schemas/generated/schemas/models/User.schema.ts - Generated base schema
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const UserPropsSchema = GeneratedUserSchema.extend({
  dateOfBirth: DateOfBirthSchema,
  timezone: TimezoneSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

/**
 * TypeScript type derived from UserPropsSchema
 * Used in User entity constructor and throughout the domain layer
 */
export type UserProps = z.infer<typeof UserPropsSchema>;

/**
 * Zod schema for Event entity properties
 *
 * Extends auto-generated EventSchema from Prisma with domain-specific types.
 * Structure is automatically synced with prisma/schema.prisma Event model.
 *
 * Type transformations:
 * - Date → Luxon DateTime
 * - string (idempotencyKey) → IdempotencyKey value object
 * - Zod enum (status) → TypeScript EventStatus enum
 * - nullish → nullable (for optional database fields)
 * - unknown → Record<string, unknown> (for JSON fields)
 *
 * @see src/domain/schemas/generated/schemas/models/Event.schema.ts - Generated base schema
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const EventPropsSchema = GeneratedEventSchema.extend({
  status: z.nativeEnum(EventStatus),
  targetTimestampUTC: DateTimeSchema,
  targetTimestampLocal: DateTimeSchema,
  executedAt: DateTimeSchema.nullable(),
  failureReason: z.string().nullable(),
  idempotencyKey: IdempotencyKeySchema,
  deliveryPayload: z.record(z.string(), z.unknown()),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

/**
 * TypeScript type derived from EventPropsSchema
 * Used in Event entity constructor and throughout the domain layer
 */
export type EventProps = z.infer<typeof EventPropsSchema>;
