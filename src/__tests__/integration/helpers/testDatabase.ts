import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;

/**
 * Starts a PostgreSQL test container and initializes Prisma client with migrations.
 * Should be called once before all tests in the suite.
 *
 * @returns {Promise<PrismaClient>} Initialized Prisma client connected to test database
 */
export async function startTestDatabase(): Promise<PrismaClient> {
  // Start PostgreSQL container
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('testdb')
    .withUsername('testuser')
    .withPassword('testpass')
    .start();

  // Set DATABASE_URL for Prisma to use test container
  const connectionUri = container.getConnectionUri();
  process.env.DATABASE_URL = connectionUri;

  // Run Prisma migrations to set up schema
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: connectionUri },
  });

  // Create and connect Prisma client
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: connectionUri,
      },
    },
  });

  await prisma.$connect();

  return prisma;
}

/**
 * Stops the PostgreSQL test container and disconnects Prisma client.
 * Should be called once after all tests in the suite complete.
 */
export async function stopTestDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
  }
  if (container) {
    await container.stop();
  }
}

/**
 * Cleans all data from the test database.
 * Should be called between tests to ensure test isolation.
 *
 * Deletes in order to respect foreign key constraints:
 * 1. Events (references Users)
 * 2. Users
 */
export async function cleanDatabase(prismaClient: PrismaClient): Promise<void> {
  // Delete in order to respect foreign key constraints
  await prismaClient.event.deleteMany();
  await prismaClient.user.deleteMany();
}

/**
 * Gets the current Prisma client instance.
 * Only available after startTestDatabase() has been called.
 */
export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    throw new Error('Test database not started. Call startTestDatabase() first.');
  }
  return prisma;
}
