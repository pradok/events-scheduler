import { DateTime } from 'luxon';
import { IEventHandler } from './IEventHandler';
import { UserInfo } from '../../../application/types/UserInfo';

/**
 * BirthdayEventHandler - Strategy implementation for birthday-specific domain logic
 *
 * Handles birthday-specific domain rules:
 * - Calculates when next birthday occurs (9:00 AM local time)
 * - Formats birthday message content
 *
 * This is a concrete strategy in the Strategy Pattern, allowing the system
 * to support birthdays without hardcoding birthday logic in core components.
 *
 * **Bounded Context Compliance:**
 * Uses UserInfo interface (primitives) instead of User entity to maintain
 * proper separation from User bounded context.
 *
 * **Design Decision:**
 * This class contains ONLY domain logic (calculations, formatting).
 * Event entity creation/orchestration is handled by CreateBirthdayEventUseCase.
 * Timezone conversions are handled by TimezoneService in the use case layer.
 * See: event-handlers-vs-use-cases.md for rationale.
 */
export class BirthdayEventHandler implements IEventHandler {
  public readonly eventType = 'BIRTHDAY';

  /**
   * Calculate the next birthday occurrence at 9:00 AM local time
   *
   * @param userInfo - User data (dateOfBirth in ISO format, timezone in IANA format)
   * @param referenceDate - The reference date (defaults to now)
   * @returns DateTime representing next birthday at 9:00 AM in user's timezone
   */
  public calculateNextOccurrence(
    userInfo: UserInfo,
    referenceDate: DateTime = DateTime.now()
  ): DateTime {
    // Parse dateOfBirth from ISO string (YYYY-MM-DD)
    const dob = DateTime.fromISO(userInfo.dateOfBirth);
    const month = dob.month;
    const day = dob.day;

    const refInZone = referenceDate.setZone(userInfo.timezone);
    const currentYear = refInZone.year;

    // Check if this is a leap year birthday (Feb 29)
    const isLeapYearBirthday = month === 2 && day === 29;

    // Try to set birthday for current year
    let nextBirthday = this.createBirthdayDateTime(
      refInZone,
      currentYear,
      month,
      day,
      isLeapYearBirthday
    );

    // If birthday has already passed this year, move to next year
    if (nextBirthday <= refInZone) {
      nextBirthday = this.createBirthdayDateTime(
        refInZone,
        currentYear + 1,
        month,
        day,
        isLeapYearBirthday
      );
    }

    return nextBirthday;
  }

  /**
   * Format the birthday message
   *
   * @param userInfo - User data (firstName, lastName)
   * @returns Formatted birthday message
   */
  public formatMessage(userInfo: UserInfo): string {
    return `Hey, ${userInfo.firstName} ${userInfo.lastName} it's your birthday`;
  }

  /**
   * Creates a birthday DateTime at 9:00 AM local time for the given year
   * Handles leap year birthdays (Feb 29) by using Feb 28 in non-leap years
   *
   * @private
   */
  private createBirthdayDateTime(
    referenceInZone: DateTime,
    year: number,
    month: number,
    day: number,
    isLeapYearBirthday: boolean
  ): DateTime {
    let targetMonth = month;
    let targetDay = day;

    // Handle Feb 29 in non-leap years: Use Feb 28 per Epic requirements
    if (isLeapYearBirthday && !this.isLeapYear(year)) {
      targetMonth = 2;
      targetDay = 28;
    }

    return referenceInZone.set({
      year,
      month: targetMonth,
      day: targetDay,
      hour: 9,
      minute: 0,
      second: 0,
      millisecond: 0,
    });
  }

  /**
   * Checks if a year is a leap year
   *
   * @private
   */
  private isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }
}
