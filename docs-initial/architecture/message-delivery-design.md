# Message Delivery Design

How the system sends birthday messages through multiple channels (Webhook, SMS, Email).

---

## Overview

The system supports **three message delivery channels**:
1. **Webhook** - HTTP POST to customer's endpoint
2. **SMS** - Amazon SNS (text message to phone)
3. **Email** - Amazon SES (email to inbox)

**Key Design**: One Lambda Worker handles all three channels using a strategy pattern.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      AWS Cloud                                  │
│                                                                  │
│   EventBridge (1 min) → Lambda Scheduler → RDS → SQS           │
│                                                  ↓               │
│                                     ┌────────────────────────┐  │
│                                     │  Lambda Worker         │  │
│                                     │  (Multi-Channel)       │  │
│                                     │                        │  │
│                                     │  - WebhookSender       │  │
│                                     │  - SmsSender (SNS)     │  │
│                                     │  - EmailSender (SES)   │  │
│                                     └────────┬───────────────┘  │
│                                              │                   │
│                        ┌─────────────────────┼─────────────┐    │
│                        │                     │             │    │
│                        ▼                     ▼             ▼    │
│                 ┌──────────┐        ┌──────────┐   ┌──────────┐│
│                 │ Webhook  │        │   SNS    │   │   SES    ││
│                 │ (NAT GW) │        │ (AWS)    │   │  (AWS)   ││
│                 └──────────┘        └──────────┘   └──────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                        │                  │              │
                        ▼                  ▼              ▼
            ┌────────────────┐  ┌────────────────┐  ┌──────────────┐
            │ Customer's     │  │ User's Phone   │  │ User's Email │
            │ Webhook        │  │ +1-555-1234    │  │ john@mail.com│
            └────────────────┘  └────────────────┘  └──────────────┘
```

---

## Data Model

### User Schema (Enhanced)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  date_of_birth DATE NOT NULL,
  timezone VARCHAR(100) NOT NULL,

  -- Message delivery configuration
  preferred_channel VARCHAR(20) NOT NULL DEFAULT 'WEBHOOK',
    CHECK (preferred_channel IN ('WEBHOOK', 'SMS', 'EMAIL')),

  -- Channel-specific fields (at least one required)
  webhook_url VARCHAR(500),
  phone_number VARCHAR(20),
  email VARCHAR(255),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Validation: At least one delivery method must be configured
  CONSTRAINT check_delivery_method CHECK (
    webhook_url IS NOT NULL OR
    phone_number IS NOT NULL OR
    email IS NOT NULL
  )
);

-- Indexes
CREATE INDEX idx_users_channel ON users(preferred_channel);
```

### User Data Examples

```json
// User 1: Webhook delivery
{
  "id": "uuid-123",
  "firstName": "John",
  "lastName": "Doe",
  "dateOfBirth": "1990-03-15",
  "timezone": "America/New_York",
  "preferredChannel": "WEBHOOK",
  "webhookUrl": "https://webhook.site/abc-123",
  "phoneNumber": null,
  "email": null
}

// User 2: SMS delivery
{
  "id": "uuid-456",
  "firstName": "Jane",
  "lastName": "Smith",
  "dateOfBirth": "1992-07-20",
  "timezone": "America/Los_Angeles",
  "preferredChannel": "SMS",
  "webhookUrl": null,
  "phoneNumber": "+14155551234",
  "email": null
}

// User 3: Email delivery
{
  "id": "uuid-789",
  "firstName": "Bob",
  "lastName": "Johnson",
  "dateOfBirth": "1985-11-05",
  "timezone": "Europe/London",
  "preferredChannel": "EMAIL",
  "webhookUrl": null,
  "phoneNumber": null,
  "email": "bob@example.com"
}
```

---

## Lambda Worker Implementation

### Strategy Pattern (One Worker, Multiple Senders)

