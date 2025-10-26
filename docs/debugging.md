# Debugging & Troubleshooting Guide

**Solutions for common issues and debugging techniques**

**IMPORTANT:** This guide uses `docker exec` to run AWS CLI commands inside the LocalStack container. **You do NOT need to install AWS CLI or awslocal on your machine!**

---

## Quick Fixes

### Nuclear Option (Reset Everything)

When in doubt, start fresh:

```bash
npm run docker:reset
npm run prisma:generate
npm run docker:verify
npm test
```

This solves 80% of issues.

---

## Docker Issues

### Docker services won't start

**Symptom:** `docker:start` fails or hangs

**Solutions:**

1. **Check Docker Desktop is running:**
   ```bash
   docker ps
   ```
   If error → Start Docker Desktop application

2. **Port already in use (5432 or 4566):**
   ```bash
   # Find what's using the port
   lsof -i :5432
   lsof -i :4566

   # Kill the process
   kill -9 <PID>

   # Or restart with different ports in docker-compose.yml
   ```

3. **Containers in bad state:**
   ```bash
   npm run docker:reset
   ```

### Containers start but health checks fail

**Symptom:** Containers show "unhealthy" status

**Check PostgreSQL health:**
```bash
docker exec bday-postgres pg_isready -U bday_user
```

Expected: `bday-postgres:5432 - accepting connections`

**Check LocalStack health:**
```bash
curl http://localhost:4566/_localstack/health
```

Expected: JSON with all services showing `"available": true`

**Solution:**
```bash
# Give services more time to start
sleep 30
npm run docker:verify

# If still failing, reset
npm run docker:reset
```

### Can't connect to PostgreSQL from host

**Symptom:** `psql` or Prisma Studio can't connect

**Check connection:**
```bash
docker exec -it bday-postgres psql -U bday_user -d bday_db -c "SELECT 1"
```

**If works inside container but not from host:**

Check port mapping:
```bash
docker ps | grep postgres
```

Should show: `0.0.0.0:5432->5432/tcp`

**Fix:** Ensure docker-compose.yml has correct port mapping

---

## LocalStack Issues

### LocalStack not creating resources

**Symptom:** `docker:verify` fails, resources not found

**Check init script ran:**
```bash
npm run docker:logs | grep "LocalStack initialization complete"
```

**If not found:**

1. Check init script exists:
   ```bash
   ls -la docker/localstack/init-aws.sh
   ```

2. Check it's executable:
   ```bash
   chmod +x docker/localstack/init-aws.sh
   ```

3. Restart LocalStack:
   ```bash
   npm run docker:reset
   ```

### SQS queue not found

**Symptom:** `awslocal sqs list-queues` returns empty

**Solution:**
```bash
# Manually run init script
docker exec bday-localstack bash /etc/localstack/init/ready.d/init-aws.sh

# Verify queues created
docker exec bday-localstack sh -c "awslocal sqs list-queues"
```

### Lambda function not found

**Symptom:** `awslocal lambda list-functions` returns empty

**Solution:**
```bash
# Redeploy Lambda
npm run lambda:all

# Verify deployed
docker exec bday-localstack sh -c "awslocal lambda list-functions"
```

---

## Database Issues

### Prisma Client out of sync

**Symptom:** `Type error: Property 'X' does not exist on type 'PrismaClient'`

**Solution:**
```bash
# Regenerate Prisma Client
npm run prisma:generate

# If still fails, nuclear option
rm -rf node_modules/.prisma
rm -rf node_modules/@prisma
npm install
npm run prisma:generate
```

### Migration fails

**Symptom:** `prisma migrate` errors

**Check database is accessible:**
```bash
docker exec -it bday-postgres psql -U bday_user -d bday_db
```

**Reset database:**
```bash
npm run db:reset
```

**WARNING:** Deletes all data!

### Prisma Studio won't open

**Symptom:** `npm run prisma:studio` fails or shows blank page

**Solution:**
```bash
# Check database is running
docker ps | grep postgres

# Try different port
npx prisma studio --port 5556

# Check browser console for errors
```

---

## Lambda Issues

### Lambda can't connect to database

**Symptom:** Lambda logs show `ECONNREFUSED` or `Can't reach database`

**Problem:** Lambda uses `localhost` instead of `host.docker.internal`

**Check Lambda environment:**
```bash
docker exec bday-localstack sh -c "awslocal lambda get-function-configuration \
  --function-name event-scheduler" | grep DATABASE_URL
```

**Expected:**
```
postgresql://bday_user:local_dev_password@host.docker.internal:5432/bday_db
```

