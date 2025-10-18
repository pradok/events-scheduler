# Date/Time Library Selection

This document analyzes date/time library options for timezone-aware birthday scheduling and explains the rationale behind choosing Luxon.

---

## Table of Contents

1. [Why This Decision Is Critical](#why-this-decision-is-critical)
2. [Requirements Analysis](#requirements-analysis)
3. [Option 1: Luxon (Recommended)](#option-1-luxon-recommended)
4. [Option 2: date-fns + date-fns-tz](#option-2-date-fns--date-fns-tz)
5. [Option 3: Day.js + timezone plugin](#option-3-dayjs--timezone-plugin)
6. [Decision: Luxon](#decision-luxon)

---

## Why This Decision Is Critical

**Timezone handling is the foundation of this entire system.** Getting this wrong means:

- ❌ Birthday messages sent at wrong times (3 AM instead of 9 AM)
- ❌ DST transitions handled incorrectly (messages missed or duplicated)
- ❌ Invalid date calculations (Feb 29 in non-leap years)
- ❌ Lost user trust and system failure

**This is not a "nice to have" - this choice makes or breaks the project.**

---

## Requirements Analysis

### Critical Requirements

From [architecture-design.md](../architecture-design.md) and [challenges.md](../challenges.md), our date/time library must:

1. **IANA Timezone Database Support**
   - Must use IANA timezone names (`America/New_York`, not `EST`)
   - Automatically handles DST transitions
   - Example: Convert "9:00 AM America/New_York" → UTC for any date

2. **Immutable Date Objects**
   - Operations return new instances (no mutation)
   - Prevents bugs from accidental date modification
   - Thread-safe for concurrent operations

3. **DST Transition Handling**
   - Correctly handles "spring forward" and "fall back"
   - No errors on non-existent times (2:30 AM during spring forward)
   - Predictable behavior for ambiguous times (1:30 AM during fall back)

4. **Date Arithmetic**
   - Add/subtract years correctly (Feb 29 → Feb 28 in non-leap year)
   - Calculate "next occurrence" (this year's birthday → next year's)
   - Handle edge cases (birthday on DST transition day)

5. **Formatting & Parsing**
   - Parse user input dates (`1990-03-15`)
   - Format for database storage (ISO 8601)
   - Format for logging and debugging

6. **Performance**
   - Fast enough for processing 100+ events per minute
   - Minimal memory overhead
   - Bundle size reasonable for serverless (Lambda)

### Use Cases in Our System

```typescript
// 1. Convert local time to UTC when creating event
const targetUTC = convertToUTC('2025-03-15', '09:00:00', 'America/New_York');
// Result: 2025-03-15T14:00:00Z (or 13:00:00Z depending on DST)

// 2. Calculate next year's birthday
const nextBirthday = calculateNextOccurrence('1990-03-15', 2025);
// Result: 2026-03-15

// 3. Validate timezone
const isValid = isValidTimezone('America/New_York'); // true
const isValid2 = isValidTimezone('EST'); // false (not IANA format)

// 4. Handle leap year birthdays
const birthday = '2000-02-29'; // Leap year birthday
const in2025 = calculateBirthdayIn(birthday, 2025);
// Result: 2025-02-28 (Feb 29 doesn't exist in 2025)

// 5. Check if date is in past
const dob = '1990-03-15';
const isPast = isInPast(dob); // true
```

---

## Option 1: Luxon (Recommended)

**Website**: https://moment.github.io/luxon/

**Built by**: Moment.js team (as Moment's successor)

### Overview

Luxon is a modern, immutable wrapper around JavaScript's native `Intl` and `Date` APIs with first-class timezone support.

### Code Examples

#### Basic Usage

```typescript
import { DateTime } from 'luxon';

// Parse date in specific timezone
const dt = DateTime.fromISO('2025-03-15T09:00:00', {
  zone: 'America/New_York'
});

// Convert to UTC
const utc = dt.toUTC();
console.log(utc.toISO()); // 2025-03-15T14:00:00.000Z (DST-dependent)

// Get timezone offset
console.log(dt.offset); // -240 (minutes from UTC)
console.log(dt.offsetNameShort); // "EDT" or "EST" depending on date
```

#### Our Core Use Cases

```typescript
// 1. Convert "9 AM local time" to UTC for storage
function calculateTargetTimestampUTC(
  dateOfBirth: string,
  year: number,
  timezone: string
): Date {
  const dt = DateTime.fromObject(
    {
      year: year,
      month: parseInt(dateOfBirth.split('-')[1]),
      day: parseInt(dateOfBirth.split('-')[2]),
      hour: 9,
      minute: 0,
      second: 0,
    },
    { zone: timezone }
  );

  return dt.toJSDate(); // Convert to native Date for Prisma
}

// Example
const target = calculateTargetTimestampUTC('1990-03-15', 2025, 'America/New_York');
// Result: Date object representing 2025-03-15T14:00:00Z (or 13:00:00Z)
```

```typescript
// 2. Validate timezone
function isValidTimezone(timezone: string): boolean {
  try {
    const dt = DateTime.local().setZone(timezone);
    return dt.isValid;
  } catch {
    return false;
  }
}

// Examples
isValidTimezone('America/New_York'); // true
isValidTimezone('Asia/Tokyo'); // true
isValidTimezone('EST'); // false (not IANA format)
isValidTimezone('Invalid/Zone'); // false
```

```typescript
// 3. Calculate next occurrence (handle leap years)
function calculateNextBirthday(dateOfBirth: string, currentYear: number): string {
  const [year, month, day] = dateOfBirth.split('-').map(Number);

  // Try to create date in target year
  let nextBirthday = DateTime.local(currentYear + 1, month, day);

  // If invalid (e.g., Feb 29 in non-leap year), use last valid day
  if (!nextBirthday.isValid) {
    nextBirthday = DateTime.local(currentYear + 1, month, day - 1);
  }

  return nextBirthday.toISODate(); // "2026-02-28" or "2026-02-29"
}

// Examples
calculateNextBirthday('2000-02-29', 2024); // "2025-02-28" (not a leap year)
calculateNextBirthday('2000-02-29', 2027); // "2028-02-29" (leap year)
calculateNextBirthday('1990-03-15', 2025); // "2026-03-15" (normal date)
```

```typescript
// 4. Handle DST transitions gracefully
function testDSTTransition() {
  // Spring forward: March 10, 2024, 2:00 AM → 3:00 AM in America/New_York
  const dt = DateTime.fromObject(
    { year: 2024, month: 3, day: 10, hour: 2, minute: 30 },
    { zone: 'America/New_York' }
  );

  console.log(dt.isValid); // true (Luxon handles this gracefully)
  console.log(dt.hour); // 3 (automatically adjusted to 3:30 AM)
  console.log(dt.toISO()); // 2024-03-10T07:30:00.000Z

  // Our use case: Birthday at 9 AM is always safe (DST happens at 2 AM)
  const birthday = DateTime.fromObject(
    { year: 2024, month: 3, day: 10, hour: 9, minute: 0 },
    { zone: 'America/New_York' }
  );
  console.log(birthday.isValid); // true (no issues at 9 AM)
}
```

### Pros

- ✅ **First-class timezone support** - Built-in IANA timezone database via `Intl`
- ✅ **Immutable** - All operations return new instances
- ✅ **Modern API** - Fluent, chainable, intuitive
- ✅ **DST handling** - Automatically handles transitions correctly
- ✅ **Small bundle size** - ~17KB minified + gzipped
- ✅ **Active maintenance** - Moment team's official successor
- ✅ **TypeScript support** - Excellent type definitions included
- ✅ **Duration arithmetic** - `plus({ years: 1 })` is clear and safe
- ✅ **Comprehensive documentation** - Well-documented with examples
- ✅ **No external dependencies** - Uses native `Intl` API

### Cons

- ⚠️ **Requires Intl API** - Works in all modern browsers and Node.js 12+
- ⚠️ **Not tree-shakeable** - Must import entire library (~70KB unminified)
- ⚠️ **Learning curve** - Different API from native Date (but better)

### Bundle Size

```
luxon: 17KB (minified + gzipped)
Total runtime: ~70KB (unminified)
```

**Acceptable for:**
- ✅ Node.js backend (size doesn't matter)
- ✅ AWS Lambda (well under 50MB limit)
- ✅ Frontend (if needed in future phases)

---

## Option 2: date-fns + date-fns-tz

**Website**: https://date-fns.org/

**Timezone addon**: https://github.com/marnusw/date-fns-tz

### Overview

date-fns is a modular, functional date utility library. Timezone support requires separate `date-fns-tz` package.

### Code Examples

```typescript
import { format, addYears, isValid } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';

// Convert local time to UTC
const localDate = new Date('2025-03-15T09:00:00');
const utcDate = zonedTimeToUtc(localDate, 'America/New_York');

// Convert UTC back to local
const backToLocal = utcToZonedTime(utcDate, 'America/New_York');

// Format dates
const formatted = format(localDate, 'yyyy-MM-dd HH:mm:ss');
```

### Our Use Case Implementation

```typescript
// 1. Convert to UTC (more verbose than Luxon)
function calculateTargetTimestampUTC(
  dateOfBirth: string,
  year: number,
  timezone: string
): Date {
  const [_, month, day] = dateOfBirth.split('-').map(Number);

  // Create date string in local timezone
  const localDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T09:00:00`;

  // Convert to UTC
  const utcDate = zonedTimeToUtc(localDateStr, timezone);

  return utcDate;
}

// ⚠️ More manual work than Luxon
```

```typescript
// 2. Timezone validation is harder
function isValidTimezone(timezone: string): boolean {
  try {
    const date = new Date();
    zonedTimeToUtc(date, timezone);
    return true;
  } catch {
    return false;
  }
}

// ⚠️ No built-in validation, relies on try/catch
```

### Pros

- ✅ **Tree-shakeable** - Import only functions you need
- ✅ **Functional style** - Pure functions, no mutation
- ✅ **Small individual functions** - Each function is ~1-2KB
- ✅ **TypeScript support** - Good type definitions
- ✅ **Wide adoption** - Popular in React ecosystem

### Cons

- ❌ **Timezone support is addon** - Separate package required
- ❌ **Less intuitive API** - More verbose than Luxon
- ❌ **Mutable Date objects** - Works with native Date (mutable)
- ❌ **No built-in timezone validation** - Must implement yourself
- ⚠️ **Two packages** - date-fns + date-fns-tz
- ⚠️ **More boilerplate** - Need helper functions for common tasks

### Bundle Size

```
date-fns: ~2-5KB per function (tree-shakeable)
date-fns-tz: ~6KB (minified + gzipped)
Typical usage: ~15-20KB total
```

**Comparison:**
- Smaller if using only a few functions
- Similar size if using many functions
- Requires two packages

---

## Option 3: Day.js + timezone plugin

**Website**: https://day.js.org/

### Overview

Day.js is a Moment.js-compatible API with a tiny bundle size. Timezone support via plugin.

### Code Examples

```typescript
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

// Convert to UTC
const dt = dayjs.tz('2025-03-15 09:00', 'America/New_York');
const utc = dt.utc();

// Timezone guess
const userTz = dayjs.tz.guess();
```

### Pros

- ✅ **Tiny bundle size** - 2KB core + 3KB timezone plugin
- ✅ **Moment.js-compatible API** - Easy migration if you know Moment
- ✅ **Plugin architecture** - Load only what you need
- ✅ **ChainableAPI** - Similar to Moment/Luxon

### Cons

- ❌ **Mutable by default** - Can modify original date objects
- ❌ **Limited timezone features** - Less comprehensive than Luxon
- ❌ **Plugin complexity** - Must remember to import and extend plugins
- ❌ **Smaller ecosystem** - Fewer resources than Luxon or date-fns
- ⚠️ **TypeScript support** - Not as robust as Luxon
- ⚠️ **Less battle-tested** - Newer library with smaller community

### Bundle Size

```
dayjs core: 2KB
timezone plugin: 3KB
Total: ~5KB (minified + gzipped)
```

**Smallest option, but with trade-offs in features and maturity.**

---

## Decision: Luxon

### Chosen Library

**Use Luxon for all date/time operations in Phase 1**

### Why Luxon Wins

#### 1. Perfect Fit for Requirements ✅

| Requirement | Luxon | date-fns | Day.js |
|-------------|-------|----------|--------|
| IANA timezones | ✅ Built-in | ✅ Via addon | ✅ Via plugin |
| Immutable | ✅ Yes | ⚠️ No (native Date) | ⚠️ Configurable |
| DST handling | ✅ Automatic | ⚠️ Manual | ⚠️ Basic |
| Timezone validation | ✅ Built-in | ❌ Manual | ⚠️ Limited |
| TypeScript | ✅ Excellent | ✅ Good | ⚠️ Fair |
| API clarity | ✅ Intuitive | ⚠️ Verbose | ✅ Good |
| Bundle size | ✅ 17KB | ✅ 15-20KB | ✅ 5KB |

#### 2. Battle-Tested for Timezone-Heavy Apps ✅

Luxon is specifically designed for apps that do heavy timezone work:
- Built by Moment.js team with lessons learned
- Used by companies with multi-timezone requirements
- Comprehensive DST handling out of the box

#### 3. Developer Experience ✅

```typescript
// Luxon - Clear and concise
const dt = DateTime.fromObject(
  { year: 2025, month: 3, day: 15, hour: 9 },
  { zone: 'America/New_York' }
).toUTC();

// vs date-fns - More verbose
const localStr = '2025-03-15T09:00:00';
const utc = zonedTimeToUtc(localStr, 'America/New_York');

// vs Day.js - Requires plugin setup
dayjs.extend(utc);
dayjs.extend(timezone);
const dt = dayjs.tz('2025-03-15 09:00', 'America/New_York').utc();
```

**Luxon's API is most readable and maintainable.**

#### 4. Immutability = Fewer Bugs ✅

```typescript
// Luxon - Immutable, safe
const dt1 = DateTime.now();
const dt2 = dt1.plus({ days: 1 });
console.log(dt1.day); // Unchanged ✅

// date-fns - Uses native Date (mutable)
const date1 = new Date();
const date2 = addDays(date1, 1);
date1.setDate(15); // Mutates original ❌ (easy mistake)
```

#### 5. Future-Proof ✅

- Active maintenance by Moment.js team
- Well-established library with long-term support
- Can be replaced via TimezoneService abstraction if needed

### Trade-offs Accepted

| Trade-off | Impact | Mitigation |
|-----------|--------|-----------|
| **Bundle size** | 17KB vs 5KB (Day.js) | Acceptable for backend; size doesn't matter in Node.js |
| **Not tree-shakeable** | Must import entire library | Small enough that this is fine |
| **Learning curve** | Different from native Date | Better API is worth learning |

### Implementation Pattern

Create a `TimezoneService` abstraction to encapsulate all Luxon usage:

```typescript
// src/services/timezone-service.ts
import { DateTime } from 'luxon';

export class TimezoneService {
  /**
   * Convert local date/time in specific timezone to UTC
   */
  convertToUTC(
    date: string,
    time: string,
    timezone: string
  ): Date {
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute, second] = time.split(':').map(Number);

    const dt = DateTime.fromObject(
      { year, month, day, hour, minute, second },
      { zone: timezone }
    );

    if (!dt.isValid) {
      throw new Error(`Invalid date/time: ${date} ${time} in ${timezone}`);
    }

    return dt.toJSDate();
  }

  /**
   * Validate IANA timezone
   */
  isValidTimezone(timezone: string): boolean {
    try {
      const dt = DateTime.local().setZone(timezone);
      return dt.isValid;
    } catch {
      return false;
    }
  }

  /**
   * Calculate next birthday occurrence
   */
  calculateNextBirthday(dateOfBirth: string, currentYear: number): string {
    const [year, month, day] = dateOfBirth.split('-').map(Number);

    let nextBirthday = DateTime.local(currentYear + 1, month, day);

    // Handle Feb 29 in non-leap years
    if (!nextBirthday.isValid) {
      nextBirthday = DateTime.local(currentYear + 1, month, day - 1);
    }

    return nextBirthday.toISODate()!;
  }

  /**
   * Check if date is in the past
   */
  isInPast(date: string): boolean {
    const dt = DateTime.fromISO(date);
    return dt < DateTime.now();
  }
}
```

**Benefits:**
- All Luxon usage centralized in one service
- Easy to mock for testing
- Easy to swap library later if needed (repository pattern)
- Domain layer doesn't depend on Luxon directly

---

## Installation

```bash
npm install luxon
npm install --save-dev @types/luxon
```

## Usage Guidelines

### DO ✅

```typescript
// DO: Use DateTime for all date operations
const dt = DateTime.fromISO('2025-03-15');

// DO: Store as UTC in database
const utc = dt.toUTC();

// DO: Use setZone for timezone conversion
const nyTime = utc.setZone('America/New_York');

// DO: Use toJSDate() when passing to Prisma
const jsDate = dt.toJSDate();
```

### DON'T ❌

```typescript
// DON'T: Mix native Date and Luxon
const badMix = new Date(); // ❌ Use DateTime.now()

// DON'T: Hard-code timezone offsets
const offset = -5; // ❌ Use IANA timezone names

// DON'T: Mutate DateTime objects (they're immutable anyway)
dt.day = 15; // ❌ This won't work (immutable)
```

---

## Testing Strategy

### Mock TimezoneService in Tests

```typescript
// tests/mocks/timezone-service.mock.ts
export const mockTimezoneService = {
  convertToUTC: jest.fn(),
  isValidTimezone: jest.fn(),
  calculateNextBirthday: jest.fn(),
  isInPast: jest.fn(),
};

// In tests
import { mockTimezoneService } from './mocks/timezone-service.mock';

test('creates birthday event with correct UTC time', () => {
  mockTimezoneService.convertToUTC.mockReturnValue(
    new Date('2025-03-15T14:00:00Z')
  );

  const event = eventFactory.create(user);

  expect(event.targetTimestampUTC).toEqual(
    new Date('2025-03-15T14:00:00Z')
  );
});
```

### Test Actual Timezone Conversions

```typescript
// tests/integration/timezone-service.test.ts
import { TimezoneService } from '../services/timezone-service';

describe('TimezoneService', () => {
  const service = new TimezoneService();

  test('converts NY 9am to UTC correctly in summer', () => {
    const utc = service.convertToUTC('2025-06-15', '09:00:00', 'America/New_York');
    expect(utc.toISOString()).toBe('2025-06-15T13:00:00.000Z'); // EDT (UTC-4)
  });

  test('converts NY 9am to UTC correctly in winter', () => {
    const utc = service.convertToUTC('2025-12-15', '09:00:00', 'America/New_York');
    expect(utc.toISOString()).toBe('2025-12-15T14:00:00.000Z'); // EST (UTC-5)
  });

  test('handles leap year birthday', () => {
    const next = service.calculateNextBirthday('2000-02-29', 2024);
    expect(next).toBe('2025-02-28'); // 2025 is not a leap year
  });

  test('validates IANA timezones', () => {
    expect(service.isValidTimezone('America/New_York')).toBe(true);
    expect(service.isValidTimezone('Asia/Tokyo')).toBe(true);
    expect(service.isValidTimezone('EST')).toBe(false);
    expect(service.isValidTimezone('Invalid/Zone')).toBe(false);
  });
});
```

---

## Comparison Summary

| Aspect | Luxon | date-fns + tz | Day.js + tz |
|--------|-------|---------------|-------------|
| **Bundle size** | 17KB | 15-20KB | 5KB |
| **Timezone support** | ✅ Built-in | ⚠️ Addon | ⚠️ Plugin |
| **Immutability** | ✅ Yes | ❌ No | ⚠️ Optional |
| **DST handling** | ✅ Automatic | ⚠️ Manual | ⚠️ Basic |
| **TypeScript** | ✅ Excellent | ✅ Good | ⚠️ Fair |
| **API clarity** | ✅ Intuitive | ⚠️ Verbose | ✅ Good |
| **Maintenance** | ✅ Active | ✅ Active | ✅ Active |
| **Learning curve** | ⚠️ Medium | ⚠️ Low | ⚠️ Low |
| **Phase 1 ready?** | ✅ Yes | ⚠️ Yes | ⚠️ Yes |

---

## References

- [Luxon Documentation](https://moment.github.io/luxon/)
- [date-fns Documentation](https://date-fns.org/)
- [Day.js Documentation](https://day.js.org/)
- [IANA Timezone Database](https://www.iana.org/time-zones)

---

**Decision Date:** 2025-10-18

**Status:** ✅ Approved for Phase 1 Implementation

**Next Review:** After Phase 1 completion if performance or bundle size becomes an issue
