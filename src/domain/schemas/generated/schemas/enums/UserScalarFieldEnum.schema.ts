import * as z from 'zod';

export const UserScalarFieldEnumSchema = z.enum([
  'id',
  'firstName',
  'lastName',
  'dateOfBirth',
  'timezone',
  'createdAt',
  'updatedAt',
]);

export type UserScalarFieldEnum = z.infer<typeof UserScalarFieldEnumSchema>;
