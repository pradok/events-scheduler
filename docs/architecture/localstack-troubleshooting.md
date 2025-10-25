# LocalStack Troubleshooting Guide

## Common Issues and Solutions

### Issue 1: Queue Not Found Error

**Symptom:**
```
❌ Queue not found. Ensure LocalStack and queues are created via docker-compose.
```

**Cause:**
- LocalStack container not running
- init-aws.sh script didn't execute successfully
- Queue was manually deleted

**Solution:**

1. **Verify LocalStack is running:**
   ```bash
   docker ps | grep localstack
   ```

2. **Check LocalStack health:**
   ```bash
   curl -s http://localhost:4566/_localstack/health | python3 -m json.tool
   ```

   Expected output:
   ```json
   {
     "services": {
       "sqs": "running",
       "lambda": "running",
       "events": "running",
       "iam": "available"
     }
   }
   ```

3. **List existing queues:**
   ```bash
   awslocal sqs list-queues
   ```

   Expected output:
   ```json
   {
     "QueueUrls": [
       "http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/events-queue",
       "http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/events-dlq"
     ]
   }
   ```

4. **If queues are missing, restart LocalStack:**
   ```bash
   docker-compose down
   docker-compose up
   ```

   This will re-run init-aws.sh and recreate all infrastructure.

---

### Issue 2: Lambda Deployment Fails

**Symptom:**
```
❌ Deployment failed: Request failed with status code 500
```

**Cause:**
- LocalStack service not fully initialized
- Lambda package not built
- LocalStack memory/resource limits

**Solution:**

1. **Verify LocalStack health:**
   ```bash
   curl -s http://localhost:4566/_localstack/health
   ```

2. **Check Lambda package exists:**
   ```bash
   ls -lh dist/event-scheduler.zip
   ```

   If missing:
   ```bash
   npm run lambda:build
   ```

3. **Check LocalStack logs:**
   ```bash
   docker logs localstack | tail -50
   ```

   Look for errors like:
   - "out of memory"
   - "service not available"
   - "connection refused"

4. **Restart LocalStack with fresh state:**
   ```bash
   docker-compose down -v  # -v removes volumes
   docker-compose up
   ```

5. **Retry deployment:**
   ```bash
   npm run lambda:deploy:localstack
   ```

---

### Issue 3: Integration Tests Timeout

**Symptom:**
```
Test suite failed to run: Timeout - Async callback was not invoked within the 30000ms timeout
```

**Cause:**
- LocalStack not running
- LocalStack services not accessible
- Network connectivity issues
- Tests creating resources but not cleaning up

**Solution:**

1. **Verify LocalStack is accessible:**
   ```bash
   curl http://localhost:4566/_localstack/health
   ```

2. **Check LocalStack container status:**
   ```bash
   docker ps
   docker logs localstack
   ```

3. **Verify tests can connect to LocalStack:**
   ```bash
   # Run a simple SQS test
   awslocal sqs list-queues
   ```

4. **Check for leaked test resources:**
   ```bash
   awslocal sqs list-queues
   ```

   Look for old `test-queue-*` queues. These should be cleaned up by tests but might persist if tests failed.

   **Clean up manually:**
   ```bash
   # List all queues
   awslocal sqs list-queues --output json | \
     jq -r '.QueueUrls[]' | \
     grep 'test-queue' | \
     while read url; do
       awslocal sqs delete-queue --queue-url "$url"
     done
   ```

5. **Increase test timeout (if needed):**
   ```typescript
   // In test file
   beforeEach(async () => {
     // ...
   }, 30000); // 30 second timeout
   ```

6. **Restart LocalStack:**
   ```bash
   docker-compose restart localstack
   ```

---

### Issue 4: EventBridge Not Triggering Lambda

**Symptom:**
- Lambda deployed successfully
- EventBridge rule exists and is enabled
- Lambda never executes automatically

**Cause:**
- EventBridge target not configured
- Lambda permissions missing
- EventBridge rule disabled

**Solution:**

1. **Verify EventBridge rule exists and is enabled:**
   ```bash
   awslocal events describe-rule --name event-scheduler-rule
   ```

   Expected output:
   ```json
   {
     "Name": "event-scheduler-rule",
     "Arn": "arn:aws:events:us-east-1:000000000000:rule/event-scheduler-rule",
     "ScheduleExpression": "rate(1 minute)",
     "State": "ENABLED",
     "Description": "Triggers time-based event scheduler every 1 minute"
   }
   ```

