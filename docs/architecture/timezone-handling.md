# Timezone Handling in Event Scheduling

## Table of Contents
1. [Introduction: Why Timezones Are Tricky](#introduction-why-timezones-are-tricky)
2. [The Two-Timestamp Approach](#the-two-timestamp-approach)
3. [Normal Production Flow: 9 AM Birthday Delivery](#normal-production-flow-9-am-birthday-delivery)
4. [Fast Test Offset: How It Works](#fast-test-offset-how-it-works)
5. [Why Fast Test Offset Requires UTC](#why-fast-test-offset-requires-utc)
6. [Common Pitfalls and How We Avoid Them](#common-pitfalls-and-how-we-avoid-them)

---

## Introduction: Why Timezones Are Tricky

### The Problem

Imagine you have users in different cities:
- **Alice** in New York (EST/EDT, UTC-5/-4)
- **Bob** in Tokyo (JST, UTC+9)
- **Charlie** in London (GMT/BST, UTC+0/+1)

All three want birthday messages at **9:00 AM local time**. But:
- When it's 9 AM in New York, it's 11 PM in Tokyo (same day) and 2 PM in London
- When it's 9 AM in Tokyo, it's 7 PM in New York (previous day) and midnight in London
- When it's 9 AM in London, it's 4 AM in New York and 6 PM in Tokyo

**The Challenge:** Our scheduler runs in UTC. How do we schedule events so everyone gets their message at 9 AM *their* time?

### Our Solution: Three-Field Storage

We store **three** pieces of timezone information for each event:

1. **`targetTimestampUTC`** - When the scheduler should fire (in UTC)
2. **`targetTimestampLocal`** - What time it is in the user's timezone (for display/audit)
3. **`targetTimezone`** - The user's IANA timezone name (e.g., "America/New_York")

This lets us:
- Schedule globally using UTC (no ambiguity)
- Show users when events will fire in their local time
- Handle timezone changes and DST transitions

---

## The Two-Timestamp Approach

### Code Reference

See: [Event.ts:16-18](../src/modules/event-scheduling/domain/entities/Event.ts#L16-L18)

```typescript
export class Event {
  public readonly targetTimestampUTC: DateTime;    // UTC for scheduling
  public readonly targetTimestampLocal: DateTime;  // Local for display
  public readonly targetTimezone: string;          // IANA timezone
  // ... other fields
}
```

### Database Storage

Both timestamps are stored in PostgreSQL as `TIMESTAMP WITH TIME ZONE`:

```sql
-- Example row for Alice in New York
target_timestamp_utc:    2026-01-15 14:00:00+00  -- 2 PM UTC
target_timestamp_local:  2026-01-15 09:00:00-05  -- 9 AM EST (UTC-5 in winter)
target_timezone:         America/New_York

-- Example row for Bob in Tokyo
target_timestamp_utc:    2026-01-15 00:00:00+00  -- Midnight UTC
target_timestamp_local:  2026-01-15 09:00:00+09  -- 9 AM JST (UTC+9)
target_timezone:         Asia/Tokyo
```

### Why Both Timestamps?

| Field | Purpose | Example Use |
|-------|---------|-------------|
| `targetTimestampUTC` | **Scheduling** - Scheduler queries: `WHERE targetTimestampUTC <= NOW()` | Efficiently find all events ready to fire globally |
| `targetTimestampLocal` | **Display/Audit** - Show user when event fires in their time | "Your birthday message will be sent at 9:00 AM EST" |
| `targetTimezone` | **Context** - Know which timezone the local time is in | Handle DST transitions, reschedule on timezone change |

---

## Normal Production Flow: 9 AM Birthday Delivery

This is how the system works in production with **no environment variable overrides**.

### Configuration

**Hardcoded Default:**
- File: [event-delivery-times.ts:47-52](../src/modules/event-scheduling/config/event-delivery-times.ts#L47-L52)
- Value: `{ hour: 9, minute: 0 }` (9:00 AM)
- **Important:** These are "semantic" values with NO timezone! They mean "9 o'clock wherever the user is."

### Example: Alice in New York

**User Details:**
- Name: Alice
- Birthday: January 15, 1990
- Timezone: America/New_York (EST in winter, EDT in summer)
- Current Date: October 27, 2025, 3:00 PM EDT

**Step 1: Get Config**

```typescript
const config = getDeliveryTimeConfig('BIRTHDAY');
// Returns: { hour: 9, minute: 0 }
// No FAST_TEST_DELIVERY_OFFSET set, so uses hardcoded default
```

**Step 2: Calculate Next Birthday in User's Local Timezone**

```typescript
const userInfo = {
  dateOfBirth: '1990-01-15',
  timezone: 'America/New_York'
};

// Current time in user's timezone
const refInZone = DateTime.now().setZone('America/New_York');
// Result: 2025-10-27T15:00:00-04:00 (3 PM EDT)

// Try birthday this year (2025)
let nextBirthday = refInZone.set({
  year: 2025,
  month: 1,   // January
  day: 15,
  hour: 9,    // From config - means 9 AM in America/New_York
  minute: 0,
  second: 0
});
// Result: 2025-01-15T09:00:00-05:00 (9 AM EST)
// Note: -05:00 because January is in winter (EST = UTC-5)

// Check: Has this passed?
// January 15, 2025 < October 27, 2025 → YES!

// Move to next year
nextBirthday = refInZone.set({
  year: 2026,
  month: 1,
  day: 15,
  hour: 9,
  minute: 0,
  second: 0
});
// Result: 2026-01-15T09:00:00-05:00 (9 AM EST)
```

**Step 3: Convert to UTC**

```typescript
const nextBirthdayLocal = DateTime.fromISO('2026-01-15T09:00:00-05:00');
// This is 9 AM EST

const nextBirthdayUTC = timezoneService.convertToUTC(nextBirthdayLocal);
// Result: 2026-01-15T14:00:00Z (2 PM UTC)

// Why 2 PM UTC?
// EST is UTC-5, so to convert:
// 9 AM EST + 5 hours = 2 PM UTC (14:00)
```

**Step 4: Store Both Timestamps**

```typescript
const event = new Event({
  targetTimestampUTC: DateTime.fromISO('2026-01-15T14:00:00Z'),
  targetTimestampLocal: DateTime.fromISO('2026-01-15T09:00:00-05:00'),
  targetTimezone: 'America/New_York',
  // ... other fields
});
```

**Step 5: Scheduler Picks It Up**

```typescript
// Scheduler runs every minute on January 15, 2026

// At 2025-01-15 13:59 UTC (8:59 AM EST):
SELECT * FROM events WHERE target_timestamp_utc <= NOW();
// Returns nothing - event not ready yet

// At 2025-01-15 14:00 UTC (9:00 AM EST):
SELECT * FROM events WHERE target_timestamp_utc <= NOW();
// Returns Alice's event! ✅
// NOW() = 14:00 UTC >= targetTimestampUTC (14:00 UTC)
```

### Example: Bob in Tokyo (Same 9 AM, Different UTC)

**User Details:**
- Name: Bob
- Birthday: January 15, 1985
- Timezone: Asia/Tokyo (JST, UTC+9, no DST)
- Current Date: October 27, 2025

**Key Differences:**

```typescript
// Step 2: Calculate in Bob's timezone
const refInZone = DateTime.now().setZone('Asia/Tokyo');

const nextBirthday = refInZone.set({
  year: 2026,
  month: 1,
  day: 15,
  hour: 9,    // 9 AM in Tokyo!
  minute: 0,
  second: 0
});
// Result: 2026-01-15T09:00:00+09:00 (9 AM JST)

// Step 3: Convert to UTC
const nextBirthdayUTC = timezoneService.convertToUTC(nextBirthday);
// Result: 2026-01-15T00:00:00Z (Midnight UTC)

// Why midnight UTC?
// JST is UTC+9, so to convert:
// 9 AM JST - 9 hours = Midnight UTC (00:00)

// Step 4: Storage
targetTimestampUTC:   2026-01-15T00:00:00Z      // Midnight UTC
targetTimestampLocal: 2026-01-15T09:00:00+09:00 // 9 AM JST
targetTimezone:       Asia/Tokyo
```

**The Beautiful Part:**
- Alice gets her message at **9 AM EST** (14:00 UTC)
- Bob gets his message at **9 AM JST** (00:00 UTC)
- Same config `{ hour: 9, minute: 0 }`, but fires at **different UTC times**!
- The scheduler doesn't care - it just checks `targetTimestampUTC <= NOW()`

### Visual Timeline: Normal 9 AM Production

```
Alice (New York, EST/UTC-5):
┌─────────────────────────────────────────────────────────────┐
│ Oct 27, 2025          →          Jan 15, 2026               │
│ 3:00 PM EDT                      9:00 AM EST                │
│ (Event Created)                  (Event Fires)              │
│                                                              │
│ Local Time:  2025-10-27T15:00:00-04:00  → 2026-01-15T09:00:00-05:00
│ UTC Time:    2025-10-27T19:00:00Z       → 2026-01-15T14:00:00Z
└─────────────────────────────────────────────────────────────┘
         80 days wait

Bob (Tokyo, JST/UTC+9):
┌─────────────────────────────────────────────────────────────┐
│ Oct 28, 2025          →          Jan 15, 2026               │
│ 4:00 AM JST                      9:00 AM JST                │
│ (Event Created)                  (Event Fires)              │
│                                                              │
│ Local Time:  2025-10-28T04:00:00+09:00  → 2026-01-15T09:00:00+09:00
│ UTC Time:    2025-10-27T19:00:00Z       → 2026-01-15T00:00:00Z
└─────────────────────────────────────────────────────────────┘
         80 days wait

Scheduler (UTC):
┌─────────────────────────────────────────────────────────────┐
│ Checks every minute: WHERE target_timestamp_utc <= NOW()    │
│                                                              │
│ On 2026-01-15T00:00:00Z → Claims Bob's event                │
│ On 2026-01-15T14:00:00Z → Claims Alice's event              │
└─────────────────────────────────────────────────────────────┘
```

---

## Fast Test Offset: How It Works

**Purpose:** Speed up testing by scheduling events seconds/minutes in the future instead of days/months.

**Environment Variable:** `FAST_TEST_DELIVERY_OFFSET`

### Supported Formats

```bash
FAST_TEST_DELIVERY_OFFSET=5     # 5 minutes from now
FAST_TEST_DELIVERY_OFFSET=5m    # 5 minutes (explicit)
FAST_TEST_DELIVERY_OFFSET=30s   # 30 seconds from now
FAST_TEST_DELIVERY_OFFSET=2m    # 2 minutes from now
```

### How Config is Calculated

**File:** [delivery-time-config.ts:87-109](../src/modules/event-scheduling/config/delivery-time-config.ts#L87-L109)

```typescript
export function getDeliveryTimeConfig(eventType: 'BIRTHDAY'): EventDeliveryTimeConfig {
  const testOffset = process.env.FAST_TEST_DELIVERY_OFFSET;

  if (testOffset) {
    // Parse "5s" → 0.0833 minutes (5/60)
    // Parse "5m" → 5 minutes
    const offsetMinutes = parseTestOffset(testOffset);

    if (offsetMinutes !== null) {
      // Calculate target time in UTC
      const targetTime = DateTime.utc().plus({ minutes: offsetMinutes });

      return {
        hour: targetTime.hour,      // Hour in UTC!
        minute: targetTime.minute,  // Minute in UTC!
        second: targetTime.second,  // Second in UTC!
      };
    }
  }

  // No override or invalid → use default
  return { hour: 9, minute: 0 }; // Normal 9 AM
}
```

### Example: FAST_TEST_DELIVERY_OFFSET=5s

**Scenario:**
- Current UTC time: 2025-10-27T13:25:42Z (1:25:42 PM UTC)
- Offset: 5 seconds
- User: Test user with birthday TODAY

**Step 1: Calculate Config**

```typescript
const now = DateTime.utc();
// Result: 2025-10-27T13:25:42Z

const targetTime = now.plus({ seconds: 5 });
// Result: 2025-10-27T13:25:47Z (5 seconds later)

const config = {
  hour: 13,    // 1 PM (in UTC)
  minute: 25,  // 25 minutes
  second: 47   // 47 seconds
};
```

**Step 2: Calculate Next Birthday in User's Timezone**

```typescript
// CRITICAL: User must be in UTC timezone!
const userInfo = {
  dateOfBirth: '2025-10-27',  // Birthday is TODAY
  timezone: 'UTC'             // Must match config calculation!
};

const refInZone = DateTime.now().setZone('UTC');
// Result: 2025-10-27T13:25:42Z

const nextBirthday = refInZone.set({
  year: 2025,
  month: 10,
  day: 27,
  hour: 13,    // From config - means 13:00 in UTC
  minute: 25,  // From config - means :25 in UTC
  second: 47   // From config - means :47 in UTC
});
// Result: 2025-10-27T13:25:47Z (same as targetTime!)
```

**Step 3: Convert to UTC**

```typescript
const nextBirthdayLocal = DateTime.fromISO('2025-10-27T13:25:47Z');
// Already in UTC!

const nextBirthdayUTC = timezoneService.convertToUTC(nextBirthdayLocal);
// Result: 2025-10-27T13:25:47Z (no conversion needed)
```

**Step 4: Storage**

```typescript
const event = new Event({
  targetTimestampUTC:   DateTime.fromISO('2025-10-27T13:25:47Z'),
  targetTimestampLocal: DateTime.fromISO('2025-10-27T13:25:47Z'),
  targetTimezone:       'UTC',
  // ... other fields
});
```

**Step 5: Scheduler Picks It Up (Within 5-65 Seconds)**

```typescript
// At 13:25:42 UTC (now):
SELECT * FROM events WHERE target_timestamp_utc <= NOW();
// Returns nothing - event scheduled for 13:25:47

// At 13:25:47 UTC (5 seconds later):
SELECT * FROM events WHERE target_timestamp_utc <= NOW();
// Still nothing - scheduler hasn't run yet

// At 13:26:00 UTC (next scheduler run, 18 seconds later):
SELECT * FROM events WHERE target_timestamp_utc <= NOW();
// Returns event! ✅
// NOW() = 13:26:00 >= targetTimestampUTC (13:25:47)
```

### Visual Timeline: FAST_TEST_DELIVERY_OFFSET=5s

```
UTC Timeline:
┌─────────────────────────────────────────────────────────────┐
│ 13:25:42           13:25:47           13:26:00              │
│ (Event Created)    (Target Time)      (Scheduler Runs)      │
│     │                  │                   │                 │
│     │◄─── 5 sec ──────►│◄─── 13 sec ──────►│                │
│     │                  │                   │                 │
│     │                  │              [Event Claimed]        │
│                        │                                     │
│        targetTimestampUTC = 13:25:47                        │
└─────────────────────────────────────────────────────────────┘

User Timeline (UTC timezone):
┌─────────────────────────────────────────────────────────────┐
│ User timezone:        UTC                                    │
│ User birthday:        2025-10-27 (TODAY)                    │
│                                                              │
│ targetTimestampLocal: 2025-10-27T13:25:47Z                  │
│ targetTimezone:       UTC                                    │
└─────────────────────────────────────────────────────────────┘

Total Wait Time: 5-65 seconds
- Minimum: 5 seconds (if scheduler runs exactly at target time)
- Maximum: 65 seconds (5 sec offset + up to 60 sec for next scheduler run)
```

### Example: FAST_TEST_DELIVERY_OFFSET=2m (2 Minutes)

```typescript
// Current UTC time: 13:25:42

const targetTime = DateTime.utc().plus({ minutes: 2 });
// Result: 13:27:42 (2 minutes later)

const config = {
  hour: 13,    // 1 PM UTC
  minute: 27,  // 27 minutes
  second: 42   // 42 seconds
};

// User's birthday (TODAY in UTC)
const nextBirthday = refInZone.set({
  year: 2025,
  month: 10,
  day: 27,
  hour: 13,    // 1:27:42 PM UTC
  minute: 27,
  second: 42
});

// Timeline:
// 13:25:42 - Event created
// 13:27:42 - Target time
// 13:28:00 - Scheduler runs, claims event (120 + 18 = 138 seconds total wait)
```

---

## Why Fast Test Offset Requires UTC

This is the **most confusing part** for beginners. Let me explain step by step.

### The Core Issue: Config Values Have No Timezone

The config returns:
```typescript
{ hour: 13, minute: 25, second: 47 }
```

These are **just numbers**. They don't say "13:25:47 UTC" or "13:25:47 EST" - they're timezone-agnostic.

### How Config Values Get Interpreted

The `BirthdayEventHandler` applies these values to a DateTime **in the user's timezone**:

```typescript
const refInZone = referenceDate.setZone(userInfo.timezone);

const nextBirthday = refInZone.set({
  hour: config.hour,    // Applied in user's timezone!
  minute: config.minute,
  second: config.second
});
```

**This is where the magic (and confusion) happens!**

### Case 1: User in UTC (Correct for Fast Test)

```typescript
// System time: 2025-10-27T13:25:42Z (Sydney is actually UTC+11, but let's say config calculated in UTC)
// Config calculated: DateTime.utc().plus({ seconds: 5 })
// Config: { hour: 13, minute: 25, second: 47 } (in UTC)

// User timezone: UTC
const refInZone = DateTime.now().setZone('UTC');
// Result: 2025-10-27T13:25:42Z (same as UTC time)

const nextBirthday = refInZone.set({
  hour: 13,    // 13:00 in UTC
  minute: 25,  // :25 in UTC
  second: 47   // :47 in UTC
});
// Result: 2025-10-27T13:25:47Z

// Difference from now: 5 seconds ✅ CORRECT!
```

### Case 2: User in America/New_York (WRONG for Fast Test)

```typescript
// System time: 2025-10-27T13:25:42Z (UTC)
// Config calculated: DateTime.utc().plus({ seconds: 5 })
// Config: { hour: 13, minute: 25, second: 47 } (in UTC)

// User timezone: America/New_York (EDT = UTC-4)
const refInZone = DateTime.now().setZone('America/New_York');
// Result: 2025-10-27T09:25:42-04:00 (4 hours behind UTC)

const nextBirthday = refInZone.set({
  hour: 13,    // 13:00 in EDT (NOT UTC!)
  minute: 25,  // :25 in EDT
  second: 47   // :47 in EDT
});
// Result: 2025-10-27T13:25:47-04:00 (1:25:47 PM EDT)

// Convert to UTC for comparison
const nextBirthdayUTC = timezoneService.convertToUTC(nextBirthday);
// Result: 2025-10-27T17:25:47Z (5:25:47 PM UTC)

// Current UTC time: 13:25:42
// Target UTC time:  17:25:47
// Difference: 4 hours and 5 seconds! ❌ WRONG!
```

### Why the Mismatch Happens

```
Config Calculation (UTC):
    DateTime.utc() → 13:25:42 UTC
    .plus({ seconds: 5 }) → 13:25:47 UTC
    Extract values → { hour: 13, minute: 25, second: 47 }
    ↓
    These values represent "13:25:47 in UTC timezone"

User in EDT (UTC-4):
    DateTime.now().setZone('America/New_York') → 09:25:42 EDT
    .set({ hour: 13, minute: 25, second: 47 }) → 13:25:47 EDT
    ↓
    These values interpreted as "13:25:47 in EDT timezone"

Conversion to UTC:
    13:25:47 EDT = 17:25:47 UTC (add 4 hours)

Result:
    Config meant:     13:25:47 UTC (5 seconds from now)
    Event scheduled:  17:25:47 UTC (4 hours 5 seconds from now)

    Mismatch: 4 hours! (the timezone offset difference)
```

### The Solution: Both Must Use UTC

**For FAST_TEST_DELIVERY_OFFSET to work correctly:**

1. **Config calculation** uses UTC: `DateTime.utc().plus({ seconds: 5 })`
2. **User timezone** must be UTC: `timezone: 'UTC'`
3. **Birthday handler** applies values in UTC: `.setZone('UTC').set({ hour: 13, ... })`
4. **Result:** Both config and user speak the same "timezone language"

```typescript
// Config in UTC
const config = DateTime.utc().plus({ seconds: 5 });
// { hour: 13, minute: 25, second: 47 } means "13:25:47 UTC"

// User in UTC
const user = { timezone: 'UTC' };
const refInZone = DateTime.now().setZone('UTC');
const nextBirthday = refInZone.set({ hour: 13, minute: 25, second: 47 });
// Result: 13:25:47 UTC (SAME meaning as config!)

// 5 seconds wait ✅
```

### Why Normal 9 AM Doesn't Have This Problem

```typescript
// Config: { hour: 9, minute: 0 }
// This DOESN'T mean "9:00 UTC" - it means "9:00 wherever the user is"

// User in New York (EDT)
const nextBirthday = refInZone.setZone('America/New_York').set({ hour: 9, minute: 0 });
// Result: 09:00:00 EDT → 13:00:00 UTC ✅

// User in Tokyo (JST)
const nextBirthday = refInZone.setZone('Asia/Tokyo').set({ hour: 9, minute: 0 });
// Result: 09:00:00 JST → 00:00:00 UTC ✅

// User in London (GMT)
const nextBirthday = refInZone.setZone('Europe/London').set({ hour: 9, minute: 0 });
// Result: 09:00:00 GMT → 09:00:00 UTC ✅
```

**The config values are timezone-agnostic** - they work for any user timezone because they're meant to represent "9 AM local time."

But `FAST_TEST_DELIVERY_OFFSET` calculates "now + 5 seconds" which is a **specific moment in time** (in UTC), so user must also be in UTC for the values to align.

---

## Common Pitfalls and How We Avoid Them

### Pitfall 1: Using System Timezone for Config Calculation

**Wrong:**
```typescript
const targetTime = DateTime.now().plus({ seconds: 5 });
// Uses system timezone (e.g., Australia/Sydney = UTC+11)
```

**Why it's wrong:**
- If system is in Sydney (UTC+11) at 11:00 PM, `DateTime.now()` returns 23:00+11:00
- Adding 5 seconds gives 23:00:05+11:00
- Config: `{ hour: 23, minute: 0, second: 5 }`
- User in UTC interprets this as 23:00:05 UTC (11 PM UTC)
- That's 11 hours LATER than intended!

**Correct:**
```typescript
const targetTime = DateTime.utc().plus({ seconds: 5 });
// Always uses UTC, regardless of system timezone
```

### Pitfall 2: Using Local Timezone for Test Users

**Wrong:**
```typescript
const user = {
  timezone: 'America/New_York',  // Local timezone
  dateOfBirth: '2025-10-27'
};
```

**Why it's wrong:**
- Config calculated in UTC: `{ hour: 13, minute: 25, second: 47 }`
- User's local time is 09:25:42 EDT
- Setting hour=13 in EDT gives 13:25:47 EDT = 17:25:47 UTC
- 4 hour mismatch due to timezone offset!

**Correct:**
```typescript
const user = {
  timezone: 'UTC',  // Match config timezone
  dateOfBirth: '2025-10-27'
};
```

### Pitfall 3: Forgetting Birthday Must Be TODAY

**Wrong:**
```typescript
const user = {
  dateOfBirth: '1990-01-15',  // Birthday months away
  timezone: 'UTC'
};
```

**Why it's wrong:**
- Next birthday is January 15, 2026
- Even with 5-second offset, event won't fire for months!

**Correct:**
```typescript
const today = DateTime.utc().toFormat('yyyy-MM-dd');
const user = {
  dateOfBirth: today,  // Birthday is TODAY
  timezone: 'UTC'
};
```

### Pitfall 4: Expecting Exact Timing

**Wrong expectation:**
- "5-second offset means event fires in exactly 5 seconds"

**Reality:**
- Scheduler runs every **60 seconds** (via EventBridge)
- Event becomes eligible after 5 seconds
- But scheduler might not run until up to 55 seconds later
- **Total wait: 5-65 seconds**

**Visual:**
```
0s     5s                                60s
│──────┼─────────────────────────────────┼───────
│      │                                 │
Create  Target Time                  Scheduler
Event   (eligible)                   Runs
```

### Pitfall 5: Mixing DateTime.now() and DateTime.utc() in Tests

**Wrong:**
```typescript
const beforePublish = DateTime.now();  // Uses system timezone
await eventBus.publish(event);
const afterPublish = DateTime.now();   // Uses system timezone

// But config was calculated with DateTime.utc()!
```

**Why it's wrong:**
- If system is in Sydney (UTC+11), `DateTime.now()` is 11 hours ahead of UTC
- Comparing Sydney time to UTC timestamps gives wrong results

**Correct:**
```typescript
const beforePublish = DateTime.utc();  // Always UTC
await eventBus.publish(event);
const afterPublish = DateTime.utc();   // Always UTC

// Consistent timezone for all comparisons
```

---

## Summary

### Normal Production (9 AM)
- Config: `{ hour: 9, minute: 0 }` (hardcoded, timezone-agnostic)
- Users: Any timezone (America/New_York, Asia/Tokyo, etc.)
- Meaning: "9 AM in the user's local timezone"
- Result: Everyone gets message at 9 AM their time, but different UTC times
- Wait: Days/weeks/months until next birthday

### Fast Test Offset (5 seconds)
- Config: `DateTime.utc().plus({ seconds: 5 })` (dynamic, UTC-specific)
- Users: Must use UTC timezone
- Meaning: "5 seconds from now in UTC"
- Result: Event fires 5-65 seconds later (5 sec offset + scheduler delay)
- Wait: Seconds/minutes for immediate testing

### Key Takeaways

1. **Two timestamps** (UTC + Local) give us scheduling efficiency AND user context
2. **Config values have no timezone** - they're interpreted based on user's timezone
3. **UTC is the universal scheduler clock** - all scheduling logic uses targetTimestampUTC
4. **Fast test offset requires UTC users** - config and user must "speak the same timezone language"
5. **Scheduler delay exists** - events fire when `targetTimestampUTC <= NOW()` AND scheduler runs

---

## Further Reading

- [Event Delivery Time Configuration](../src/modules/event-scheduling/config/event-delivery-times.ts)
- [Delivery Time Config Function](../src/modules/event-scheduling/config/delivery-time-config.ts)
- [Birthday Event Handler](../src/modules/event-scheduling/domain/services/event-handlers/BirthdayEventHandler.ts)
- [Create Birthday Event Use Case](../src/modules/event-scheduling/application/use-cases/CreateBirthdayEventUseCase.ts)
- [Event Entity](../src/modules/event-scheduling/domain/entities/Event.ts)
- [Story 4.5: Configurable Delivery Time Override](../docs/stories/4.5.configurable-delivery-time-override.md)
