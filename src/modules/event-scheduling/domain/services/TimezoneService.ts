import { DateTime } from 'luxon';
import { Timezone } from '@shared/value-objects/Timezone';

/**
 * TimezoneService - Pure utility for timezone conversions
 *
 * Handles timezone conversions using Luxon with automatic DST handling.
 * This service contains NO business logic about event types - it is a pure
 * utility for timezone operations.
 *
 * Event-type-specific logic (e.g., "when is the next birthday") belongs in
 * EventHandler implementations (BirthdayEventHandler, AnniversaryEventHandler, etc.)
 */
export class TimezoneService {
  /**
   * Converts a local timestamp to UTC
   *
   * @param localTimestamp - The DateTime representing a "wall clock" time (timezone-agnostic)
   * @param timezone - The IANA timezone identifier to interpret the timestamp in
   * @returns DateTime in UTC timezone
   *
   * @throws Error if localTimestamp is invalid
   *
   * @remarks
   * - Handles DST transitions automatically via Luxon
   * - Treats localTimestamp as a "floating" time (9AM) and interprets it in the given timezone
   * - Example: 9AM interpreted in America/New_York becomes 14:00 UTC (during EST)
   */
  public convertToUTC(localTimestamp: DateTime, timezone: Timezone): DateTime {
    if (!localTimestamp.isValid) {
      throw new Error(`Invalid timestamp provided: ${localTimestamp.invalidReason}`);
    }

    // Extract the "wall clock" time components (year, month, day, hour, minute, second)
    // and reconstruct them in the target timezone, then convert to UTC
    const reconstructed = DateTime.fromObject(
      {
        year: localTimestamp.year,
        month: localTimestamp.month,
        day: localTimestamp.day,
        hour: localTimestamp.hour,
        minute: localTimestamp.minute,
        second: localTimestamp.second,
        millisecond: localTimestamp.millisecond,
      },
      { zone: timezone.toString() }
    );

    return reconstructed.toUTC();
  }

  /**
   * Converts a UTC timestamp to local time in the specified timezone
   *
   * @param utcTimestamp - The DateTime in UTC
   * @param timezone - The IANA timezone identifier for the target local time
   * @returns DateTime in the specified local timezone
   *
   * @throws Error if utcTimestamp is invalid
   *
   * @remarks
   * - Handles DST transitions automatically via Luxon
   * - Preserves the exact moment in time, just changes the timezone representation
   */
  public convertToLocalTime(utcTimestamp: DateTime, timezone: Timezone): DateTime {
    if (!utcTimestamp.isValid) {
      throw new Error(`Invalid timestamp provided: ${utcTimestamp.invalidReason}`);
    }

    return utcTimestamp.setZone(timezone.toString());
  }
}
