/**
 * UserNotFoundError - Application-level error for missing users
 *
 * This error is thrown when a use case attempts to operate on a user
 * that does not exist in the system.
 *
 * **Error Type:** ApplicationError
 * **HTTP Status:** 404 Not Found
 *
 * **Usage:**
 * ```typescript
 * const user = await userRepository.findById(userId);
 * if (!user) {
 *   throw new UserNotFoundError(userId);
 * }
 * ```
 */
export class UserNotFoundError extends Error {
  public constructor(userId: string) {
    super(`User not found: ${userId}`);
    this.name = 'UserNotFoundError';
    Error.captureStackTrace(this, this.constructor);
  }
}
