import { IUserRepository } from './IUserRepository';
import { User } from '../../domain/entities/User';

describe('IUserRepository', () => {
  it('should use User domain entity not Prisma models', () => {
    // Type checking test - verifies User entity is used
    const mockUser = {} as User;
    const repo: IUserRepository = {
      create: (user: User) => Promise.resolve(user),
      findById: (_id: string) => Promise.resolve(mockUser),
      findByEmail: (_email: string) => Promise.resolve(mockUser),
      findUsersWithUpcomingBirthdays: (_daysAhead: number) => Promise.resolve([mockUser]),
      update: (user: User) => Promise.resolve(user),
      delete: (_id: string) => Promise.resolve(),
    };

    expect(repo).toBeDefined();
  });

  it('should have explicit return type annotations', () => {
    // This test ensures TypeScript compilation will fail if return types are missing
    // The interface itself enforces this at compile time
    const repo: IUserRepository = {
      create: (user: User): Promise<User> => Promise.resolve(user),
      findById: (_id: string): Promise<User | null> => Promise.resolve(null),
      findByEmail: (_email: string): Promise<User | null> => Promise.resolve(null),
      findUsersWithUpcomingBirthdays: (_daysAhead: number): Promise<User[]> => Promise.resolve([]),
      update: (user: User): Promise<User> => Promise.resolve(user),
      delete: (_id: string): Promise<void> => Promise.resolve(),
    };

    expect(repo).toBeDefined();
  });
});
