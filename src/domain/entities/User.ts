import { DateTime } from 'luxon';
import { DateOfBirth } from '../value-objects/DateOfBirth';
import { Timezone } from '../value-objects/Timezone';
import { ValidationError } from '../errors/ValidationError';
import { UserProps } from '../schemas/EntitySchemas';

/**
 * User entity
 * Represents an individual with a birthday and timezone
 * Immutable - all update methods return new instances
 */
export class User {
  public readonly id: string;
  public readonly firstName: string;
  public readonly lastName: string;
  public readonly dateOfBirth: DateOfBirth;
  public readonly timezone: Timezone;
  public readonly createdAt: DateTime;
  public readonly updatedAt: DateTime;

  public constructor(props: UserProps) {
    // Validate firstName
    if (!props.firstName || props.firstName.trim().length === 0) {
      throw new ValidationError('First name cannot be empty');
    }
    if (props.firstName.length > 100) {
      throw new ValidationError('First name cannot exceed 100 characters');
    }

    // Validate lastName
    if (!props.lastName || props.lastName.trim().length === 0) {
      throw new ValidationError('Last name cannot be empty');
    }
    if (props.lastName.length > 100) {
      throw new ValidationError('Last name cannot exceed 100 characters');
    }

    this.id = props.id;
    this.firstName = props.firstName;
    this.lastName = props.lastName;
    this.dateOfBirth = props.dateOfBirth;
    this.timezone = props.timezone;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /**
   * Updates the user's timezone (immutable - returns new instance)
   * @param newTimezone The new timezone
   * @returns A new User instance with updated timezone
   *
   * Note: Birthday calculation logic has been moved to BirthdayEventHandler
   * as part of the Strategy Pattern refactoring. Use BirthdayEventHandler.calculateNextOccurrence()
   * instead of User.calculateNextBirthday().
   */
  public updateTimezone(newTimezone: Timezone): User {
    return new User({
      ...this,
      timezone: newTimezone,
      updatedAt: DateTime.now(),
    });
  }

  /**
   * Updates the user's name (immutable - returns new instance)
   * @param firstName The new first name
   * @param lastName The new last name
   * @returns A new User instance with updated name
   */
  public updateName(firstName: string, lastName: string): User {
    return new User({
      ...this,
      firstName,
      lastName,
      updatedAt: DateTime.now(),
    });
  }
}
