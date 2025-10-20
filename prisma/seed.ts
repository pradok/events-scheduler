import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create sample users
  const user1 = await prisma.user.create({
    data: {
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: new Date('1990-03-15'),
      timezone: 'America/New_York',
    },
  });

  const user2 = await prisma.user.create({
    data: {
      firstName: 'Jane',
      lastName: 'Smith',
      dateOfBirth: new Date('1985-07-22'),
      timezone: 'Europe/London',
    },
  });

  const user3 = await prisma.user.create({
    data: {
      firstName: 'Bob',
      lastName: 'Johnson',
      dateOfBirth: new Date('1992-12-05'),
      timezone: 'Asia/Tokyo',
    },
  });

  console.log('✅ Created 3 users:', {
    user1: `${user1.firstName} ${user1.lastName}`,
    user2: `${user2.firstName} ${user2.lastName}`,
    user3: `${user3.firstName} ${user3.lastName}`,
  });

  // Create sample events for users
  const event1 = await prisma.event.create({
    data: {
      userId: user1.id,
      eventType: 'BIRTHDAY',
      status: 'PENDING',
      targetTimestampUTC: new Date('2026-03-15T14:00:00Z'), // 9 AM EST = 2 PM UTC
      targetTimestampLocal: new Date('2026-03-15T09:00:00'), // 9 AM local
      targetTimezone: 'America/New_York',
      idempotencyKey: `birthday-${user1.id}-2026`,
      deliveryPayload: {
        message: `Happy Birthday, ${user1.firstName} ${user1.lastName}!`,
        userName: `${user1.firstName} ${user1.lastName}`,
        eventType: 'BIRTHDAY',
      },
    },
  });

  const event2 = await prisma.event.create({
    data: {
      userId: user2.id,
      eventType: 'BIRTHDAY',
      status: 'PENDING',
      targetTimestampUTC: new Date('2026-07-22T08:00:00Z'), // 9 AM BST = 8 AM UTC
      targetTimestampLocal: new Date('2026-07-22T09:00:00'), // 9 AM local
      targetTimezone: 'Europe/London',
      idempotencyKey: `birthday-${user2.id}-2026`,
      deliveryPayload: {
        message: `Happy Birthday, ${user2.firstName} ${user2.lastName}!`,
        userName: `${user2.firstName} ${user2.lastName}`,
        eventType: 'BIRTHDAY',
      },
    },
  });

  const event3 = await prisma.event.create({
    data: {
      userId: user3.id,
      eventType: 'BIRTHDAY',
      status: 'PENDING',
      targetTimestampUTC: new Date('2025-12-05T00:00:00Z'), // 9 AM JST = 12 AM UTC
      targetTimestampLocal: new Date('2025-12-05T09:00:00'), // 9 AM local
      targetTimezone: 'Asia/Tokyo',
      idempotencyKey: `birthday-${user3.id}-2025`,
      deliveryPayload: {
        message: `Happy Birthday, ${user3.firstName} ${user3.lastName}!`,
        userName: `${user3.firstName} ${user3.lastName}`,
        eventType: 'BIRTHDAY',
      },
    },
  });

  console.log('✅ Created 3 events:', {
    event1: event1.id,
    event2: event2.id,
    event3: event3.id,
  });

  console.log('🎉 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
