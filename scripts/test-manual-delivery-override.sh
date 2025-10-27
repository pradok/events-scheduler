#!/bin/bash

##############################################################################
# Manual E2E Test Script for EVENT_DELIVERY_OVERRIDE
#
# Story 4.5: Configurable Delivery Time Override for Manual Testing
#
# This script demonstrates fast manual testing using EVENT_DELIVERY_OVERRIDE.
# It creates a test user and schedules a birthday event to trigger in 5 minutes.
#
# Usage:
#   ./scripts/test-manual-delivery-override.sh [offset_minutes]
#
# Examples:
#   ./scripts/test-manual-delivery-override.sh     # Defaults to +5 minutes
#   ./scripts/test-manual-delivery-override.sh 10  # Use +10 minutes
#
# Prerequisites:
#   - Docker services running (npm run docker:start)
#   - Database migrated (npm run prisma:migrate)
#   - API server running (npm run dev)
##############################################################################

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
OFFSET_MINUTES=${1:-5}  # Default to 5 minutes if not provided
API_BASE_URL=${API_BASE_URL:-http://localhost:3000}

echo ""
echo -e "${BLUE}===========================================${NC}"
echo -e "${BLUE}  EVENT_DELIVERY_OVERRIDE Manual Test${NC}"
echo -e "${BLUE}===========================================${NC}"
echo ""

# Validate offset
if ! [[ "$OFFSET_MINUTES" =~ ^[0-9]+$ ]] || [ "$OFFSET_MINUTES" -lt 1 ] || [ "$OFFSET_MINUTES" -gt 1440 ]; then
  echo -e "${RED}Error: Offset must be between 1 and 1440 minutes${NC}"
  exit 1
fi

# Check if API server is running
if ! curl -s -f "$API_BASE_URL/health" > /dev/null 2>&1; then
  echo -e "${RED}Error: API server not responding at $API_BASE_URL${NC}"
  echo -e "${YELLOW}Start the server with: npm run dev${NC}"
  exit 1
fi

echo -e "${GREEN}✓ API server is running${NC}"
echo ""

# Generate test data
TEST_USER_FIRST_NAME="Test"
TEST_USER_LAST_NAME="User-$(date +%s)"
TEST_USER_DOB="1990-01-15"
TEST_USER_TIMEZONE="America/New_York"

# Calculate trigger time
TRIGGER_TIME=$(date -u -v +${OFFSET_MINUTES}M "+%Y-%m-%d %H:%M:%S UTC" 2>/dev/null || date -u -d "+${OFFSET_MINUTES} minutes" "+%Y-%m-%d %H:%M:%S UTC" 2>/dev/null)

echo -e "${BLUE}Configuration:${NC}"
echo "  Offset: ${OFFSET_MINUTES} minutes from now"
echo "  Expected Trigger Time: ${TRIGGER_TIME}"
echo ""

# Set environment variable for server (if not already set)
if [ -z "$FAST_TEST_DELIVERY_OFFSET" ]; then
  echo -e "${YELLOW}Note: Set FAST_TEST_DELIVERY_OFFSET=${OFFSET_MINUTES} in your server environment${NC}"
  echo -e "${YELLOW}Restart your server with: FAST_TEST_DELIVERY_OFFSET=${OFFSET_MINUTES} npm run dev${NC}"
  echo ""
  read -p "Press Enter when server is restarted with override, or Ctrl+C to cancel..."
  echo ""
fi

# Create test user
echo -e "${BLUE}Creating test user...${NC}"
CREATE_RESPONSE=$(curl -s -X POST "$API_BASE_URL/user" \
  -H "Content-Type: application/json" \
  -d "{
    \"firstName\": \"$TEST_USER_FIRST_NAME\",
    \"lastName\": \"$TEST_USER_LAST_NAME\",
    \"dateOfBirth\": \"$TEST_USER_DOB\",
    \"timezone\": \"$TEST_USER_TIMEZONE\"
  }")

# Extract user ID
USER_ID=$(echo "$CREATE_RESPONSE" | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -z "$USER_ID" ]; then
  echo -e "${RED}Error: Failed to create user${NC}"
  echo "Response: $CREATE_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ Test user created${NC}"
echo "  User ID: $USER_ID"
echo "  Name: $TEST_USER_FIRST_NAME $TEST_USER_LAST_NAME"
echo ""

# Display next steps
echo -e "${BLUE}===========================================${NC}"
echo -e "${GREEN}✓ Setup Complete!${NC}"
echo -e "${BLUE}===========================================${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo "1. Monitor the database for event execution:"
echo -e "   ${BLUE}npm run prisma:studio${NC}"
echo "   Look for event with userId: $USER_ID"
echo ""
echo "2. Check server logs for event processing"
echo "   Expected trigger time: ${TRIGGER_TIME}"
echo ""
echo "3. Expected Behavior:"
echo "   - Event created with targetTimestampUTC ≈ now + ${OFFSET_MINUTES} minutes"
echo "   - Scheduler will claim event when targetTimestampUTC is reached"
echo "   - Worker will execute event and mark as COMPLETED"
echo ""
echo -e "${YELLOW}Cleanup:${NC}"
echo "   Delete user: curl -X DELETE $API_BASE_URL/user/$USER_ID"
echo ""
