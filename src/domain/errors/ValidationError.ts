import { DomainError } from './DomainError';

/**
 * Thrown when domain validation fails
 */
export class ValidationError extends DomainError {
  public constructor(message: string) {
    super(message);
  }
}