```typescript
// src/senders/message-sender.interface.ts
export interface MessageSender {
  send(user: User, message: string): Promise<void>;
}

// src/senders/webhook-sender.ts
export class WebhookSender implements MessageSender {
  async send(user: User, message: string): Promise<void> {
    if (!user.webhookUrl) {
      throw new Error('Webhook URL not configured');
    }

    await fetch(user.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        userId: user.id,
        timestamp: new Date().toISOString()
      })
    });
  }
}

// src/senders/sms-sender.ts
export class SmsSender implements MessageSender {
  constructor(private sns: AWS.SNS) {}

  async send(user: User, message: string): Promise<void> {
    if (!user.phoneNumber) {
      throw new Error('Phone number not configured');
    }

    await this.sns.publish({
      PhoneNumber: user.phoneNumber,
      Message: message,
      MessageAttributes: {
        'AWS.SNS.SMS.SenderID': {
          DataType: 'String',
          StringValue: 'BdayApp'
        },
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional'
        }
      }
    }).promise();
  }
}

// src/senders/email-sender.ts
export class EmailSender implements MessageSender {
  constructor(private ses: AWS.SES) {}

  async send(user: User, message: string): Promise<void> {
    if (!user.email) {
      throw new Error('Email not configured');
    }

    await this.ses.sendEmail({
      Source: 'birthday@yourdomain.com',
      Destination: {
        ToAddresses: [user.email]
      },
      Message: {
        Subject: {
          Data: '🎉 Happy Birthday!'
        },
        Body: {
          Html: {
            Data: `
              <html>
                <body style="font-family: Arial, sans-serif;">
                  <h1>Happy Birthday, ${user.firstName}! 🎂</h1>
                  <p>${message}</p>
                </body>
              </html>
            `
          },
          Text: {
            Data: message
          }
        }
      }
    }).promise();
  }
}

// src/senders/sender-factory.ts
export class SenderFactory {
  constructor(
    private webhookSender: WebhookSender,
    private smsSender: SmsSender,
    private emailSender: EmailSender
  ) {}

  getSender(channel: string): MessageSender {
    switch (channel) {
      case 'WEBHOOK':
        return this.webhookSender;
      case 'SMS':
        return this.smsSender;
      case 'EMAIL':
        return this.emailSender;
      default:
        throw new Error(`Unknown channel: ${channel}`);
    }
  }
}

// src/worker/lambda-handler.ts
export async function handler(sqsEvent: SQSEvent) {
  const senderFactory = new SenderFactory(
    new WebhookSender(),
    new SmsSender(new AWS.SNS()),
    new EmailSender(new AWS.SES())
  );

  for (const record of sqsEvent.Records) {
    const event = JSON.parse(record.body) as BirthdayEvent;

    try {
      // 1. Load user data
      const user = await userRepository.findById(event.userId);

      // 2. Construct message
      const message = `Hey, ${user.firstName} ${user.lastName} it's your birthday`;

      // 3. Get appropriate sender
      const sender = senderFactory.getSender(user.preferredChannel);

      // 4. Send message
      await sender.send(user, message);

      // 5. Mark event as completed
      await eventRepository.updateStatus(event.id, 'COMPLETED');

      console.log(`Message sent via ${user.preferredChannel} to user ${user.id}`);

    } catch (error) {
      console.error('Failed to send message', error);
      throw error; // SQS will retry
    }
  }
}
```

---

## Delivery Channel Details

### 1. Webhook Delivery

**When to use:**
- Customer has their own integration endpoint
- Testing with RequestBin/Webhook.site
- Custom routing logic needed

**Requirements:**
- NAT Gateway (for internet access) - $33/month
- Valid HTTPS URL

**Example:**
```bash
POST https://webhook.site/abc-123
Content-Type: application/json

{
  "message": "Hey, John Doe it's your birthday",
  "userId": "uuid-123",
  "eventId": "event-456",
  "timestamp": "2025-03-15T14:00:00Z"
}
```

**Error Handling:**
- Retry on 5xx errors (server issues)
- Don't retry on 4xx errors (client issues)
- Timeout: 5 seconds

---

### 2. SMS Delivery (Amazon SNS)

**When to use:**
- Direct to user's phone
- High priority notifications
- No email available

**Requirements:**
- Phone number in E.164 format (+14155551234)
- AWS SNS access
- Country-specific pricing

**Configuration:**
```typescript
SNS Configuration:
  SenderID: 'BdayApp'
  SMSType: 'Transactional' (higher priority)
  MaxPrice: $0.50 (cost protection)
```

**Rate Limits:**
- Default: 20 SMS/second
- Can request increase
- Backpressure: Use Lambda concurrency control

**Cost:**
```
US: $0.00645 per SMS
UK: $0.05 per SMS
India: $0.01 per SMS
```

**Error Handling:**
- Invalid phone number: Don't retry (permanent failure)
- Rate limit exceeded: Retry with backoff
- Network error: Retry

---

### 3. Email Delivery (Amazon SES)

**When to use:**
- Rich formatting needed (HTML)
- Cheaper than SMS
- Professional communication

**Requirements:**
- Verified domain (birthday@yourdomain.com)
- SES production access (out of sandbox)
- Valid email address

**Configuration:**
```typescript
SES Configuration:
  From: 'birthday@yourdomain.com'
  ReplyTo: 'no-reply@yourdomain.com'
  ConfigurationSet: 'birthday-tracking'
