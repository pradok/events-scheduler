#!/usr/bin/env node

/**
 * Create Test User with Today's Birthday for Fast E2E Testing
 *
 * This script automates the complete fast E2E testing workflow:
 *   1. Kills any existing dev server on port 3000
 *   2. Starts dev server with EVENT_DELIVERY_TIMES_OVERRIDE set to 10s from now
 *   3. Waits for server to be ready
 *   4. Creates user with birthday = TODAY (in UTC)
 *   5. Event triggers in ~10-70 seconds (10s offset + scheduler interval)
 *
 * Usage:
 *   node scripts/create-test-user-today.js [OFFSET_SECONDS]
 *
 * Examples:
 *   node scripts/create-test-user-today.js     # Default 10 seconds
 *   node scripts/create-test-user-today.js 15  # 15 seconds offset
 *
 * Prerequisites:
 *   - E2E environment running: npm run e2e:setup
 *
 * How it works:
 *   - Restarts dev server with EVENT_DELIVERY_TIMES_OVERRIDE
 *   - Creates user with birthday = TODAY (in UTC)
 *   - Timezone = UTC (required for override to work correctly)
 *   - POST request triggers UserCreated event
 *   - Birthday event handler schedules event for target time
 *   - Scheduler Lambda picks it up and sends to SQS
 *   - Worker Lambda executes and delivers webhook
 */

const { spawn, exec } = require('child_process');
const http = require('http');

// ANSI color codes
const COLORS = {
  GREEN: '\x1b[32m',
  BLUE: '\x1b[34m',
  YELLOW: '\x1b[33m',
  CYAN: '\x1b[36m',
  RED: '\x1b[31m',
  RESET: '\x1b[0m',
};

// Configuration
const OFFSET_SECONDS = parseInt(process.argv[2]) || 10;
const API_PORT = 3000;
const API_HOST = 'localhost';
const HEALTH_CHECK_INTERVAL = 500; // ms
const HEALTH_CHECK_MAX_ATTEMPTS = 40; // 20 seconds total

/**
 * Calculate target time in UTC (HH:MM:SS format)
 */
function calculateTargetTime(offsetSeconds) {
  const now = new Date();
  const targetTime = new Date(now.getTime() + offsetSeconds * 1000);
  return targetTime.toISOString().substring(11, 19); // HH:MM:SS
}

/**
 * Kill any process listening on the specified port
 */
async function killProcessOnPort(port) {
  return new Promise((resolve) => {
    exec(`lsof -ti:${port}`, (error, stdout) => {
      if (error || !stdout.trim()) {
        // No process running on port
        resolve(false);
        return;
      }

      const pids = stdout.trim().split('\n');
      console.log(`${COLORS.YELLOW}⚠️  Found ${pids.length} process(es) on port ${port}${COLORS.RESET}`);
      console.log(`${COLORS.YELLOW}   Killing PIDs: ${pids.join(', ')}${COLORS.RESET}`);
      console.log('');

      exec(`kill -9 ${pids.join(' ')}`, (killError) => {
        if (killError) {
          console.error(`${COLORS.RED}Error killing processes: ${killError.message}${COLORS.RESET}`);
          resolve(false);
        } else {
          console.log(`${COLORS.GREEN}✓ Killed existing server${COLORS.RESET}`);
          console.log('');
          // Wait a bit for port to be released
          setTimeout(() => resolve(true), 1000);
        }
      });
    });
  });
}

/**
 * Start dev server with EVENT_DELIVERY_TIMES_OVERRIDE
 */
function startDevServer(targetTime) {
  console.log(`${COLORS.CYAN}Starting dev server with override...${COLORS.RESET}`);
  console.log(`  EVENT_DELIVERY_TIMES_OVERRIDE=${targetTime}`);
  console.log('');

  const devProcess = spawn('npm', ['run', 'dev'], {
    env: {
      ...process.env,
      EVENT_DELIVERY_TIMES_OVERRIDE: targetTime,
    },
    stdio: 'pipe', // Capture output
  });

  // Log server output with prefix
  devProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => {
      console.log(`${COLORS.BLUE}[SERVER]${COLORS.RESET} ${line}`);
    });
  });

  devProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => {
      console.log(`${COLORS.BLUE}[SERVER]${COLORS.RESET} ${line}`);
    });
  });

  devProcess.on('error', (error) => {
    console.error(`${COLORS.RED}Error starting server: ${error.message}${COLORS.RESET}`);
  });

  return devProcess;
}

/**
 * Check if server is healthy by hitting health endpoint
 */
