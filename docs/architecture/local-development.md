# Local Development & Testing

Complete guide for setting up and testing the birthday event scheduling system locally.

Reference: [Full Architecture Document](../architecture.md)

---

## Overview

This document covers everything needed to develop and test locally:
- Docker environment setup (PostgreSQL, LocalStack)
- Running tests (unit, integration, E2E)
- Connection pooling testing with PgBouncer
- Debugging and troubleshooting

For **production deployment** (AWS Lambda, ECS, RDS Proxy), see [Infrastructure](./infrastructure.md).

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| **Node.js** | 20.11.0 LTS | JavaScript runtime |
| **npm** | 10.x | Package manager (comes with Node.js) |
| **Docker** | 24.0.7+ | Container runtime |
| **Docker Compose** | 2.20.0+ | Multi-container orchestration |
| **Git** | Latest | Version control |

### Optional Tools

| Tool | Purpose |
|------|---------|
| **PostgreSQL Client (psql)** | Direct database access |
| **awslocal CLI** | LocalStack interaction |
| **pgAdmin** | Database GUI (alternative to Prisma Studio) |

### Installation Verification

```bash
# Check Node.js version
node --version  # Should be v20.11.0 or compatible

# Check npm version
npm --version   # Should be 10.x

# Check Docker version
docker --version        # Should be 24.0.7+
docker compose version  # Should be 2.20.0+
```

---

## Quick Start

### 1. Clone and Install

```bash
# Clone repository
git clone <repository-url>
cd bday

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### 2. Start Docker Services

```bash
# Start PostgreSQL and LocalStack
npm run docker:start

# Verify services are running
docker ps
```

Expected output:
```
CONTAINER ID   IMAGE                        STATUS         PORTS
abc123         postgres:16                  Up 10 seconds  0.0.0.0:5432->5432/tcp
def456         localstack/localstack:3.1.0  Up 10 seconds  0.0.0.0:4566->4566/tcp
```

### 3. Run Database Migrations

```bash
# Generate Prisma Client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Seed sample data (optional)
npm run db:seed
```

### 4. Run Tests

```bash
# Run all tests
npm test

# Tests should pass ✅
```

You're now ready to develop! 🎉

---

## Docker Environment

### Services Overview

The local environment runs two Docker containers:

```
┌────────────────────────────────────────┐
│ Development Machine (localhost)       │
├────────────────────────────────────────┤
│                                        │
│  ┌─────────────────────────────────┐  │
│  │ PostgreSQL 16                   │  │
│  │ Port: 5432                      │  │
│  │ Database: bday                  │  │
│  │ User: postgres                  │  │
│  └─────────────────────────────────┘  │
│                                        │
│  ┌─────────────────────────────────┐  │
│  │ LocalStack 3.1.0                │  │
│  │ Port: 4566                      │  │
│  │ Services: SQS, EventBridge, SNS │  │
│  └─────────────────────────────────┘  │
│                                        │
└────────────────────────────────────────┘
```

### PostgreSQL Configuration

**Connection Details:**
```bash
Host:     localhost
Port:     5432
Database: bday
User:     postgres
Password: postgres  # From .env file
```

**Connection String:**
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bday"
```

**Extensions Installed:**
- `uuid-ossp` - UUID generation

### LocalStack Configuration

LocalStack emulates AWS services locally:

**Endpoint:**
```
http://localhost:4566
```

**Services Available:**
- API Gateway (REST API)
- Lambda (serverless functions)
- SQS (message queue)
- EventBridge (scheduler)
- SNS (notifications)

---

## Docker Commands

### Starting Services

```bash
# Start all services (PostgreSQL + LocalStack)
npm run docker:start

# Start in background
docker compose -f docker/docker-compose.yml up -d

# Check services are healthy
docker compose -f docker/docker-compose.yml ps
```

### Stopping Services

```bash
# Stop all services
npm run docker:stop

# Stop and remove containers
docker compose -f docker/docker-compose.yml down

# Stop and remove volumes (deletes data!)
docker compose -f docker/docker-compose.yml down -v
```

### Viewing Logs

```bash
# View all service logs
npm run docker:logs

# View specific service logs
docker logs bday-postgres
docker logs bday-localstack

# Follow logs in real-time
docker logs -f bday-postgres
```

### Resetting Database

```bash
# Reset database (deletes all data!)
npm run docker:reset

# This will:
# 1. Stop containers
# 2. Remove volumes
# 3. Start containers
# 4. Run migrations
# 5. Seed sample data
```

### Accessing PostgreSQL

