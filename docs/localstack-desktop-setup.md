# LocalStack Desktop Setup Guide

**Complete guide for using LocalStack Desktop to manage and inspect your local AWS environment**

---

## Overview

**LocalStack Desktop** is a free desktop application that provides a graphical interface for managing LocalStack instances. It offers:

- 📊 **Resource Browser** - Visual interface for browsing AWS services (SQS, Lambda, EventBridge, etc.)
- 🐳 **Container Management** - Start, stop, and manage LocalStack containers
- 📝 **Real-time Logging** - View LocalStack logs and execution traces
- 💻 **CLI Integration** - Integrated terminal for running awslocal commands
- 🔍 **CloudWatch Logs** - View Lambda execution logs and application logs

**Best for:** Developers who prefer GUI tools over command-line interfaces.

---

## Why LocalStack Desktop?

### Benefits Over CLI-Only Workflow

| Feature | CLI Only | LocalStack Desktop |
|---------|----------|-------------------|
| Browse SQS queues | Multiple commands | Visual list with details |
| View CloudWatch logs | `awslocal logs tail` | Searchable log viewer |
| Check EventBridge rules | JSON output | Formatted table view |
| Container management | Docker commands | One-click start/stop |
| Resource inspection | Parse JSON manually | Formatted, human-readable |

### Desktop vs VSCode Extension

| Feature | LocalStack Desktop | VSCode Extension |
|---------|-------------------|------------------|
| **Standalone app** | ✅ Yes | ❌ VSCode only |
| **Container management** | ✅ Full control | ⚠️ Limited |
| **Resource browser** | ✅ Comprehensive | ✅ Good |
| **CloudWatch logs** | ✅ Real-time viewer | ✅ Integrated |
| **CLI integration** | ✅ Built-in terminal | ❌ Use VSCode terminal |
| **Works offline** | ✅ Yes | ✅ Yes |

**Decision:** Use Desktop for comprehensive management, VSCode extension as secondary option.

---

## Prerequisites

### Required

1. **LocalStack running in Docker** (Story 4.1 must be complete)
   ```bash
   npm run docker:start
   ```

2. **Docker Desktop** running and accessible

### System Requirements

- **macOS:** 10.14+ (Mojave or later)
- **Windows:** Windows 10/11 (64-bit)
- **Linux:** Ubuntu 20.04+, Debian 10+, Fedora 32+
- **RAM:** 4GB minimum (8GB recommended)
- **Disk Space:** 500MB for Desktop app

---

## Installation

### Step 1: Download LocalStack Desktop

1. Visit the official download page:
   ```
   https://app.localstack.cloud/download
   ```

2. Select your operating system:
   - **macOS:** Download `.dmg` file
   - **Windows:** Download `.exe` installer
   - **Linux:** Download `.AppImage` or `.deb` package

### Step 2: Install Application

#### macOS Installation

```bash
# 1. Open the downloaded .dmg file
open ~/Downloads/LocalStack-Desktop-*.dmg

# 2. Drag LocalStack Desktop to Applications folder

# 3. Launch from Applications
# First launch may show security warning
# Go to: System Preferences → Security & Privacy → Allow
```

#### Windows Installation

```powershell
# 1. Run the downloaded installer
.\LocalStack-Desktop-Setup-*.exe

# 2. Follow installation wizard
# - Accept license
# - Choose installation directory
# - Create desktop shortcut (optional)

# 3. Launch from Start Menu or Desktop
```

#### Linux Installation (Ubuntu/Debian)

```bash
# Option A: Using .deb package
sudo dpkg -i localstack-desktop_*.deb
sudo apt-get install -f  # Fix dependencies if needed

# Option B: Using AppImage
chmod +x LocalStack-Desktop-*.AppImage
./LocalStack-Desktop-*.AppImage

# Option C: Add to applications
mkdir -p ~/.local/bin
mv LocalStack-Desktop-*.AppImage ~/.local/bin/localstack-desktop
```

### Step 3: First Launch

1. Open LocalStack Desktop application
2. You may see a welcome screen or onboarding flow
3. Skip account creation (optional for free tier)
4. Proceed to main dashboard

---

## Configuration

### Connect to Docker Instance

LocalStack Desktop should **automatically detect** your Docker instance at `http://localhost:4566`. If not, follow these steps:

#### Automatic Detection (Preferred)

