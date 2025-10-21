import * as z from 'zod';

export const EventStatusSchema = z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']);

export type EventStatus = z.infer<typeof EventStatusSchema>;
