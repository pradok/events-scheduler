# Fast E2E Testing

This guide explains how to quickly test the end-to-end birthday event flow without waiting hours.

## Quick Start

```bash
# One-time setup (starts Docker, LocalStack, Lambdas)
npm run e2e:setup

# Run fast test with external webhook URL (recommended)
WEBHOOK_TEST_URL=https://httpbin.org/post npm run e2e:create-user-today-trigger-event
```

Event should trigger in **~10-70 seconds** (10s offset + up to 60s for scheduler to run).

**Note**: You'll see TWO events created:
1. **TODAY's event** (COMPLETED) - Triggers in ~10-70 seconds
2. **NEXT YEAR's event** (PENDING) - Automatically generated for recurring birthdays

## What It Does

The `npm run e2e:create-user-today-trigger-event` command runs [scripts/create-test-user-today.js](../scripts/create-test-user-today.js), which:

1. **Kills any existing dev server** on port 3000
2. **Calculates target time** = current UTC time + 10 seconds
3. **Starts dev server** with `EVENT_DELIVERY_TIMES_OVERRIDE=HH:MM:SS`
4. **Waits for server** to become healthy (polls `/health`)
5. **Creates test user** via `POST /user`:
   - `firstName`: "TestUser"
   - `lastName`: "E2E-{timestamp}"
   - `dateOfBirth`: TODAY (YYYY-MM-DD in UTC)
   - `timezone`: "UTC" (required for override to work)
6. **Keeps server running** so you can monitor the event delivery

## Custom Offset

```bash
# Default 10 seconds
npm run e2e:create-user-today-trigger-event

# Custom 15 seconds
node scripts/create-test-user-today.js 15

# Custom 30 seconds
node scripts/create-test-user-today.js 30
```

## Timeline

```
T+0s     Script starts, kills old server
T+1s     New server starts with EVENT_DELIVERY_TIMES_OVERRIDE
T+2-5s   Server becomes ready
T+5s     User created, event scheduled for T+15s (10s offset)
T+15s    Event becomes eligible for delivery
T+15-75s EventScheduler Lambda finds event (runs every 60s)
T+15-75s Event delivered to webhook
```

**Total wait time**: ~10-70 seconds

## Monitoring

### 1. Watch Database (Recommended)

```bash
npm run prisma:studio
```

Navigate to the `events` table and refresh to see status changes:

- `PENDING` → `PROCESSING` → `COMPLETED`

### 2. View Scheduler Lambda Logs

```bash
docker exec bday-localstack sh -c "awslocal logs tail /aws/lambda/event-scheduler --follow"
```

### 3. View Worker Lambda Logs

```bash
docker exec bday-localstack sh -c "awslocal logs tail /aws/lambda/event-worker --follow"
```

### 4. Check SQS Queue

```bash
docker exec bday-localstack sh -c "awslocal sqs receive-message --queue-url http://localhost:4566/000000000000/bday-events-queue"
```

## Cleanup

### Delete Test User

The script displays the cleanup command after user creation:

```bash
curl -X DELETE http://localhost:3000/user/{USER_ID}
```

This will also delete associated events (cascade).

### Stop Dev Server

Press `Ctrl+C` in the terminal running the script.

## Webhook URL Configuration

### How Webhook URLs Work

The webhook URL is set **when the event is created** and stored in the event's `delivery_payload` in the database. This means:

- **Changing `.env` only affects NEW events**, not existing ones
- **The webhook URL is read from `WEBHOOK_TEST_URL` environment variable** at event creation time
- **Worker Lambda uses the stored URL** from the event payload, not from its environment

### Option 1: External URL (Recommended)

Use a public webhook service like `httpbin.org` for easy testing:

```bash
WEBHOOK_TEST_URL=https://httpbin.org/post npm run e2e:create-user-today-trigger-event
```

**Advantages**:
- ✅ Works immediately (no networking issues)
- ✅ Lambda can reach it from Docker container
- ✅ Returns 200 OK for all requests
- ✅ Simple and reliable

**Other options**:
- `https://webhook.site/YOUR-UNIQUE-ID` - View requests in browser
- `https://requestcatcher.com/` - Another webhook testing service

### Option 2: Local Mock Server (Advanced)

Use the local mock webhook server (more complex due to Docker networking):

```bash
# Terminal 1: Start mock webhook server
npm run webhook:mock

# Terminal 2: Run test (requires special networking setup)
# Note: Lambda runs in Docker and can't reach localhost directly
WEBHOOK_TEST_URL=http://host.docker.internal:3001/webhook npm run e2e:create-user-today-trigger-event
```

**Networking Issue**: The Worker Lambda runs inside the LocalStack Docker container, so:
- `localhost:3001` inside container ≠ `localhost:3001` on your Mac
- Must use `host.docker.internal:3001` for Lambda to reach host machine

### Webhook URL Flow

```
1. Environment Variable
   WEBHOOK_TEST_URL=https://httpbin.org/post

2. StaticWebhookConfig (singleton)
   Loads from process.env.WEBHOOK_TEST_URL

3. CreateBirthdayEventUseCase
   webhookUrl = webhookConfig.getWebhookUrl(...)

4. Event Entity
   deliveryPayload: { message, webhookUrl }

5. Database
   Stored in events.delivery_payload column

6. Worker Lambda
   Reads webhookUrl from event.deliveryPayload

7. WebhookAdapter
   POST to the stored webhook URL
```