2. **Check EventBridge targets:**
   ```bash
   awslocal events list-targets-by-rule --rule event-scheduler-rule
   ```

   Expected output:
   ```json
   {
     "Targets": [
       {
         "Id": "1",
         "Arn": "arn:aws:lambda:us-east-1:000000000000:function:event-scheduler"
       }
     ]
   }
   ```

3. **If targets are missing, redeploy Lambda:**
   ```bash
   npm run lambda:deploy:localstack
   ```

   This will reconfigure EventBridge targets and permissions.

4. **Manually invoke Lambda to verify it works:**
   ```bash
   awslocal lambda invoke \
     --function-name event-scheduler \
     --payload '{}' \
     response.json

   cat response.json
   ```

5. **Check Lambda logs (LocalStack):**
   ```bash
   docker logs localstack | grep event-scheduler
   ```

6. **Enable rule if disabled:**
   ```bash
   awslocal events enable-rule --name event-scheduler-rule
   ```

---

### Issue 5: Lambda Can't Connect to PostgreSQL

**Symptom:**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Cause:**
- Lambda runs inside Docker container
- Can't use `localhost` to access host PostgreSQL
- Incorrect `DATABASE_URL` environment variable

**Solution:**

1. **Verify Lambda uses `host.docker.internal`:**
   ```bash
   awslocal lambda get-function-configuration \
     --function-name event-scheduler \
     --query 'Environment.Variables.DATABASE_URL'
   ```

   Expected output:
   ```
   "postgresql://bday_user:local_dev_password@host.docker.internal:5432/bday_db"
   ```

   **Note:** Must use `host.docker.internal`, NOT `localhost`

2. **Verify PostgreSQL is accessible from host:**
   ```bash
   docker ps | grep postgres
   psql -h localhost -U bday_user -d bday_db -c "SELECT 1;"
   ```

3. **If DATABASE_URL is wrong, redeploy Lambda:**

   Edit `scripts/deploy-lambda.js` to ensure:
   ```javascript
   DATABASE_URL: 'postgresql://bday_user:local_dev_password@host.docker.internal:5432/bday_db'
   ```

   Then redeploy:
   ```bash
   npm run lambda:deploy:localstack
   ```

---

### Issue 6: LocalStack Services Show "available" Instead of "running"

**Symptom:**
```json
{
  "services": {
    "sqs": "available",
    "lambda": "available",
    "events": "available"
  }
}
```

**Cause:**
- Services haven't been used yet
- LocalStack lazy-loads services on first use

**Solution:**

**This is NORMAL behavior.**

LocalStack lazy-loads services. They show as "available" until first use, then change to "running".

**To initialize services:**
```bash
# Use SQS (will change to "running")
awslocal sqs list-queues

# Use Lambda (will change to "running")
awslocal lambda list-functions

# Use EventBridge (will change to "running")
awslocal events list-rules
```

**After first use:**
```bash
curl -s http://localhost:4566/_localstack/health | python3 -m json.tool
```

Services should now show "running".

---

### Issue 7: Docker Compose Fails to Start LocalStack

**Symptom:**
```
ERROR: for localstack  Cannot start service localstack: driver failed programming external connectivity
```

**Cause:**
- Port 4566 already in use
- Previous LocalStack instance not stopped
- Port conflict with another service

**Solution:**

1. **Check what's using port 4566:**
   ```bash
   lsof -i :4566
   ```

2. **Kill the process using port 4566:**
   ```bash
   # If LocalStack from previous run
   docker stop localstack
   docker rm localstack

   # If another process
   kill -9 <PID>
   ```

3. **Clean up and restart:**
   ```bash
   docker-compose down
   docker-compose up
   ```

4. **Alternative: Change LocalStack port:**

   Edit `docker-compose.yml`:
   ```yaml
   ports:
     - "4567:4566"  # Use 4567 on host instead
   ```

   Update all LocalStack endpoints:
   - `scripts/deploy-lambda.js`
   - Integration tests
   - Environment variables

---

### Issue 8: awslocal Command Not Found

**Symptom:**
```
zsh: command not found: awslocal
```

**Cause:**
- `awslocal` CLI wrapper not installed
- Not in PATH

**Solution:**

**Option 1: Install awslocal (Recommended)**
```bash
pip install awscli-local
```

**Option 2: Use AWS CLI with --endpoint-url**
```bash
aws --endpoint-url=http://localhost:4566 sqs list-queues
```