```bash
# Using psql (if installed locally)
psql -h localhost -p 5432 -U postgres -d bday

# Using Docker exec
docker exec -it bday-postgres psql -U postgres -d bday

# Using Prisma Studio (GUI)
npm run prisma:studio
# Opens http://localhost:5555
```

### Troubleshooting Docker

**Problem: Ports already in use**

```bash
# Check what's using port 5432
lsof -i :5432

# Check what's using port 4566
lsof -i :4566

# Kill the process if needed
kill -9 <PID>
```

**Problem: Services won't start**

```bash
# View detailed logs
docker compose -f docker/docker-compose.yml logs

# Check container status
docker compose -f docker/docker-compose.yml ps

# Restart services
npm run docker:stop
npm run docker:start
```

**Problem: Database connection errors**

```bash
# Verify PostgreSQL is healthy
docker compose -f docker/docker-compose.yml ps postgres

# Check PostgreSQL logs
docker logs bday-postgres

# Test connection
psql -h localhost -p 5432 -U postgres -d bday -c "SELECT 1"
```

**Problem: Out of disk space**

```bash
# Remove unused Docker resources
docker system prune -a

# Remove old volumes
docker volume prune
```

---

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (during development)
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run specific test file
npm test -- PrismaEventRepository.test.ts

# Run tests matching a pattern
npm test -- -t "should prevent duplicate claims"
```

### Test Types

#### Integration Tests ✅

**Location:** `src/__tests__/integration/`

**Purpose:** Verify adapter implementations with real database

**Examples:**
- Repository implementations (Prisma)
- Database transactions
- Concurrency control (`FOR UPDATE SKIP LOCKED`)
- Optimistic locking

**Running:**
```bash
# Requires PostgreSQL running
npm run docker:start
npm test
```

**Key Test:** Distributed Scheduler Concurrency
```typescript
it('should prevent duplicate claims when called concurrently', async () => {
  // Creates 10 PENDING events
  // Runs 3 concurrent claimReadyEvents() calls
  // Verifies each event claimed exactly once (no duplicates)
});
```

#### Unit Tests 🚧

**Location:** Colocated with source files

**Purpose:** Test domain logic in isolation

**Examples:**
- Domain entities (User, Event)
- Value objects (EventStatus, IdempotencyKey)
- Domain services (TimezoneService)

**Running:**
```bash
npm test -- --testPathPattern=unit
```

#### E2E Tests 📋

**Location:** `src/__tests__/e2e/`

**Purpose:** Test complete user workflows

**Status:** Planned for future stories

### Test Infrastructure

**Test Database:**
- PostgreSQL 16 in Docker via Testcontainers
- Automatic schema migration before tests
- Database cleanup between test suites

**Test Helpers:**
- `testDatabase.ts` - Database lifecycle management
- `cleanDatabase()` - Truncate all tables
- `startTestDatabase()` - Initialize test DB
- `stopTestDatabase()` - Cleanup after tests

**Example Usage:**
```typescript
describe('PrismaEventRepository', () => {
  let prisma: PrismaClient;
  let repository: PrismaEventRepository;

  beforeAll(async () => {
    prisma = await startTestDatabase();
    repository = new PrismaEventRepository(prisma);
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  it('should create event', async () => {
    // Test implementation
  });
});
```

### Coverage Targets

| Layer | Target | Current |
|-------|--------|---------|
| **Domain** | 100% | 🚧 In progress |
| **Application** | 80% | 📋 Planned |
| **Adapters** | 80% | ✅ ~90% |

---

## Connection Pooling Testing

### Why Test Connection Pooling?

In production, Lambda functions connect through **RDS Proxy** for connection pooling. Testing this behavior locally ensures:
- ✅ No "too many connections" errors
- ✅ Connection reuse works correctly
- ✅ `FOR UPDATE SKIP LOCKED` works with pooling
- ✅ Transaction isolation maintained

### Option 1: PgBouncer (Recommended)

**PgBouncer** is an open-source connection pooler that mimics RDS Proxy behavior.

#### Architecture

```
┌────────────────────────────────────────┐
│ Test Process (20 Prisma clients)      │
└───────────────────┬────────────────────┘
                    │ 20 connections
                    ▼
┌────────────────────────────────────────┐
│ PgBouncer (Docker)                     │
│ Port: 6432                             │
│ Pool Mode: transaction                 │
│ Pool Size: 10                          │
└───────────────────┬────────────────────┘
                    │ 10 connections
                    ▼
┌────────────────────────────────────────┐
│ PostgreSQL (Docker)                    │
│ Port: 5432                             │
└────────────────────────────────────────┘
```

**Result:** 20 clients share 10 database connections (50% pooling efficiency)

#### Setup PgBouncer

**1. Add PgBouncer to docker-compose.yml:**

```yaml
services:
  postgres:
    image: postgres:16
    container_name: bday-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: bday
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  pgbouncer:
    image: edoburu/pgbouncer:1.21.0
    container_name: bday-pgbouncer
    environment:
      # Database connection
      DATABASE_URL: "postgresql://postgres:postgres@postgres:5432/bday"

      # Pool configuration (mimics RDS Proxy)
      POOL_MODE: transaction           # Same as RDS Proxy
      MAX_CLIENT_CONN: 100             # Max client connections
      DEFAULT_POOL_SIZE: 10            # Actual DB connections
      RESERVE_POOL_SIZE: 5             # Reserve connections

      # Connection timeouts
      SERVER_IDLE_TIMEOUT: 600         # 10 minutes
      QUERY_TIMEOUT: 0                 # No timeout

      # Auth
      AUTH_TYPE: md5
      AUTH_FILE: /etc/pgbouncer/userlist.txt
    ports:
      - "6432:5432"
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - ./docker/pgbouncer/userlist.txt:/etc/pgbouncer/userlist.txt:ro

volumes:
  postgres_data:
```

**2. Create PgBouncer user file:**

```bash
# Create directory
mkdir -p docker/pgbouncer

# Generate MD5 hash
echo -n "postgrespostgres" | md5sum
# Output: c23e9f5c8ee8f1fb1d0d2b6ad1c5c3e0

# Create userlist.txt
echo '"postgres" "md5c23e9f5c8ee8f1fb1d0d2b6ad1c5c3e0"' > docker/pgbouncer/userlist.txt
```

**3. Start PgBouncer:**

```bash
# Start services
docker compose -f docker/docker-compose.yml up -d

# Verify PgBouncer is running
docker logs bday-pgbouncer
```

#### Test Connection Pooling

**1. Update connection string:**

```bash
# Point to PgBouncer (port 6432)
export DATABASE_URL="postgresql://postgres:postgres@localhost:6432/bday"
```

**2. Run pooling test:**

```typescript
// scripts/test-connection-pooling.ts
import { PrismaClient } from '@prisma/client';

async function testConnectionPooling() {
  const clients: PrismaClient[] = [];

  // Create 20 Prisma clients (simulating 20 concurrent Lambdas)
  console.log('Creating 20 Prisma clients...');
  for (let i = 0; i < 20; i++) {
    const prisma = new PrismaClient();
    clients.push(prisma);
  }

  // Execute queries concurrently
  console.log('Executing 20 concurrent queries...');
  const queries = clients.map((prisma, index) =>
    prisma.$queryRaw`SELECT pg_backend_pid() as pid, ${index} as client_id`
  );

  const results = await Promise.all(queries);

  // Analyze connection reuse
  const pids = results.map((r: any) => r[0].pid);
  const uniquePids = new Set(pids);

  console.log(`\nResults:`);
  console.log(`- Total clients: ${clients.length}`);
  console.log(`- Unique backend PIDs: ${uniquePids.size}`);
  console.log(`- Connection reuse: ${clients.length - uniquePids.size} times`);
  console.log(`- Pooling efficiency: ${((1 - uniquePids.size / clients.length) * 100).toFixed(1)}%`);

  // Cleanup
  await Promise.all(clients.map(p => p.$disconnect()));
}

testConnectionPooling();
```

**3. Run test:**

```bash
# With PgBouncer
export DATABASE_URL="postgresql://postgres:postgres@localhost:6432/bday"
npx ts-node scripts/test-connection-pooling.ts

# Expected output:
# Results:
# - Total clients: 20
# - Unique backend PIDs: 10
# - Connection reuse: 10 times
# - Pooling efficiency: 50.0%
```

**4. Verify integration tests still pass:**

```bash
# Tests should pass with PgBouncer
npm test

# This verifies FOR UPDATE SKIP LOCKED works with connection pooling
```

#### Monitor PgBouncer

**Connect to admin console:**

```bash
psql -h localhost -p 6432 -U postgres pgbouncer
```

**Useful commands:**

| Command | Purpose |
|---------|---------|
| `SHOW POOLS;` | Pool statistics |
| `SHOW CLIENTS;` | Active client connections |
| `SHOW SERVERS;` | Backend database connections |
| `SHOW STATS;` | Request statistics |
| `SHOW DATABASES;` | Configured databases |

**Example output:**

```sql
pgbouncer=# SHOW POOLS;
 database |   user    | cl_active | cl_waiting | sv_active | sv_idle
----------+-----------+-----------+------------+-----------+---------
 bday     | postgres  |        20 |          0 |         5 |       5
```

**Interpretation:**
- `cl_active: 20` - 20 client connections
- `sv_active: 5` - 5 active database connections
- `sv_idle: 5` - 5 idle database connections
- **Pooling working!** 20 clients using only 10 DB connections

#### PgBouncer vs RDS Proxy

| Feature | PgBouncer (Local) | RDS Proxy (AWS) |
|---------|-------------------|-----------------|
| **Connection Pooling** | ✅ Yes | ✅ Yes |
| **Transaction Mode** | ✅ Yes | ✅ Yes |
| **FOR UPDATE Support** | ✅ Yes | ✅ Yes |
| **IAM Authentication** | ❌ No | ✅ Yes |
| **Automatic Failover** | ❌ No | ✅ Yes |
| **Secrets Manager** | ❌ No | ✅ Yes |
| **Cost** | ✅ Free | 💰 $0.015/hour |

**For local development:** PgBouncer provides 95% of RDS Proxy functionality.

### Option 2: Direct PostgreSQL (Simple)

For basic development, connect directly to PostgreSQL without pooling:

```bash
# Direct connection (no pooling)
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bday"
npm test
```

**Pros:**
- ✅ Simple setup
- ✅ No additional services
- ✅ Good for initial development

**Cons:**
- ❌ Doesn't test connection pooling
- ❌ May miss connection limit issues
- ❌ Different from production behavior

**When to use:**
- Early development
- Unit tests
- When pooling isn't critical

### Progressive Testing Strategy

**Phase 1 (Current - MVP):**
```
Development → Direct PostgreSQL
- Simple, fast iteration
- Focus on business logic
```

**Phase 2 (Pre-Production):**
```
Testing → PgBouncer
- Test connection pooling
- Verify FOR UPDATE SKIP LOCKED with pooling
- Load testing
```

**Phase 3 (Production):**
```
AWS → RDS Proxy
- Fully managed pooling
- IAM authentication
- Automatic failover
```

---

## Database Management

### Prisma Commands

```bash
# Generate Prisma Client (after schema changes)
npm run prisma:generate

# Create migration (development)
npm run prisma:migrate
# Or: npx prisma migrate dev --name <migration-name>

# Apply migrations (production)
npx prisma migrate deploy

# Reset database (deletes all data!)
npm run db:reset

# Seed database with sample data
npm run db:seed

# Open Prisma Studio (database GUI)
npm run prisma:studio
```

### Viewing Database

**Option 1: Prisma Studio (Recommended)**

```bash
npm run prisma:studio
```

Opens http://localhost:5555 with GUI for:
- Viewing tables and data
- Editing records
- Running queries

**Option 2: psql CLI**

```bash
# Connect to database
psql -h localhost -p 5432 -U postgres -d bday

# List tables
\dt

# Describe table
\d events

# Run query
SELECT * FROM events WHERE status = 'PENDING';

# Exit
\q
```

**Option 3: pgAdmin**

Install pgAdmin 4 and add server:
- Host: localhost
- Port: 5432
- Database: bday
- Username: postgres
- Password: postgres

### Database Seeding

The seed script creates sample data for testing:

```bash
npm run db:seed
```

**Creates:**
- 3 sample users
  - John Doe (America/New_York)
  - Jane Smith (Europe/London)
  - Bob Johnson (Asia/Tokyo)
- 3 birthday events with different timezones
- All events in PENDING status

**Seed file:** `prisma/seed.ts`

**Customize seeding:**
```typescript
// prisma/seed.ts
async function main() {
  // Create your custom seed data
  await prisma.user.create({ ... });
  await prisma.event.create({ ... });
}
```

### Database Migrations

**Create new migration:**

```bash
# Make changes to prisma/schema.prisma
# Then generate migration
npm run prisma:migrate
# Or: npx prisma migrate dev --name add_user_email_field
```

**Migration workflow:**
1. Modify `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name <description>`
3. Prisma generates SQL migration in `prisma/migrations/`
4. Migration is automatically applied
5. Prisma Client is regenerated

**View migration history:**

```bash
# List all migrations
ls -la prisma/migrations/

# View specific migration SQL
cat prisma/migrations/20251020113627_init/migration.sql
```

**Troubleshooting migrations:**

```bash
# Migration failed? Reset database
npm run db:reset

# Check migration status
npx prisma migrate status

# Mark migration as applied (if already manually applied)
npx prisma migrate resolve --applied <migration-name>
```

---

## Development Workflow

### Daily Development Cycle

**1. Start environment:**
```bash
npm run docker:start
```

**2. Make changes:**
```bash
# Edit code in src/
# Run linter
npm run lint

# Format code
npm run format
```

**3. Run tests:**
```bash
# Run tests in watch mode
npm run test:watch

# Or run once
npm test
```

**4. Check database:**
```bash
# Open Prisma Studio
npm run prisma:studio
```

**5. Stop environment:**
```bash
npm run docker:stop
```

### Schema Changes Workflow

**1. Update schema:**
```typescript
// prisma/schema.prisma
model User {
  // Add new field
  email String @unique
}
```

**2. Create migration:**
```bash
npm run prisma:migrate
# Enter migration name: add_user_email
```

**3. Regenerate Prisma Client:**
```bash
npm run prisma:generate
```

**4. Update TypeScript types:**
```typescript
// Types are automatically updated
const user = await prisma.user.create({
  data: {
    email: 'user@example.com', // TypeScript knows about this field
  }
});
```

**5. Run tests:**
```bash
npm test
```

### Debugging Tips

**Enable Prisma query logging:**

```typescript
// src/index.ts or test setup
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});
```

**Check PostgreSQL logs:**

```bash
docker logs -f bday-postgres
```

**Monitor slow queries:**

```sql
-- In psql
SELECT * FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

