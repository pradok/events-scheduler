import { User as PrismaUser } from '@prisma/client';
import { User } from '@modules/user/domain/entities/User';
import { DateOfBirth } from '@modules/user/domain/value-objects/DateOfBirth';
import { Timezone } from '@shared/value-objects/Timezone';
import { DateTime } from 'luxon';

/**
 * Converts a Prisma User model to a domain User entity
 * @param prismaUser The Prisma User model from database
 * @returns Domain User entity
 */
export function userToDomain(prismaUser: PrismaUser): User {
  // Convert Prisma Date to ISO string format (YYYY-MM-DD) for DateOfBirth
  // Use UTC to avoid timezone shifts since dateOfBirth is stored as DATE (not DATETIME)
  const dobString = DateTime.fromJSDate(prismaUser.dateOfBirth, { zone: 'utc' }).toISODate();

  if (!dobString) {
    throw new Error(`Invalid date of birth for user ${prismaUser.id}`);
  }

  return new User({
    id: prismaUser.id,
    firstName: prismaUser.firstName,
    lastName: prismaUser.lastName,
    dateOfBirth: DateOfBirth.fromString(dobString),
    timezone: new Timezone(prismaUser.timezone),
    createdAt: DateTime.fromJSDate(prismaUser.createdAt),
    updatedAt: DateTime.fromJSDate(prismaUser.updatedAt),
  });
}

/**
 * Converts a domain User entity to Prisma User model data
 * @param domainUser The domain User entity
 * @returns Prisma User model data (without id for creates)
 */
export function userToPrisma(domainUser: User): Omit<
  PrismaUser,
  'id' | 'createdAt' | 'updatedAt'
> & {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
} {
  // Convert DateOfBirth string (YYYY-MM-DD) to JavaScript Date for Prisma
  // Use UTC to avoid timezone shifts since dateOfBirth is stored as DATE (not DATETIME)
  const dobDate = DateTime.fromISO(domainUser.dateOfBirth.toString(), { zone: 'utc' }).toJSDate();

  return {
    id: domainUser.id,
    firstName: domainUser.firstName,
    lastName: domainUser.lastName,
    dateOfBirth: dobDate, // JavaScript Date for Prisma Date type
    timezone: domainUser.timezone.toString(), // IANA timezone string
    createdAt: domainUser.createdAt.toJSDate(),
    updatedAt: domainUser.updatedAt.toJSDate(),
  };
}