**Option 3: Use AWS SDK in Node.js scripts**

All deployment and management uses `deploy-lambda.js` which uses AWS SDK, so `awslocal` is optional.

---

### Issue 9: Tests Create Queues but Don't Clean Up

**Symptom:**
- Many `test-queue-*` queues persist after tests
- SQS list-queues shows dozens of old queues

**Cause:**
- Tests failed before `afterEach` cleanup
- Test timeout prevented cleanup
- Developer interrupted tests with Ctrl+C

**Solution:**

1. **List all test queues:**
   ```bash
   awslocal sqs list-queues
   ```

2. **Delete all test queues (bulk cleanup):**
   ```bash
   # List all queues, filter test queues, delete
   awslocal sqs list-queues --output json | \
     jq -r '.QueueUrls[]' | \
     grep 'test-queue' | \
     while read url; do
       echo "Deleting $url"
       awslocal sqs delete-queue --queue-url "$url"
     done
   ```

3. **Restart LocalStack for clean slate:**
   ```bash
   docker-compose down -v
   docker-compose up
   ```

4. **Prevent future leaks:**
   - Ensure `afterEach` hooks always run
   - Use `try/finally` for cleanup if needed
   - Increase test timeouts to allow cleanup

---

### Issue 10: Lambda Package Too Large

**Symptom:**
```
Error: Lambda package size exceeds maximum allowed size
```

**Cause:**
- `node_modules` included in package
- Dev dependencies included
- Source maps or test files included

**Solution:**

1. **Check Lambda build script (`scripts/lambda-build.sh`):**
   ```bash
   cat scripts/lambda-build.sh
   ```

   Ensure it:
   - Only includes production dependencies
   - Excludes dev dependencies
   - Excludes tests and source maps

2. **Verify package size:**
   ```bash
   ls -lh dist/event-scheduler.zip
   ```

   Should be < 50MB (LocalStack limit: 50MB unzipped)

3. **Rebuild package:**
   ```bash
   npm run lambda:build
   ```

4. **If still too large, optimize:**
   - Remove unused dependencies
   - Use webpack/esbuild to bundle
   - Exclude AWS SDK (provided by Lambda runtime)

---

## Debugging Tips

### Enable Verbose Logging

**LocalStack Docker Logs:**
```bash
# Follow logs in real-time
docker logs -f localstack

# Last 100 lines
docker logs localstack --tail 100

# Filter for specific service
docker logs localstack | grep -i sqs
docker logs localstack | grep -i lambda
docker logs localstack | grep -i events
```

**Lambda Function Logs:**
```bash
# Lambda logs appear in LocalStack container logs
docker logs localstack | grep event-scheduler
```

**Integration Test Logs:**
```bash
# Run tests with verbose output
npm test -- --verbose

# Run specific test file
npm test SQSAdapter.integration.test.ts -- --verbose
```

### Inspect LocalStack State

**SQS Queue Inspection:**
```bash
# List all queues
awslocal sqs list-queues

# Get queue attributes
QUEUE_URL=$(awslocal sqs get-queue-url --queue-name events-queue --query 'QueueUrl' --output text)
awslocal sqs get-queue-attributes --queue-url $QUEUE_URL --attribute-names All

# Peek at messages (without removing)
awslocal sqs receive-message \
  --queue-url $QUEUE_URL \
  --max-number-of-messages 10 \
  --wait-time-seconds 2
```

**Lambda Inspection:**
```bash
# List all Lambda functions
awslocal lambda list-functions

# Get function configuration
awslocal lambda get-function-configuration --function-name event-scheduler

# Get function code location
awslocal lambda get-function --function-name event-scheduler
```

**EventBridge Inspection:**
```bash
# List all rules
awslocal events list-rules

# Describe specific rule
awslocal events describe-rule --name event-scheduler-rule

# List targets for rule
awslocal events list-targets-by-rule --rule event-scheduler-rule
```

### Reset LocalStack Completely

**Clean Reset (Removes ALL Data):**
```bash
docker-compose down -v  # -v removes volumes
docker-compose up
```

**After reset:**
- All queues recreated via init-aws.sh
- All Lambda functions must be redeployed
- All EventBridge targets must be reconfigured

**When to use:**
- LocalStack in corrupted state
- Testing init-aws.sh changes
- Starting fresh after major configuration changes

### Performance Profiling