```

**Rate Limits:**
- Sandbox: 1 email/second, 200/day
- Production: 14 emails/second (default)
- Can request increase to 1000+/second

**Cost:**
```
$0.10 per 1,000 emails
= $0.0001 per email (very cheap!)
```

**Error Handling:**
- Invalid email: Don't retry (permanent failure)
- Bounce: Mark user email as invalid
- Complaint (spam): Unsubscribe user
- Rate limit: Retry with backoff

---

## Infrastructure Requirements by Channel

### Webhook Only

```yaml
Required:
  - Lambda Worker (VPC for RDS access)
  - NAT Gateway (for internet access)
  - No additional AWS services

Cost: $58/month (includes NAT Gateway $33/month)
```

### SMS (SNS) Only

```yaml
Required:
  - Lambda Worker (VPC for RDS access)
  - Amazon SNS (no infrastructure)
  - IAM: lambda → SNS permission

NOT Required:
  - NAT Gateway (SNS is AWS service) ✅ Saves $33/month

Cost: $25/month + $0.00645 per SMS
```

### Email (SES) Only

```yaml
Required:
  - Lambda Worker (VPC for RDS access)
  - Amazon SES (no infrastructure)
  - Verified domain (via DNS records)
  - IAM: lambda → SES permission

NOT Required:
  - NAT Gateway (SES is AWS service) ✅ Saves $33/month

Cost: $25/month + $0.0001 per email
```

### All Three (Recommended)

```yaml
Required:
  - Lambda Worker (VPC for RDS access)
  - NAT Gateway (for webhook only)
  - Amazon SNS
  - Amazon SES
  - IAM: lambda → SNS, SES permissions

Cost: $58/month + per-message costs
```

---

## Lambda Worker Configuration

### Single Lambda Function

```yaml
Function Name: bday-worker
Runtime: nodejs20.x
Memory: 512 MB
Timeout: 30 seconds
Reserved Concurrency: 10

VPC:
  Subnets: [private-subnet-a, private-subnet-b]
  Security Groups: [worker-sg]

Environment Variables:
  NODE_ENV: production
  SES_FROM_EMAIL: birthday@yourdomain.com

IAM Permissions:
  - secretsmanager:GetSecretValue (DB password)
  - ssm:GetParameter (webhook URL from Parameter Store, if centralized)
  - sns:Publish (for SMS)
  - ses:SendEmail (for email)
  - logs:CreateLogStream, logs:PutLogEvents (CloudWatch)
  - ec2:CreateNetworkInterface, ec2:DescribeNetworkInterfaces (VPC)

Trigger:
  - SQS Queue: bday-messages
  - Batch Size: 10
  - Batch Window: 0 seconds
```

### Why One Lambda for All Channels?

✅ **Simpler infrastructure** - One function to manage, not three
✅ **Shared code** - Common logic (DB access, SQS handling)
✅ **Cost efficient** - No duplication of cold start costs
✅ **Easier monitoring** - Single CloudWatch log group
✅ **Flexible scaling** - One concurrency setting for all

**Alternative (Not Recommended):**
```yaml
# Three separate Lambda functions
bday-worker-webhook
bday-worker-sms
bday-worker-email

# Problems:
# - More complex infrastructure
# - Need to route SQS messages to correct Lambda
# - 3x cold start overhead
# - 3x monitoring complexity
```

---

## Channel Selection Logic

### Option 1: User Preference (Recommended)

User explicitly chooses their preferred channel:

```sql
UPDATE users
SET preferred_channel = 'SMS',
    phone_number = '+14155551234'
WHERE id = 'uuid-123';
```

**Pros:**
- User control
- Clear expectations
- Simple logic

### Option 2: Fallback Chain

Try channels in order until one succeeds:

```typescript
const channels = ['SMS', 'EMAIL', 'WEBHOOK'];

for (const channel of channels) {
  if (hasConfiguredChannel(user, channel)) {
    try {
      await send(user, channel);
      break; // Success
    } catch (error) {
      console.log(`${channel} failed, trying next...`);
    }
  }
}
```

**Pros:**
- Higher delivery rate
- Automatic failover

**Cons:**
- More complex
- May send duplicate if first succeeds but appears to fail

### Option 3: Multi-Channel (Send to All)

Send to all configured channels:

```typescript
const promises = [];

if (user.webhookUrl) {
  promises.push(webhookSender.send(user, message));
}
if (user.phoneNumber) {
  promises.push(smsSender.send(user, message));
}
if (user.email) {
  promises.push(emailSender.send(user, message));
}

await Promise.allSettled(promises);
```

**Pros:**
- Maximum delivery assurance
- User gets message on all platforms

**Cons:**
- Higher costs (multiple messages per user)
- May be annoying to user

**Recommendation: Use Option 1 (User Preference)** for Phase 1.

---

## API Endpoints

### Create User with Channel Preference

```typescript
POST /user
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "dateOfBirth": "1990-03-15",
  "timezone": "America/New_York",
  "preferredChannel": "SMS",
  "phoneNumber": "+14155551234"
}

