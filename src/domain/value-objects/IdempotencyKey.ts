import { createHash } from 'crypto';
import { DateTime } from 'luxon';

/**
 * IdempotencyKey value object
 * Generates unique, deterministic keys for preventing duplicate event deliveries
 */
export class IdempotencyKey {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * Generates a deterministic idempotency key
   * @param userId The user ID
   * @param targetTimestampUTC The target timestamp in UTC
   * @returns A new IdempotencyKey
   */
  public static generate(userId: string, targetTimestampUTC: DateTime): IdempotencyKey {
    const keyData = `${userId}-${targetTimestampUTC.toISO()}-BIRTHDAY`;
    const hash = createHash('sha256').update(keyData).digest('hex');
    return new IdempotencyKey(`event-${hash.substring(0, 16)}`);
  }

  /**
   * Returns the idempotency key string
   */
  public toString(): string {
    return this.value;
  }

  /**
   * Checks if two idempotency keys are equal
   */
  public equals(other: IdempotencyKey): boolean {
    return this.value === other.value;
  }
}
