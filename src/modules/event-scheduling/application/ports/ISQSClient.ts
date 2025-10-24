import type { SQSMessagePayload } from '../../../../shared/validation/schemas';

/**
 * ISQSClient Port Interface
 *
 * Abstracts SQS message queue operations for the event scheduling system.
 * This port enables the application layer to send event messages to a queue
 * without depending on any specific message queue technology (SQS, RabbitMQ, Kafka, etc.).
 *
 * **Purpose:**
 * - Decouple scheduling from execution (async processing)
 * - Enable horizontal scaling of event execution workers
 * - Provide retry mechanism for transient failures via SQS built-in retry
 *
 * **Implementations:**
 * - SQSAdapter: AWS SQS implementation using @aws-sdk/client-sqs
 * - InMemoryQueueAdapter: In-memory queue for testing (future)
 * - RabbitMQAdapter: Alternative queue technology (future)
 *
 * **Dependency Injection:**
 * Use cases depend on this interface, not concrete implementations.
 * The adapter is injected at application startup, enabling easy testing
 * and technology swapping without changing business logic.
 *
 * @see SQSAdapter for concrete AWS SQS implementation
 * @see docs/architecture/port-interfaces.md#IMessageSender
 * @see docs/architecture/design-patterns.md#Hexagonal-Architecture
 */
export interface ISQSClient {
  /**
   * Sends an event message to the SQS queue for asynchronous processing.
   *
   * The message payload is validated against SQSMessagePayloadSchema before sending.
   * If validation fails, a ValidationError is thrown.
   *
   * The implementation must ensure:
   * - Payload is validated against schema
   * - Message is sent to the configured queue
   * - Message attributes (eventType, idempotencyKey) are included
   * - Errors are logged with structured context
   * - AWS SDK errors are wrapped in InfrastructureError
   *
   * @param payload - The SQS message payload (validated against SQSMessagePayloadSchema)
   * @returns Promise<string> - SQS MessageId for tracking and debugging
   * @throws ValidationError - If payload fails schema validation
   * @throws InfrastructureError - If SQS operation fails (network, permissions, queue not found, etc.)
   *
   * @example
   * ```typescript
   * const payload: SQSMessagePayload = {
   *   eventId: event.id,
   *   eventType: event.eventType,
   *   idempotencyKey: event.idempotencyKey,
   *   metadata: {
   *     userId: event.userId,
   *     targetTimestampUTC: event.targetTimestampUTC.toISO(),
   *     deliveryPayload: event.deliveryPayload,
   *   },
   * };
   *
   * const messageId = await sqsClient.sendMessage(payload);
   * logger.info({ messageId, eventId: event.id }, 'Event queued for execution');
   * ```
   */
  sendMessage(payload: SQSMessagePayload): Promise<string>;
}
