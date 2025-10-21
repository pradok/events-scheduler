import * as z from 'zod';

export const EventScalarFieldEnumSchema = z.enum([
  'id',
  'userId',
  'eventType',
  'status',
  'targetTimestampUTC',
  'targetTimestampLocal',
  'targetTimezone',
  'executedAt',
  'failureReason',
  'retryCount',
  'version',
  'idempotencyKey',
  'deliveryPayload',
  'createdAt',
  'updatedAt',
]);

export type EventScalarFieldEnum = z.infer<typeof EventScalarFieldEnumSchema>;
