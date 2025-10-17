# Infrastructure

Simple AWS infrastructure for the birthday messaging system.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      AWS Cloud                                  │
│                                                                  │
│   ┌──────────────────────────────────────────────┐             │
│   │  EventBridge Rule                            │             │
│   │  Triggers: Every 1 minute                    │             │
│   └──────────────┬───────────────────────────────┘             │
│                  │                                               │
│                  ▼                                               │
│   ┌──────────────────────────────────────────────┐             │
│   │  Lambda Scheduler                            │             │
│   │  - Queries DB for ready events               │             │
│   │  - Sends messages to SQS                     │             │
│   │  - Fast execution (< 1 second)               │             │
│   │  - In VPC (private subnet)                   │             │
│   └──────────────┬───────────────────────────────┘             │
│                  │                                               │
│                  ▼                                               │
│   ┌──────────────────────────────────────────────┐             │
│   │  RDS PostgreSQL                              │             │
│   │  - Instance: db.t3.micro                     │             │
│   │  - Storage: 20 GB                            │             │
│   └──────────────────────────────────────────────┘             │
│                                                                  │
│                  ┌───────────────────────────────┐             │
│                  │  SQS Queue (bday-messages)    │             │
│                  │  - Decouples scheduler/worker │             │
│                  │  - Auto-retry (5 attempts)    │             │
│                  │  - 14-day retention           │             │
│                  └──────────────┬────────────────┘             │
│                                 │                               │
│                                 ▼                               │
│                  ┌───────────────────────────────┐             │
│                  │  Lambda Worker                │             │
│                  │  - Batch size: 10             │             │
│                  │  - Concurrency: 10            │             │
│                  │  - Posts to webhook           │             │
│                  │  - In VPC (for RDS)           │             │
│                  └──────────────┬────────────────┘             │
│                                 │                               │
│                  ┌───────────────────────────────┐             │
│                  │  Dead Letter Queue            │             │
│                  │  - Failed messages after 5x   │             │
│                  │  - CloudWatch alarm           │             │
│                  └───────────────────────────────┘             │
│                                                                  │
│   Supporting Services:                                          │
│   - Secrets Manager (DB credentials)                            │
│   - Parameter Store (Webhook URL)                               │
│   - CloudWatch (logs + metrics)                                 │
│   - NAT Gateway (Lambda → Internet)                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 │ HTTPS POST (parallel)
                                 ▼
                  ┌───────────────────────────┐
                  │   Webhook Endpoint        │
                  │   (External Service)      │
                  └───────────────────────────┘
