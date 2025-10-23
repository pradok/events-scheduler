import { PrismaClient } from '@prisma/client';
import { IUserRepository } from '../../application/ports/IUserRepository';
import { User } from '../../domain/entities/User';
import { userToDomain, userToPrisma } from './mappers/userMapper';
import { DateTime } from 'luxon';

/**
 * Prisma implementation of IUserRepository.
 * Adapts domain User entities to/from Prisma User models for PostgreSQL persistence.
 */
export class PrismaUserRepository implements IUserRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  /**
   * Creates a new user in the database
   */
  public async create(user: User): Promise<User> {
    const prismaData = userToPrisma(user);

    const created = await this.prisma.user.create({
      data: prismaData,
    });

    return userToDomain(created);
  }

  /**
   * Finds a user by their unique ID
   */
  public async findById(userId: string): Promise<User | null> {
    const prismaUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!prismaUser) {
      return null;
    }

    return userToDomain(prismaUser);
  }

  /**
   * Finds a user by email address
   * Note: Current schema doesn't have email field, returns null for now
   */
  public findByEmail(_email: string): Promise<User | null> {
    // TODO: Schema doesn't have email field yet - this is a placeholder
    // When email field is added to User model, implement:
    // const prismaUser = await this.prisma.user.findUnique({ where: { email } });
    return Promise.resolve(null);
  }

  /**
   * Finds all users with birthdays occurring in the next N days
   *
   * **Raw SQL Justification:**
   * Uses `$queryRaw` because Prisma doesn't support:
   * 1. Extracting date components (month-day) for comparison
   * 2. Comparing partial dates while ignoring year
   * 3. PostgreSQL-specific functions like TO_CHAR()
   *
   * **Why not Prisma query builder?**
   * - Prisma date filters (gte, lte) compare full dates including year
   * - Fetching all users and filtering in-memory would scale poorly
   * - Birthday matching requires month-day comparison regardless of birth year
   *
   * **Business Logic:**
   * Handles year wrap-around (e.g., Dec 28 → Jan 3) by splitting into two cases:
   * - Normal range: WHERE month-day BETWEEN start AND end
   * - Wrap range: WHERE month-day >= start OR month-day <= end
   *
   * @see docs/architecture/coding-standards.md - Section on Raw SQL Usage
   */
  public async findUsersWithUpcomingBirthdays(daysAhead: number): Promise<User[]> {
    const today = DateTime.now().startOf('day');
    const endDate = today.plus({ days: daysAhead });

    // Extract month-day for comparison (format: MM-DD)
    const todayMD = today.toFormat('MM-dd');
    const endMD = endDate.toFormat('MM-dd');

    // PostgreSQL TO_CHAR() extracts month-day from DATE field for comparison
    let users;

    if (todayMD <= endMD) {
      // Normal range (no year wrap) - e.g., March 15 to March 22
      users = await this.prisma.$queryRaw<
        Array<{
          id: string;
          first_name: string;
          last_name: string;
          date_of_birth: Date;
          timezone: string;
          created_at: Date;
          updated_at: Date;
        }>
      >`
        SELECT * FROM users
        WHERE TO_CHAR(date_of_birth, 'MM-DD') >= ${todayMD}
          AND TO_CHAR(date_of_birth, 'MM-DD') <= ${endMD}
      `;
    } else {
      // Year wrap range (e.g., Dec 28 to Jan 3)
      users = await this.prisma.$queryRaw<
        Array<{
          id: string;
          first_name: string;
          last_name: string;
          date_of_birth: Date;
          timezone: string;
          created_at: Date;
          updated_at: Date;
        }>
      >`
        SELECT * FROM users
        WHERE TO_CHAR(date_of_birth, 'MM-DD') >= ${todayMD}
           OR TO_CHAR(date_of_birth, 'MM-DD') <= ${endMD}
      `;
    }

    // Map raw SQL results (with snake_case columns) to domain entities
    return users.map((u) =>
      userToDomain({
        id: u.id,
        firstName: u.first_name,
        lastName: u.last_name,
        dateOfBirth: u.date_of_birth,
        timezone: u.timezone,
        createdAt: u.created_at,
        updatedAt: u.updated_at,
      })
    );
  }

  /**
   * Updates an existing user
   */
  public async update(user: User): Promise<User> {
    const prismaData = userToPrisma(user);

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        firstName: prismaData.firstName,
        lastName: prismaData.lastName,
        dateOfBirth: prismaData.dateOfBirth,
        timezone: prismaData.timezone,
        updatedAt: prismaData.updatedAt,
      },
    });

    return userToDomain(updated);
  }

  /**
   * Deletes a user (cascade deletes related events via Prisma schema)
   */
  public async delete(userId: string): Promise<void> {
    await this.prisma.user.delete({
      where: { id: userId },
    });
  }
}
