import { describe, expect, it } from '@jest/globals';
import {
  WebhookPayloadSchema,
  WebhookResponseSchema,
  type WebhookPayload,
  type WebhookResponse,
} from './schemas';

describe('WebhookPayloadSchema', () => {
  describe('valid payloads', () => {
    it('should validate a valid webhook payload with message', () => {
      const validPayload = {
        message: "Hey, John Doe it's your birthday",
        webhookUrl: 'https://webhook.test/endpoint',
      };

      const result = WebhookPayloadSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.message).toBe("Hey, John Doe it's your birthday");
        expect(result.data.webhookUrl).toBe('https://webhook.test/endpoint');
      }
    });

    it('should validate payload with long message', () => {
      const validPayload = {
        message: 'A'.repeat(1000), // Long message
        webhookUrl: 'https://webhook.test/endpoint',
      };

      const result = WebhookPayloadSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
    });

    it('should derive correct TypeScript type', () => {
      const payload: WebhookPayload = {
        message: 'Test message',
        webhookUrl: 'https://webhook.test/endpoint',
      };

      // Type assertion to ensure correct type inference
      const validated = WebhookPayloadSchema.parse(payload);
      expect(validated.message).toBe('Test message');
      expect(validated.webhookUrl).toBe('https://webhook.test/endpoint');
    });
  });

  describe('invalid payloads', () => {
    it('should reject payload with missing message', () => {
      const invalidPayload = {};

      const result = WebhookPayloadSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.code).toBe('invalid_type');
      }
    });

    it('should reject payload with empty message', () => {
      const invalidPayload = {
        message: '',
      };

      const result = WebhookPayloadSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('Message is required');
      }
    });

    it('should reject payload with non-string message', () => {
      const invalidPayload = {
        message: 123,
      };

      const result = WebhookPayloadSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.code).toBe('invalid_type');
      }
    });

    it('should reject payload with null message', () => {
      const invalidPayload = {
        message: null,
      };

      const result = WebhookPayloadSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });
  });

  describe('schema evolution', () => {
    it('should ignore additional fields (allowing future extensibility)', () => {
      const payloadWithExtraFields = {
        message: "Hey, John Doe it's your birthday",
        webhookUrl: 'https://webhook.test/endpoint',
        extraField: 'should be stripped',
        anotherField: 123,
      };

      const result = WebhookPayloadSchema.safeParse(payloadWithExtraFields);

      expect(result.success).toBe(true);
      if (result.success) {
        // Zod strips unknown fields by default
        expect(result.data).toEqual({
          message: "Hey, John Doe it's your birthday",
          webhookUrl: 'https://webhook.test/endpoint',
        });
      }
    });
  });
});

describe('WebhookResponseSchema', () => {
  describe('valid responses', () => {
    it('should validate response with all fields', () => {
      const validResponse = {
        success: true,
        timestamp: '2025-10-24T12:00:00Z',
        message: 'Webhook received successfully',
      };

      const result = WebhookResponseSchema.safeParse(validResponse);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.timestamp).toBe('2025-10-24T12:00:00Z');
        expect(result.data.message).toBe('Webhook received successfully');
      }
    });

    it('should validate response with minimal fields (success defaults to true)', () => {
      const minimalResponse = {};

      const result = WebhookResponseSchema.safeParse(minimalResponse);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true); // Default value
        expect(result.data.timestamp).toBeUndefined();
        expect(result.data.message).toBeUndefined();
      }
    });

    it('should validate response with only timestamp', () => {
      const responseWithTimestamp = {
        timestamp: '2025-10-24T12:00:00Z',
      };

      const result = WebhookResponseSchema.safeParse(responseWithTimestamp);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.timestamp).toBe('2025-10-24T12:00:00Z');
      }
    });

    it('should validate response with success: false', () => {
      const failureResponse = {
        success: false,
        message: 'Webhook processing failed',
      };

      const result = WebhookResponseSchema.safeParse(failureResponse);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(false);
        expect(result.data.message).toBe('Webhook processing failed');
      }
    });

    it('should derive correct TypeScript type', () => {
      const response: WebhookResponse = {
        success: true,
        timestamp: '2025-10-24T12:00:00Z',
      };

      const validated = WebhookResponseSchema.parse(response);
      expect(validated.success).toBe(true);
    });
  });

  describe('invalid responses', () => {
    it('should reject response with non-boolean success', () => {
      const invalidResponse = {
        success: 'true', // String instead of boolean
      };

      const result = WebhookResponseSchema.safeParse(invalidResponse);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.code).toBe('invalid_type');
      }
    });

    it('should reject response with non-string timestamp', () => {
      const invalidResponse = {
        timestamp: 123456789, // Number instead of string
      };

      const result = WebhookResponseSchema.safeParse(invalidResponse);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.code).toBe('invalid_type');
      }
    });

    it('should reject response with non-string message', () => {
      const invalidResponse = {
        message: { text: 'Invalid format' }, // Object instead of string
      };

      const result = WebhookResponseSchema.safeParse(invalidResponse);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.code).toBe('invalid_type');
      }
    });
  });

  describe('schema evolution', () => {
    it('should allow additional fields for future extensibility', () => {
      const responseWithExtraFields = {
        success: true,
        timestamp: '2025-10-24T12:00:00Z',
        message: 'Success',
        extraField: 'future feature',
      };

      const result = WebhookResponseSchema.safeParse(responseWithExtraFields);

      expect(result.success).toBe(true);
      if (result.success) {
        // Zod strips unknown fields by default
        expect(result.data).toEqual({
          success: true,
          timestamp: '2025-10-24T12:00:00Z',
          message: 'Success',
        });
      }
    });
  });
});
