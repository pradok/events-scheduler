import * as z from 'zod';
import { EventStatusSchema } from '../enums/EventStatus.schema';

export const EventSchema = z.object({
  id: z.string(),
  userId: z.string(),
  eventType: z.string().default('BIRTHDAY'),
  status: EventStatusSchema,
  targetTimestampUTC: z.date(),
  targetTimestampLocal: z.date(),
  targetTimezone: z.string(),
  executedAt: z.date().nullish(),
  failureReason: z.string().nullish(),
  retryCount: z.number().int(),
  version: z.number().int().default(1),
  idempotencyKey: z.string(),
  deliveryPayload: z.unknown().refine((val) => {
    const getDepth = (obj: unknown, depth: number = 0): number => {
      if (depth > 10) return depth;
      if (obj === null || typeof obj !== 'object') return depth;
      const values = Object.values(obj as Record<string, unknown>);
      if (values.length === 0) return depth;
      return Math.max(...values.map((v) => getDepth(v, depth + 1)));
    };
    return getDepth(val) <= 10;
  }, 'JSON nesting depth exceeds maximum of 10'),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type EventType = z.infer<typeof EventSchema>;
