/**
 * Base class for all domain errors
 * Extends Error to provide custom domain-specific error handling
 */
export class DomainError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}
