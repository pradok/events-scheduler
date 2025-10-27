# Documentation Index

**Complete documentation for the Time-Based Event Scheduling System**

---

## 🚀 Getting Started

New to the project? Start here:

- **[Getting Started](./getting-started.md)** - 5-minute quick start guide

---

## 📖 Developer Guides

Practical how-to guides for developers:

| Guide | Description | Read Time |
|-------|-------------|-----------|
| **[Local Development](./local-development.md)** | Docker, npm scripts, database management | 5 min |
| **[LocalStack Setup](./localstack-setup-community.md)** | AWS service emulation (Community Edition) | 7 min |
| **[LocalStack Desktop](./localstack-desktop-setup.md)** | GUI tool for managing LocalStack (Recommended) | 8 min |
| **[Testing Guide](./testing-guide.md)** | Running and writing unit/integration/E2E tests | 6 min |
| **[Debugging Guide](./debugging.md)** | Troubleshooting common issues | 5 min |

---

## 🏗️ Architecture Documentation

Design decisions and system architecture:

| Document | Description |
|----------|-------------|
| **[Architecture Overview](./architecture.md)** | Complete system architecture |
| **[Tech Stack](./architecture/tech-stack.md)** | Technology choices and versions |
| **[Bounded Contexts](./architecture/bounded-contexts.md)** | Domain boundaries and modules |
| **[Data Models](./architecture/data-models.md)** | Entities, value objects, relationships |
| **[Database Schema](./architecture/database-schema.md)** | PostgreSQL schema design |
| **[Design Patterns](./architecture/design-patterns.md)** | Applied patterns (DDD, Hexagonal, Repository) |
| **[Port Interfaces](./architecture/port-interfaces.md)** | Adapter contracts and interfaces |
| **[Error Handling](./architecture/error-handling.md)** | Error strategy and logging |
| **[Test Strategy](./architecture/test-strategy.md)** | Testing philosophy and patterns |
| **[Workflows](./architecture/workflows.md)** | Key system workflows |
| **[Infrastructure](./architecture/infrastructure.md)** | Production AWS architecture |
| **[Security](./architecture/security.md)** | Security considerations |
| **[Source Tree](./architecture/source-tree.md)** | Folder structure explanation |
| **[Coding Standards](./architecture/coding-standards.md)** | Code style and conventions |

---

## 📋 Product Requirements

- **[Product Brief](./brief.md)** - Original project brief
- **[PRD](./prd.md)** - Complete Product Requirements Document

### Epics

| Epic | Title | Stories |
|------|-------|---------|
| **[Epic 1](./prd/epic-1-foundation-user-management.md)** | Foundation & User Management | 1.1 - 1.11c |
| **[Epic 2](./prd/epic-2-event-scheduling-execution.md)** | Event Scheduling & Execution | 2.1 - 2.11 |
| **[Epic 3](./prd/epic-3-automatic-recovery-reliability.md)** | Automatic Recovery & Reliability | 3.1 - 3.4 |
| **[Epic 4](./prd/epic-4-end-to-end-testing.md)** | End-to-End Testing | 4.1 - 4.6 |
| **[Epic 5](./prd/epic-5-testing-production-readiness.md)** | Testing & Production Readiness | 5.1 - 5.x |

### Stories

Stories are located in [`./stories/`](./stories/) directory.

**Recently Completed:**

- [Story 4.1](./stories/4.1.localstack-setup-community-edition.story.md) - LocalStack Setup (Community Edition)
- [Story 3.4](./stories/3.4.basic-end-to-end-smoke-test.story.md) - Basic E2E Smoke Test
- [Story 3.3](./stories/3.3.recovery-on-system-startup.story.md) - Recovery on System Startup

[View all stories →](./stories/)

---

## 📊 Project Status

- **[BMAD Workflow Status](./bmad-workflow-status.md)** - Current sprint and story status
- **[Architecture Validation Report](./architecture-validation-report.md)** - Architecture review findings
- **[PO Validation Gaps](./po-validation-gaps.md)** - Product Owner feedback

---

## 🔍 Quick Links

### For New Developers

1. [Getting Started](./getting-started.md) - Set up your environment (5 min)
2. [Local Development](./local-development.md) - Learn the development workflow
3. [Testing Guide](./testing-guide.md) - Run your first tests
4. [Coding Standards](./architecture/coding-standards.md) - Learn the code style

### For Troubleshooting

- [Debugging Guide](./debugging.md) - Common issues and solutions
- [LocalStack Troubleshooting](./localstack-setup-community.md#troubleshooting) - LocalStack-specific issues

### For Understanding Architecture

- [Architecture Overview](./architecture.md) - Start here
- [Tech Stack](./architecture/tech-stack.md) - What we use and why
- [Design Patterns](./architecture/design-patterns.md) - How we structure code
- [Test Strategy](./architecture/test-strategy.md) - How we test

---

## 📚 External References

- [Prisma Documentation](https://www.prisma.io/docs/)
- [LocalStack Documentation](https://docs.localstack.cloud/)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Domain-Driven Design](https://martinfowler.com/bliki/DomainDrivenDesign.html)

---

## 🤝 Contributing

Before contributing:

1. Read [Getting Started](./getting-started.md)
2. Review [Coding Standards](./architecture/coding-standards.md)
3. Understand [Test Strategy](./architecture/test-strategy.md)
4. Run tests: `npm test`

---

## 📝 Documentation Structure

```
docs/
├── README.md                           ← You are here
├── getting-started.md                  ← Quick start (5 min)
├── local-development.md                ← Development guide
├── localstack-setup-community.md       ← LocalStack setup
├── localstack-desktop-setup.md         ← LocalStack Desktop GUI
├── testing-guide.md                    ← Testing guide
├── debugging.md                        ← Troubleshooting
├── architecture.md                     ← Architecture overview
├── architecture/                       ← Architecture deep dives
│   ├── bounded-contexts.md
│   ├── coding-standards.md
│   ├── data-models.md
│   ├── database-schema.md
│   ├── design-patterns.md
│   ├── error-handling.md
│   ├── infrastructure.md
│   ├── port-interfaces.md
│   ├── security.md
│   ├── source-tree.md
│   ├── tech-stack.md
│   ├── test-strategy.md
│   └── workflows.md
├── prd/                                ← Product requirements
│   ├── epic-1-foundation-user-management.md
│   ├── epic-2-event-scheduling-execution.md
│   ├── epic-3-automatic-recovery-reliability.md
│   ├── epic-4-end-to-end-testing.md
│   └── epic-5-testing-production-readiness.md
└── stories/                            ← Story implementations
    ├── 1.1.project-setup.md
    ├── 1.2.docker-environment.md
    ├── ...
    └── 4.1.localstack-setup-community-edition.story.md
```

---

**Last Updated:** 2025-10-27

**Documentation consolidated and organized in Story 4.1**