// Response: 201 Created
{
  "id": "uuid-123",
  "firstName": "John",
  "lastName": "Doe",
  "dateOfBirth": "1990-03-15",
  "timezone": "America/New_York",
  "preferredChannel": "SMS",
  "phoneNumber": "+14155551234",
  "createdAt": "2025-01-18T10:00:00Z"
}
```

### Update Channel Preference

```typescript
PUT /user/:id
Content-Type: application/json

{
  "preferredChannel": "EMAIL",
  "email": "john@example.com"
}

// Response: 200 OK
```

---

## Cost Comparison (10K Users)

| Channel | Infrastructure | Per Message | Total/Month |
|---------|----------------|-------------|-------------|
| **Webhook** | $58 | $0 | **$58** |
| **SMS** | $25 | $0.00645 | **$30** ($25 + $5) |
| **Email** | $25 | $0.0001 | **$25** ($25 + $0.08) |
| **All Three** | $58 | Mixed | **$58-85** |

**Winner: Email is cheapest, SMS is most direct, Webhook is most flexible.**

---

## Testing Each Channel

### Test Webhook
```bash
# Set up test webhook
WEBHOOK_URL="https://webhook.site/abc-123"

# Create test user
curl -X POST https://api.bday.com/user \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "dateOfBirth": "2000-01-01",
    "timezone": "UTC",
    "preferredChannel": "WEBHOOK",
    "webhookUrl": "'$WEBHOOK_URL'"
  }'

# Check webhook.site - you should see POST request
```

### Test SMS
```bash
# Create test user with your phone
curl -X POST https://api.bday.com/user \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "dateOfBirth": "2000-01-01",
    "timezone": "UTC",
    "preferredChannel": "SMS",
    "phoneNumber": "+14155551234"
  }'

# Manually trigger event for testing
aws lambda invoke \
  --function-name bday-scheduler \
  --payload '{"userId":"uuid-123"}' \
  response.json

# Check your phone - you should receive SMS
```

### Test Email
```bash
# Create test user with your email
curl -X POST https://api.bday.com/user \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "dateOfBirth": "2000-01-01",
    "timezone": "UTC",
    "preferredChannel": "EMAIL",
    "email": "your-email@example.com"
  }'

# Check your inbox - you should receive email
```

---

## Monitoring & Metrics

### CloudWatch Metrics per Channel

```typescript
// Emit custom metrics
await cloudwatch.putMetricData({
  Namespace: 'BdayApp/Delivery',
  MetricData: [
    {
      MetricName: 'MessagesSent',
      Value: 1,
      Unit: 'Count',
      Dimensions: [
        { Name: 'Channel', Value: user.preferredChannel }
      ]
    }
  ]
}).promise();
```

### Dashboard

```
┌──────────────────────────────────────────────────┐
│  Message Delivery Dashboard                      │
├──────────────────────────────────────────────────┤
│                                                   │
│  [Graph] Messages by Channel (Last 24h)          │
│  Webhook: 450 (45%)                              │
│  SMS:     350 (35%)                              │
│  Email:   200 (20%)                              │
│                                                   │
│  [Graph] Success Rate by Channel                 │
│  Webhook: 95% (45 failures)                      │
│  SMS:     99% (3 failures)                       │
│  Email:   98% (4 failures)                       │
│                                                   │
│  [Number] DLQ Messages: 12                       │
│  [Number] Processing Latency: 850ms (avg)        │
│                                                   │
└──────────────────────────────────────────────────┘
```

---

## Summary

### Architecture Decisions

✅ **One Lambda Worker** handles all three channels
✅ **Strategy Pattern** for clean, extensible code
✅ **User chooses** preferred delivery channel
✅ **SQS decoupling** enables reliable delivery
✅ **AWS services** (SNS/SES) save costs (no NAT Gateway needed)

### Implementation Checklist

- [ ] Update database schema (add channel fields)
- [ ] Implement MessageSender interface
- [ ] Create WebhookSender class
- [ ] Create SmsSender class (SNS)
- [ ] Create EmailSender class (SES)
- [ ] Create SenderFactory
- [ ] Update Lambda Worker handler
- [ ] Add IAM permissions (SNS, SES)
- [ ] Update API endpoints (support channel selection)
- [ ] Add CloudWatch metrics per channel
- [ ] Test all three channels
- [ ] Document for users (how to configure)

### Next Steps

1. Implement MessageSender interface and senders
2. Update Lambda Worker with strategy pattern
3. Test webhook delivery (Phase 1)
4. Add SNS/SES support (Phase 2)
5. Monitor delivery success rates

---

**Status**: ✅ Design Complete
**Last Updated**: 2025-01-18
