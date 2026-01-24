-- Actor URL Migration Redirect Monitoring Queries
-- Migration Date: January 24, 2026
-- Purpose: Track legacy tmdb_id → actor.id URL redirects
--
-- NOTE: These queries are for historical reference only. Actual redirect tracking
-- is done via NewRelic custom events (ActorUrlRedirect), not page_visits.
-- Browser follows 301 redirects automatically, so page_visits only sees final destination.
--
-- To query actual redirect data, use NewRelic NRQL:
--   SELECT count(*) FROM ActorUrlRedirect WHERE matchType = 'tmdb_id' SINCE 7 days ago
--   SELECT actorId, actorName, count(*) FROM ActorUrlRedirect FACET actorId, actorName SINCE 30 days ago LIMIT 20

-- ============================================================================
-- Quick Stats: Last 7 Days
-- ============================================================================

SELECT
  COUNT(*) as total_redirects,
  ROUND(COUNT(*)::numeric / 7, 1) as avg_per_day,
  MIN(visited_at)::date as period_start,
  MAX(visited_at)::date as period_end
FROM page_visits
WHERE visited_path ~ '/actor/[a-z0-9-]+-\d+/?$'
  AND is_internal_referral = true
  AND referrer_path ~ '/actor/[a-z0-9-]+-\d+/?$'
  AND referrer_path != visited_path
  -- Exclude same actor (e.g., /actor/X vs /actor/X/death)
  AND split_part(RTRIM(referrer_path, '/'), '-', -1) != split_part(RTRIM(visited_path, '/'), '-', -1)
  AND visited_at >= NOW() - INTERVAL '7 days';


-- ============================================================================
-- Daily Trend: Last 30 Days
-- ============================================================================

SELECT
  DATE(visited_at) as date,
  COUNT(*) as redirect_count,
  -- Show day of week to identify patterns
  TO_CHAR(visited_at, 'Dy') as day_of_week
FROM page_visits
WHERE visited_path ~ '/actor/[a-z0-9-]+-\d+/?$'
  AND is_internal_referral = true
  AND referrer_path ~ '/actor/[a-z0-9-]+-\d+/?$'
  AND referrer_path != visited_path
  AND split_part(RTRIM(referrer_path, '/'), '-', -1) != split_part(RTRIM(visited_path, '/'), '-', -1)
  AND visited_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(visited_at), TO_CHAR(visited_at, 'Dy')
ORDER BY date DESC;


-- ============================================================================
-- Weekly Summary: Last 12 Weeks
-- ============================================================================

SELECT
  DATE_TRUNC('week', visited_at)::date as week_start,
  COUNT(*) as redirect_count,
  ROUND(COUNT(*)::numeric / 7, 1) as avg_per_day
FROM page_visits
WHERE visited_path ~ '/actor/[a-z0-9-]+-\d+/?$'
  AND is_internal_referral = true
  AND referrer_path ~ '/actor/[a-z0-9-]+-\d+/?$'
  AND referrer_path != visited_path
  AND split_part(RTRIM(referrer_path, '/'), '-', -1) != split_part(RTRIM(visited_path, '/'), '-', -1)
  AND visited_at >= NOW() - INTERVAL '12 weeks'
GROUP BY DATE_TRUNC('week', visited_at)
ORDER BY week_start DESC;


-- ============================================================================
-- Most Redirected Actors: Top 20
-- ============================================================================
-- Find which actors are getting the most legacy URL traffic

WITH redirects AS (
  SELECT
    visited_path,
    COUNT(*) as redirect_count
  FROM page_visits
  WHERE visited_path ~ '/actor/[a-z0-9-]+-\d+/?$'
    AND is_internal_referral = true
    AND referrer_path ~ '/actor/[a-z0-9-]+-\d+/?$'
    AND referrer_path != visited_path
    AND split_part(RTRIM(referrer_path, '/'), '-', -1) != split_part(RTRIM(visited_path, '/'), '-', -1)
    AND visited_at >= NOW() - INTERVAL '30 days'
  GROUP BY visited_path
  ORDER BY redirect_count DESC
  LIMIT 20
)
SELECT
  visited_path,
  redirect_count,
  -- Extract actor ID from URL (strip trailing slash first to handle optional slash in regex)
  CAST(split_part(RTRIM(visited_path, '/'), '-', -1) as INTEGER) as actor_id
FROM redirects
ORDER BY redirect_count DESC;


-- ============================================================================
-- Cleanup Readiness Check
-- ============================================================================
-- Run this to see if it's safe to remove the tmdb_id fallback
-- Safe when: <10 redirects/day for 14+ consecutive days

WITH daily_counts AS (
  SELECT
    DATE(visited_at) as date,
    COUNT(*) as redirect_count
  FROM page_visits
  WHERE visited_path ~ '/actor/[a-z0-9-]+-\d+/?$'
    AND is_internal_referral = true
    AND referrer_path ~ '/actor/[a-z0-9-]+-\d+/?$'
    AND referrer_path != visited_path
    AND split_part(RTRIM(referrer_path, '/'), '-', -1) != split_part(RTRIM(visited_path, '/'), '-', -1)
    AND visited_at >= NOW() - INTERVAL '14 days'
  GROUP BY DATE(visited_at)
)
SELECT
  COUNT(*) as days_checked,
  MAX(redirect_count) as max_redirects_per_day,
  AVG(redirect_count)::numeric(10,2) as avg_redirects_per_day,
  CASE
    WHEN MAX(redirect_count) < 10 THEN '✅ SAFE to remove fallback'
    ELSE '⏳ Wait for lower traffic'
  END as recommendation
FROM daily_counts;


-- ============================================================================
-- All-Time Total Since Migration
-- ============================================================================
-- Total redirects since January 24, 2026

SELECT
  COUNT(*) as total_redirects_since_migration,
  MIN(visited_at)::date as first_redirect,
  MAX(visited_at)::date as latest_redirect,
  EXTRACT(day FROM MAX(visited_at) - MIN(visited_at)) as days_active
FROM page_visits
WHERE visited_path ~ '/actor/[a-z0-9-]+-\d+/?$'
  AND is_internal_referral = true
  AND referrer_path ~ '/actor/[a-z0-9-]+-\d+/?$'
  AND referrer_path != visited_path
  AND split_part(RTRIM(referrer_path, '/'), '-', -1) != split_part(RTRIM(visited_path, '/'), '-', -1)
  AND visited_at >= '2026-01-24'::date;
