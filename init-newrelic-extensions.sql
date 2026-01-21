-- Initialize New Relic monitoring extensions
-- This script runs automatically on first container startup

-- Create pg_stat_statements extension
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Create pg_wait_sampling extension
CREATE EXTENSION IF NOT EXISTS pg_wait_sampling;

-- Create pg_stat_monitor extension
CREATE EXTENSION IF NOT EXISTS pg_stat_monitor;

-- Verify extensions are installed
SELECT extname, extversion FROM pg_extension WHERE extname IN ('pg_stat_statements', 'pg_wait_sampling', 'pg_stat_monitor');
