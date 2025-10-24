/**
 * PermanentDeliveryError
 *
 * Thrown when a delivery attempt fails permanently and should NOT be retried.
 * This typically indicates:
 * - 4xx HTTP status codes (client errors like 400 Bad Request, 404 Not Found)
 * - Invalid webhook URL
 * - Authentication failures
 * - Rate limiting that won't resolve with retries
 *
 * Unlike InfrastructureError (which represents transient failures),
 * PermanentDeliveryError indicates the request should not be retried
 * and the event should be marked as FAILED.
 *
 * @see docs/architecture/error-handling.md#External-API-Errors
 */
export class PermanentDeliveryError extends Error {
  public constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'PermanentDeliveryError';

    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PermanentDeliveryError);
    }
  }
}
