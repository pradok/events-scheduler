import { DateTime } from 'luxon';
import { getDeliveryTimeConfig, isDeliveryTimeOverrideActive } from './delivery-time-config';

describe('delivery-time-config', () => {
  beforeEach(() => {
    delete process.env.FAST_TEST_DELIVERY_OFFSET;
  });

  afterEach(() => {
    delete process.env.FAST_TEST_DELIVERY_OFFSET;
  });

  describe('getDeliveryTimeConfig', () => {
    describe('No Override', () => {
      it('should return default config (9am) when env var not set', () => {
        // Act
        const config = getDeliveryTimeConfig('BIRTHDAY');

        // Assert
        expect(config).toEqual({ hour: 9, minute: 0 });
      });
    });

    describe('Fast Test Override', () => {
      describe('Minutes format', () => {
        it('should calculate dynamic config for 5 minutes (implicit)', () => {
          // Arrange
          process.env.FAST_TEST_DELIVERY_OFFSET = '5';
          const before = DateTime.utc();

          // Act
          const config = getDeliveryTimeConfig('BIRTHDAY');

          // Assert - config uses UTC time
          const configTime = DateTime.utc().set({
            hour: config.hour,
            minute: config.minute,
            second: config.second ?? 0,
          });
          const diffMinutes = configTime.diff(before, 'minutes').minutes;
          expect(diffMinutes).toBeGreaterThanOrEqual(4);
          expect(diffMinutes).toBeLessThanOrEqual(6);
        });

        it('should calculate dynamic config for 5m (explicit)', () => {
          // Arrange
          process.env.FAST_TEST_DELIVERY_OFFSET = '5m';
          const before = DateTime.utc();

          // Act
          const config = getDeliveryTimeConfig('BIRTHDAY');

          // Assert - config uses UTC time
          const configTime = DateTime.utc().set({
            hour: config.hour,
            minute: config.minute,
            second: config.second ?? 0,
          });
          const diffMinutes = configTime.diff(before, 'minutes').minutes;
          expect(diffMinutes).toBeGreaterThanOrEqual(4);
          expect(diffMinutes).toBeLessThanOrEqual(6);
        });

        it('should handle 1 minute (ultra-fast testing)', () => {
          // Arrange
          process.env.FAST_TEST_DELIVERY_OFFSET = '1';
          const before = DateTime.utc();

          // Act
          const config = getDeliveryTimeConfig('BIRTHDAY');

          // Assert - config uses UTC time
          const configTime = DateTime.utc().set({
            hour: config.hour,
            minute: config.minute,
            second: config.second ?? 0,
          });
          const diffMinutes = configTime.diff(before, 'minutes').minutes;
          expect(diffMinutes).toBeGreaterThanOrEqual(0);
          expect(diffMinutes).toBeLessThanOrEqual(2);
        });

        it('should handle 120 minutes (2 hours)', () => {
          // Arrange
          process.env.FAST_TEST_DELIVERY_OFFSET = '120';

          // Act
          const config = getDeliveryTimeConfig('BIRTHDAY');

          // Assert - config uses UTC time
          const expected = DateTime.utc().plus({ minutes: 120 });
          expect(config.hour).toBe(expected.hour);
          expect(config.minute).toBe(expected.minute);
        });
      });

      describe('Seconds format', () => {
        it('should handle 30 seconds', () => {
          // Arrange
          process.env.FAST_TEST_DELIVERY_OFFSET = '30s';

          // Act
          const config = getDeliveryTimeConfig('BIRTHDAY');

          // Assert - config uses UTC time
          const expected = DateTime.utc().plus({ seconds: 30 });
          expect(config.hour).toBe(expected.hour);
          expect(config.minute).toBe(expected.minute);
          expect(config.second).toBe(expected.second);
        });

        it('should handle 90s (1.5 minutes)', () => {
          // Arrange
          process.env.FAST_TEST_DELIVERY_OFFSET = '90s';

          // Act
          const config = getDeliveryTimeConfig('BIRTHDAY');

          // Assert - config uses UTC time
          const expected = DateTime.utc().plus({ seconds: 90 });
          expect(config.hour).toBe(expected.hour);
          expect(config.minute).toBe(expected.minute);
          expect(config.second).toBe(expected.second);
        });
      });

      describe('Fallback behavior (invalid formats)', () => {
        it('should fallback to default for invalid format (non-number)', () => {
          // Arrange
          process.env.FAST_TEST_DELIVERY_OFFSET = 'abc';

          // Act
          const config = getDeliveryTimeConfig('BIRTHDAY');

          // Assert - should use default (9am)
          expect(config).toEqual({ hour: 9, minute: 0 });
        });

        it('should fallback to default for zero offset', () => {
          // Arrange
          process.env.FAST_TEST_DELIVERY_OFFSET = '0';

          // Act
          const config = getDeliveryTimeConfig('BIRTHDAY');

          // Assert - should use default (9am)
          expect(config).toEqual({ hour: 9, minute: 0 });
        });

        it('should fallback to default for negative offset', () => {
          // Arrange
          process.env.FAST_TEST_DELIVERY_OFFSET = '-5';

          // Act
          const config = getDeliveryTimeConfig('BIRTHDAY');

          // Assert - should use default (9am)
          expect(config).toEqual({ hour: 9, minute: 0 });
        });

        it('should fallback to default for offset > 1440 minutes (24 hours)', () => {
          // Arrange
          process.env.FAST_TEST_DELIVERY_OFFSET = '1441';

          // Act
          const config = getDeliveryTimeConfig('BIRTHDAY');

          // Assert - should use default (9am)
          expect(config).toEqual({ hour: 9, minute: 0 });
        });

        it('should fallback to default for combined format (not supported)', () => {
          // Arrange
          process.env.FAST_TEST_DELIVERY_OFFSET = '2m30s';

          // Act
          const config = getDeliveryTimeConfig('BIRTHDAY');

          // Assert - should use default (9am)
          expect(config).toEqual({ hour: 9, minute: 0 });
        });

        it('should fallback to default for invalid suffix', () => {
          // Arrange
          process.env.FAST_TEST_DELIVERY_OFFSET = '5h';

          // Act
          const config = getDeliveryTimeConfig('BIRTHDAY');

          // Assert - should use default (9am)
          expect(config).toEqual({ hour: 9, minute: 0 });
        });
      });
    });
  });

  describe('isDeliveryTimeOverrideActive', () => {
    it('should return false when env var not set', () => {
      // Act
      const isActive = isDeliveryTimeOverrideActive();

      // Assert
      expect(isActive).toBe(false);
    });

    it('should return true when FAST_TEST_DELIVERY_OFFSET is set', () => {
      // Arrange
      process.env.FAST_TEST_DELIVERY_OFFSET = '5';

      // Act
      const isActive = isDeliveryTimeOverrideActive();

      // Assert
      expect(isActive).toBe(true);
    });
  });
});