1. Ensure LocalStack is running:
   ```bash
   docker ps | grep bday-localstack
   ```

2. Open LocalStack Desktop

3. Desktop should show:
   - ✅ **Status:** Connected
   - ✅ **Endpoint:** http://localhost:4566
   - ✅ **Region:** us-east-1

#### Manual Configuration

If automatic detection fails:

1. Open **Settings** or **Preferences** (varies by OS):
   - **macOS:** `LocalStack Desktop → Preferences` or `Cmd+,`
   - **Windows:** `File → Settings` or `Ctrl+,`
   - **Linux:** `Edit → Preferences` or `Ctrl+,`

2. Navigate to **Connection** or **Endpoint** section

3. Enter connection details:
   ```
   Endpoint URL: http://localhost:4566
   Region: us-east-1
   Access Key ID: test
   Secret Access Key: test
   ```

4. Click **Save** or **Connect**

5. Verify status changes to **Connected**

### Connection Settings Explained

| Setting | Value | Why? |
|---------|-------|------|
| **Endpoint URL** | `http://localhost:4566` | LocalStack's default port |
| **Region** | `us-east-1` | Our configured AWS region |
| **Access Key** | `test` | Dummy credentials for local dev |
| **Secret Key** | `test` | Dummy credentials for local dev |

**Note:** LocalStack ignores AWS credentials in local mode. Any value works, but `test/test` is convention.

---

## Using LocalStack Desktop

### Resource Browser

The Resource Browser is the primary interface for inspecting AWS resources.

#### Navigate to SQS Queues

1. In left sidebar, click **SQS** or search for "SQS"
2. You should see two queues:
   - `bday-events-queue` (Main event processing queue)
   - `bday-events-dlq` (Dead letter queue for failed events)

3. Click on `bday-events-queue` to view details:
   - **Queue URL:** `http://localhost:4566/000000000000/bday-events-queue`
   - **Messages Available:** 0 (until events are processed)
   - **Redrive Policy:** Points to `bday-events-dlq`

4. Explore queue actions:
   - **Send Message** - Send test message
   - **Receive Messages** - Poll for messages
   - **Purge Queue** - Delete all messages

#### Navigate to EventBridge Rules

1. In left sidebar, click **EventBridge** or **Events**
2. Select **Rules** tab
3. You should see:
   - **Rule Name:** `event-scheduler-rule`
   - **State:** ENABLED
   - **Schedule:** `rate(1 minute)`
   - **Target:** (Will be added in Story 4.4)

4. Click on rule to view:
   - Full rule configuration
   - Event pattern (if any)
   - Target Lambda function (after Story 4.4)

#### Navigate to IAM Roles

1. In left sidebar, click **IAM**
2. Select **Roles** tab
3. You should see:
   - **Role Name:** `lambda-execution-role`
   - **Trust Entity:** Lambda service
   - **Attached Policies:** AWSLambdaBasicExecutionRole, AmazonSQSFullAccess

#### Navigate to CloudWatch Logs

1. In left sidebar, click **CloudWatch** → **Logs**
2. You should see:
   - No log groups yet (will appear after Story 4.4)

3. After Lambda deployment (Story 4.4), log groups will appear:
   - `/aws/lambda/event-scheduler`
   - `/aws/lambda/event-worker`

#### Navigate to Lambda Functions

1. In left sidebar, click **Lambda**
2. Currently: No functions (until Story 4.4)
3. After Story 4.4, you'll see:
   - `event-scheduler` (Triggered by EventBridge)
   - `event-worker` (Triggered by SQS)

---

### Container Management

LocalStack Desktop can manage your LocalStack Docker container directly.

#### View Container Status

1. Look for **Container** panel or **Status** section
2. Should show:
   - **Container Name:** `bday-localstack`
   - **Status:** Running
   - **Image:** `localstack/localstack:3.1.0`
   - **Ports:** `4566:4566`

#### Stop Container

1. Click **Stop Container** button
2. Wait for status to change to **Stopped**
3. Resource Browser will show "Disconnected" state

**Verify via CLI:**
```bash
docker ps | grep bday-localstack
# Should show nothing (container stopped)
```

#### Start Container

1. Click **Start Container** button
2. Wait for status to change to **Running**
3. Resource Browser will reconnect automatically

