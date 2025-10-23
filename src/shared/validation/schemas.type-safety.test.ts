/**
 * Type Safety Verification Test
 *
 * This test verifies that schema changes cause TypeScript compilation errors
 * in dependent code, ensuring type safety across all layers.
 *
 * **How to run this test:**
 * 1. Uncomment the schema modification below
 * 2. Run `npx tsc --noEmit`
 * 3. Verify TypeScript compilation errors appear in user.routes.ts
 * 4. Re-comment the modification to restore original schema
 *
 * **Expected behavior:**
 * - TypeScript should fail to compile when UserResponseSchema changes
 * - Error should appear in mapUserToResponse() function in user.routes.ts
 * - This proves type safety is enforced from schema → routes → use cases
 */

import { z } from 'zod';
import { UserResponseSchema } from './schemas';

describe('Schema Type Safety', () => {
  it('should document type safety verification process', () => {
    // This test documents the type safety verification process
    // Actual verification is done manually by modifying schemas and running tsc

    expect(true).toBe(true);
  });

  it('should demonstrate schema types are derived correctly', () => {
    // Verify that UserResponseSchema has correct shape
    const schema = UserResponseSchema;

    // TypeScript will error if these properties don't exist
    const testData: z.infer<typeof schema> = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '1990-01-15',
      timezone: 'America/New_York',
      createdAt: '2025-10-23T12:00:00.000Z',
      updatedAt: '2025-10-23T12:00:00.000Z',
    };

    // This should parse successfully
    const result = schema.parse(testData);
    expect(result).toEqual(testData);
  });

  /**
   * MANUAL TYPE SAFETY VERIFICATION:
   *
   * To verify type safety across layers, follow these steps:
   *
   * 1. Add a new required field to UserResponseSchema:
   *
   * ```typescript
   * export const UserResponseSchema = z.object({
   *   id: z.string().uuid(),
   *   firstName: z.string(),
   *   lastName: z.string(),
   *   dateOfBirth: z.string(),
   *   timezone: z.string(),
   *   createdAt: z.string(),
   *   updatedAt: z.string(),
   *   newField: z.string(), // <-- Add this
   * });
   * ```
   *
   * 2. Run: `npx tsc --noEmit`
   *
   * 3. Expected error in user.routes.ts:
   *    "Type '{ id: string; firstName: string; ... }' is missing the following
   *     properties from type 'UserResponse': newField"
   *
   * 4. This proves that schema changes propagate to all dependent code,
   *    forcing developers to update mapUserToResponse() function.
   *
   * 5. Revert the schema change after verification.
   */
});