## How EVENT_DELIVERY_TIMES_OVERRIDE Works

The override is a comma-separated list of UTC times (HH:MM:SS format) that replaces the default 9:00 AM delivery time.

### Example

If current time is `14:30:00 UTC` and offset is 10 seconds:

- Override is set to: `EVENT_DELIVERY_TIMES_OVERRIDE=14:30:10`
- Any event created will use `14:30:10` as the delivery time
- Works for users in ANY timezone (not just UTC)

### Why User Timezone Must Be UTC

The birthday event handler uses this logic:

```javascript
// Get delivery time in user's timezone
const deliveryTime = getDeliveryTime(user.timezone); // e.g., "14:30:10 America/New_York"

// Convert to UTC
const targetTimestampUTC = convertToUTC(deliveryTime, user.timezone);
```

If user timezone is NOT UTC, the conversion will shift the time:

- User in `America/New_York` (UTC-5)
- Override: `14:30:10`
- Delivery time in NY: `14:30:10` (interpreted as NY time)
- Converted to UTC: `19:30:10` (5 hours later!)
- Event won't trigger for 5 hours!

By using `timezone: "UTC"`, no conversion happens and the override time is used directly.

## Troubleshooting

### Server Won't Start

**Problem**: Port 3000 already in use by another process

**Solution**: The script should auto-kill it. If not:

```bash
lsof -ti:3000 | xargs kill -9
```

### Server Health Check Fails

**Problem**: Server doesn't respond to `/health` endpoint

**Solution**:

1. Check if server started successfully (look at `[SERVER]` logs)
2. Verify dependencies are installed: `npm install`
3. Check database is running: `docker ps | grep postgres`

### User Creation Fails

**Problem**: POST /user returns error

**Solution**:

1. Check Prisma is set up: `npm run prisma:generate`
2. Check database migrations: `npm run prisma:migrate`
3. Verify database connection in server logs

### Event Doesn't Trigger

**Problem**: Event stays in PENDING status

**Possible causes**:

1. **EventScheduler Lambda not running**: Run `npm run e2e:verify`
2. **Override time already passed**: Event won't be picked up if target time is in the past
3. **Timezone mismatch**: User must have `timezone: "UTC"`

**Debug**:

```bash
# Check event in database
npm run prisma:studio
# Look at targetTimestampUTC - should be ~10 seconds after creation

# Check scheduler Lambda is configured
docker exec bday-localstack sh -c "awslocal events list-rules"

# Check scheduler Lambda logs
docker exec bday-localstack sh -c "awslocal logs tail /aws/lambda/event-scheduler --follow"
```

## Technical Details

### Why Server Restart is Needed

The `EVENT_DELIVERY_TIMES_OVERRIDE` environment variable is read at server startup and cached. To change it, we must restart the server.

Alternative approaches considered:

1. **Hot reload via API endpoint**: Would require adding `/admin/override` endpoint (security risk)
2. **Modify .env file**: Would still require restart (tsx watch would pick it up)
3. **Database-driven override**: Over-engineered for a test-only feature

The script approach is simple, safe, and doesn't require code changes.

## Understanding the Two Events

When you run the fast E2E test, you'll notice **TWO events** are created in the database:

### Event 1: TODAY's Birthday (COMPLETED)

```sql
target_timestamp_utc: 2025-10-27 13:26:43+00  -- 10 seconds from creation
status: COMPLETED
```

This is the **immediate test event** that triggers within ~10-70 seconds.

### Event 2: NEXT YEAR's Birthday (PENDING)

```sql
target_timestamp_utc: 2026-10-27 09:00:00+00  -- Next year at 9 AM
status: PENDING
```

This is the **automatic recurring event** generated after Event 1 completes successfully.

### Why Two Events?

This demonstrates the **Automatic Next-Year Event Generation** feature (Story 2.9):

1. User created → Event 1 scheduled for today (with override)
2. Event 1 delivered successfully → Marked as COMPLETED
3. **System automatically generates Event 2** for next year's birthday
4. When Event 2 completes in 2026 → Event 3 generated for 2027
5. Continues forever... 🎂

**Code Location**: [ExecuteEventUseCase.ts:186](../src/modules/event-scheduling/application/use-cases/ExecuteEventUseCase.ts#L186)

```typescript
// After successful webhook delivery:
const completedEvent = event.markCompleted(DateTime.now());
await this.generateNextYearEventAndComplete(completedEvent, event.userId);
```

**Benefits**:
- ✅ Birthdays recur annually without manual intervention
- ✅ No cron jobs needed to generate future events
- ✅ Uses transaction to ensure atomicity
- ✅ Handles edge cases (user deletion, failures)

## See Also

- [Architecture: Event Scheduling](./architecture/workflows.md) - How event scheduling works
- [Story 2.9](./stories/2.9.next-year-event-generation.story.md) - Automatic next-year event generation
- [Story 4.5](./stories/4.5.timezone-delivery-time-configuration.md) - Timezone delivery time implementation