**Verify via CLI:**
```bash
docker ps | grep bday-localstack
# Should show container running
```

#### View Container Logs

1. Click **View Logs** or **Logs** tab
2. Real-time logs will appear:
   ```
   2025-10-27 12:00:00,123 INFO     localstack.boot.main Starting LocalStack
   2025-10-27 12:00:01,456 INFO     localstack.boot.main Initializing services: lambda,sqs,events,logs,iam
   2025-10-27 12:00:05,789 INFO     localstack.services Ready.
   ```

3. Use search/filter to find specific log entries
4. Logs update in real-time as events occur

---

### CLI Integration

LocalStack Desktop may include an integrated terminal for running awslocal commands.

#### Open Integrated Terminal

1. Look for **Terminal** or **CLI** panel (location varies by version)
2. If available, click to open terminal
3. Terminal opens with `awslocal` CLI pre-configured

#### Example Commands

```bash
# List SQS queues
awslocal sqs list-queues

# Describe EventBridge rule
awslocal events describe-rule --name event-scheduler-rule

# List IAM roles
awslocal iam list-roles

# List Lambda functions (after Story 4.4)
awslocal lambda list-functions

# View CloudWatch log groups (after Story 4.4)
awslocal logs describe-log-groups
```

#### If Integrated Terminal Not Available

Use your system terminal with `docker exec`:

```bash
# Run commands inside LocalStack container
docker exec bday-localstack sh -c "awslocal sqs list-queues"
docker exec bday-localstack sh -c "awslocal events describe-rule --name event-scheduler-rule"
```

---

## Workflows

### Daily Development Workflow

**Morning startup:**
1. Open Docker Desktop (if not already running)
2. Start LocalStack:
   ```bash
   npm run docker:start
   ```
3. Open LocalStack Desktop
4. Verify connection status: **Connected**
5. Check Resource Browser for expected resources

**During development:**
- Use Desktop to monitor SQS messages
- View Lambda logs in real-time
- Inspect EventBridge rule status
- Send test messages to queues

**End of day:**
- Leave containers running (optional)
- Or stop via Desktop or CLI:
  ```bash
  npm run docker:stop
  ```

### Debugging Lambda Execution

**After Story 4.4 (Lambda deployment):**

1. Open LocalStack Desktop
2. Navigate to **Lambda** → `event-scheduler`
3. Click **Invoke** or **Test**
4. View execution result
5. Navigate to **CloudWatch Logs** → `/aws/lambda/event-scheduler`
6. View detailed execution logs
7. Search for errors or specific log messages

### Monitoring Event Processing

1. Create a user via API (or Prisma Studio)
2. In Desktop, navigate to **SQS** → `bday-events-queue`
3. Wait for scheduler to claim event (1 minute interval)
4. Refresh queue → message should disappear
5. Navigate to **CloudWatch Logs** → `/aws/lambda/event-worker`
6. View execution logs showing webhook delivery

---

## Troubleshooting

### Desktop Can't Connect

**Symptom:** Desktop shows "Disconnected" or "Unable to connect"

**Solutions:**

1. **Check LocalStack is running:**
   ```bash
   docker ps | grep bday-localstack
   ```
   If not running: `npm run docker:start`

2. **Check health endpoint:**
   ```bash
   curl http://localhost:4566/_localstack/health
   ```
   Should return JSON with service statuses.

3. **Verify endpoint URL:**
   - Must be `http://localhost:4566` (not https)
   - No trailing slash
   - Port must be 4566

4. **Restart Desktop application:**
   - Quit Desktop completely
   - Relaunch application
   - Connection may re-establish automatically

5. **Check firewall:**
   - Ensure port 4566 is not blocked
   - Allow Docker and LocalStack Desktop in firewall settings

### Resources Not Showing

**Symptom:** Resource Browser shows empty lists

**Solutions:**

1. **Verify resources exist:**
   ```bash
   npm run docker:verify
   ```
   Should show all resources created.

2. **Check init script ran:**
   ```bash
   npm run docker:logs | grep "LocalStack initialization complete"
   ```

3. **Refresh Desktop:**
   - Click refresh icon in Resource Browser
   - Or close/reopen Desktop

4. **Reconnect Desktop:**
   - Disconnect from endpoint
   - Reconnect to `http://localhost:4566`

### Container Management Not Working

**Symptom:** Start/Stop buttons don't work

