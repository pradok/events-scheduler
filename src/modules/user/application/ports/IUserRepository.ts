import { User } from '../../domain/entities/User';

/**
 * Repository interface for User persistence operations.
 *
 * This port abstracts user data access, allowing the application layer
 * to remain independent of specific database implementations (PostgreSQL,
 * MongoDB, DynamoDB, in-memory, etc.).
 *
 * All methods use domain entities (User) rather than database-specific
 * models, enforcing clean architecture boundaries.
 *
 * Note: The 'I' prefix for port interfaces is required by the project's
 * architecture standards (Hexagonal Architecture pattern).
 * See: docs/architecture/coding-standards.md
 */
/* eslint-disable @typescript-eslint/naming-convention */
export interface IUserRepository {
  /**
   * Creates a new user in the persistence layer.
   *
   * @param user - The User domain entity to persist
   * @returns Promise resolving to the created User with generated fields (id, timestamps)
   */
  create(user: User): Promise<User>;

  /**
   * Finds a user by their unique identifier.
   *
   * @param userId - The unique user ID (UUID)
   * @returns Promise resolving to the User entity if found, null otherwise
   */
  findById(userId: string): Promise<User | null>;

  /**
   * Finds a user by their email address.
   *
   * This method enforces email uniqueness constraint at the application layer.
   * Used for validation during user creation and authentication flows.
   *
   * @param email - The email address to search for
   * @returns Promise resolving to the User entity if found, null otherwise
   */
  findByEmail(email: string): Promise<User | null>;

  /**
   * Finds all users with birthdays occurring within the next N days.
   *
   * This method supports batch event generation for upcoming birthdays.
   * Implementation should consider timezone-aware date calculations.
   *
   * @param daysAhead - Number of days to look ahead (e.g., 7 for next week)
   * @returns Promise resolving to array of User entities with upcoming birthdays
   */
  findUsersWithUpcomingBirthdays(daysAhead: number): Promise<User[]>;

  /**
   * Updates an existing user in the persistence layer.
   *
   * Implementation may use optimistic locking to prevent concurrent modification issues.
   *
   * @param user - The User domain entity with updated fields
   * @returns Promise resolving to the updated User entity
   */
  update(user: User): Promise<User>;

  /**
   * Deletes a user from the persistence layer.
   *
   * Implementation should handle cascade deletion of related data
   * (e.g., events associated with this user) according to business rules.
   *
   * @param userId - The unique user ID (UUID) to delete
   * @returns Promise resolving when deletion is complete
   */
  delete(userId: string): Promise<void>;
}
