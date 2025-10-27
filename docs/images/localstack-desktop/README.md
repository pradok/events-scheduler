# LocalStack Desktop Screenshots

This directory contains screenshots for the LocalStack Desktop Setup Guide.

## Required Screenshots

Please capture the following screenshots after installing LocalStack Desktop:

### 1. Main Dashboard
**Filename:** `01-main-dashboard.png`
**Shows:** Main dashboard with connection status and container info
**Instructions:**
- Open LocalStack Desktop
- Ensure connected to `http://localhost:4566`
- Capture full window showing connection status

### 2. SQS Resource Browser
**Filename:** `02-sqs-queues.png`
**Shows:** SQS queues view showing `bday-events-queue` and `bday-events-dlq`
**Instructions:**
- Navigate to SQS section in left sidebar
- Capture queue list showing both queues
- Ensure queue details are visible

### 3. EventBridge Rules
**Filename:** `03-eventbridge-rules.png`
**Shows:** EventBridge rules view showing `event-scheduler-rule`
**Instructions:**
- Navigate to EventBridge → Rules
- Capture rule list showing `event-scheduler-rule`
- Ensure State (ENABLED) and Schedule are visible

### 4. Container Management
**Filename:** `04-container-management.png`
**Shows:** Container management panel with start/stop controls
**Instructions:**
- Locate container management panel
- Capture panel showing container status and controls
- Ensure start/stop buttons are visible

### 5. CloudWatch Logs
**Filename:** `05-cloudwatch-logs.png`
**Shows:** CloudWatch Logs viewer (after Lambda deployment in Story 4.4)
**Instructions:**
- Navigate to CloudWatch → Logs
- After Story 4.4, capture log groups list
- **Note:** This screenshot can be added after Story 4.4 is complete

## Screenshot Guidelines

- **Format:** PNG preferred (JPEG acceptable)
- **Resolution:** 1920x1080 or higher
- **Crop:** Crop to relevant content, remove unnecessary UI
- **Privacy:** Ensure no sensitive information is visible
- **Quality:** Use high quality setting (no compression artifacts)

## How to Capture Screenshots

### macOS
```bash
# Full window
Cmd + Shift + 4, then Space, then click window

# Selected area
Cmd + Shift + 4, drag to select area
```

### Windows
```bash
# Full window
Alt + PrtScn

# Selected area
Windows + Shift + S
```

### Linux
```bash
# Full window
Use screenshot tool (varies by distro)

# Selected area
Shift + PrtScn (most distros)
```

## After Capturing Screenshots

1. Save screenshots to this directory with exact filenames above
2. Verify all 5 screenshots are captured
3. Update `docs/localstack-desktop-setup.md` if screenshot references need adjustment
4. Commit screenshots with story completion

---

**Status:** Awaiting screenshots
**Story:** 4.3 - LocalStack Desktop Setup