**Check active connections:**

```sql
SELECT count(*) FROM pg_stat_activity;
```

**Kill stuck queries:**

```sql
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'active' AND query_start < NOW() - INTERVAL '5 minutes';
```

---

## Common Issues

### Port Conflicts

**Problem:** Port 5432 or 4566 already in use

**Solution:**
```bash
# Find process using port
lsof -i :5432
lsof -i :4566

# Kill process
kill -9 <PID>

# Or change port in docker-compose.yml
ports:
  - "5433:5432"  # Use different host port
```

### Database Connection Errors

**Problem:** `ECONNREFUSED` when connecting to database

**Solution:**
```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Check PostgreSQL logs
docker logs bday-postgres

# Restart PostgreSQL
docker restart bday-postgres

# Reset environment
npm run docker:reset
```

### Migration Conflicts

**Problem:** Migration failed or schema out of sync

**Solution:**
```bash
# Reset database and reapply all migrations
npm run db:reset

# Or manually reset
npx prisma migrate reset --force
```

### Test Failures

**Problem:** Tests fail with "database already exists"

**Solution:**
```bash
# Clean database before tests
npm test

# Or manually clean
docker exec -it bday-postgres psql -U postgres -c "DROP DATABASE IF EXISTS testdb;"
```

### Docker Volume Issues

