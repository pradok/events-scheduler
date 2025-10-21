import { DomainError } from './DomainError';

/**
 * Thrown when an invalid IANA timezone identifier is provided
 */
export class InvalidTimezoneError extends DomainError {
  public constructor(timezone: string) {
    super(`Invalid timezone: ${timezone}. Must be a valid IANA timezone identifier.`);
  }
}
