# Epic 4: End-to-End Testing & Manual Testing Infrastructure

**Epic Goal:** Set up a complete LocalStack environment for E2E testing that mimics AWS production setup, enabling both automated E2E tests and manual testing workflows. Support both LocalStack Community Edition (free) and Pro Edition (with additional AWS services).

**Scope:** Configure LocalStack with all necessary AWS services (Lambda, SQS, EventBridge, CloudWatch Logs), deploy application infrastructure, and enable manual testing via VSCode LocalStack extension. Complete with one comprehensive E2E smoke test proving the entire system works end-to-end.

---

## Story 4.1: LocalStack Setup for E2E Testing (Community Edition)

**As a** developer,
**I want** a LocalStack environment configured with Community Edition features,
**so that** I can test the application locally without AWS costs.

**Acceptance Criteria:**

1. LocalStack Community Edition configured in docker-compose.yml
2. Services enabled: Lambda, SQS, EventBridge, CloudWatch Logs, IAM
3. SQS queue created: `bday-events-queue` (for event processing)
4. SQS DLQ created: `bday-events-dlq` (for failed events)
5. EventBridge rule created: `event-scheduler-rule` (triggers every 1 minute)
6. IAM role created: `lambda-execution-role`
7. Init script (`docker/localstack/init-aws.sh`) creates all resources on startup
8. Documentation added: "LocalStack Setup Guide (Community Edition)"
9. NPM scripts updated: `docker:start`, `docker:stop`, `docker:logs`
10. Verification script added to check all resources exist

**Technical Notes:**
- LocalStack endpoint: `http://localhost:4566`
- Use `awslocal` CLI commands for resource management
- CloudWatch Logs automatically created when Lambdas write logs
- Community Edition limitations: No RDS, X-Ray, or advanced CloudWatch Metrics

---

## Story 4.2: LocalStack Setup for E2E Testing (Pro Edition - Optional)

**As a** developer,
**I want** to optionally use LocalStack Pro Edition for enhanced testing,
**so that** I can test additional AWS services like RDS and X-Ray.

**Acceptance Criteria:**

1. Documentation added: "LocalStack Pro Setup Guide"
2. Instructions for obtaining LocalStack Pro trial/license
3. Pro-specific services documented: RDS, X-Ray, CloudWatch Metrics, Web UI
4. Environment variable configuration for Pro features
5. RDS PostgreSQL instance creation script (alternative to Docker PostgreSQL)
6. X-Ray tracing configuration for Lambda functions
7. Comparison table: Community vs Pro features for this project
8. Decision criteria: When to use Pro vs Community
9. Cost-benefit analysis documented

**Pro Edition Features (If Using):**
- AWS Web UI (LocalStack Console) at `http://localhost:4566/_localstack/dashboard`
- RDS PostgreSQL instead of Docker container
- X-Ray distributed tracing
- Advanced CloudWatch Metrics and Alarms
- SNS/SES for future notification features

**Note:** This story is OPTIONAL. If not using Pro, mark as "Won't Do" and document why Community Edition is sufficient.

---

## Story 4.3: LocalStack Desktop & VSCode Extension Setup

**As a** developer,
**I want** LocalStack Desktop and/or VSCode extension configured,
**so that** I can browse resources, view CloudWatch logs, and manage my LocalStack instance easily.

**Acceptance Criteria:**

**Option A: LocalStack Desktop (Recommended):**

1. LocalStack Desktop downloaded from <https://app.localstack.cloud/download>
2. Desktop app configured to connect to local Docker instance
3. Resource Browser shows: Lambda functions, SQS queues, EventBridge rules, CloudWatch Logs
4. Container management works: start, stop, view logs
5. CLI interaction available through integrated terminal
6. Real-time logging and insights visible
7. Documentation added: "LocalStack Desktop Setup Guide"
8. Screenshots showing Resource Browser and CloudWatch Logs

**Option B: VSCode LocalStack Extension (Alternative):**

1. LocalStack VSCode extension installed and documented
2. Extension configured to connect to `http://localhost:4566`
3. Resource browser shows: Lambda functions, SQS queues, EventBridge rules, CloudWatch Logs
4. CloudWatch Logs can be viewed and filtered in VSCode
5. Documentation added: "VSCode LocalStack Extension Guide"

**Option C: CLI Only (No GUI):**

1. CLI commands documented for inspecting resources (`awslocal logs tail`, etc.)
2. Bash aliases created for common commands

**LocalStack Desktop Features (Included in Base/Free Plan):**

