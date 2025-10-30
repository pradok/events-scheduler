# DDD Concepts: Visual Guide

A comprehensive guide to Domain-Driven Design concepts with visual examples from the Birthday Event Scheduling domain.

---

## Table of Contents
1. [Value Objects](#value-objects)
2. [Entities](#entities)
3. [Aggregates & Aggregate Roots](#aggregates--aggregate-roots)
4. [Domain Events](#domain-events)
5. [Current Domain Model](#current-domain-model)
6. [Future Extensions](#future-extensions)

---

## Value Objects

**Definition**: Immutable objects defined by their attributes, not identity.

### Characteristics
- ✅ No unique identifier
- ✅ Immutable (cannot change after creation)
- ✅ Equality based on values
- ✅ Self-validating
- ✅ Replaceable (create new instance to "change")

### Visual Representation

```
┌─────────────────────────┐
│   Value Object          │
│                         │
│  - No ID                │
│  - Immutable            │
│  - Value-based equality │
│  + Business logic       │
│  + Validation           │
└─────────────────────────┘
```

### Examples in Birthday App

```typescript
// DateOfBirth - Value Object
┌──────────────────────────┐
│  DateOfBirth             │
├──────────────────────────┤
│  - value: Date           │
├──────────────────────────┤
│  + getAge(): number      │
│  + equals(other): bool   │
│  + validate()            │
└──────────────────────────┘

const dob1 = new DateOfBirth(new Date('1990-01-01'));
const dob2 = new DateOfBirth(new Date('1990-01-01'));
dob1.equals(dob2) // true - same values

// To "change" - create new instance
const newDob = new DateOfBirth(new Date('1991-01-01'));
```

```typescript
// Email - Value Object
┌──────────────────────────┐
│  Email                   │
├──────────────────────────┤
│  - value: string         │
├──────────────────────────┤
│  + toString(): string    │
│  + equals(other): bool   │
│  + validate()            │
└──────────────────────────┘

const email1 = new Email('user@example.com');
const email2 = new Email('user@example.com');
email1.equals(email2) // true - same values
```

```typescript
// Timezone - Value Object
┌──────────────────────────┐
│  Timezone                │
├──────────────────────────┤
│  - value: string         │
├──────────────────────────┤
│  + isValid(): bool       │
│  + equals(other): bool   │
└──────────────────────────┘
```

### Other Common Value Objects
- `Money` (amount + currency)
- `Address` (street, city, zip, country)
- `DateRange` (start date, end date)
- `PhoneNumber`
- `EventStatus` (PENDING, SCHEDULED, SENT, FAILED)

### When to Create a Value Object

**Rule of Thumb**: Create a Value Object when a concept has validation rules, behavior, or represents a domain concept beyond just data.

#### Decision Criteria

Create a Value Object if the field has:

```
Does this field have...
│
├─ Validation rules? ──────────────────────┐
├─ Business logic/behavior? ───────────────┤
├─ Multiple related properties? ───────────┤──> YES → Create Value Object
├─ A domain concept it represents? ────────┤
└─ Used in multiple places with same rules?┘
           │
           NO
           │
           ▼
    Use primitive type
```

#### 1. Has Validation Rules or Constraints

```typescript
// ❌ Primitive - no validation
class User {
  email: string; // Could be "invalid!!!" or empty string
}

// ✅ Value Object - enforces rules
class Email {
  private readonly value: string;

  constructor(value: string) {
    if (!this.isValid(value)) {
      throw new Error('Invalid email format');
    }
    this.value = value;
  }

  private isValid(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
```

#### 2. Has Behavior or Business Logic

```typescript
// ❌ Primitive - logic scattered elsewhere
const dateOfBirth: Date = user.dateOfBirth;
const age = calculateAge(dateOfBirth); // Logic lives outside
const isMinor = age < 18; // More logic outside

// ✅ Value Object - encapsulates logic
class DateOfBirth {
  private readonly value: Date;

  constructor(date: Date) {
    this.validate(date);
    this.value = date;
  }

  getAge(): number {
    const today = new Date();
    const birthDate = this.value;
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  }

  isMinor(): boolean {
    return this.getAge() < 18;
  }

  isBirthdayToday(): boolean {
    const today = new Date();
    return this.value.getMonth() === today.getMonth() &&
           this.value.getDate() === today.getDate();
  }
}
```

#### 3. Represents a Domain Concept (Not Just Data)

```typescript
// ❌ Just primitive data
class Order {
  amount: number;      // What currency?
  currency: string;    // Separate fields, easy to mix up
}

// ✅ Domain concept
class Money {
  private readonly amount: number;
  private readonly currency: Currency;

  constructor(amount: number, currency: Currency) {
    if (amount < 0) throw new Error('Amount cannot be negative');
    this.amount = amount;
    this.currency = currency;
  }

  add(other: Money): Money {
    if (!this.currency.equals(other.currency)) {
      throw new Error('Cannot add different currencies');
    }
    return new Money(this.amount + other.amount, this.currency);
  }

  multiply(factor: number): Money {
    return new Money(this.amount * factor, this.currency);
  }

  format(): string {
    return `${this.currency.symbol}${this.amount.toFixed(2)}`;
  }
}
```

#### 4. Multiple Properties Belong Together

```typescript
// ❌ Scattered properties
class User {
  street: string;
  city: string;
  zipCode: string;
  country: string;
  // Easy to forget one, hard to validate together
}

// ✅ Cohesive concept
class Address {
  private readonly street: string;
  private readonly city: string;
  private readonly zipCode: string;
  private readonly country: string;

  constructor(street: string, city: string, zipCode: string, country: string) {
    this.validateZipCode(zipCode, country);
    this.street = street;
    this.city = city;
    this.zipCode = zipCode;
    this.country = country;
  }

  format(): string {
    return `${this.street}\n${this.city}, ${this.zipCode}\n${this.country}`;
  }

  private validateZipCode(zip: string, country: string): void {
    // Country-specific zip code validation
    if (country === 'US' && !/^\d{5}(-\d{4})?$/.test(zip)) {
      throw new Error('Invalid US zip code');
    }
  }
}
```

#### 5. Validation Duplicated Across Multiple Places

```typescript
// ❌ Validation duplicated everywhere (DRY violation)
class UserController {
  createUser(email: string) {
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      throw new Error('Invalid email');
    }
    // ...
  }
}

class UserService {
  updateEmail(email: string) {
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      throw new Error('Invalid email');
    }
    // ...
  }
}

class User {
  setEmail(email: string) {
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      throw new Error('Invalid email');
    }
    // ...
  }
}

// ✅ Validation in ONE place (DRY)
class Email {
  constructor(value: string) {
    this.validate(value); // Only validation point!
    this.value = value;
  }

  private validate(email: string): void {
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      throw new Error('Invalid email');
    }
  }
}

// Now everywhere just uses Email type
class UserController {
  createUser(email: Email) { /* Already validated! */ }
}
```

#### 6. Prevents Primitive Obsession and Type Safety

```typescript
// ❌ Primitive obsession - easy to mix up parameters
function schedule(
  userId: string,
  eventId: string,
  date: string
) {
  // Which string is which? Easy to swap them!
  scheduler.schedule(eventId, userId, date); // Oops! Wrong order
}

// ✅ Type-safe with Value Objects
function schedule(
  userId: UserId,
  eventId: EventId,
  date: ScheduledDate
) {
  // Compiler prevents mistakes!
  scheduler.schedule(eventId, userId, date); // Type error!
  scheduler.schedule(userId, eventId, date); // Correct!
}

class UserId {
  constructor(private readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('UserId cannot be empty');
    }
  }

  toString(): string { return this.value; }
}
```

### Examples from Birthday App

#### ✅ Good Value Objects (Already Implemented)

```typescript
// 1. Email - Has validation
class Email {
  // ✅ Enforces email format rules
  // ✅ Prevents invalid emails in the system
  // ✅ Single source of truth for email validation
}

// 2. DateOfBirth - Has validation + behavior
class DateOfBirth {
  getAge(): number        // ✅ Business logic
  validate()              // ✅ Age constraints (e.g., must be valid date)
  isBirthdayToday(): bool // ✅ Domain logic
}

// 3. Timezone - Has validation
class Timezone {
  // ✅ Ensures valid IANA timezone strings
  // ✅ Prevents "America/Invalid" in system
}

// 4. EventStatus - Domain concept with state rules
class EventStatus {
  canTransitionTo(newStatus: EventStatus): boolean
  // ✅ Enforces state machine logic
  // ✅ PENDING → SCHEDULED → SENT/FAILED only
}

// 5. IdempotencyKey - Validation + uniqueness guarantee
class IdempotencyKey {
  // ✅ Ensures proper UUID format
  // ✅ Prevents duplicate operations
  // ✅ Domain concept for distributed systems
}
```

#### ❌ When NOT to Create Value Objects

```typescript
// Simple strings with no validation or business rules
name: string ✅ (just a label, no special rules)

// Simple identifiers (though you COULD make UserId/EventId VOs for type safety)
id: string ✅ (just an identifier, no validation beyond "not empty")

// Timestamps - no domain logic
createdAt: Date ✅ (just a timestamp)
updatedAt: Date ✅ (just a timestamp)

// Simple booleans
isActive: boolean ✅ (just true/false, no logic)
isDeleted: boolean ✅ (just a flag)
```

### Potential Future Value Objects

As your domain grows, you might create:

```typescript
// PhoneNumber - validation + formatting
class PhoneNumber {
  constructor(value: string) {
    if (!this.isValidFormat(value)) throw new Error('Invalid phone');
  }

  format(): string {
    return '+1 (555) 123-4567'; // Standardized format
  }

  toInternational(): string {
    return '+15551234567';
  }
}

// RetryPolicy - business rules
class RetryPolicy {
  constructor(
    private readonly maxRetries: number,
    private readonly backoffMultiplier: number
  ) {
    if (maxRetries < 0) throw new Error('Invalid retry count');
  }

  shouldRetry(attemptCount: number): boolean {
    return attemptCount < this.maxRetries;
  }

  getNextRetryDelay(attemptCount: number): number {
    return Math.pow(2, attemptCount) * 1000 * this.backoffMultiplier;
  }
}

// TimeWindow - multiple related properties + validation
class TimeWindow {
  constructor(
    private readonly startTime: Time,
    private readonly endTime: Time
  ) {
    if (endTime <= startTime) {
      throw new Error('End time must be after start time');
    }
  }

  contains(time: Time): boolean {
    return time >= this.startTime && time <= this.endTime;
  }

  overlaps(other: TimeWindow): boolean {
    return this.startTime < other.endTime && other.startTime < this.endTime;
  }
}

// MessageTemplate - validation + rendering behavior
class MessageTemplate {
  constructor(
    private readonly subject: string,
    private readonly body: string
  ) {
    this.validateVariables();
  }

  render(data: Record<string, string>): string {
    return this.body.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || '');
  }

  private validateVariables(): void {
    const variables = this.body.match(/\{\{(\w+)\}\}/g) || [];
    // Ensure required variables exist
  }
}
```

### Anti-Pattern Warning: Don't Overdo It

```typescript
// ❌ Too much - "String" wrapper adds no value
class UserName {
  constructor(private readonly value: string) {
    this.value = value; // No validation, no logic, no benefit
  }
}

// ✅ Better - just use string if there are no rules
class User {
  name: string; // Simple property, no need for VO
}

// ❌ Too much - unnecessary wrapper
class IsActiveFlag {
  constructor(private readonly value: boolean) {}
}

// ✅ Better - just use boolean
class User {
  isActive: boolean;
}
```

### Summary: Value Object Checklist

Create a Value Object if it has **at least one** of these:

- ✅ Validation rules or constraints
- ✅ Business logic or behavior
- ✅ Represents a domain concept beyond data
- ✅ Multiple properties that belong together
- ✅ Same validation used in multiple places
- ✅ Type safety benefits (prevents parameter mix-ups)

Use a primitive if:

- ❌ It's just simple data with no rules
- ❌ No validation needed
- ❌ No behavior or logic
- ❌ Single property with no special meaning
- ❌ Only used in one context

**The key question**: *"Does this concept have rules or behavior that should be encapsulated?"*

If **YES** → Value Object
If **NO** → Primitive

---

## Entities

**Definition**: Objects with unique identity and lifecycle, containing business logic.

### Characteristics
- ✅ Has unique ID
- ✅ Mutable (can change state)
- ✅ Identity-based equality
- ✅ Contains business logic
- ✅ Has lifecycle (created, modified, deleted)

### Visual Representation

```
┌─────────────────────────┐
│   Entity                │
│                         │
│  - id: UniqueId         │
│  - properties           │
│  + business methods     │
│  + validation           │
└─────────────────────────┘
```

### Entity vs Value Object

```
┌────────────────────────────────────────────────────────────────────────┐
│                         Comparison                                     │
├─────────────────────────────┬──────────────────────────────────────────┤
│  Entity                     │  Value Object                            │
├─────────────────────────────┼──────────────────────────────────────────┤
│  Has unique ID              │  No ID                                   │
│  Mutable                    │  Immutable                               │
│  Identity matters           │  Value matters                           │
│  user1.id === user2.id      │  email1.value === email2.value           │
│  Can change over time       │  Replace to "change"                     │
│  Example: User, Order       │  Example: Email, Money, Address          │
│                             │                                          │
│  LOGIC TYPE:                │  LOGIC TYPE:                             │
│  Orchestration & State      │  Enhancement of Primitive                │
│  - Coordinates multiple VOs │  - Wraps primitive (string, number, etc) │
│  - Manages state changes    │  - Adds validation to primitive          │
│  - Raises domain events     │  - Adds behavior to primitive            │
│  - Enforces business rules  │  - Makes primitive type-safe             │
└─────────────────────────────┴──────────────────────────────────────────┘
```

### Logic Distribution: Value Objects vs Entities

**Key Principle**: Value Objects enhance primitives with logic about the value itself. Entities use those enhanced values to orchestrate behavior.

```
┌─────────────────────────────────────────────────────────────────┐
│  VALUE OBJECT LOGIC (about the primitive value)                │
│  ────────────────────────────────────────────────────           │
│                                                                 │
│  Primitive + Intelligence = Value Object                        │
│                                                                 │
│  string     + email validation/formatting  = Email              │
│  Date       + age calculation logic        = DateOfBirth        │
│  number+str + currency rules               = Money              │
│                                                                 │
│  Asks: "What can I tell you about THIS value?"                 │
│  • Is this email valid?                                        │
│  • What's the age from this date?                              │
│  • How do I format this money?                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  ENTITY LOGIC (orchestrates VOs and manages behavior)          │
│  ──────────────────────────────────────────────────────         │
│                                                                 │
│  Uses Value Objects + Coordinates Behavior = Entity Logic       │
│                                                                 │
│  Asks: "What can I DO as this entity?"                         │
│  • Change my birthday (state change)                           │
│  • Validate business rules using VOs                           │
│  • Coordinate multiple Value Objects                           │
│  • Raise domain events                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Example: How Logic is Distributed

```typescript
// VALUE OBJECT - Logic about the date itself
class DateOfBirth {
  private readonly value: Date; // Enhances this primitive

  // ✅ VO Logic: Calculates age from THIS date
  getAge(): number {
    const today = new Date();
    const birthDate = this.value;
    let age = today.getFullYear() - birthDate.getFullYear();
    // ... calculation
    return age;
  }

  // ✅ VO Logic: Checks if THIS date is today
  isBirthdayToday(): boolean {
    const today = new Date();
    return this.value.getMonth() === today.getMonth() &&
           this.value.getDate() === today.getDate();
  }

  // DateOfBirth doesn't know about Users or Events
  // It only knows about dates and age calculations
}

// ENTITY - Logic about User's behavior
class User extends AggregateRoot {
  private dateOfBirth: DateOfBirth; // Uses the enhanced value
  private email: Email;
  private timezone: Timezone;

  // ✅ Entity Logic: Orchestrates VOs and manages state
  changeBirthday(newDate: DateOfBirth): void {
    // 1. Uses VO's logic for validation
    if (newDate.getAge() < 18) {  // Delegates to DateOfBirth.getAge()
      throw new Error('User must be 18+');
    }

    // 2. Manages state change (Entity responsibility)
    const oldDate = this.dateOfBirth;
    this.dateOfBirth = newDate;

    // 3. Raises domain events (Entity responsibility)
    this.addDomainEvent(
      new UserBirthdayChanged(this.id, oldDate, newDate)
    );
  }

  // ✅ Entity Logic: Coordinates multiple VOs
  canReceiveNotification(): boolean {
    return this.email.isValid() &&        // Uses Email VO logic
           !this.dateOfBirth.isMinor() && // Uses DateOfBirth VO logic
           this.isActive;                 // Entity state
  }

  // User coordinates DateOfBirth, Email, Timezone
  // and manages its own state and events
}
```

#### Why This Separation Matters

```typescript
// ❌ BAD - Entity contains VO logic (primitive obsession)
class User {
  private dateOfBirth: Date; // Just a primitive

  getAge(): number {
    // Entity has to know how to calculate age
    const today = new Date();
    let age = today.getFullYear() - this.dateOfBirth.getFullYear();
    // ... complex calculation in Entity
    return age;
  }

  canVote(): boolean {
    return this.getAge() >= 18; // Logic scattered
  }

  // Problem: Age calculation logic lives in User
  // What if Event entity also needs age? Duplicate code!
}

// ✅ GOOD - Logic properly distributed
class DateOfBirth {
  // VO knows how to calculate age (its job)
  getAge(): number { /* ... */ }
}

class User {
  private dateOfBirth: DateOfBirth; // Enhanced value

  // Entity uses VO's logic (delegation, no duplication)
  canVote(): boolean {
    return this.dateOfBirth.getAge() >= 18;
  }

  canDrink(): boolean {
    return this.dateOfBirth.getAge() >= 21;
  }

  // Entity focuses on User behavior
  // DateOfBirth handles age calculation (reusable everywhere)
}
```

#### Summary: Two Types of Logic

| Aspect | Value Object Logic | Entity Logic |
|--------|-------------------|--------------|
| **Purpose** | Enhance primitive with intelligence | Orchestrate behavior & state |
| **Wraps** | Primitive values (string, number, Date) | Multiple Value Objects |
| **Asks** | "What about THIS value?" | "What can I DO?" |
| **Examples** | validate(), format(), calculate() | changeState(), coordinate(), raiseEvent() |
| **Scope** | Single concept/value | Multiple concepts together |
| **Reusability** | Highly reusable (any entity can use) | Specific to that entity |

**Pattern**: Value Objects make primitives smart. Entities use smart values to do smart things.

### Example: User Entity

```typescript
┌──────────────────────────────────────┐
│  User (Entity)                       │
├──────────────────────────────────────┤
│  - id: UserId (identity!)            │
│  - name: string                      │
│  - email: Email (value object)       │
│  - dateOfBirth: DateOfBirth (VO)     │
│  - timezone: Timezone (VO)           │
├──────────────────────────────────────┤
│  + changeBirthday(date): void        │
│  + updateEmail(email): void          │
│  + updateTimezone(tz): void          │
│  + validateAge(): void               │
└──────────────────────────────────────┘

const user1 = new User('id-123', ...);
const user2 = new User('id-123', ...);
user1.equals(user2) // true - same ID

const user3 = new User('id-456', ...);
user1.equals(user3) // false - different ID
```

### Example: Event Entity

```typescript
┌──────────────────────────────────────┐
│  Event (Entity)                      │
├──────────────────────────────────────┤
│  - id: EventId (identity!)           │
│  - userId: UserId                    │
│  - scheduledFor: Date                │
│  - status: EventStatus (VO)          │
│  - idempotencyKey: IdempotencyKey    │
├──────────────────────────────────────┤
│  + schedule(): void                  │
│  + markAsSent(): void                │
│  + markAsFailed(): void              │
│  + canBeRescheduled(): boolean       │
└──────────────────────────────────────┘
```

---

## Aggregates & Aggregate Roots

**Definition**: A cluster of entities and value objects treated as a single unit, with one entity acting as the entry point (Aggregate Root).

### Key Concepts

```
┌─────────────────────────────────────────────────┐
│  AGGREGATE (the whole boundary/cluster)         │
│                                                 │
│  ┌───────────────────────────────────────┐     │
│  │  AGGREGATE ROOT (entry point entity)  │     │
│  │  - Controls access                    │     │
│  │  - Enforces invariants                │     │
│  │  - Publishes domain events            │     │
│  └───────────────────────────────────────┘     │
│           │                                     │
│           ├─→ Child Entity (optional)          │
│           ├─→ Child Entity (optional)          │
│           └─→ Value Objects                    │
│                                                 │
│  All saved/loaded together as one unit         │
└─────────────────────────────────────────────────┘
```

### Rules

1. **One Aggregate = One Aggregate Root** (the parent/boss)
2. **External code can only reference the Aggregate Root**
3. **Child entities accessed only through the root**
4. **Aggregate boundary = transactional consistency boundary**
5. **Each Aggregate Root has its own repository**

### Terminology Clarification

```
┌──────────────────────────────────────────────────────────┐
│  "Aggregate" vs "Aggregate Root"                         │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Aggregate Root → The specific entity (the boss)         │
│  Aggregate      → The whole cluster/boundary             │
│                                                          │
│  Example:                                                │
│  - "Order is an Aggregate Root"                          │
│  - "Load the Order Aggregate from database"              │
│  - "The Order Aggregate Root enforces business rules"    │
│  - "Each Aggregate has one Aggregate Root"               │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Example: Order Aggregate (Classic Example)

```
┌─────────────────────────────────────────────────────────┐
│  ORDER AGGREGATE                                        │
│                                                         │
│  ┌────────────────────────────────────────────┐        │
│  │  Order (Aggregate Root - Entity)           │        │
│  │  ─────────────────────────────────         │        │
│  │  - orderId: OrderId                        │        │
│  │  - customerId: CustomerId                  │        │
│  │  - orderDate: Date                         │        │
│  │  - items: OrderLineItem[]                  │        │
│  │  - shippingAddress: Address (VO)           │        │
│  │  - totalAmount: Money (VO)                 │        │
│  │                                            │        │
│  │  + addItem(product, qty)                   │        │
│  │  + removeItem(itemId)                      │        │
│  │  + changeQuantity(itemId, qty)             │        │
│  │  + checkout()                              │        │
│  └────────────────────────────────────────────┘        │
│           │                                            │
│           ├─→ OrderLineItem (Child Entity)            │
│           │    ┌──────────────────────────┐           │
│           │    │ - lineItemId: LineItemId │           │
│           │    │ - productId: ProductId   │           │
│           │    │ - quantity: number       │           │
│           │    │ - price: Money (VO)      │           │
│           │    │ + increaseQuantity()     │           │
│           │    └──────────────────────────┘           │
│           │                                            │
│           ├─→ OrderLineItem (Child Entity)            │
│           │                                            │
│           └─→ ShippingAddress (Value Object)          │
│                Payment (Value Object)                 │
│                                                         │
└─────────────────────────────────────────────────────────┘

// ✅ Correct usage
const order = orderRepository.findById(orderId);
order.addItem(productId, quantity);
orderRepository.save(order); // Saves entire aggregate

// ❌ Wrong - can't access child directly
const lineItem = lineItemRepository.findById(itemId); // NO!
lineItem.increaseQuantity(5); // Breaks encapsulation
```

---

## Domain Events

**Definition**: Notifications about something significant that happened in the domain (always past tense).

### Characteristics
- ✅ Immutable
- ✅ Past tense naming
- ✅ Published by Aggregate Roots
- ✅ Enable loose coupling between aggregates
- ✅ Can trigger side effects in other parts of the system

### Visual Representation

```
┌─────────────────────────────────────────────────┐
│  Domain Event (NOT an Aggregate Root!)          │
│                                                 │
│  - eventId: string                              │
│  - occurredAt: Date                             │
│  - aggregateId: string (which aggregate raised) │
│  - event-specific data                          │
└─────────────────────────────────────────────────┘
```

### Examples in Birthday App

```typescript
┌──────────────────────────────────────┐
│  UserBirthdayChanged                 │
├──────────────────────────────────────┤
│  - eventId: string                   │
│  - occurredAt: Date                  │
│  - aggregate: string (userId)        │
│  - userId: string                    │
│  - newDateOfBirth: DateOfBirth       │
│  - oldDateOfBirth: DateOfBirth       │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  UserCreated                         │
├──────────────────────────────────────┤
│  - eventId: string                   │
│  - occurredAt: Date                  │
│  - aggregate: string (userId)        │
│  - userId: string                    │
│  - email: Email                      │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  EventScheduled                      │
├──────────────────────────────────────┤
│  - eventId: string                   │
│  - occurredAt: Date                  │
│  - aggregate: string (eventId)       │
│  - eventId: string                   │
│  - scheduledFor: Date                │
└──────────────────────────────────────┘
```

### Event Flow

```
┌─────────────────┐         ┌──────────────────┐
│  User           │ raises  │ UserBirthdayChgd │
│ (Agg Root)      │────────>│ (Domain Event)   │
└─────────────────┘         └──────────────────┘
                                     │
                   ┌─────────────────┼─────────────────┐
                   │                 │                 │
                   ▼                 ▼                 ▼
         ┌─────────────────┐ ┌──────────────┐ ┌──────────┐
         │ Reschedule      │ │ Send Email   │ │ Audit    │
         │ Birthday Events │ │ Notification │ │ Log      │
         └─────────────────┘ └──────────────┘ └──────────┘
```

---

## Current Domain Model

### User Module (Simple Aggregate)

```
┌─────────────────────────────────────────────────┐
│  USER AGGREGATE (Currently Simple)              │
│                                                 │
│  ┌───────────────────────────────────────┐     │
│  │  User (Aggregate Root - Entity)       │     │
│  │  ────────────────────────────────     │     │
│  │  - id: UserId                         │     │
│  │  - name: string                       │     │
│  │  - email: Email (VO)                  │     │
│  │  - dateOfBirth: DateOfBirth (VO)      │     │
│  │  - timezone: Timezone (VO)            │     │
│  │  - createdAt: Date                    │     │
│  │  - updatedAt: Date                    │     │
│  │                                       │     │
│  │  + create()                           │     │
│  │  + changeBirthday()                   │     │
│  │  + updateEmail()                      │     │
│  │  + updateTimezone()                   │     │
│  └───────────────────────────────────────┘     │
│                                                 │
│  No child entities yet - just value objects    │
│                                                 │
└─────────────────────────────────────────────────┘

Repository: IUserRepository
  - findById(id)
  - save(user)
  - findByEmail(email)
```

### Event Scheduling Module (Simple Aggregate)

```
┌─────────────────────────────────────────────────┐
│  EVENT AGGREGATE (Currently Simple)             │
│                                                 │
│  ┌───────────────────────────────────────┐     │
│  │  Event (Aggregate Root - Entity)      │     │
│  │  ──────────────────────────────────   │     │
│  │  - id: EventId                        │     │
│  │  - userId: UserId (reference)         │     │
│  │  - scheduledFor: Date                 │     │
│  │  - status: EventStatus (VO)           │     │
│  │  - idempotencyKey: IdempotencyKey (VO)│     │
│  │  - createdAt: Date                    │     │
│  │                                       │     │
│  │  + schedule()                         │     │
│  │  + markAsSent()                       │     │
│  │  + markAsFailed()                     │     │
│  │  + canBeRescheduled(): bool           │     │
│  └───────────────────────────────────────┘     │
│                                                 │
│  No child entities yet                         │
│                                                 │
└─────────────────────────────────────────────────┘

Repository: IEventRepository
  - findById(id)
  - save(event)
  - findByUserId(userId)
```

### Why User and Event are Separate Aggregates

```
┌─────────────┐                    ┌─────────────┐
│    User     │                    │    Event    │
│ (Aggregate) │                    │ (Aggregate) │
└─────────────┘                    └─────────────┘
      │                                  │
      │ Reference by ID only             │
      │ (not by direct object ref)       │
      └──────────────────────────────────┘

Reasons for separation:
✅ Independent lifecycles (users can exist without events)
✅ Different transactional boundaries
✅ Different repositories
✅ Can scale independently
✅ User changes don't force event updates
```

---

## Future Extensions

### Option 1: User Aggregate with Child Entities

```
┌────────────────────────────────────────────────────────────┐
│  EXTENDED USER AGGREGATE                                   │
│                                                            │
│  ┌──────────────────────────────────────────────┐         │
│  │  User (Aggregate Root)                       │         │
│  │  ────────────────────────────                │         │
│  │  - id: UserId                                │         │
│  │  - name: string                              │         │
│  │  - email: Email (VO)                         │         │
│  │  - dateOfBirth: DateOfBirth (VO)             │         │
│  │  - profile: UserProfile                      │         │
│  │  - preferences: NotificationPreference[]     │         │
│  │                                              │         │
│  │  + addNotificationPreference(pref)           │         │
│  │  + updateProfile(data)                       │         │
│  │  + removeNotificationChannel(channel)        │         │
│  └──────────────────────────────────────────────┘         │
│           │                                               │
│           ├─→ UserProfile (Child Entity)                 │
│           │    ┌────────────────────────────┐            │
│           │    │ - profileId: ProfileId     │            │
│           │    │ - avatar: URL              │            │
│           │    │ - bio: string              │            │
│           │    │ - socialLinks: Link[]      │            │
│           │    │ + updateAvatar()           │            │
│           │    └────────────────────────────┘            │
│           │                                               │
│           └─→ NotificationPreference (Child Entity)      │
│                ┌────────────────────────────┐            │
│                │ - preferenceId: PrefId     │            │
│                │ - channel: Channel (VO)    │            │
│                │ - enabled: boolean         │            │
│                │ - daysInAdvance: number    │            │
│                │ + enable()                 │            │
│                │ + disable()                │            │
│                └────────────────────────────┘            │
│                                                            │
│  Rule: Can only modify UserProfile and Preferences        │
│        through User aggregate root methods                │
│                                                            │
└────────────────────────────────────────────────────────────┘

// ✅ Correct
const user = userRepository.findById(userId);
user.addNotificationPreference(new NotificationPreference(...));
user.updateProfile({ bio: 'New bio' });
userRepository.save(user); // Saves user + profile + preferences

// ❌ Wrong
const profile = profileRepository.findById(profileId); // NO!
profile.updateAvatar(newUrl); // Bypasses aggregate root
```

### Option 2: Event Aggregate with Delivery History

```
┌────────────────────────────────────────────────────────────┐
│  EXTENDED EVENT AGGREGATE                                  │
│                                                            │
│  ┌──────────────────────────────────────────────┐         │
│  │  Event (Aggregate Root)                      │         │
│  │  ────────────────────────                    │         │
│  │  - id: EventId                               │         │
│  │  - userId: UserId                            │         │
│  │  - scheduledFor: Date                        │         │
│  │  - status: EventStatus (VO)                  │         │
│  │  - deliveryAttempts: DeliveryAttempt[]       │         │
│  │  - retryPolicy: RetryPolicy (VO)             │         │
│  │                                              │         │
│  │  + recordDeliveryAttempt(result)             │         │
│  │  + shouldRetry(): boolean                    │         │
│  │  + getNextRetryTime(): Date                  │         │
│  └──────────────────────────────────────────────┘         │
│           │                                               │
│           └─→ DeliveryAttempt (Child Entity)             │
│                ┌────────────────────────────┐            │
│                │ - attemptId: AttemptId     │            │
│                │ - attemptedAt: Date        │            │
│                │ - success: boolean         │            │
│                │ - errorMessage?: string    │            │
│                │ - channel: Channel (VO)    │            │
│                └────────────────────────────┘            │
│                                                            │
│  Rule: Delivery attempts only managed through Event       │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Option 3: New Aggregate - Birthday Campaign

```
┌────────────────────────────────────────────────────────────┐
│  BIRTHDAY CAMPAIGN AGGREGATE (New Concept)                 │
│                                                            │
│  ┌──────────────────────────────────────────────┐         │
│  │  BirthdayCampaign (Aggregate Root)           │         │
│  │  ──────────────────────────────────          │         │
│  │  - id: CampaignId                            │         │
│  │  - organizationId: OrgId                     │         │
│  │  - name: string                              │         │
│  │  - templates: MessageTemplate[]              │         │
│  │  - schedule: CampaignSchedule (VO)           │         │
│  │  - active: boolean                           │         │
│  │                                              │         │
│  │  + addTemplate(template)                     │         │
│  │  + updateSchedule(schedule)                  │         │
│  │  + activate()                                │         │
│  │  + deactivate()                              │         │
│  └──────────────────────────────────────────────┘         │
│           │                                               │
│           └─→ MessageTemplate (Child Entity)             │
│                ┌────────────────────────────┐            │
│                │ - templateId: TemplateId   │            │
│                │ - channel: Channel (VO)    │            │
│                │ - subject: string          │            │
│                │ - body: string             │            │
│                │ - variables: Variable[]    │            │
│                │ + render(data): Message    │            │
│                └────────────────────────────┘            │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### New Value Objects for Extensions

```
┌────────────────────────┐  ┌────────────────────────┐
│  Channel (VO)          │  │  RetryPolicy (VO)      │
├────────────────────────┤  ├────────────────────────┤
│  - type: ChannelType   │  │  - maxRetries: number  │
│  - config: Config      │  │  - backoffStrategy     │
│  + validate()          │  │  - retryIntervals[]    │
└────────────────────────┘  └────────────────────────┘

┌────────────────────────┐  ┌────────────────────────┐
│  CampaignSchedule (VO) │  │  Link (VO)             │
├────────────────────────┤  ├────────────────────────┤
│  - sendTime: Time      │  │  - url: URL            │
│  - daysInAdvance: num  │  │  - label: string       │
│  - timezone: Timezone  │  │  + validate()          │
└────────────────────────┘  └────────────────────────┘
```

---

## Key Takeaways

### When to Create an Aggregate Root

✅ **Create separate Aggregate Roots when:**
- Entities have independent lifecycles
- They need separate transactional boundaries
- They can be modified independently
- They need their own repositories

❌ **Use child entities within an aggregate when:**
- Entities always belong to a parent
- They don't make sense without the parent
- They're always loaded/saved with the parent
- Changes must be coordinated through the parent

### Current State (Simple Aggregates)

```
User Aggregate (simple)
  └─ User entity + value objects

Event Aggregate (simple)
  └─ Event entity + value objects

✅ This is PERFECT for current needs
✅ Don't add complexity until needed
```

### Design Principles

1. **Start small** - Simple aggregates with just the root entity
2. **Add child entities** - Only when truly needed
3. **Keep aggregates small** - Smaller = easier to maintain
4. **One aggregate = one transaction** - Don't make aggregates too large
5. **Reference by ID** - Aggregates reference each other by ID, not direct object references

---

## References

- **Value Objects**: [src/modules/user/domain/value-objects/](src/modules/user/domain/value-objects/)
- **Entities**: [src/modules/user/domain/entities/User.ts](src/modules/user/domain/entities/User.ts)
- **Domain Events**: [src/modules/user/domain/events/](src/modules/user/domain/events/)
- **Aggregate Roots**: User and Event both extend AggregateRoot base class
