import { DateTime } from 'luxon';
import { InvalidTimezoneError } from '../../domain/errors/InvalidTimezoneError';

/**
 * Timezone value object
 * Type-safe wrapper for IANA timezone identifiers with validation
 */
export class Timezone {
  private readonly value: string;

  public constructor(value: string) {
    if (!Timezone.isValid(value)) {
      throw new InvalidTimezoneError(value);
    }
    this.value = value;
  }

  /**
   * Validates if a string is a valid IANA timezone identifier
   */
  public static isValid(tz: string): boolean {
    try {
      const dt = DateTime.local().setZone(tz);
      return dt.isValid;
    } catch {
      return false;
    }
  }

  /**
   * Returns the timezone string
   */
  public toString(): string {
    return this.value;
  }

  /**
   * Checks if two timezones are equal
   */
  public equals(other: Timezone): boolean {
    return this.value === other.value;
  }
}