```

---

## Message Delivery Flow

```
Event Ready (9:00 AM user's local time)
           ↓
Lambda Scheduler picks it up
           ↓
Constructs message data
           ↓
Sends to SQS Queue (fast, < 10ms)
           ↓
┌─────────────────────────────────────────┐
│  SQS Queue                              │
│  - Holds messages                       │
│  - Auto-retry on failure                │
│  - Visibility timeout: 30s              │
└──────────────┬──────────────────────────┘
               ↓ (triggers)
┌──────────────────────────────────────────┐
│  Lambda Worker (10 concurrent)          │
│  - Receives batch of 10 messages        │
│  - Posts to webhook in parallel         │
└──────────────┬──────────────────────────┘
               ↓ (HTTP POST)
┌──────────────────────────────────────────┐
│  External Webhook Endpoint               │
│  (RequestBin / Webhook.site / Custom)    │
│                                           │
│  Receives JSON:                           │
│  {                                        │
│    "message": "Hey, John Doe...",        │
│    "userId": "uuid-123",                 │
│    "eventId": "event-456",               │
│    "timestamp": "2025-03-15T14:00:00Z"   │
│  }                                        │
└──────────────────────────────────────────┘

If webhook fails after 5 retries:
    ↓
Dead Letter Queue
    ↓
CloudWatch Alarm → Email alert
```

### Message Sending Options

**Option 1: Webhook (Requirement - Phase 1)**
```typescript
// Lambda makes HTTPS POST request
POST https://webhook.site/abc-123-xyz
Content-Type: application/json

{
  "message": "Hey, John Doe it's your birthday",
  "userId": "uuid-123",
  "eventId": "event-456",
  "timestamp": "2025-03-15T14:00:00Z"
}
```

**Why Webhook?**
- ✅ Meets project requirements
- ✅ Customer can integrate with any system (Slack, email, SMS, etc.)
- ✅ Customer controls the destination
- ✅ Simple HTTP POST from Lambda

**Testing Services**:
- [RequestBin](https://requestbin.com) - View incoming webhooks
- [Webhook.site](https://webhook.site) - Instant webhook URLs
- [Pipedream](https://pipedream.com) - Webhook → multiple destinations

**Option 2: Direct Integration (Future)**
If you want to send messages directly instead of via webhook:

| Channel | AWS Service | Cost |
|---------|------------|------|
| **Email** | Amazon SES | $0.10 per 1K emails |
| **SMS** | Amazon SNS | $0.00645 per SMS (US) |
| **Slack** | Slack API + Lambda | Free (Slack API) |
| **WhatsApp** | Twilio + Lambda | $0.005 per message |

### Performance at Scale

With SQS architecture:

| Events/Minute | Scheduler Time | Worker Processing | Total Latency |
|---------------|----------------|-------------------|---------------|
| 10 | < 1 second | 1 second (parallel) | ~2 seconds |
| 50 | < 1 second | 5 seconds (parallel) | ~6 seconds |
| 100 | < 1 second | 10 seconds (parallel) | ~11 seconds |
| 1000 | < 1 second | 100 seconds (parallel) | ~101 seconds |

**Key Benefit**: Scheduler always completes fast, never times out.

### Lambda Internet Access

Lambda Worker needs to reach external webhook endpoint:

```
Lambda Worker (Private Subnet)
    ↓
NAT Gateway (Public Subnet)
    ↓
Internet Gateway
    ↓
External Webhook URL
```

**Important**: NAT Gateway costs ~$33/month

**Note**: Scheduler Lambda doesn't need internet (only talks to RDS + SQS)

---

## Core Services

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **Lambda Scheduler** | Finds ready events, sends to SQS | Node.js 20, 512 MB, 1min timeout |
| **Lambda Worker** | Processes SQS, posts to webhook | Node.js 20, 512 MB, 30s timeout, 10 concurrent |
| **EventBridge** | Triggers scheduler | `rate(1 minute)` |
| **SQS Queue** | Decouples scheduler from webhook | Standard queue, 14-day retention |
| **Dead Letter Queue** | Failed messages | After 5 retry attempts |
| **RDS PostgreSQL** | Database for users + events | db.t3.micro, 20 GB |
| **VPC** | Network isolation | Private subnet for Lambda + RDS |
| **Secrets Manager** | Database credentials | DB password (auto-rotation) |
| **Parameter Store** | Application config | Webhook URL |
| **CloudWatch** | Logs + metrics + alarms | 7-day retention |
| **NAT Gateway** | Lambda internet access | For webhook calls |

---

## Why These Choices?

### Lambda
- No servers to manage
- Pay per execution (~$2/month)
- Auto-scaling built-in
- No cold starts (runs every 60s)

### RDS PostgreSQL
- `FOR UPDATE SKIP LOCKED` prevents race conditions
- Managed (automated backups, patching)
- ACID transactions

### EventBridge
- Managed scheduling (no cron to maintain)
- Reliable
- 1-minute precision

---

## Security

1. **Database is Private**
   - RDS in private subnet
   - No public access
   - Only Lambda can connect

2. **Configuration Secured**
   - **DB password**: Secrets Manager (auto-rotation, highly sensitive)
   - **Webhook URL**: Parameter Store (free, versioned, updatable)
   - **Other config**: Parameter Store or environment variables

3. **Encryption**
   - RDS: Encrypted at rest (KMS)
   - Connections: TLS enforced
   - Secrets: KMS encrypted

4. **IAM Least Privilege**
   - Lambda can only:
     - Read Secrets Manager (DB password)
     - Read Parameter Store (webhook URL)
     - Write CloudWatch logs
     - Connect to RDS

---

## Monitoring

### Metrics

**Scheduler Lambda**:
- Invocations (should be 1/minute)
- Duration (should be < 1 second)
- Errors

**SQS Queue**:
- Messages in queue (backlog)
- Messages sent
- Oldest message age

**Worker Lambda**:
- Invocations
- Success/failure rate
- Concurrent executions

**Dead Letter Queue**:
- Messages in DLQ (failures)

**RDS**:
- CPU & connections
- Query performance

### Alarms (Email via SNS)

- ⚠️ Scheduler errors > 3 in 5 minutes
- ⚠️ SQS queue depth > 1000 (backlog building up)
- ⚠️ DLQ has messages (webhook failures)
- ⚠️ Worker error rate > 10%
- ⚠️ RDS CPU > 80%
- ⚠️ RDS storage < 2 GB free

---

## Deployment

### Option 1: AWS CDK (Recommended)
```bash
npm install -g aws-cdk
cdk bootstrap
cdk deploy
```

### Option 2: AWS Console
1. Create VPC (private subnets)
2. Create RDS PostgreSQL
3. Create Lambda function
4. Create EventBridge rule
5. Configure security groups
6. Add secrets to Secrets Manager

---

## Key Commands

### Deploy
```bash
cdk deploy BdayInfraStack
```

### Test Scheduler Manually
```bash
aws lambda invoke \
  --function-name bday-scheduler \
  --payload '{}' \
  response.json
```

### View Logs
```bash
aws logs tail /aws/lambda/bday-scheduler --follow
```

### Database Connection
```bash
# Get credentials from Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id bday/db-credentials

# Connect via bastion or local tunnel
psql postgresql://user:pass@host:5432/bday
```

### Configure Webhook URL
```bash
# Store webhook URL in Parameter Store (FREE)
aws ssm put-parameter \
  --name /bday/webhook-url \
  --value "https://webhook.site/abc-123" \
  --type String \
  --description "Birthday webhook endpoint"

# Update it anytime (no Lambda redeploy needed)
aws ssm put-parameter \
  --name /bday/webhook-url \
  --value "https://new-webhook.com/xyz" \
  --overwrite

# View current value
aws ssm get-parameter --name /bday/webhook-url
```

### Test Webhook Delivery
```bash
# Trigger scheduler manually
aws lambda invoke \
  --function-name bday-scheduler \
  --payload '{}' \
  response.json

# Check webhook.site - you should see the POST request!
```

---

## Disaster Recovery

### Backups
- **Automated**: Daily RDS snapshots (7-day retention)
- **Point-in-Time Recovery**: Restore to any second in last 7 days

### Recovery Time
- Database corruption: 30 minutes (restore from snapshot)
- Lambda deleted: 5 minutes (redeploy via CDK)
- Secrets deleted: 5 minutes (recover from Secrets Manager)

---

## Infrastructure Checklist

- [ ] VPC with private subnets
- [ ] Lambda Scheduler function
- [ ] Lambda Worker function
- [ ] EventBridge rule (1-minute trigger)
- [ ] SQS Queue (bday-messages)
- [ ] Dead Letter Queue
- [ ] RDS PostgreSQL (db.t3.micro)
- [ ] NAT Gateway
- [ ] Security groups
- [ ] Secrets Manager (DB password)
- [ ] Parameter Store (webhook URL)
- [ ] CloudWatch alarms (6 alarms)
- [ ] IAM roles (Scheduler + Worker)

---

## Summary

**What you get:**
- Serverless scheduler (Lambda + EventBridge + SQS)
- Managed PostgreSQL (RDS)
- Decoupled architecture (scheduler doesn't wait for webhooks)
- Auto-retry logic (SQS handles failures)
- Parallel processing (10 concurrent workers)
- Secure (private, encrypted)
- Observable (logs, metrics, alarms)
- Scalable (handles 100+ events/minute easily)

**Why SQS?**
- Prevents scheduler timeouts
- Automatic retries on webhook failures
- Parallel webhook processing
- Clear visibility into backlog and failures
- Only adds ~$0.40/month for 100K messages

**What you DON'T need:**
- Kubernetes/ECS
- Multi-region setup
- DynamoDB
- ElastiCache
- Load balancers

This architecture handles high volume (100+ events/minute) reliably.

---

**Status**: ✅ Ready for Deployment