**Problem:** Old data persists after reset

**Solution:**
```bash
# Stop and remove volumes
docker compose -f docker/docker-compose.yml down -v

# Remove all Docker volumes
docker volume prune -f

# Restart
npm run docker:start
```

---

## Performance Tips

### Speed Up Tests

**Use in-memory database for unit tests:**
```typescript
// For unit tests (future)
const prisma = new PrismaClient({
  datasources: {
    db: { url: 'file::memory:?cache=shared' }
  }
});
```

**Run tests in parallel:**
```bash
# Jest runs tests in parallel by default
npm test -- --maxWorkers=4
```

**Skip slow tests during development:**
```typescript
// Mark slow tests
it.skip('slow integration test', async () => {
  // ...
});
```

### Speed Up Docker

**Use volumes for node_modules:**
```yaml
volumes:
  - ./src:/app/src
  - /app/node_modules  # Don't sync node_modules
```

**Reduce rebuild time:**
```bash
# Use Docker layer caching
docker compose build --parallel
```

---

## Next Steps

Once comfortable with local development:

1. **Add unit tests** for domain entities
2. **Implement E2E tests** for full workflows
3. **Set up PgBouncer** to test connection pooling
4. **Deploy to AWS** following [Infrastructure Guide](./infrastructure.md)

---

## Related Documentation

| Topic | Document |
|-------|----------|
| **Production Deployment** | [Infrastructure](./infrastructure.md) |
| **Distributed Scheduler Pattern** | [Design Patterns](./design-patterns.md#8-distributed-scheduler-pattern---concurrent-job-claiming) |
| **Testing Strategy** | [Test Strategy](./test-strategy.md) |
| **Code Standards** | [Coding Standards](./coding-standards.md) |

---

**Last Updated:** 2025-10-23
