import type { IUserRepository } from '../ports/IUserRepository';
import type { User } from '../../domain/entities/User';

/**
 * GetUserUseCase - Retrieve a user by ID
 *
 * This use case encapsulates the business logic for fetching a single user.
 * It follows the Hexagonal Architecture pattern by depending only on the
 * IUserRepository port interface, not on any specific infrastructure implementation.
 *
 * **Usage:**
 * ```typescript
 * const getUserUseCase = new GetUserUseCase(userRepository);
 * const user = await getUserUseCase.execute(userId);
 *
 * if (user) {
 *   console.log(`Found user: ${user.firstName} ${user.lastName}`);
 * } else {
 *   console.log('User not found');
 * }
 * ```
 *
 * **Returns:**
 * - User entity if found
 * - null if user does not exist
 *
 * **Throws:**
 * - InfrastructureError if database connection fails
 */
export class GetUserUseCase {
  /**
   * @param userRepository - Repository port for user persistence operations
   */
  public constructor(private readonly userRepository: IUserRepository) {}

  /**
   * Execute the use case to retrieve a user by ID
   *
   * @param userId - UUID of the user to retrieve
   * @returns User entity if found, null otherwise
   * @throws InfrastructureError if database operation fails
   */
  public async execute(userId: string): Promise<User | null> {
    return await this.userRepository.findById(userId);
  }
}
