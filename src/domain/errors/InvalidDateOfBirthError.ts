import { DomainError } from './DomainError';

/**
 * Thrown when an invalid date of birth is provided
 */
export class InvalidDateOfBirthError extends DomainError {
  public constructor(dateString: string) {
    super(`Invalid date of birth: ${dateString}. Must be a valid date in YYYY-MM-DD format.`);
  }
}

/**
 * Thrown when a date of birth in the future is provided
 */
export class DateOfBirthInFutureError extends DomainError {
  public constructor(dateString: string) {
    super(`Date of birth cannot be in the future: ${dateString}`);
  }
}
