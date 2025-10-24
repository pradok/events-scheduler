import type { WebhookPayload, WebhookResponse } from '../../../../shared/validation/schemas';

/**
 * IWebhookClient Port Interface
 *
 * Defines the contract between the application layer (use cases) and
 * infrastructure layer (WebhookAdapter) for delivering webhook payloads
 * to external services.
 *
 * This interface follows the Hexagonal Architecture pattern where the
 * application layer depends on abstractions (ports), not concrete
 * implementations (adapters).
 *
 * **Retry Behavior:**
 * Implementations MUST automatically retry transient failures (5xx, timeout, network)
 * using exponential backoff (1s, 2s, 4s) for up to 3 retry attempts.
 *
 * **Idempotency:**
 * The idempotency key MUST be included in all HTTP requests (X-Idempotency-Key header)
 * to enable external services to deduplicate duplicate deliveries.
 *
 * **Error Handling:**
 * - Transient failures (5xx, timeout, network): Throw InfrastructureError after retries exhausted
 * - Permanent failures (4xx): Throw PermanentDeliveryError immediately (no retries)
 *
 * @see WebhookAdapter for concrete implementation
 * @see ExecuteEventUseCase for usage in application layer
 * @see docs/architecture/port-interfaces.md#IWebhookClient
 * @see docs/architecture/design-patterns.md#Hexagonal-Architecture
 */
export interface IWebhookClient {
  /**
   * Delivers a webhook payload to an external service via HTTP POST.
   *
   * @param payload - Validated webhook payload (e.g., birthday message)
   * @param idempotencyKey - Unique key for duplicate detection (format: evt-{eventId}-{timestamp})
   * @returns Promise<WebhookResponse> - Response from webhook service
   *
   * @throws InfrastructureError - Transient failures (5xx, timeout, network) after retry exhaustion
   * @throws PermanentDeliveryError - Permanent failures (4xx client errors)
   * @throws ValidationError - Invalid payload or response schema
   *
   * **Retry Policy:**
   * - Retries: 3 attempts (4 total including initial request)
   * - Backoff: Exponential (1s, 2s, 4s)
   * - Retry Conditions: 5xx status codes, timeouts, network errors
   * - NO Retry: 4xx status codes (permanent failures)
   *
   * **HTTP Request Details:**
   * - Method: POST
   * - Content-Type: application/json
   * - Headers:
   *   - X-Idempotency-Key: {idempotencyKey}
   * - Timeout: 10 seconds
   * - Body: JSON-serialized WebhookPayload
   *
   * **Example Usage:**
   * ```typescript
   * const payload = { message: "Hey, John Doe it's your birthday" };
   * const idempotencyKey = "evt-123e4567-e89b-12d3-a456-426614174000-1634567890000";
   *
   * try {
   *   const response = await webhookClient.deliver(payload, idempotencyKey);
   *   logger.info('Webhook delivered successfully', { response });
   * } catch (error) {
   *   if (error instanceof PermanentDeliveryError) {
   *     // Mark event as FAILED (no retry)
   *     event.markFailed(error.message);
   *   } else if (error instanceof InfrastructureError) {
   *     // Transient failure - already retried 3 times
   *     event.markFailed(error.message);
   *   }
   * }
   * ```
   */
  deliver(payload: WebhookPayload, idempotencyKey: string): Promise<WebhookResponse>;
}
