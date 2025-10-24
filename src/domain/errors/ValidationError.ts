import { DomainError } from './DomainError';

/**
 * Thrown when domain validation fails
 */
export class ValidationError extends DomainError {
  public readonly details?: unknown;

  public constructor(message: string, details?: unknown) {
    super(message);
    this.details = details;
  }
}
