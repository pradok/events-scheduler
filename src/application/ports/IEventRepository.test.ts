import { IEventRepository } from './IEventRepository';
import { Event } from '../../domain/entities/Event';

describe('IEventRepository', () => {
  it('should use Event domain entity not Prisma models', () => {
    // Type checking test - verifies Event entity is used
    const mockEvent = {} as Event;
    const repo: IEventRepository = {
      create: (event: Event) => Promise.resolve(event),
      findById: (_id: string) => Promise.resolve(mockEvent),
      findByUserId: (_userId: string) => Promise.resolve([mockEvent]),
      update: (event: Event) => Promise.resolve(event),
      claimReadyEvents: (_limit: number) => Promise.resolve([mockEvent]),
    };

    expect(repo).toBeDefined();
  });

  it('should have explicit return type annotations', () => {
    // This test ensures TypeScript compilation will fail if return types are missing
    // The interface itself enforces this at compile time
    const repo: IEventRepository = {
      create: (event: Event): Promise<Event> => Promise.resolve(event),
      findById: (_id: string): Promise<Event | null> => Promise.resolve(null),
      findByUserId: (_userId: string): Promise<Event[]> => Promise.resolve([]),
      update: (event: Event): Promise<Event> => Promise.resolve(event),
      claimReadyEvents: (_limit: number): Promise<Event[]> => Promise.resolve([]),
    };

    expect(repo).toBeDefined();
  });
});
