#!/usr/bin/env node

/**
 * Mock Webhook Server for Local Development
 *
 * This simple HTTP server simulates an external webhook endpoint for testing
 * the WebhookAdapter without requiring internet connectivity or external services.
 *
 * **Usage:**
 * ```bash
 * npm run webhook:mock
 * # Server runs on http://localhost:3001
 * ```
 *
 * **Features:**
 * - Logs all incoming requests with full headers and body
 * - Displays X-Idempotency-Key header for verifying idempotent behavior
 * - Returns configurable HTTP status codes (200, 500, 400, etc.) via query parameter
 * - Supports testing retry logic by returning errors
 *
 * **Test Retry Logic:**
 * ```bash
 * # Return 503 to trigger retry
 * curl -X POST http://localhost:3001?status=503 \
 *   -H "Content-Type: application/json" \
 *   -H "X-Idempotency-Key: test-key-123" \
 *   -d '{"message": "Test message"}'
 * ```
 *
 * **Test Idempotency:**
 * - Send multiple requests with the same X-Idempotency-Key
 * - Observe logs to identify duplicate requests
 *
 * @see WebhookAdapter for the client implementation
 * @see Story 2.4 Acceptance Criteria #7, #9
 */

const http = require('http');
const url = require('url');

const PORT = process.env.WEBHOOK_MOCK_PORT || 3001;

const server = http.createServer((req, res) => {
  const startTime = Date.now();
  let body = '';

  // Parse query parameters to allow status code customization
  const parsedUrl = url.parse(req.url, true);
  const statusCode = parseInt(parsedUrl.query.status, 10) || 200;

  // Collect request body
  req.on('data', (chunk) => {
    body += chunk.toString();
  });

  req.on('end', () => {
    const duration = Date.now() - startTime;

    // Log request details
    console.log('\n' + '='.repeat(80));
    console.log('📥 Webhook Request Received');
    console.log('='.repeat(80));
    console.log(`Timestamp:        ${new Date().toISOString()}`);
    console.log(`Method:           ${req.method}`);
    console.log(`URL:              ${req.url}`);
    console.log(`Status Override:  ${statusCode}`);
    console.log(`Duration:         ${duration}ms`);
    console.log('\nHeaders:');
    console.log(JSON.stringify(req.headers, null, 2));
    console.log('\n🔑 Idempotency Key:');
    console.log(req.headers['x-idempotency-key'] || '(not provided)');
    console.log('\nBody:');
    console.log(body || '(empty)');

    // Parse and pretty-print JSON body if valid
    try {
      const jsonBody = JSON.parse(body);
      console.log('\nParsed JSON:');
      console.log(JSON.stringify(jsonBody, null, 2));
    } catch (error) {
      // Not JSON or invalid JSON
    }

    console.log('='.repeat(80) + '\n');

    // Send response
    const responseBody = {
      success: statusCode >= 200 && statusCode < 300,
      timestamp: new Date().toISOString(),
      message: `Mock webhook response with status ${statusCode}`,
      receivedIdempotencyKey: req.headers['x-idempotency-key'],
    };

    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
    });
    res.end(JSON.stringify(responseBody, null, 2));
  });
});

server.listen(PORT, () => {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 Mock Webhook Server Started');
  console.log('='.repeat(80));
  console.log(`Listening on:     http://localhost:${PORT}`);
  console.log(`Environment:      ${process.env.NODE_ENV || 'development'}`);
  console.log('\n💡 Usage:');
  console.log('   Test webhook:        curl -X POST http://localhost:3001 \\');
  console.log('                          -H "Content-Type: application/json" \\');
  console.log('                          -H "X-Idempotency-Key: test-123" \\');
  console.log('                          -d \'{"message": "Test"}\'');
  console.log('\n   Simulate 503 error:  curl -X POST http://localhost:3001?status=503 \\');
  console.log('                          -H "Content-Type: application/json" \\');
  console.log('                          -d \'{"message": "Test"}\'');
  console.log('\n   Simulate 400 error:  curl -X POST http://localhost:3001?status=400 \\');
  console.log('                          -H "Content-Type: application/json" \\');
  console.log('                          -d \'{"message": "Test"}\'');
  console.log('\n📝 Press Ctrl+C to stop the server');
  console.log('='.repeat(80) + '\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down mock webhook server...');
  server.close(() => {
    console.log('✅ Server stopped gracefully\n');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Shutting down mock webhook server...');
  server.close(() => {
    console.log('✅ Server stopped gracefully\n');
    process.exit(0);
  });
});
