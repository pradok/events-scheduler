/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import axios, { AxiosError } from 'axios';
import { WebhookAdapter } from './WebhookAdapter';
import { InfrastructureError } from '../../../domain/errors/InfrastructureError';
import { PermanentDeliveryError } from '../../../domain/errors/PermanentDeliveryError';
import type { WebhookPayload } from '../../../shared/validation/schemas';

// Mock axios-retry
jest.mock('axios-retry', () => jest.fn());

// Mock logger
jest.mock('../../../shared/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('WebhookAdapter', () => {
  let adapter: WebhookAdapter;
  const webhookUrl = 'https://webhook.test/endpoint';
  let mockPost: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock the post method on Axios instances created by axios.create
    // This is cleaner than mocking axios.create itself
    mockPost = jest.spyOn(axios.Axios.prototype, 'post');

    // Create adapter - it will call axios.create() which creates an Axios instance
    // with the mocked post method
    adapter = new WebhookAdapter(webhookUrl);
  });

  afterEach(() => {
    // Restore the original implementation
    mockPost.mockRestore();
  });

  const validPayload: WebhookPayload = {
    message: "Hey, John Doe it's your birthday",
  };
  const idempotencyKey = 'evt-123-456';

  describe('deliver', () => {
    describe('successful delivery', () => {
      it('should deliver webhook successfully and return validated response', async () => {
        const mockResponse = {
          status: 200,
          data: {
            success: true,
            timestamp: '2025-10-24T12:00:00Z',
            message: 'Webhook received',
          },
        };
        mockPost.mockResolvedValue(mockResponse);

        const result = await adapter.deliver(validPayload, idempotencyKey);

        expect(result).toEqual({
          success: true,
          timestamp: '2025-10-24T12:00:00Z',
          message: 'Webhook received',
        });
        expect(mockPost).toHaveBeenCalledWith(webhookUrl, validPayload, {
          headers: { 'X-Idempotency-Key': idempotencyKey },
        });
      });

      it('should validate response with minimal fields (success defaults to true)', async () => {
        mockPost.mockResolvedValue({ status: 200, data: {} } as never);

        const result = await adapter.deliver(validPayload, idempotencyKey);

        expect(result.success).toBe(true);
      });

      it('should include X-Idempotency-Key header in all requests', async () => {
        mockPost.mockResolvedValue({ status: 200, data: {} } as never);

        await adapter.deliver(validPayload, idempotencyKey);

        expect(mockPost).toHaveBeenCalledWith(
          webhookUrl,
          expect.any(Object),
          expect.objectContaining({
            headers: expect.objectContaining({
              'X-Idempotency-Key': idempotencyKey,
            }),
          })
        );
      });
    });

    describe('payload validation', () => {
      it('should throw error when payload is invalid (missing message)', async () => {
        const invalidPayload = {} as WebhookPayload;

        await expect(adapter.deliver(invalidPayload, idempotencyKey)).rejects.toThrow();
      });

      it('should throw error when payload has empty message', async () => {
        const invalidPayload = { message: '' } as WebhookPayload;

        await expect(adapter.deliver(invalidPayload, idempotencyKey)).rejects.toThrow();
      });
    });

    describe('permanent failures (4xx)', () => {
      it('should throw PermanentDeliveryError on 400 without retry', async () => {
        // Create a plain error object that looks like an AxiosError
        const error = Object.assign(new Error('Request failed with status code 400'), {
          isAxiosError: true,
          response: {
            status: 400,
            statusText: 'Bad Request',
            data: {},
            headers: {},
            config: {} as never,
          },
          config: {} as never,
          code: 'ERR_BAD_REQUEST',
        });

        mockPost.mockRejectedValue(error);

        try {
          await adapter.deliver(validPayload, idempotencyKey);
          fail('Expected PermanentDeliveryError to be thrown');
        } catch (err) {
          expect(err).toBeInstanceOf(PermanentDeliveryError);
          expect(err).toHaveProperty('message', expect.stringContaining('HTTP 400'));
        }
      });

      it('should throw PermanentDeliveryError on 404 without retry', async () => {
        const error = Object.assign(new Error('Request failed with status code 404'), {
          isAxiosError: true,
          response: {
            status: 404,
            statusText: 'Not Found',
            data: {},
            headers: {},
            config: {} as never,
          },
          config: {} as never,
          code: 'ERR_BAD_REQUEST',
        });

        mockPost.mockRejectedValue(error);

        await expect(adapter.deliver(validPayload, idempotencyKey)).rejects.toThrow(
          PermanentDeliveryError
        );
      });

      it('should include status code in PermanentDeliveryError', async () => {
        const error = Object.assign(new Error('Request failed with status code 400'), {
          isAxiosError: true,
          response: {
            status: 400,
            statusText: 'Bad Request',
            data: {},
            headers: {},
            config: {} as never,
          },
          config: {} as never,
          code: 'ERR_BAD_REQUEST',
        });

        mockPost.mockRejectedValue(error);

        try {
          await adapter.deliver(validPayload, idempotencyKey);
          fail('Expected PermanentDeliveryError');
        } catch (err) {
          expect(err).toBeInstanceOf(PermanentDeliveryError);
          if (err instanceof PermanentDeliveryError) {
            expect(err.statusCode).toBe(400);
          }
        }
      });
    });

    describe('transient failures (5xx)', () => {
      it('should throw InfrastructureError on 503 after retries', async () => {
        const error = new AxiosError(
          'Service Unavailable',
          '503',
          undefined,
          {},
          {
            status: 503,
            statusText: 'Service Unavailable',
            data: {},
            headers: {},
            config: {} as never,
          }
        );
        mockPost.mockRejectedValue(error);

        await expect(adapter.deliver(validPayload, idempotencyKey)).rejects.toThrow(
          InfrastructureError
        );
      });

      it('should throw InfrastructureError on 500 after retries', async () => {
        const error = new AxiosError(
          'Internal Server Error',
          '500',
          undefined,
          {},
          {
            status: 500,
            statusText: 'Internal Server Error',
            data: {},
            headers: {},
            config: {} as never,
          }
        );
        mockPost.mockRejectedValue(error);

        await expect(adapter.deliver(validPayload, idempotencyKey)).rejects.toThrow(
          InfrastructureError
        );
      });
    });

    describe('network errors', () => {
      it('should throw InfrastructureError on timeout', async () => {
        const error = new AxiosError(
          'timeout of 10000ms exceeded',
          'ECONNABORTED',
          undefined,
          {},
          undefined
        );
        mockPost.mockRejectedValue(error);

        await expect(adapter.deliver(validPayload, idempotencyKey)).rejects.toThrow(
          InfrastructureError
        );
      });

      it('should throw InfrastructureError on connection refused', async () => {
        const error = new AxiosError(
          'connect ECONNREFUSED',
          'ECONNREFUSED',
          undefined,
          {},
          undefined
        );
        mockPost.mockRejectedValue(error);

        await expect(adapter.deliver(validPayload, idempotencyKey)).rejects.toThrow(
          InfrastructureError
        );
      });
    });

    describe('response validation', () => {
      it('should throw error when response has invalid format', async () => {
        mockPost.mockResolvedValue({
          status: 200,
          data: { success: 'not-a-boolean' },
        });

        await expect(adapter.deliver(validPayload, idempotencyKey)).rejects.toThrow();
      });
    });

    describe('unexpected errors', () => {
      it('should throw InfrastructureError for non-Axios errors', async () => {
        mockPost.mockRejectedValue(new Error('Unexpected error'));

        await expect(adapter.deliver(validPayload, idempotencyKey)).rejects.toThrow(
          InfrastructureError
        );
      });
    });
  });
});
