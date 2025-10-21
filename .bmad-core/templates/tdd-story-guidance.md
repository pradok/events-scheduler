<!-- Powered by BMAD™ Core -->

# TDD Story Guidance for Scrum Masters

**Purpose:** This document provides guidance for Scrum Masters on when and how to structure stories for Test-Driven Development (TDD).

---

## When to Recommend TDD

**TDD is strongly recommended when:**

✅ **Patterns and contracts are clear:**

- Well-defined interfaces (e.g., repository ports, use cases)
- Following established architectural patterns (e.g., value objects, entities, services)
- Stories with detailed acceptance criteria and clear expected behavior
- Implementing business logic with known requirements

✅ **Benefits are high:**

- Code needs to be highly testable from the start
- Interface contracts are defined in architecture docs
- Multiple implementations expected (e.g., Prisma + InMemory for tests)
- Critical path code requiring 100% test coverage

**TDD is acceptable to skip when:**

⚠️ **Exploration is needed:**

- Architectural exploration and prototyping
- Initial pattern discovery
- Proof-of-concept implementations
- Infrastructure setup without clear contracts
- Researching third-party library integrations

---

## How to Structure TDD Stories

### 1. Add TDD Context to Story Header

Add this section right after the "Tasks / Subtasks" heading:

```markdown
## Tasks / Subtasks

**Development Approach:** This story is ideal for **Test-Driven Development (TDD)** since we have clear interface contracts and established patterns. Follow the Red-Green-Refactor cycle.

**TDD Workflow Reminder:**

1. **RED**: Write failing test defining desired behavior
2. **GREEN**: Write minimal code to pass the test
3. **REFACTOR**: Clean up while keeping tests green

---
```

### 2. Structure Tasks Using Red-Green-Refactor

Each major implementation task should be broken into three subtask groups:

```markdown
- [ ] **Task N (TDD): [Task Name]** (AC: X, Y, Z)
  - [ ] **RED: Write failing test first**
    - [ ] Create test file
    - [ ] Write test: "[specific test description]"
    - [ ] Write test: "[another specific test description]"
    - [ ] Run tests → expect failures (implementation doesn't exist yet)
  - [ ] **GREEN: Implement [Component] to pass tests**
    - [ ] Create implementation file
    - [ ] [Implementation step 1]
    - [ ] [Implementation step 2]
    - [ ] Run tests → expect all tests pass
  - [ ] **REFACTOR: Clean up and verify**
    - [ ] [Code quality check 1]
    - [ ] [Code quality check 2]
    - [ ] Run tests again → expect all tests still pass
```

### 3. Add TDD Guidance to Dev Notes

In the Testing section of Dev Notes, add a TDD-specific subsection:

```markdown
#### TDD Approach for This Story

**This story is IDEAL for Test-Driven Development** because:

- [Reason 1: e.g., Interface contracts are clearly defined]
- [Reason 2: e.g., Expected behavior is well-specified]
- [Reason 3: e.g., No infrastructure dependencies to set up]

**Follow Red-Green-Refactor:**

1. **RED**: Write tests defining [what to test] → Tests fail (implementation doesn't exist)
2. **GREEN**: Create [component] with minimal implementation to pass tests
3. **REFACTOR**: Improve [what to improve], verify [what to verify]
```

---

## Example: Story 1.6 (Repository Port Interfaces)

**Why TDD was recommended:**

- Clear interface contracts defined in architecture docs
- Method signatures and types fully specified
- No infrastructure setup needed
- Ideal for test-first approach

**How it was structured:**

1. **Header included TDD workflow reminder**
2. **Tasks structured as Red-Green-Refactor:**
   - Task 2 (TDD): Define IUserRepository
     - RED: Write failing tests for interface structure
     - GREEN: Implement interface to pass tests
     - REFACTOR: Verify imports, JSDoc, strict mode
   - Task 3 (TDD): Define IEventRepository
     - RED: Write failing tests for interface structure
     - GREEN: Implement interface to pass tests
     - REFACTOR: Verify imports, JSDoc, strict mode

3. **Dev Notes included TDD justification:**
   - Explained why this story is ideal for TDD
   - Provided specific Red-Green-Refactor guidance
   - Referenced test-strategy.md

---

## TDD Story Checklist

When creating a story that should use TDD:

- [ ] Add "Development Approach: TDD recommended" section to Tasks
- [ ] Include TDD Workflow Reminder (Red-Green-Refactor)
- [ ] Structure tasks with RED-GREEN-REFACTOR subtasks
- [ ] Add "TDD Approach for This Story" to Dev Notes > Testing
- [ ] Explain WHY TDD is ideal for this specific story
- [ ] Provide specific test scenarios to write first
- [ ] Include "Run tests → expect failures/passes" checkpoints

---

## Anti-Patterns to Avoid

❌ **Don't mandate TDD for everything:**

- Respect developer autonomy for exploratory work
- TDD is a tool, not a religion
- Some work genuinely benefits from test-after approach

❌ **Don't write TDD tasks without clear contracts:**

- If interfaces/behavior aren't defined, TDD will slow down discovery
- Let developers explore first, then write tests

❌ **Don't over-specify test implementation details:**

- Give developers freedom in HOW they write tests
- Focus on WHAT should be tested, not exact test syntax

---

## References

- [Architecture: Test Strategy](../../docs/architecture/test-strategy.md#testing-philosophy)
- [Architecture: Coding Standards](../../docs/architecture/coding-standards.md#test-requirements)
- [Example: Story 1.6](../../docs/stories/1.6.repository-port-interfaces.md)

---

**Last Updated:** 2025-01-22
**Version:** 1.0