- Container Management (start, stop, create, delete)
- CLI Interaction (integrated terminal)
- Real-time Logging & Insights
- Resource Browser (same as web application)
- Works with Community Edition (no Pro required!)

---

## Story 4.4: Lambda Deployment to LocalStack

**As a** developer,
**I want** application Lambdas automatically deployed to LocalStack,
**so that** I can test the complete serverless architecture locally.

**Acceptance Criteria:**

1. Build script creates Lambda deployment packages (already exists: `scripts/lambda-build.sh`)
2. Deployment script deploys to LocalStack (already exists: `scripts/deploy-lambda.js`)
3. Both Lambdas deployed: `event-scheduler`, `event-worker`
4. EventBridge rule connected to `event-scheduler` Lambda
5. SQS queue connected to `event-worker` Lambda (event source mapping)
6. Environment variables configured for both Lambdas
7. NPM script: `npm run lambda:all` (already exists)
8. Deployment verification script checks Lambdas exist and are configured correctly
9. Documentation updated: "Lambda Deployment to LocalStack"

**Deployed Lambdas:**
- `event-scheduler`: Triggered by EventBridge (every 1 minute), claims PENDING events
- `event-worker`: Triggered by SQS messages, executes events and sends webhooks

---

## Story 4.5: Manual E2E Testing Workflow Documentation

**As a** developer,
**I want** clear documentation for manual E2E testing,
**so that** I can test the complete system end-to-end without automated tests.

**Acceptance Criteria:**

1. Manual testing guide created: `docs/manual-testing-guide.md`
2. Guide includes step-by-step workflow:
   - Start LocalStack: `npm run docker:start`
   - Deploy Lambdas: `npm run lambda:all`
   - Create user via Prisma Studio or API
   - Create event via Prisma Studio or API
   - View CloudWatch logs in VSCode
   - Monitor SQS queue messages
   - Verify event execution in database
3. Common troubleshooting scenarios documented
4. Screenshots showing each step
5. CLI commands for inspecting resources (`awslocal` examples)
6. Guide includes how to view:
   - CloudWatch Logs (VSCode or CLI)
   - SQS messages (VSCode or CLI)
   - Lambda invocations
   - Database state (Prisma Studio)

---

## Story 4.6: Comprehensive End-to-End Smoke Test

**As a** developer,
**I want** one end-to-end test proving the complete system works,
**so that** I can confidently demo the MVP and know all components integrate correctly.

**Note:** This story was originally Story 3.4 in Epic 3, moved here because it requires the E2E testing infrastructure from Stories 4.1-4.5.

**Acceptance Criteria:**

1. E2E test creates user via API → verifies birthday event generated automatically
2. Test advances time to event execution time → scheduler claims event → sends to SQS
3. Test processes SQS message via worker → webhook delivered to test endpoint
4. Test verifies event status updated to COMPLETED in database
5. Test uses real database (Testcontainers PostgreSQL)
6. Test uses real LocalStack (SQS for worker, EventBridge for scheduler)
7. Test uses real mock webhook server to verify delivery
8. Test passes consistently without flaky behavior
9. Test completes in under 30 seconds
10. Test can be run via: `npm run test:e2e`
11. Test cleanup script removes all containers after completion

**Test Coverage:**
- User creation → Event generation (domain logic)
- Scheduler Lambda claiming events (scheduler handler)
- SQS message sending and receiving (messaging adapter)
- Worker Lambda processing events (worker handler)
- Webhook delivery (HTTP adapter)
- Next year event generation (recurring events)
- Database state transitions (persistence layer)

**This story validates the entire Epic 4 setup is working correctly!**

---

## Epic 4 Success Criteria

- ✅ LocalStack running with all required AWS services
- ✅ VSCode extension showing CloudWatch logs
- ✅ Lambdas deployed and responding to triggers
- ✅ Manual testing workflow documented and tested
- ✅ Comprehensive E2E smoke test passing
- ✅ Developer can test complete system locally without AWS account

---

## Notes

- **LocalStack Pro:** Story 4.2 is optional. Evaluate based on budget and need for advanced features.
- **Resource Reuse:** Use same LocalStack resources for both automated and manual testing (Option 1).
- **CloudWatch Logs:** Available in Community Edition, sufficient for debugging.
- **Database:** Use Docker PostgreSQL container (already configured), not RDS in LocalStack.
- **Free Trial:** LocalStack Pro offers 14-day free trial - can test Pro features before committing.