**If shows `localhost`:**

Update `scripts/deploy-lambda.js` to use `host.docker.internal`

### Lambda execution times out

**Symptom:** Lambda invocation returns timeout error

**Check timeout setting:**
```bash
docker exec bday-localstack sh -c "awslocal lambda get-function-configuration \
  --function-name event-scheduler" | grep Timeout
```

**Increase timeout:**

Edit `scripts/deploy-lambda.js`:
```javascript
Timeout: 120  // 2 minutes instead of 60
```

Redeploy:
```bash
npm run lambda:deploy:localstack
```

### Lambda logs not showing

**Symptom:** Can't see Lambda execution logs

**View logs:**
```bash
# Tail logs (follow mode)
docker exec bday-localstack sh -c "awslocal logs tail /aws/lambda/event-scheduler --follow"

# Get recent logs
docker exec bday-localstack sh -c "awslocal logs tail /aws/lambda/event-scheduler --since 10m"
```

**If no log group:**

Lambda hasn't been invoked yet. Manually invoke:
```bash
docker exec bday-localstack sh -c "awslocal lambda invoke \
  --function-name event-scheduler \
  output.json && cat output.json"
```

---

## Test Issues

### Tests fail with "Cannot find module"

**Symptom:** Import errors in tests

**Solution:**
```bash
# Regenerate Prisma Client
npm run prisma:generate

# Clear Jest cache
npm test -- --clearCache

# Rebuild
npm run build
```

### Integration tests timeout

**Symptom:** Tests hang or timeout

**Check Docker:**
```bash
docker ps
```

**Increase timeout:**
```typescript
// In test file
jest.setTimeout(120000); // 2 minutes
```

**Check Testcontainers:**
```bash
# View Testcontainers logs
docker logs <container-id>
```

### E2E tests fail with "Queue not found"

**Symptom:** E2E tests can't find SQS queue

**Solution:**
```bash
# Verify LocalStack is running
npm run docker:verify

# Check E2E setup script ran
cat scripts/e2e-test-setup.sh

# Manually run setup
./scripts/e2e-test-setup.sh
```

---

## Viewing Logs

### Docker Container Logs

```bash
# LocalStack logs
npm run docker:logs

# PostgreSQL logs
docker logs bday-postgres -f

# All containers
docker-compose -f docker/docker-compose.yml logs -f
```

### Lambda Logs

```bash
# Tail logs (follow mode)
docker exec bday-localstack sh -c "awslocal logs tail /aws/lambda/event-scheduler --follow"

# Get last 50 lines
docker exec bday-localstack sh -c "awslocal logs tail /aws/lambda/event-scheduler"

# Filter by time
docker exec bday-localstack sh -c "awslocal logs tail /aws/lambda/event-scheduler --since 1h"
```

### Application Logs (Pino)

**In development:**
```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty'  // Pretty printing for local dev
  }
});
```

**In tests:**
```typescript
const logger = pino({
  level: 'silent'  // Suppress logs during tests
});
```

---

## Performance Issues

### Tests running slowly

**Check what's running:**
```bash
# Unit tests should be fast (< 10 seconds)
npm run test:unit

# Integration tests are slower (30-60 seconds)
npm run test:integration

# E2E tests are slowest (1-3 minutes)
npm run test:e2e
```

**Speed up tests:**

1. Run unit tests only during development
2. Use `--watch` mode for TDD
3. Use `--bail` to stop on first failure
4. Run integration/E2E tests only before commits

### LocalStack slow to start

**Normal startup time:** 15-30 seconds

**If slower than 1 minute:**

1. Check Docker Desktop has enough resources:
   - Settings → Resources → Memory: 4GB minimum
   - CPUs: 2 minimum

2. Check disk space:
   ```bash
   docker system df
   ```

3. Clean up unused containers:
   ```bash
   docker system prune -a
   ```

---

## Data Issues

### Events not being claimed by scheduler

**Check event status:**
```bash
npm run prisma:studio
# View events table, check status and targetTimestampUTC
```

**Debug checklist:**

1. Is event status `PENDING`?
2. Is `targetTimestampUTC` in the past?
3. Is scheduler Lambda deployed?
4. Is scheduler Lambda running?

**Manually invoke scheduler:**
```bash
docker exec bday-localstack sh -c "awslocal lambda invoke \
  --function-name event-scheduler \
  output.json && cat output.json"
```

### Events stuck in PROCESSING

**Symptom:** Events never complete or fail

