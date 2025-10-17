# Time-Based Event Scheduling System

A distributed, timezone-aware event scheduling system that triggers events at specific local times. Built with extensibility in mind, starting with birthday messaging as the Phase 1 MVP.

---

## What This Project Is About

This is **not just a birthday messaging app** - it's a general-purpose **event scheduling platform** that can trigger any action at specific local times across multiple timezones.

### The Core Problem

Schedule and execute events based on:
- ⏰ **Temporal criteria** (specific dates/times, recurrence patterns)
- 🌍 **Timezone context** (local time, not just UTC)
- 🔄 **Recurrence patterns** (annual, monthly, one-time, custom)
- 🔌 **Pluggable actions** (webhooks, emails, SMS, API calls, etc.)

### Use Cases

While Phase 1 focuses on birthday messages, the architecture supports:
- 🎂 Birthday greetings at 9am local time
- 💑 Anniversary reminders
- 📅 Subscription renewal notifications
- 📊 Scheduled report generation per office timezone
- 🔔 Appointment reminders
- 🏢 Contract expiry notifications
- ...and any time-based event you can imagine

---

## Key Features (Phase 1 MVP)

- ✅ **Multi-timezone Support**: Send messages at exactly 9am local time across all timezones
- ✅ **Exactly-Once Delivery**: No duplicate messages, guaranteed
- ✅ **Failure Recovery**: System recovers from downtime and catches up on missed events
- ✅ **RESTful API**: Create, read, update, delete users
- ✅ **Automatic Scheduling**: Events generated and scheduled automatically
- ✅ **Extensible Architecture**: Built to support future event types without core changes

**Technical Highlights**: Layered architecture, design patterns (Strategy, Repository, State Machine), highly testable, LocalStack ready, TypeScript strict mode, race condition safe.

---

## Quick Start

### Prerequisites
- Node.js >= 18
- Docker & Docker Compose
- Git

### Installation & Running

```bash
# Clone the repository
git clone <repository-url>
cd bday

# Install dependencies
npm install

# Start LocalStack (Database, etc.)
docker-compose up -d

# Setup database schema
npm run db:setup

# Run the application
npm run dev

# In another terminal, start the scheduler
npm run scheduler

# Run tests
npm test
```

### Create Your First User

```bash
curl -X POST http://localhost:3000/user \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "dateOfBirth": "1990-03-15",
    "timezone": "America/New_York"
  }'
```

The system will automatically schedule a birthday message for 9:00 AM on March 15th in the New York timezone.

---

## Documentation

### 📖 Documentation Hub
👉 **[See docs/README.md](docs/README.md)** for complete documentation guide with architecture diagrams, design principles, and how the system works.

### 📋 Core Documents

| Document | Description |
|----------|-------------|
| [Problem Statement](docs/problem-statement.md) | Why this exists, abstract problem definition |
| [Technical Challenges](docs/challenges.md) | 8 major technical challenges we solve |
| [Architecture Design](docs/architecture-design.md) | System architecture, patterns, domain model |
| [Phase 1 MVP Scope](docs/phase1-mvp-scope.md) | What we're building, timeline, success criteria |

### 🔗 Reference Documents

| Document | Description |
|----------|-------------|
| [Original Brief](docs/brief.md) | Project requirements |
| [Coverage Mapping](docs/brief-coverage-mapping.md) | Requirements traceability |
| [Documentation Roadmap](docs/documentation-roadmap.md) | What's covered and what's still needed |

---

## Technology Stack

**Runtime**: Node.js + TypeScript | **Framework**: Express.js | **Database**: TBD (LocalStack) | **Testing**: Jest | **Date/Time**: Luxon

See [docs/README.md](docs/README.md#-technology-stack) for complete tech stack details.

---

## Project Structure

```
bday/
├── docs/                    # 📚 All documentation (see docs/README.md)
├── src/                     # Source code (Phase 1)
│   ├── api/                 # API controllers
│   ├── domain/              # Domain entities & services
│   ├── repository/          # Data access layer
│   ├── scheduler/           # Background scheduler
│   └── infrastructure/      # External clients, logging
├── tests/                   # Test suites (unit, integration, e2e)
├── docker-compose.yml       # LocalStack + services
└── README.md                # This file
```

---

## Development Status

### Current Phase: Phase 0 - Planning & Design ✅ Complete
- ✅ Problem definition and technical challenges documented
- ✅ Architecture designed with extensibility in mind
- ✅ Domain model and design patterns established
- ✅ Phase 1 MVP scope defined

### Next Phase: Phase 1 - Birthday Messaging MVP 🚧 Starting Soon
4-week implementation plan:
- **Week 1**: Foundation (setup, LocalStack, database, basic API)
- **Week 2**: Core Scheduling (events, timezone logic, scheduler, executor)
- **Week 3**: Reliability (exactly-once delivery, retries, recovery)
- **Week 4**: Polish (user updates, testing, documentation, performance)

See [Phase 1 MVP Scope](docs/phase1-mvp-scope.md) for detailed breakdown.

### Future Phases
- **Phase 2**: Event extensibility (anniversary, custom events)
- **Phase 3**: Advanced features (auth, dashboard, audit trail)
- **Phase 4**: Production readiness (multi-tenancy, monitoring, performance)

---

## Contributing

This is currently a personal project for learning and demonstration. Contributions welcome after Phase 1 MVP is complete.

**Code Standards**: TypeScript strict mode, ESLint + Prettier enforced, 80%+ test coverage, conventional commits, all tests must pass.

---

## License

[To be determined]

---

## Contact & Links

- **Documentation**: [docs/](docs/)
- **Project Repository**: [GitHub URL]
- **Issues**: [GitHub Issues]
- **Author**: [Your Name]

---

## Acknowledgments

This project architecture was inspired by Domain-Driven Design principles, Event-Driven Architecture patterns, AWS serverless best practices, and the challenge of building timezone-aware distributed systems.

Special thanks to the open-source community for LocalStack, Luxon, and Jest.

---

**Status**: 📋 Phase 0 Complete | 🚧 Phase 1 Starting Soon

**Last Updated**: 2025-10-17
