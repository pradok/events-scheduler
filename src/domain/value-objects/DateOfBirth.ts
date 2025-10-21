import { DateTime } from 'luxon';
import {
  InvalidDateOfBirthError,
  DateOfBirthInFutureError,
} from '../errors/InvalidDateOfBirthError';
import { Timezone } from './Timezone';

/**
 * DateOfBirth value object
 * Type-safe representation of a date of birth with validation
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
   * Returns the month and day of the birthday
   */
  public getMonthDay(): { month: number; day: number } {
    return { month: this.value.month, day: this.value.day };
  }

  /**
   * Calculates the next occurrence of this birthday in the given timezone
   * @param timezone The timezone to calculate in
   * @param referenceDate The reference date (defaults to now)
   */
  public calculateNextOccurrence(
    timezone: Timezone,
    referenceDate: DateTime = DateTime.now()
  ): DateTime {
    const { month, day } = this.getMonthDay();
    const refInZone = referenceDate.setZone(timezone.toString());
    const currentYear = refInZone.year;

    // Determine if this is a leap year birthday (Feb 29)
    const isLeapYearBirthday = month === 2 && day === 29;

    // Helper to check if a year is a leap year
    const isLeapYear = (year: number): boolean => {
      return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    };

    // Set the birthday for the current year (or adjust for non-leap year)
    let targetMonth = month;
    let targetDay = day;
    if (isLeapYearBirthday && !isLeapYear(currentYear)) {
      // Feb 29 in non-leap year becomes Mar 1
      targetMonth = 3;
      targetDay = 1;
    }

    let nextBirthday = refInZone.set({
      month: targetMonth,
      day: targetDay,
      hour: 9,
      minute: 0,
      second: 0,
      millisecond: 0,
    });

    // If birthday has already passed this year, move to next year
    if (nextBirthday < refInZone) {
      const nextYear = currentYear + 1;
      if (isLeapYearBirthday && !isLeapYear(nextYear)) {
        // Feb 29 in non-leap year becomes Mar 1
        nextBirthday = refInZone.set({
          year: nextYear,
          month: 3,
          day: 1,
          hour: 9,
          minute: 0,
          second: 0,
          millisecond: 0,
        });
      } else {
        nextBirthday = refInZone.set({
          year: nextYear,
          month,
          day,
          hour: 9,
          minute: 0,
          second: 0,
          millisecond: 0,
        });
      }
    }

    return nextBirthday;
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
