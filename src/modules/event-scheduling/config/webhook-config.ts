/**
 * Webhook Configuration
 *
 * Provides webhook URL configuration for event delivery.
 *
 * Current implementation: Simple static configuration
 * Future: Can be replaced with user-specific webhooks from database,
 *         external configuration service, or per-tenant settings.
 */

export interface IWebhookConfig {
  /**
   * Get webhook URL for event delivery
   * @param userId - User ID (for future per-user webhook support)
   * @param eventType - Event type (for future event-type-specific webhooks)
   * @returns Webhook URL to deliver event notifications
   */
  getWebhookUrl(userId: string, eventType: string): string;
}

/**
 * Static webhook configuration
 * Uses single webhook URL from environment variable
 */
export class StaticWebhookConfig implements IWebhookConfig {
  private readonly webhookUrl: string;

  public constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl || process.env.WEBHOOK_TEST_URL || '';

    if (!this.webhookUrl) {
      throw new Error('Webhook URL not configured. Set WEBHOOK_TEST_URL environment variable.');
    }
  }

  public getWebhookUrl(_userId: string, _eventType: string): string {
    return this.webhookUrl;
  }
}

/**
 * Default webhook configuration instance (lazy initialization)
 * Export for use in event handlers and use cases
 */
let cachedWebhookConfig: IWebhookConfig | null = null;

export const webhookConfig: IWebhookConfig = {
  getWebhookUrl(userId: string, eventType: string): string {
    if (!cachedWebhookConfig) {
      cachedWebhookConfig = new StaticWebhookConfig();
    }
    return cachedWebhookConfig.getWebhookUrl(userId, eventType);
  },
};
