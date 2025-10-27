import { DateTime } from 'luxon';
import { EventDeliveryTimeConfig, EVENT_DELIVERY_TIMES } from './event-delivery-times';

/**
 * Get delivery time configuration for an event type
 *
 * **Current Behavior (Story 4.5):**
 * 1. If FAST_TEST_DELIVERY_OFFSET is set and valid → Use offset (testing only)
 * 2. If FAST_TEST_DELIVERY_OFFSET is invalid → Fallback to defaults (9am)
 * 3. Otherwise → Return hardcoded defaults (9am for birthdays)
 *
 * **Fast Testing Override:**
 * ```bash
 * FAST_TEST_DELIVERY_OFFSET=5    # 5 minutes
 * FAST_TEST_DELIVERY_OFFSET=5m   # 5 minutes (explicit)
 * FAST_TEST_DELIVERY_OFFSET=30s  # 30 seconds (ultra-fast)
 * FAST_TEST_DELIVERY_OFFSET=2m30s # NOT SUPPORTED - falls back to default
 * ```
 * ⚠️ **TESTING ONLY** - Local development, manual E2E testing
 *
 * **Fallback Behavior:**
 * - Invalid format → Use defaults (no error thrown)
 * - Out of range → Use defaults (no error thrown)
 * - This prevents server startup failures due to typos
 *
 * **Future: Production Configuration (Next Stories)**
 *
 * When you need production delivery time config, DON'T modify this function.
 * Instead, create a new config resolution chain:
 *
 * ```typescript
 * // Future Story: Per-user delivery preferences
 * async function resolveDeliveryTimeConfig(
 *   eventType: 'BIRTHDAY' | 'ANNIVERSARY',
 *   userId?: string
 * ): Promise<EventDeliveryTimeConfig> {
 *   // Priority 1: User-specific preference (from DB)
 *   if (userId) {
 *     const userPref = await db.getUserDeliveryPreference(userId, eventType);
 *     if (userPref) return userPref;
 *   }
 *
 *   // Priority 2: Global config (from Parameter Store)
 *   const globalConfig = await parameterStore.getParameter('/app/event-delivery-times');
 *   if (globalConfig) {
 *     const times = JSON.parse(globalConfig.value);
 *     if (times[eventType]) return times[eventType];
 *   }
 *
 *   // Priority 3: Hardcoded defaults
 *   return getDeliveryTimeConfig(eventType); // This function (fallback)
 * }
 * ```
 *
 * **Why Separate Functions:**
 * - This function: Sync, simple, testing + defaults
 * - Future function: Async, complex, production config resolution
 * - Don't mix concerns: testing override ≠ production config
 *
 * @param eventType - Type of event ('BIRTHDAY' or 'ANNIVERSARY')
 * @returns Delivery time config { hour, minute }
 *
 * @example
 * // Default (9am for birthdays)
 * const config = getDeliveryTimeConfig('BIRTHDAY');
 * // Returns: { hour: 9, minute: 0 }
 *
 * @example
 * // With ENV: FAST_TEST_DELIVERY_OFFSET=5m
 * const config = getDeliveryTimeConfig('BIRTHDAY');
 * // Returns: { hour: <now + 5 min>, minute: <now + 5 min> }
 *
 * @example
 * // With ENV: FAST_TEST_DELIVERY_OFFSET=30s
 * const config = getDeliveryTimeConfig('BIRTHDAY');
 * // Returns: { hour: <now + 30 sec>, minute: <now + 30 sec> }
 *
 * @example
 * // With ENV: FAST_TEST_DELIVERY_OFFSET=invalid
 * const config = getDeliveryTimeConfig('BIRTHDAY');
 * // Returns: { hour: 9, minute: 0 } (fallback to default)
 */
export function getDeliveryTimeConfig(
  eventType: 'BIRTHDAY' | 'ANNIVERSARY'
): EventDeliveryTimeConfig {
  const testOffset = process.env.FAST_TEST_DELIVERY_OFFSET;

  // Fast test override → calculate now + offset
  if (testOffset) {
    const offsetMinutes = parseTestOffset(testOffset);
    // If parsing failed, offsetMinutes will be null → use default
    if (offsetMinutes !== null) {
      const targetTime = DateTime.now().plus({ minutes: offsetMinutes });
      return {
        hour: targetTime.hour,
        minute: targetTime.minute,
      };
    }
  }

  // No override or invalid format → use default
  return getDefaultConfig(eventType);
}

/**
 * Check if fast test delivery override is active
 *
 * @returns true if FAST_TEST_DELIVERY_OFFSET env var is set, false otherwise
 */
export function isDeliveryTimeOverrideActive(): boolean {
  return !!process.env.FAST_TEST_DELIVERY_OFFSET;
}

/**
 * Get default delivery time config
 *
 * @param eventType - Type of event
 * @returns Default config from EVENT_DELIVERY_TIMES constant
 * @throws Error if event type not implemented
 * @private
 */
function getDefaultConfig(eventType: 'BIRTHDAY' | 'ANNIVERSARY'): EventDeliveryTimeConfig {
  // TODO: Add ANNIVERSARY support in future story
  if (eventType === 'ANNIVERSARY') {
    throw new Error('ANNIVERSARY event type not yet implemented');
  }
  return EVENT_DELIVERY_TIMES[eventType];
}

/**
 * Parse test offset value with support for minutes and seconds
 *
 * Supported formats:
 * - "5"    → 5 minutes
 * - "5m"   → 5 minutes (explicit)
 * - "30s"  → 30 seconds (0.5 minutes)
 * - "120"  → 120 minutes (2 hours)
 *
 * Invalid formats return null (fallback to default):
 * - "abc"  → null
 * - "2m30s" → null (combined format not supported)
 * - "-5"   → null (negative not allowed)
 * - "0"    → null (zero not allowed)
 * - "1441" → null (> 24 hours)
 *
 * @param value - Offset string
 * @returns Offset in minutes (fractional for seconds), or null if invalid
 * @private
 */
function parseTestOffset(value: string): number | null {
  const trimmed = value.trim();

  // Match formats: "5", "5m", "30s"
  const minuteMatch = trimmed.match(/^(\d+)m?$/);
  const secondMatch = trimmed.match(/^(\d+)s$/);

  let offsetMinutes: number;

  if (secondMatch && secondMatch[1]) {
    // Format: "30s" → 0.5 minutes
    const seconds = parseInt(secondMatch[1], 10);
    if (Number.isNaN(seconds)) return null;
    offsetMinutes = seconds / 60;
  } else if (minuteMatch && minuteMatch[1]) {
    // Format: "5" or "5m" → 5 minutes
    const minutes = parseInt(minuteMatch[1], 10);
    if (Number.isNaN(minutes)) return null;
    offsetMinutes = minutes;
  } else {
    // Invalid format
    return null;
  }

  // Validate range: 1 second (0.0167 min) to 24 hours (1440 min)
  if (offsetMinutes < 0.0167 || offsetMinutes > 1440) {
    return null;
  }

  return offsetMinutes;
}