**Measure Test Speed:**
```bash
# Run tests with timing
npm test -- --verbose --testTimeout=30000

# Profile specific test
npm test SQSAdapter.integration.test.ts -- --verbose
```

**Measure Lambda Deployment Speed:**
```bash
time npm run lambda:deploy:localstack
```

Typical times:
- Lambda build: ~5-10s
- Lambda deploy: ~3-5s
- Total: ~8-15s

**Measure Queue Creation Speed:**
```bash
# Time queue creation (used in tests)
time awslocal sqs create-queue --queue-name perf-test-queue
time awslocal sqs delete-queue --queue-url <URL>
```

Typical times:
- Create queue: ~1-1.5s
- Delete queue: ~0.5-1s

---

## Health Check Commands

### Quick Health Check

```bash
# One-liner health check
curl -s http://localhost:4566/_localstack/health | python3 -m json.tool
```

### Comprehensive Health Check

```bash
#!/bin/bash

echo "=== LocalStack Health Check ==="

# 1. Container running?
echo "1. Docker container status:"
docker ps | grep localstack || echo "❌ LocalStack container not running"

# 2. LocalStack endpoint responding?
echo -e "\n2. LocalStack endpoint health:"
curl -s http://localhost:4566/_localstack/health | python3 -m json.tool || echo "❌ LocalStack not responding"

# 3. SQS service working?
echo -e "\n3. SQS service:"
awslocal sqs list-queues || echo "❌ SQS not working"

# 4. Expected queues exist?
echo -e "\n4. Expected queues:"
awslocal sqs get-queue-url --queue-name events-queue && echo "✓ events-queue exists" || echo "❌ events-queue missing"
awslocal sqs get-queue-url --queue-name events-dlq && echo "✓ events-dlq exists" || echo "❌ events-dlq missing"

# 5. Lambda service working?
echo -e "\n5. Lambda service:"
awslocal lambda list-functions || echo "❌ Lambda not working"

# 6. EventBridge service working?
echo -e "\n6. EventBridge service:"
awslocal events list-rules || echo "❌ EventBridge not working"

# 7. Expected EventBridge rule exists?
echo -e "\n7. Expected EventBridge rule:"
awslocal events describe-rule --name event-scheduler-rule && echo "✓ event-scheduler-rule exists" || echo "❌ event-scheduler-rule missing"

echo -e "\n=== Health Check Complete ==="
```

Save as `scripts/localstack-health-check.sh` and run:
```bash
chmod +x scripts/localstack-health-check.sh
./scripts/localstack-health-check.sh
```

---

## Additional Resources

### Official Documentation

- **LocalStack Docs:** [https://docs.localstack.cloud/](https://docs.localstack.cloud/)
- **LocalStack GitHub:** [https://github.com/localstack/localstack](https://github.com/localstack/localstack)
- **AWS CLI Reference:** [https://docs.aws.amazon.com/cli/](https://docs.aws.amazon.com/cli/)
- **AWS SDK v3 (JavaScript):** [https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)

### Internal Documentation

- [LocalStack Setup and Architecture](./localstack-setup.md)
- [Technology Stack](./tech-stack.md)
- [Test Strategy](./test-strategy.md)
- [Source Tree](./source-tree.md)

### Community Resources

- **LocalStack Discuss:** [https://discuss.localstack.cloud/](https://discuss.localstack.cloud/)
- **LocalStack Slack:** [https://localstack-community.slack.com/](https://localstack-community.slack.com/)
- **Stack Overflow:** Tag `localstack`

---

## Getting Help

### When Filing Issues

**Include the following information:**

1. **Environment:**
   - LocalStack version: `docker inspect localstack | grep -i image`
   - Docker version: `docker --version`
   - OS: `uname -a`

2. **LocalStack Logs:**
   ```bash
   docker logs localstack --tail 100
   ```

3. **Health Check Output:**
   ```bash
   curl -s http://localhost:4566/_localstack/health
   ```

4. **Reproducible Steps:**
   - Exact commands run
   - Expected behavior
   - Actual behavior
   - Error messages

5. **Configuration Files:**
   - `docker-compose.yml`
   - `scripts/deploy-lambda.js` (relevant sections)
   - Integration test setup (if applicable)

### Internal Team Contacts

- **Infrastructure:** DevOps team
- **LocalStack Configuration:** Backend team
- **Integration Tests:** QA team
- **Lambda Development:** Backend team

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2025-10-25 | 1.0 | Initial troubleshooting guide created |
