import { DateTime } from 'luxon';
import { IEventHandler } from './IEventHandler';
import { User } from '../../entities/User';
import { Event } from '../../entities/Event';
import { EventStatus } from '../../value-objects/EventStatus';
import { IdempotencyKey } from '../../value-objects/IdempotencyKey';
import { TimezoneService } from '../TimezoneService';

/**
 * BirthdayEventHandler - Strategy implementation for birthday events
 *
 * Handles birthday-specific logic:
 * - Calculates next birthday at 9:00 AM local time
 * - Formats birthday message
 * - Generates birthday Event entities
 *
 * This is a concrete strategy in the Strategy Pattern, allowing the system
 * to support birthdays without hardcoding birthday logic in core components.
 */
export class BirthdayEventHandler implements IEventHandler {
  public readonly eventType = 'BIRTHDAY';

  public constructor(private readonly timezoneService: TimezoneService) {}

  /**
   * Calculate the next birthday occurrence at 9:00 AM local time
   *
   * @param user - The user whose birthday to calculate
   * @param referenceDate - The reference date (defaults to now)
   * @returns DateTime representing next birthday at 9:00 AM in user's timezone
   */
  public calculateNextOccurrence(user: User, referenceDate: DateTime = DateTime.now()): DateTime {
    const { month, day } = user.dateOfBirth.getMonthDay();
    const refInZone = referenceDate.setZone(user.timezone.toString());
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
   * @param user - The user whose birthday to celebrate
   * @returns Formatted birthday message
   */
  public formatMessage(user: User): string {
    return `Hey, ${user.firstName} ${user.lastName} it's your birthday`;
  }

  /**
   * Generate a complete birthday Event entity
   *
   * @param user - The user for whom to generate the birthday event
   * @returns Event entity ready to be persisted
   */
  public generateEvent(user: User): Event {
    const nextBirthday = this.calculateNextOccurrence(user);
    const targetUTC = this.timezoneService.convertToUTC(nextBirthday, user.timezone);

    const idempotencyKey = IdempotencyKey.generate(user.id, targetUTC);

    return new Event({
      id: idempotencyKey.toString(), // Use idempotency key as event ID
      userId: user.id,
      eventType: this.eventType,
      status: EventStatus.PENDING,
      targetTimestampUTC: targetUTC,
      targetTimestampLocal: nextBirthday,
      targetTimezone: user.timezone.toString(),
      deliveryPayload: {
        message: this.formatMessage(user),
        firstName: user.firstName,
        lastName: user.lastName,
      },
      idempotencyKey,
      version: 1,
      retryCount: 0,
      executedAt: null,
      failureReason: null,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    });
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
