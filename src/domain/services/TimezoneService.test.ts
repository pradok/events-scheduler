import { DateTime } from 'luxon';
import { TimezoneService } from './TimezoneService';
import { Timezone } from '../value-objects/Timezone';

describe('TimezoneService', () => {
  let service: TimezoneService;

  beforeEach(() => {
    service = new TimezoneService();
  });

  describe('convertToUTC', () => {
    describe('Basic Conversion', () => {
      it('should convert local timestamp to UTC in America/New_York (EST)', () => {
        // Arrange
        const timezone = new Timezone('America/New_York');
        // January is EST (UTC-5)
        const localTime = DateTime.fromObject(
          {
            year: 2025,
            month: 1,
            day: 15,
            hour: 9,
            minute: 0,
            second: 0,
          },
          { zone: 'America/New_York' }
        );

        // Act
        const utcTime = service.convertToUTC(localTime, timezone);

        // Assert
        expect(utcTime.zoneName).toBe('UTC');
        expect(utcTime.hour).toBe(14); // 9 AM EST = 2 PM UTC
        expect(utcTime.toISODate()).toBe('2025-01-15');
      });

      it('should convert local timestamp to UTC in Europe/London (GMT)', () => {
        // Arrange
        const timezone = new Timezone('Europe/London');
        // January is GMT (UTC+0)
        const localTime = DateTime.fromObject(
          {
            year: 2025,
            month: 1,
            day: 15,
            hour: 9,
            minute: 0,
            second: 0,
          },
          { zone: 'Europe/London' }
        );

        // Act
        const utcTime = service.convertToUTC(localTime, timezone);

        // Assert
        expect(utcTime.zoneName).toBe('UTC');
        expect(utcTime.hour).toBe(9); // 9 AM GMT = 9 AM UTC
        expect(utcTime.toISODate()).toBe('2025-01-15');
      });

      it('should convert local timestamp to UTC in Asia/Tokyo (JST)', () => {
        // Arrange
        const timezone = new Timezone('Asia/Tokyo');
        // Tokyo is always JST (UTC+9, no DST)
        const localTime = DateTime.fromObject(
          {
            year: 2025,
            month: 1,
            day: 15,
            hour: 9,
            minute: 0,
            second: 0,
          },
          { zone: 'Asia/Tokyo' }
        );

        // Act
        const utcTime = service.convertToUTC(localTime, timezone);

        // Assert
        expect(utcTime.zoneName).toBe('UTC');
        expect(utcTime.hour).toBe(0); // 9 AM JST = 0 AM UTC (midnight)
        expect(utcTime.toISODate()).toBe('2025-01-15');
      });

      it('should convert local timestamp to UTC in Australia/Sydney (AEDT)', () => {
        // Arrange
        const timezone = new Timezone('Australia/Sydney');
        // January is summer in Sydney (AEDT, UTC+11)
        const localTime = DateTime.fromObject(
          {
            year: 2025,
            month: 1,
            day: 15,
            hour: 9,
            minute: 0,
            second: 0,
          },
          { zone: 'Australia/Sydney' }
        );

        // Act
        const utcTime = service.convertToUTC(localTime, timezone);

        // Assert
        expect(utcTime.zoneName).toBe('UTC');
        expect(utcTime.hour).toBe(22); // 9 AM AEDT = 10 PM UTC (previous day)
        expect(utcTime.toISODate()).toBe('2025-01-14'); // Day before in UTC
      });
    });

    describe('DST Transitions', () => {
      it('should convert correctly during DST (summer) in America/New_York', () => {
        // Arrange
        const timezone = new Timezone('America/New_York');
        // July is EDT (UTC-4)
        const localTime = DateTime.fromObject(
          {
            year: 2024,
            month: 7,
            day: 15,
            hour: 9,
            minute: 0,
            second: 0,
          },
          { zone: 'America/New_York' }
        );

        // Act
        const utcTime = service.convertToUTC(localTime, timezone);

        // Assert
        expect(utcTime.zoneName).toBe('UTC');
        expect(utcTime.hour).toBe(13); // 9 AM EDT = 1 PM UTC
        expect(utcTime.toISODate()).toBe('2024-07-15');
      });

      it('should convert correctly during non-DST (winter) in America/New_York', () => {
        // Arrange
        const timezone = new Timezone('America/New_York');
        // December is EST (UTC-5)
        const localTime = DateTime.fromObject(
          {
            year: 2024,
            month: 12,
            day: 15,
            hour: 9,
            minute: 0,
            second: 0,
          },
          { zone: 'America/New_York' }
        );

        // Act
        const utcTime = service.convertToUTC(localTime, timezone);

        // Assert
        expect(utcTime.zoneName).toBe('UTC');
        expect(utcTime.hour).toBe(14); // 9 AM EST = 2 PM UTC
        expect(utcTime.toISODate()).toBe('2024-12-15');
      });

      it('should handle spring forward DST transition in Europe/London', () => {
        // Arrange
        const timezone = new Timezone('Europe/London');
        // March 31, 2024 is the spring forward day in London
        const localTime = DateTime.fromObject(
          {
            year: 2024,
            month: 3,
            day: 31,
            hour: 9,
            minute: 0,
            second: 0,
          },
          { zone: 'Europe/London' }
        );

        // Act
        const utcTime = service.convertToUTC(localTime, timezone);

        // Assert
        expect(utcTime.zoneName).toBe('UTC');
        // After spring forward, London is BST (UTC+1)
        expect(utcTime.hour).toBe(8); // 9 AM BST = 8 AM UTC
      });
    });

    describe('Error Handling', () => {
      it('should throw error for invalid timestamp', () => {
        // Arrange
        const timezone = new Timezone('America/New_York');
        const invalidTime = DateTime.invalid('test invalid');

        // Act & Assert
        expect(() => {
          service.convertToUTC(invalidTime, timezone);
        }).toThrow('Invalid timestamp provided');
      });
    });

    describe('Moment Preservation', () => {
      it('should preserve the exact moment in time across timezone conversions', () => {
        // Arrange
        const timezone = new Timezone('America/New_York');
        const localTime = DateTime.fromObject(
          {
            year: 2025,
            month: 1,
            day: 15,
            hour: 9,
            minute: 0,
            second: 0,
          },
          { zone: 'America/New_York' }
        );

        // Act
        const utcTime = service.convertToUTC(localTime, timezone);

        // Assert - Convert back and verify it's the same moment
        const backToLocal = utcTime.setZone('America/New_York');
        expect(backToLocal.hour).toBe(9);
        expect(backToLocal.toISODate()).toBe('2025-01-15');
        // Verify Unix timestamp is the same
        expect(utcTime.toMillis()).toBe(localTime.toMillis());
      });
    });
  });

  describe('convertToLocalTime', () => {
    it('should convert UTC to local time in America/New_York', () => {
      // Arrange
      const timezone = new Timezone('America/New_York');
      const utcTime = DateTime.fromObject(
        {
          year: 2025,
          month: 1,
          day: 15,
          hour: 14,
          minute: 0,
          second: 0,
        },
        { zone: 'UTC' }
      );

      // Act
      const localTime = service.convertToLocalTime(utcTime, timezone);

      // Assert
      expect(localTime.zoneName).toBe('America/New_York');
      expect(localTime.hour).toBe(9); // 2 PM UTC = 9 AM EST
      expect(localTime.toISODate()).toBe('2025-01-15');
    });

    it('should convert UTC to local time in Asia/Tokyo', () => {
      // Arrange
      const timezone = new Timezone('Asia/Tokyo');
      const utcTime = DateTime.fromObject(
        {
          year: 2025,
          month: 1,
          day: 15,
          hour: 0,
          minute: 0,
          second: 0,
        },
        { zone: 'UTC' }
      );

      // Act
      const localTime = service.convertToLocalTime(utcTime, timezone);

      // Assert
      expect(localTime.zoneName).toBe('Asia/Tokyo');
      expect(localTime.hour).toBe(9); // 0 AM UTC = 9 AM JST
      expect(localTime.toISODate()).toBe('2025-01-15');
    });

    it('should handle DST transitions when converting to local time', () => {
      // Arrange
      const timezone = new Timezone('America/New_York');
      // UTC time during EDT period
      const utcTime = DateTime.fromObject(
        {
          year: 2024,
          month: 7,
          day: 15,
          hour: 13,
          minute: 0,
          second: 0,
        },
        { zone: 'UTC' }
      );

      // Act
      const localTime = service.convertToLocalTime(utcTime, timezone);

      // Assert
      expect(localTime.zoneName).toBe('America/New_York');
      expect(localTime.hour).toBe(9); // 1 PM UTC = 9 AM EDT
    });

    it('should throw error for invalid UTC timestamp', () => {
      // Arrange
      const timezone = new Timezone('America/New_York');
      const invalidTime = DateTime.invalid('test invalid');

      // Act & Assert
      expect(() => {
        service.convertToLocalTime(invalidTime, timezone);
      }).toThrow('Invalid timestamp provided');
    });

    it('should preserve the exact moment when converting to local time', () => {
      // Arrange
      const timezone = new Timezone('Europe/London');
      const utcTime = DateTime.fromObject(
        {
          year: 2025,
          month: 1,
          day: 15,
          hour: 9,
          minute: 0,
          second: 0,
        },
        { zone: 'UTC' }
      );

      // Act
      const localTime = service.convertToLocalTime(utcTime, timezone);

      // Assert - Unix timestamp should be identical
      expect(localTime.toMillis()).toBe(utcTime.toMillis());
    });
  });

  describe('Domain Layer Purity', () => {
    it('should be instantiable without dependencies', () => {
      // Arrange & Act
      const newService = new TimezoneService();

      // Assert
      expect(newService).toBeInstanceOf(TimezoneService);
    });

    it('should have pure methods with no side effects', () => {
      // Arrange
      const timezone = new Timezone('America/New_York');
      const timestamp = DateTime.fromObject(
        {
          year: 2025,
          month: 1,
          day: 15,
          hour: 9,
          minute: 0,
          second: 0,
        },
        { zone: 'America/New_York' }
      );

      // Act - Call method multiple times
      const result1 = service.convertToUTC(timestamp, timezone);
      const result2 = service.convertToUTC(timestamp, timezone);

      // Assert - Same inputs should produce same outputs (deterministic)
      expect(result1.toMillis()).toBe(result2.toMillis());
      expect(result1.toISO()).toBe(result2.toISO());
    });
  });
});
