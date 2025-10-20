-- PostgreSQL Database Initialization Script
-- Time-Based Event Scheduling System
-- This script runs automatically on first container startup

-- Enable UUID extension for UUID generation
-- Required for primary keys in users and events tables
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Verify extension is installed
SELECT 'uuid-ossp extension installed successfully' AS status;

-- Test UUID generation
SELECT uuid_generate_v4() AS sample_uuid;

-- Note: Database schema will be created via Prisma migrations in Story 1.3
-- This initialization script only sets up required PostgreSQL extensions
