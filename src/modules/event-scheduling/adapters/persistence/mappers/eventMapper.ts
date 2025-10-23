import { Event as PrismaEvent, EventStatus as PrismaEventStatus, Prisma } from '@prisma/client';
import { Event } from '@modules/event-scheduling/domain/entities/Event';
import type { EventStatus } from '@modules/event-scheduling/domain/value-objects/EventStatus';
import { fromString as eventStatusFromString } from '@modules/event-scheduling/domain/value-objects/EventStatus';
import { IdempotencyKey } from '@modules/event-scheduling/domain/value-objects/IdempotencyKey';
import { DateTime } from 'luxon';

/**
 * Type-safe conversion of Prisma JsonValue to Record<string, unknown>
 * Validates that the JsonValue is an object (not array, null, or primitive)
 */
function jsonValueToRecord(value: Prisma.JsonValue): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('deliveryPayload must be a JSON object');
  }
  return value as Record<string, unknown>;
}

/**
 * Converts a Prisma Event model to a domain Event entity
 * @param prismaEvent The Prisma Event model from database
 * @returns Domain Event entity
 */
export function eventToDomain(prismaEvent: PrismaEvent): Event {
  const status: EventStatus = eventStatusFromString(String(prismaEvent.status));
  const idempotencyKey: IdempotencyKey = IdempotencyKey.fromString(
    String(prismaEvent.idempotencyKey)
  );

  return new Event({
    id: prismaEvent.id,
    userId: prismaEvent.userId,
    eventType: prismaEvent.eventType,
    status,
    targetTimestampUTC: DateTime.fromJSDate(prismaEvent.targetTimestampUTC),
    targetTimestampLocal: DateTime.fromJSDate(prismaEvent.targetTimestampLocal),
    targetTimezone: prismaEvent.targetTimezone,
    executedAt: prismaEvent.executedAt ? DateTime.fromJSDate(prismaEvent.executedAt) : null,
    failureReason: prismaEvent.failureReason,
    retryCount: prismaEvent.retryCount,
    version: prismaEvent.version,
    idempotencyKey,
    deliveryPayload: jsonValueToRecord(prismaEvent.deliveryPayload),
    createdAt: DateTime.fromJSDate(prismaEvent.createdAt),
    updatedAt: DateTime.fromJSDate(prismaEvent.updatedAt),
  });
}

/**
 * Converts a domain Event entity to Prisma Event model data
 * @param domainEvent The domain Event entity
 * @returns Prisma Event model data (without id for creates)
 */
export function eventToPrisma(domainEvent: Event): Omit<
  PrismaEvent,
  'id' | 'createdAt' | 'updatedAt'
> & {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
} {
  return {
    id: domainEvent.id,
    userId: domainEvent.userId,
    eventType: domainEvent.eventType,
    status: domainEvent.status as unknown as PrismaEventStatus,
    targetTimestampUTC: domainEvent.targetTimestampUTC.toJSDate(),
    targetTimestampLocal: domainEvent.targetTimestampLocal.toJSDate(),
    targetTimezone: domainEvent.targetTimezone,
    executedAt: domainEvent.executedAt ? domainEvent.executedAt.toJSDate() : null,
    failureReason: domainEvent.failureReason,
    retryCount: domainEvent.retryCount,
    version: domainEvent.version,
    idempotencyKey: domainEvent.idempotencyKey.toString(),
    deliveryPayload: domainEvent.deliveryPayload as Prisma.JsonValue,
    createdAt: domainEvent.createdAt.toJSDate(),
    updatedAt: domainEvent.updatedAt.toJSDate(),
  };
}
