/**
 * InfrastructureError
 *
 * Thrown when infrastructure-level operations fail, including:
 * - Database connection failures
 * - Network timeouts
 * - External API errors (SQS, EventBridge, etc.)
 * - Message queue failures
 *
 * This error type allows the application layer to handle infrastructure
 * failures without knowing the specific infrastructure technology in use.
 *
 * @see docs/architecture/error-handling.md#Infrastructure-Errors
 */
export class InfrastructureError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'InfrastructureError';

    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InfrastructureError);
    }
  }
}
