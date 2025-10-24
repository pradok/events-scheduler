import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { ISQSClient } from '../../../modules/event-scheduling/application/ports/ISQSClient';
import { SQSMessagePayload, SQSMessagePayloadSchema } from '../../../shared/validation/schemas';
import { logger } from '../../../shared/logger';
import { ValidationError } from '../../../domain/errors/ValidationError';
import { InfrastructureError } from '../../../domain/errors/InfrastructureError';

/**
 * AWS SQS Adapter for Event Message Queue
 *
 * Implements the ISQSClient port interface using AWS SDK for Node.js v3.
 * Sends event messages to SQS queue for asynchronous processing by worker Lambdas.
 *
 * **Architecture:**
 * - Hexagonal Architecture: Adapter layer implementing port interface
 * - Dependency Inversion: Application layer depends on ISQSClient, not SQSAdapter
 * - Schema Validation: Runtime validation using Zod before sending messages
 *
 * **Configuration:**
 * - Local Development: Connects to LocalStack SQS (http://localhost:4566)
 * - Production: Connects to AWS SQS (configured via environment variables)
 *
 * **Error Handling:**
 * - Schema validation failures → ValidationError (client error, don't retry)
 * - SQS send failures → InfrastructureError (infrastructure error, may retry)
 * - All errors logged with structured context for debugging
 *
 * **Message Attributes:**
 * - eventType: Enables SQS message filtering by event type
 * - idempotencyKey: For duplicate detection at webhook delivery layer
 *
 * @see ISQSClient port interface definition
 * @see docs/architecture/port-interfaces.md#IMessageSender
 * @see docs/architecture/tech-stack.md#AWS-Services
 */
export class SQSAdapter implements ISQSClient {
  /**
   * Creates a new SQSAdapter instance
   *
   * @param sqsClient - Configured AWS SQS client (LocalStack or AWS)
   * @param queueUrl - SQS queue URL (from environment variable SQS_QUEUE_URL)
   *
   * @example
   * ```typescript
   * const sqsClient = new SQSClient({
   *   region: 'us-east-1',
   *   endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:4566',
   *   credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
   * });
   *
   * const adapter = new SQSAdapter(
   *   sqsClient,
   *   process.env.SQS_QUEUE_URL!
   * );
   * ```
   */
  public constructor(
    private readonly sqsClient: SQSClient,
    private readonly queueUrl: string
  ) {}

  /**
   * Sends an event message to the SQS queue for asynchronous processing
   *
   * **Workflow:**
   * 1. Validate payload against SQSMessagePayloadSchema
   * 2. Create SQS SendMessageCommand with message body and attributes
   * 3. Send message to queue using AWS SDK
   * 4. Log success with messageId and eventId
   * 5. Return SQS MessageId for tracking
   *
   * **Error Handling:**
   * - Invalid payload → ValidationError (logged as warning, not retried)
   * - SQS send failure → InfrastructureError (logged as error, may retry)
   *
   * @param payload - The SQS message payload (validated against schema)
   * @returns SQS MessageId for tracking and debugging
   * @throws ValidationError - If payload fails schema validation
   * @throws InfrastructureError - If SQS operation fails
   */
  public async sendMessage(payload: SQSMessagePayload): Promise<string> {
    // Validate payload against schema
    const validationResult = SQSMessagePayloadSchema.safeParse(payload);

    if (!validationResult.success) {
      logger.warn({
        msg: 'Invalid SQS message payload',
        eventId: payload.eventId,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        validationErrors: validationResult.error.issues,
      });

      throw new ValidationError(
        'Invalid SQS message payload: ' +
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
          validationResult.error.issues.map((e: any) => e.message).join(', ')
      );
    }

    try {
      // Create SQS SendMessageCommand with message body and attributes
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const command = new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(payload),
        MessageAttributes: {
          eventType: {
            DataType: 'String',
            StringValue: payload.eventType,
          },
          idempotencyKey: {
            DataType: 'String',
            StringValue: payload.idempotencyKey,
          },
        },
      });

      // Send message to SQS queue
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const response = await this.sqsClient.send(command);

      // Log success with structured context
      logger.info({
        msg: 'SQS message sent successfully',
        eventId: payload.eventId,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        messageId: response.MessageId,
        eventType: payload.eventType,
        queueUrl: this.queueUrl,
      });

      // Return MessageId for tracking
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
      return response.MessageId!;
    } catch (error) {
      // Log error with structured context
      logger.error({
        msg: 'Failed to send SQS message',
        error: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : 'UnknownError',
        eventId: payload.eventId,
        queueUrl: this.queueUrl,
      });

      // Wrap AWS SDK error in application-level InfrastructureError
      throw new InfrastructureError(
        `SQS send failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
