# Getting Started (5 Minutes)

**Quick start guide to get the Time-Based Event Scheduling System running locally**

---

## Prerequisites

Before you begin, ensure you have:

- ✅ **Node.js 20.11.0** (LTS) - JavaScript runtime
- ✅ **Docker Desktop** - Container runtime for PostgreSQL and LocalStack
- ✅ **npm 10+** - Package manager (comes with Node.js)
- ✅ **Git** - Version control

### Verify Prerequisites

```bash
# Check Node.js version
node --version  # Should show v20.11.0 or compatible

# Check npm version
npm --version   # Should show 10.x

# Check Docker is running
docker --version
docker ps       # Should not error
```

---

## Quick Start (5 Steps)

### 1. Install Dependencies

```bash
npm install
```

**What this does:** Installs all Node.js packages defined in `package.json`

### 2. Generate Prisma Client

```bash
npm run prisma:generate
```

**What this does:** Generates TypeScript types and Prisma Client from `schema.prisma`

### 3. Start Docker Services

```bash
npm run docker:start
```

**What this does:** Starts PostgreSQL (port 5432) and LocalStack (port 4566)

Wait ~15 seconds for services to initialize.

### 4. Run Database Migrations

```bash
npm run prisma:migrate
```

**What this does:** Creates database tables (users, events) and applies schema

### 5. Verify Setup

```bash
npm run docker:verify
```

**Expected output:**
```
✅ All checks passed!

LocalStack is ready for E2E testing.
```

---

## ✅ You're Ready!

The system is now running locally. Here's what you have:

| Service | Port | Purpose |
|---------|------|---------|
| **PostgreSQL** | 5432 | Database for users and events |
| **LocalStack** | 4566 | AWS service emulation (SQS, Lambda, EventBridge) |

---

## What's Next?

### Start User API Server (Optional)

```bash
npm run dev               # Start Fastify API with hot-reload
```

**Endpoints available:**

- Health check: `GET http://localhost:3000/health`
- Get user: `GET http://localhost:3000/user/:id`
- Update user: `PUT http://localhost:3000/user/:id`
- Delete user: `DELETE http://localhost:3000/user/:id`

**Learn more:** [Local Development Guide](./local-development.md)

### Run Tests

```bash
npm run test:unit         # Fast unit tests
npm run test:integration  # Integration tests with real database
npm run test:e2e          # Full end-to-end tests
```

**Learn more:** [Testing Guide](./testing-guide.md)

### Deploy Lambdas (Optional)

```bash
npm run lambda:all        # Build and deploy scheduler/worker to LocalStack
```

**Learn more:** [LocalStack Setup](./localstack-setup-community.md)

### Other Useful Commands

- **Database UI:** `npm run prisma:studio` (opens at http://localhost:5555)
- **View logs:** `npm run docker:logs`
- **Reset everything:** `npm run docker:reset` (clean slate)

**Learn more:** [Local Development Guide](./local-development.md)

---

## Troubleshooting

### Docker services won't start

```bash
# Check Docker Desktop is running
docker ps

# If not running, start Docker Desktop and retry
npm run docker:start
```

### Port already in use (5432 or 4566)

```bash
# Find what's using the port
lsof -i :5432
lsof -i :4566

# Kill the process or change ports in docker-compose.yml
```

### Tests failing

```bash
# Reset database and restart
npm run docker:reset
npm run docker:verify
npm run test:unit
```

**More help:** [Debugging Guide](./debugging.md)

---

## Common Commands Cheat Sheet

```bash
# Development
npm run dev                 # Start User API server (http://localhost:3000)
npm run docker:start        # Start PostgreSQL + LocalStack
npm run docker:stop         # Stop containers (keep data)
npm run docker:reset        # Nuclear option: delete everything and restart
npm run docker:verify       # Check LocalStack resources created

# Database
npm run prisma:migrate      # Apply migrations
npm run prisma:studio       # Open database GUI
npm run db:seed             # Seed test data (if configured)

# Testing
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests
npm run test:e2e            # End-to-end tests
npm run test                # All tests

# Code Quality
npm run lint                # Check code style
npm run typecheck           # TypeScript type checking
npm run format              # Auto-format code
```

---

## Documentation Index

- **[Getting Started](./getting-started.md)** ← You are here
- **[Local Development Guide](./local-development.md)** - Docker, npm scripts, database
- **[LocalStack Setup](./localstack-setup-community.md)** - AWS service emulation
- **[Testing Guide](./testing-guide.md)** - Running and writing tests
- **[Debugging Guide](./debugging.md)** - Troubleshooting and logs

---

**Ready to dive deeper?** Check out the [Local Development Guide](./local-development.md) next! 🚀