**Check worker Lambda logs:**
```bash
docker exec bday-localstack sh -c "awslocal logs tail /aws/lambda/event-worker --follow"
```

**Check SQS messages:**
```bash
docker exec bday-localstack sh -c "awslocal sqs receive-message \
  --queue-url http://localhost:4566/000000000000/bday-events-queue \
  --max-number-of-messages 10"
```

**Manually reprocess:**
```bash
# Get event ID from database
# Then manually invoke worker with event ID
```

---

## Environment Variable Issues

### Missing environment variables

**Symptom:** `Error: DATABASE_URL is not defined`

**Check .env file exists:**
```bash
ls -la .env
```

**If missing:**
```bash
cp .env.example .env
```

**Verify variables loaded:**
```bash
# In Node.js
console.log(process.env.DATABASE_URL);
```

### Wrong DATABASE_URL for Lambda

**Problem:** Lambda uses host's DATABASE_URL (with `localhost`)

**Lambda needs:** `host.docker.internal` instead of `localhost`

**Check deployment script:**
```bash
cat scripts/deploy-lambda.js | grep DATABASE_URL
```

Should transform `localhost` to `host.docker.internal`

---

## Recovery Procedures

### Complete System Reset

```bash
# 1. Stop everything
npm run docker:stop

# 2. Delete all volumes
npm run docker:teardown

# 3. Clean npm
rm -rf node_modules
npm install

# 4. Regenerate Prisma
npm run prisma:generate

# 5. Start fresh
npm run docker:start
npm run docker:verify
npm run prisma:migrate

# 6. Test
npm run test:unit
```

### Reset Just Database

```bash
# Reset schema
npm run db:reset

# Or manually
docker exec -it bday-postgres psql -U bday_user -d bday_db -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
npm run prisma:migrate
```

### Reset Just LocalStack

```bash
# Restart LocalStack
docker restart bday-localstack

# Wait for init script
sleep 15

# Verify
npm run docker:verify
```

---

## Debugging Tools

### VSCode Debugger

**Launch configuration (.vscode/launch.json):**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Jest Current File",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["${fileBasename}", "--runInBand"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

**Usage:**

1. Open test file
2. Set breakpoints
3. Press F5
4. Select "Jest Current File"

### Database Inspection

```bash
# psql (command line)
docker exec -it bday-postgres psql -U bday_user -d bday_db

# Prisma Studio (GUI)
npm run prisma:studio
```

### LocalStack Dashboard (Pro Edition Only)

Free alternative: Use AWS CLI commands to inspect resources

```bash
# List all queues
docker exec bday-localstack sh -c "awslocal sqs list-queues"

# List all Lambda functions
docker exec bday-localstack sh -c "awslocal lambda list-functions"

# List all EventBridge rules
docker exec bday-localstack sh -c "awslocal events list-rules"
```

---

## Getting Help

### Check Documentation

- [Getting Started](./getting-started.md) - Quick setup
- [Local Development](./local-development.md) - Docker, npm scripts
- [LocalStack Setup](./localstack-setup-community.md) - LocalStack details
- [Testing Guide](./testing-guide.md) - Running tests

### Enable Debug Logging

```bash
# Docker Compose
DEBUG=1 npm run docker:start

# LocalStack
# Edit docker/docker-compose.yml
environment:
  - DEBUG=1

# Application
LOG_LEVEL=debug npm test
```

### Collect Debug Info

When reporting issues, include:

```bash
# System info
node --version
npm --version
docker --version
uname -a

# Service status
docker ps

# Logs
npm run docker:logs | tail -100

# Environment
cat .env | grep -v PASSWORD
```

---

## Common Error Messages

### "Cannot find module '@prisma/client'"

**Solution:**
```bash
npm run prisma:generate
```

### "connect ECONNREFUSED 127.0.0.1:5432"

**Solution:**
```bash
# Database not running
npm run docker:start

# Or wrong connection string
# Check .env file
```

### "Queue does not exist"

**Solution:**
```bash
# LocalStack not initialized
npm run docker:reset
npm run docker:verify
```

### "Resource not found: Lambda function"

**Solution:**
```bash
# Lambda not deployed
npm run lambda:all
```

### "Timeout waiting for condition"

**Solution:**
```bash
# Services slow to start
# Increase timeout or wait longer
sleep 30
npm run docker:verify
```

---

## Next Steps

- [Getting Started](./getting-started.md) - Back to basics
- [Local Development](./local-development.md) - Development workflows
- [Testing Guide](./testing-guide.md) - Running tests
- [LocalStack Setup](./localstack-setup-community.md) - LocalStack configuration
