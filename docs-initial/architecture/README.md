# Architecture Documentation

This folder contains all architecture and infrastructure design documents for the birthday messaging system.

## Document Overview

### Core Architecture Documents

- **[infrastructure.md](infrastructure.md)** ⭐ **START HERE** - Essential single-page infrastructure reference with AWS services and core architecture
- **[local-development-setup.md](local-development-setup.md)** 💻 **LOCAL SETUP** - Complete guide to running everything locally with LocalStack and Docker
- **[architecture-design.md](architecture-design.md)** - Comprehensive layered architecture covering domain model, design patterns, and system structure

### Detailed Design Documents

- **[high-level-system-design.md](high-level-system-design.md)** - Detailed system design with component architecture, data flows, and deployment options
- **[message-delivery-design.md](message-delivery-design.md)** - Multi-channel message delivery implementation (Webhook, SMS, Email)

## Quick Reference

### System Architecture

```text
EventBridge (1 min) → Lambda Scheduler → RDS + SQS → Lambda Worker → Webhook/SNS/SES
```

### Core AWS Services

| Service | Purpose |
|---------|---------|
| **Lambda Scheduler** | Finds ready events, sends to SQS (1 min timeout) |
| **Lambda Worker** | Processes SQS, delivers messages (30s timeout) |
| **EventBridge** | Triggers scheduler every minute |
| **SQS Queue** | Decouples scheduler from message delivery |
| **RDS PostgreSQL** | Stores users and events |
| **Parameter Store** | Application configuration |
| **SNS/SES** | SMS and Email delivery |

### Key Design Decisions

1. **UTC-Based Storage** - All timestamps stored in UTC, scheduler region-agnostic
2. **SQS Decoupling** - Handles >50 events/min without Lambda timeouts
3. **Multi-Channel Delivery** - One Lambda Worker with strategy pattern for Webhook/SMS/Email
4. **Parameter Store** - Free alternative to Secrets Manager for non-sensitive config
5. **Dead Letter Queue** - Captures permanently failed messages after 5 retries

## Reading Path

1. **Start with**: [infrastructure.md](infrastructure.md) - Get the essential overview
2. **Then read**: [message-delivery-design.md](message-delivery-design.md) - Understand delivery channels
3. **For details**: [architecture-design.md](architecture-design.md) - Deep dive into domain model
4. **For deployment**: [high-level-system-design.md](high-level-system-design.md) - Full AWS infrastructure

## Related Documentation

- [../requirements-solutions/](../requirements-solutions/) - Detailed solutions for each requirement
- [../brief.md](../brief.md) - Original project brief
- [../phase1-mvp-scope.md](../phase1-mvp-scope.md) - MVP scope definition