async function checkServerHealth() {
  return new Promise((resolve) => {
    const req = http.get(`http://${API_HOST}:${API_PORT}/health`, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => {
      resolve(false);
    });

    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Wait for server to be ready
 */
async function waitForServer(maxAttempts = HEALTH_CHECK_MAX_ATTEMPTS) {
  console.log(`${COLORS.CYAN}Waiting for server to be ready...${COLORS.RESET}`);
  console.log('');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const isHealthy = await checkServerHealth();

    if (isHealthy) {
      console.log(`${COLORS.GREEN}✓ Server is ready (attempt ${attempt}/${maxAttempts})${COLORS.RESET}`);
      console.log('');
      return true;
    }

    // Show progress every 5 attempts
    if (attempt % 5 === 0) {
      console.log(`${COLORS.YELLOW}  Still waiting... (attempt ${attempt}/${maxAttempts})${COLORS.RESET}`);
    }

    await new Promise(resolve => setTimeout(resolve, HEALTH_CHECK_INTERVAL));
  }

  console.error(`${COLORS.RED}✗ Server failed to start after ${maxAttempts} attempts${COLORS.RESET}`);
  console.log('');
  return false;
}

async function createTestUser() {
  console.log('');
  console.log(`${COLORS.BLUE}==========================================${COLORS.RESET}`);
  console.log(`${COLORS.BLUE}  Create Test User for Fast E2E Testing${COLORS.RESET}`);
  console.log(`${COLORS.BLUE}==========================================${COLORS.RESET}`);
  console.log('');

  // Generate test user data
  const firstName = 'TestUser';
  const lastName = `E2E-${Date.now()}`;

  // CRITICAL: Birthday must be TODAY in UTC
  const today = new Date();
  const dateOfBirth = today.toISOString().split('T')[0]; // YYYY-MM-DD format

  // CRITICAL: Timezone must be UTC for EVENT_DELIVERY_TIMES_OVERRIDE to work
  const timezone = 'UTC';

  console.log(`${COLORS.CYAN}Creating user:${COLORS.RESET}`);
  console.log(`  Name:         ${firstName} ${lastName}`);
  console.log(`  Date of Birth: ${dateOfBirth} ${COLORS.YELLOW}(TODAY in UTC)${COLORS.RESET}`);
  console.log(`  Timezone:     ${timezone} ${COLORS.YELLOW}(Required for override)${COLORS.RESET}`);
  console.log('');

  // Prepare POST request
  const postData = JSON.stringify({
    firstName,
    lastName,
    dateOfBirth,
    timezone,
  });

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/user',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 201) {
          const user = JSON.parse(data);
          console.log(`${COLORS.GREEN}✓ User created successfully${COLORS.RESET}`);
          console.log('');
          console.log('User details:');
          console.log(`  ID:           ${user.id}`);
          console.log(`  Name:         ${user.firstName} ${user.lastName}`);
          console.log(`  Date of Birth: ${user.dateOfBirth}`);
          console.log(`  Timezone:     ${user.timezone}`);
          console.log('');

          console.log(`${COLORS.CYAN}UserCreated event published automatically!${COLORS.RESET}`);
          console.log(`${COLORS.CYAN}Birthday event handler will create event soon...${COLORS.RESET}`);
          console.log('');

          console.log(`${COLORS.BLUE}==========================================${COLORS.RESET}`);
          console.log(`${COLORS.GREEN}✅ Setup Complete!${COLORS.RESET}`);
          console.log(`${COLORS.BLUE}==========================================${COLORS.RESET}`);
          console.log('');
          console.log(`${COLORS.YELLOW}What happens next:${COLORS.RESET}`);
          console.log('');

          const targetTime = process.env.EVENT_DELIVERY_TIMES_OVERRIDE || 'default time';
          console.log(`1. Birthday event created in database`);
          console.log(`   - Status: PENDING`);
          console.log(`   - Target time: ${COLORS.YELLOW}${targetTime} UTC${COLORS.RESET}`);
          console.log('');
          console.log(`2. EventBridge triggers scheduler Lambda every 60 seconds`);
          console.log(`   - Scheduler queries for events where targetTimestampUTC <= NOW()`);
          console.log(`   - Finds your event when time arrives`);
          console.log('');
          console.log(`3. Scheduler sends message to SQS queue`);
          console.log(`   - Status changes: ${COLORS.YELLOW}PENDING → PROCESSING${COLORS.RESET}`);
          console.log('');
          console.log(`4. Worker Lambda consumes SQS message`);
          console.log(`   - Delivers webhook`);
          console.log(`   - Status changes: ${COLORS.YELLOW}PROCESSING → COMPLETED${COLORS.RESET}`);
          console.log('');

          console.log(`${COLORS.BLUE}==========================================${COLORS.RESET}`);
          console.log(`${COLORS.YELLOW}Monitoring:${COLORS.RESET}`);
          console.log(`${COLORS.BLUE}==========================================${COLORS.RESET}`);
          console.log('');
          console.log('1. Watch database (recommended):');
          console.log(`   ${COLORS.CYAN}npm run prisma:studio${COLORS.RESET}`);
          console.log(`   Navigate to 'events' table and refresh to see status changes`);
          console.log('');
          console.log('2. View scheduler Lambda logs:');
          console.log(`   ${COLORS.CYAN}docker exec bday-localstack sh -c "awslocal logs tail /aws/lambda/event-scheduler --follow"${COLORS.RESET}`);
          console.log('');
          console.log('3. View worker Lambda logs:');
          console.log(`   ${COLORS.CYAN}docker exec bday-localstack sh -c "awslocal logs tail /aws/lambda/event-worker --follow"${COLORS.RESET}`);
          console.log('');
          console.log('4. Check SQS queue:');
          console.log(`   ${COLORS.CYAN}docker exec bday-localstack sh -c "awslocal sqs receive-message --queue-url http://localhost:4566/000000000000/bday-events-queue"${COLORS.RESET}`);
          console.log('');

          console.log(`${COLORS.BLUE}==========================================${COLORS.RESET}`);
          console.log(`${COLORS.YELLOW}Cleanup:${COLORS.RESET}`);
          console.log(`${COLORS.BLUE}==========================================${COLORS.RESET}`);
          console.log('');
          console.log('Delete this test user (and associated events):');
          console.log(`  ${COLORS.CYAN}curl -X DELETE http://localhost:3000/user/${user.id}${COLORS.RESET}`);
          console.log('');

          resolve(user);
        } else {
          console.error(`${COLORS.RED}Error: Received status code ${res.statusCode}${COLORS.RESET}`);
          console.error('Response:', data);
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error(`${COLORS.RED}Error: Failed to connect to API server${COLORS.RESET}`);
      console.log('');
      console.log(`${COLORS.YELLOW}The server should have started automatically.${COLORS.RESET}`);
      console.log(`${COLORS.YELLOW}If you see server errors above, check:${COLORS.RESET}`);
      console.log('1. E2E environment is running:');
      console.log(`   ${COLORS.CYAN}npm run e2e:setup${COLORS.RESET}`);
      console.log('');
      console.log('2. Dependencies are installed:');
      console.log(`   ${COLORS.CYAN}npm install${COLORS.RESET}`);
      console.log('');
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Main execution
(async () => {
  let devProcess = null;

  try {
    console.log('');
    console.log(`${COLORS.BLUE}==========================================${COLORS.RESET}`);
    console.log(`${COLORS.BLUE}  Fast E2E Testing - Automated Setup${COLORS.RESET}`);
    console.log(`${COLORS.BLUE}==========================================${COLORS.RESET}`);
    console.log('');

    // Validate offset
    if (OFFSET_SECONDS < 5 || OFFSET_SECONDS > 300) {
      console.error(`${COLORS.RED}Error: Offset must be between 5 and 300 seconds${COLORS.RESET}`);
      process.exit(1);
    }

    // Calculate target time
    const targetTime = calculateTargetTime(OFFSET_SECONDS);
    const currentTime = new Date().toISOString().substring(11, 19);

    console.log(`${COLORS.CYAN}Configuration:${COLORS.RESET}`);
    console.log(`  Current time (UTC): ${currentTime}`);
    console.log(`  Offset: ${OFFSET_SECONDS} seconds`);
    console.log(`  Target time (UTC): ${targetTime}`);
    console.log('');

    // Step 1: Kill existing server
    await killProcessOnPort(API_PORT);

    // Step 2: Start dev server with override
    devProcess = startDevServer(targetTime);

    // Step 3: Wait for server to be ready
    const isReady = await waitForServer();
    if (!isReady) {
      console.error(`${COLORS.RED}Failed to start server${COLORS.RESET}`);
      if (devProcess) {
        devProcess.kill('SIGTERM');
      }
      process.exit(1);
    }

    // Step 4: Create user
    const user = await createTestUser();

    // Step 5: Display summary
    console.log(`${COLORS.CYAN}Server is running with override: ${targetTime}${COLORS.RESET}`);
    console.log(`${COLORS.CYAN}Event should trigger in ~${OFFSET_SECONDS}-${OFFSET_SECONDS + 60} seconds${COLORS.RESET}`);
    console.log('');
    console.log(`${COLORS.YELLOW}Press Ctrl+C to stop the server${COLORS.RESET}`);
    console.log('');

    // Handle graceful shutdown
    const cleanup = () => {
      console.log('');
      console.log(`${COLORS.YELLOW}Shutting down...${COLORS.RESET}`);
      if (devProcess) {
        devProcess.kill('SIGTERM');
      }
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

  } catch (error) {
    console.error(`${COLORS.RED}Error: ${error.message}${COLORS.RESET}`);
    if (devProcess) {
      devProcess.kill('SIGTERM');
    }
    process.exit(1);
  }
})();
