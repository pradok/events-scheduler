import { InvalidStateTransitionError } from '../../../../domain/errors/InvalidStateTransitionError';

/**
 * EventStatus enum
 * Represents the lifecycle states of an event with enforced state machine transitions
 */
export enum EventStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

/**
 * Valid state transitions mapping
 * PENDING → PROCESSING → (COMPLETED | FAILED)
 * COMPLETED and FAILED are terminal states
 */
const VALID_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  [EventStatus.PENDING]: [EventStatus.PROCESSING],
  [EventStatus.PROCESSING]: [EventStatus.COMPLETED, EventStatus.FAILED],
  [EventStatus.COMPLETED]: [],
  [EventStatus.FAILED]: [],
};

/**
 * Validates if a state transition is valid according to the state machine
 */
export function isValidTransition(from: EventStatus, to: EventStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Validates and enforces state transition
 * Throws InvalidStateTransitionError if transition is invalid
 */
export function validateTransition(from: EventStatus, to: EventStatus): void {
  if (!isValidTransition(from, to)) {
    throw new InvalidStateTransitionError(from, to);
  }
}

/**
 * Creates an EventStatus from a string value
 * @param value The status string (PENDING, PROCESSING, COMPLETED, FAILED)
 * @returns The corresponding EventStatus enum value
 */
export function fromString(value: string): EventStatus {
  const statusValue = value as EventStatus;
  if (!Object.values(EventStatus).includes(statusValue)) {
    throw new Error(`Invalid event status: ${value}`);
  }
  return statusValue;
}
