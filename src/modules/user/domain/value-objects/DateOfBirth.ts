import { DateTime } from 'luxon';
import {
  InvalidDateOfBirthError,
  DateOfBirthInFutureError,
} from '../../../../domain/errors/InvalidDateOfBirthError';

/**
 * DateOfBirth value object
 * Type-safe representation of a date of birth with validation
 *
 * Note: Birthday calculation logic has been moved to BirthdayEventHandler
 * as part of the Strategy Pattern refactoring. DateOfBirth is now a pure
 * value object focused solely on representing and validating birthdates.
 */
export class DateOfBirth {
  private readonly value: DateTime;

  public constructor(dateString: string) {
    const parsed = DateTime.fromISO(dateString);
    if (!parsed.isValid) {
      throw new InvalidDateOfBirthError(dateString);
    }
    if (parsed > DateTime.now()) {
      throw new DateOfBirthInFutureError(dateString);
    }
    this.value = parsed;
  }

  /**
   * Static factory method to create DateOfBirth from string
   */
  public static fromString(dateString: string): DateOfBirth {
    return new DateOfBirth(dateString);
  }

  /**
   * Returns the month and day of the birthday
   */
  public getMonthDay(): { month: number; day: number } {
    return { month: this.value.month, day: this.value.day };
  }

  /**
   * Returns the date in ISO format (YYYY-MM-DD)
   */
  public toString(): string {
    return this.value.toISODate() ?? '';
  }

  /**
   * Checks if two dates of birth are equal
   */
  public equals(other: DateOfBirth): boolean {
    return this.value.equals(other.value);
  }
}
