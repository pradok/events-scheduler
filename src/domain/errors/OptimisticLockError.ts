import { DomainError } from './DomainError';

/**
 * Error thrown when an optimistic locking conflict is detected.
 * This occurs when an entity's version number doesn't match the expected version,
 * indicating that another transaction has modified the entity since it was read.
 */
export class OptimisticLockError extends DomainError {
  public constructor(message: string) {
    super(message);
    this.name = 'OptimisticLockError';
  }
}