**Solutions:**

1. **Check Docker Desktop is running:**
   - Open Docker Desktop application
   - Verify Docker engine is running

2. **Grant Docker socket access:**
   - Desktop needs access to Docker daemon
   - Check Desktop permissions in system settings

3. **Use CLI as fallback:**
   ```bash
   docker stop bday-localstack
   docker start bday-localstack
   ```

### Logs Not Appearing

**Symptom:** Logs panel is empty

**Solutions:**

1. **Check container is running:**
   ```bash
   docker ps | grep bday-localstack
   ```

2. **View logs via CLI:**
   ```bash
   npm run docker:logs
   ```

3. **Check log level:**
   - Desktop may filter logs by level
   - Set level to DEBUG to see all logs

4. **Restart container:**
   - Stop container via Desktop or CLI
   - Start container
   - Logs should begin appearing

---

## Best Practices

### When to Use Desktop vs CLI

**Use Desktop for:**
- ✅ Exploring resources visually
- ✅ Debugging Lambda executions
- ✅ Monitoring SQS message flow
- ✅ Viewing CloudWatch logs in real-time
- ✅ Managing container lifecycle

**Use CLI for:**
- ✅ Automation scripts
- ✅ CI/CD pipelines
- ✅ Quick one-off commands
- ✅ Scripted testing workflows

### Resource Browser Tips

1. **Use search** - Most views have search/filter
2. **Refresh regularly** - Resources update on refresh
3. **Bookmark common resources** - Save frequently accessed resources
4. **Use details panel** - Click resource for full details

### Container Management Tips

1. **Leave running during active development** - Faster than stopping/starting
2. **Stop when switching projects** - Free up system resources
3. **Use `docker:reset` for clean slate** - Nuclear option when things break
4. **Monitor Docker Desktop resources** - Watch CPU/memory usage

---

## Keyboard Shortcuts

| Shortcut | Action | Platform |
|----------|--------|----------|
| `Cmd/Ctrl + R` | Refresh current view | All |
| `Cmd/Ctrl + ,` | Open preferences | All |
| `Cmd/Ctrl + K` | Open search | All |
| `Cmd/Ctrl + T` | Open terminal (if available) | All |
| `Cmd/Ctrl + W` | Close current tab | All |
| `Cmd/Ctrl + Q` | Quit application | All |

*(Shortcuts may vary by Desktop version)*

---

## Next Steps

After LocalStack Desktop setup:

1. **Deploy Lambdas** (Story 4.4)
   ```bash
   npm run lambda:all
   ```
   Then view in Desktop: Lambda → Functions

2. **Run E2E Tests** (Story 4.6)
   ```bash
   npm run test:e2e
   ```
   Monitor in Desktop: SQS messages, Lambda logs

3. **Manual Testing** (Story 4.5)
   - Follow manual testing guide
   - Use Desktop to inspect state at each step

---

## References

- **LocalStack Desktop:** https://app.localstack.cloud/download
- **LocalStack Docs:** https://docs.localstack.cloud/user-guide/tools/localstack-desktop/
- **Story 4.1:** LocalStack Setup (Community Edition)
- **Story 4.4:** Lambda Deployment to LocalStack
- **Docker Compose:** `docker/docker-compose.yml`

---

## Screenshots

### Main Dashboard
*(Screenshot placeholder: Main dashboard showing connection status and container info)*

Location: `docs/images/localstack-desktop/01-main-dashboard.png`

### SQS Resource Browser
*(Screenshot placeholder: SQS queues view showing bday-events-queue and bday-events-dlq)*

Location: `docs/images/localstack-desktop/02-sqs-queues.png`

### EventBridge Rules
*(Screenshot placeholder: EventBridge rules view showing event-scheduler-rule)*

Location: `docs/images/localstack-desktop/03-eventbridge-rules.png`

### Container Management
*(Screenshot placeholder: Container management panel showing start/stop controls)*

Location: `docs/images/localstack-desktop/04-container-management.png`

### CloudWatch Logs
*(Screenshot placeholder: CloudWatch Logs viewer showing Lambda execution logs)*

Location: `docs/images/localstack-desktop/05-cloudwatch-logs.png`

---

**Last Updated:** 2025-10-27
**Story:** 4.3 - LocalStack Desktop Setup
**Status:** Complete ✅
