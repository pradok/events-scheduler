import axios, { type AxiosInstance, AxiosError, isAxiosError } from 'axios';
import axiosRetry, { exponentialDelay, isNetworkOrIdempotentRequestError } from 'axios-retry';
import type { IWebhookClient } from '../../../modules/event-scheduling/application/ports/IWebhookClient';
import {
  WebhookPayloadSchema,
  WebhookResponseSchema,
  type WebhookPayload,
  type WebhookResponse,
} from '../../../shared/validation/schemas';
import { InfrastructureError } from '../../../domain/errors/InfrastructureError';
import { PermanentDeliveryError } from '../../../domain/errors/PermanentDeliveryError';
import { logger } from '../../../shared/logger';

/**
 * WebhookAdapter
 *
 * Concrete implementation of IWebhookClient that delivers webhook payloads
 * to external HTTP endpoints using Axios.
 *
 * **Features:**
 * - Automatic retry with exponential backoff (1s, 2s, 4s)
 * - Payload and response validation using Zod schemas
 * - Idempotency key header for duplicate detection
 * - Structured logging with correlation tracking
 * - Error classification (transient vs permanent)
 *
 * **Hexagonal Architecture:**
 * This is a secondary (driven/outbound) adapter that implements the
 * IWebhookClient port interface defined in the application layer.
 *
 * @see IWebhookClient for interface contract
 * @see docs/architecture/port-interfaces.md#IWebhookClient
 * @see docs/architecture/design-patterns.md#Hexagonal-Architecture
 */
export class WebhookAdapter implements IWebhookClient {
  private readonly axiosInstance: AxiosInstance;

  /**
   * Creates a new WebhookAdapter instance
   *
   * Webhook URL is now read from payload (per-event configuration)
   * instead of constructor (global configuration).
   */
  public constructor() {
    // Create Axios instance with default configuration
    this.axiosInstance = axios.create({
      timeout: 10000, // 10 seconds
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Configure automatic retry logic with exponential backoff
    axiosRetry(this.axiosInstance, {
      retries: 3, // Retry 3 times (4 total attempts including initial)
      retryDelay: exponentialDelay, // 1s, 2s, 4s
      retryCondition: (error: AxiosError): boolean => {
        // Retry on network errors, timeouts, or 5xx server errors
        if (isNetworkOrIdempotentRequestError(error)) {
          return true;
        }

        // Retry on 5xx server errors
        const status = error.response?.status;
        if (status !== undefined && status >= 500 && status < 600) {
          return true;
        }

        // Do NOT retry on 4xx client errors (permanent failures)
        return false;
      },
      onRetry: (retryCount: number, error: AxiosError, config): void => {
        logger.warn({
          msg: 'Webhook delivery retry attempt',
          retryCount,
          url: config.url,
          statusCode: error.response?.status,
          error: error.message,
        });
      },
    });
  }

  /**
   * Delivers a webhook payload to the configured endpoint
   *
   * @param payload - Webhook payload (validated against WebhookPayloadSchema)
   * @param idempotencyKey - Unique key for duplicate detection
   * @returns Promise<WebhookResponse> - Validated response from webhook service
   *
   * @throws InfrastructureError - Transient failures after retry exhaustion
   * @throws PermanentDeliveryError - Permanent failures (4xx)
   * @throws ValidationError - Invalid payload or response (from Zod)
   */
  public async deliver(payload: WebhookPayload, idempotencyKey: string): Promise<WebhookResponse> {
    const startTime = Date.now();

    // Validate payload before sending (throws ZodError if invalid)
    const validatedPayload = WebhookPayloadSchema.parse(payload);

    // Extract webhook URL from payload
    const webhookUrl = validatedPayload.webhookUrl;

    logger.info({
      msg: 'Webhook delivery started',
      url: webhookUrl,
      idempotencyKey,
      payloadSize: JSON.stringify(payload).length,
    });

    try {
      // Send HTTP POST request with idempotency header
      const response = await this.axiosInstance.post(webhookUrl, payload, {
        headers: {
          'X-Idempotency-Key': idempotencyKey,
        },
      });

      const duration = Date.now() - startTime;

      // Validate response against schema (throws ZodError if invalid)
      const validatedResponse = WebhookResponseSchema.parse(response.data);

      logger.info({
        msg: 'Webhook delivery succeeded',
        url: webhookUrl,
        idempotencyKey,
        statusCode: response.status,
        durationMs: duration,
      });

      return validatedResponse;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Handle Axios errors (HTTP errors, network errors, timeouts)
      // Check multiple ways for compatibility with both real errors and test mocks
      const isAxios =
        isAxiosError(error) ||
        error instanceof AxiosError ||
        (error as AxiosError).isAxiosError === true ||
        !!(error as AxiosError).response;

      if (isAxios) {
        const axiosErr = error as AxiosError;
        const status = axiosErr.response?.status;

        // Log failure details
        logger.error({
          msg: 'Webhook delivery failed',
          url: webhookUrl,
          idempotencyKey,
          error: axiosErr.message,
          stack: axiosErr.stack,
          statusCode: status,
          durationMs: duration,
        });

        // Permanent failure: 4xx client errors (do NOT retry)
        if (status !== undefined && status >= 400 && status < 500) {
          throw new PermanentDeliveryError(
            `Webhook delivery failed with HTTP ${status}: ${axiosErr.message}`,
            status
          );
        }

        // Transient failure: 5xx, timeout, network (already retried)
        throw new InfrastructureError(`Webhook delivery failed after retries: ${axiosErr.message}`);
      }

      // Handle non-Axios errors (e.g., Zod validation errors)
      logger.error({
        msg: 'Webhook delivery failed with unexpected error',
        url: webhookUrl,
        idempotencyKey,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        durationMs: duration,
      });

      throw new InfrastructureError(
        `Unexpected error during webhook delivery: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
