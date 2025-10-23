# Prisma-Generated Zod Schemas

**Location:** `src/domain/schemas/generated/`

**⚠️ DO NOT EDIT FILES IN `generated/` DIRECTORY - THEY ARE AUTO-GENERATED**

## Overview

This directory contains Zod schemas automatically generated from Prisma models using `prisma-zod-generator`. These schemas are the **single source of truth** for validation and types.

## Generation

Schemas are auto-generated when you run:

```bash
npx prisma generate
```

The generator config is in `prisma/schema.prisma`:

```prisma
generator zod {
  provider = "prisma-zod-generator"
  output   = "../src/domain/schemas/generated"
}
```

## Available Schemas

### Model Schemas

Located in `generated/schemas/models/`:

- **`User.schema.ts`** - User entity schema from Prisma User model
- **`Event.schema.ts`** - Event entity schema from Prisma Event model

### Enum Schemas

Located in `generated/schemas/enums/`:

- **`EventStatus.schema.ts`** - EventStatus enum (PENDING, PROCESSING, COMPLETED, FAILED)
- And other Prisma-generated enums

## Usage

### ✅ Correct: Use Generated Schemas

```typescript
// Import the generated schema
import { UserSchema } from '@/domain/schemas/generated/schemas/models/User.schema';

// Derive API DTOs from generated schema
export const UpdateUserSchema = UserSchema.pick({
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  timezone: true,
}).partial();

export type UpdateUserDTO = z.infer<typeof UpdateUserSchema>;
```

### ❌ Wrong: Manual Schema Definition

```typescript
// DON'T DO THIS - manual duplication!
export const UpdateUserSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  dateOfBirth: z.string().optional(),
  timezone: z.string().optional(),
});
```

## Benefits

1. **Single Source of Truth** - Prisma schema defines structure once
2. **Automatic Sync** - Schema changes propagate automatically
3. **Type Safety** - Compile-time errors if database and validation drift
4. **DRY Principle** - No manual duplication of field definitions
5. **Runtime + Compile-Time** - Both validation and TypeScript types

## API DTO Pattern

For REST API endpoints, derive DTOs from generated schemas:

```typescript
import { UserSchema } from '@/domain/schemas/generated/schemas/models/User.schema';

// Create DTO (subset of fields)
export const CreateUserSchema = UserSchema.pick({
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  timezone: true,
});

// Update DTO (partial fields)
export const UpdateUserSchema = UserSchema.pick({
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  timezone: true,
}).partial();

// Response DTO (all fields)
export const UserResponseSchema = UserSchema;

// Derive types
export type CreateUserDTO = z.infer<typeof CreateUserSchema>;
export type UpdateUserDTO = z.infer<typeof UpdateUserSchema>;
export type UserResponse = z.infer<typeof UserResponseSchema>;
```

## Field Transformations

For API-specific formats (e.g., Date → string), transform generated schemas:

```typescript
import { UserSchema } from '@/domain/schemas/generated/schemas/models/User.schema';

// Transform Date fields to ISO strings for API
export const UserResponseSchema = UserSchema.extend({
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
```

## References

- **Coding Standards:** `docs/architecture/coding-standards.md` (Section 10: Zod Schemas)
- **Tech Stack:** `docs/architecture/tech-stack.md` (Validation section)
- **Source Tree:** `docs/architecture/source-tree.md` (Schema location)
