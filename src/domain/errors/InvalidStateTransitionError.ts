import { DomainError } from './DomainError';

/**
 * Thrown when an invalid state transition is attempted
 */
export class InvalidStateTransitionError extends DomainError {
  public constructor(from: string, to: string) {
    super(`Invalid state transition from ${from} to ${to}`);
  }
}
