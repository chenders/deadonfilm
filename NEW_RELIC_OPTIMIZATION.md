# New Relic Account Cleanup & Optimization - Implementation Summary

**Date**: January 20, 2026
**Account ID**: 7418892
**Project**: Dead on Film

## Overview

Completed comprehensive optimization of New Relic instrumentation for the Dead on Film application, including Redis monitoring, CLI script instrumentation, PostgreSQL monitoring, and enhanced observability.

---

## Phase 1: Account Audit (✅ Completed)

### Current Active Entities

**APM Application**:
- "Dead on Film" (Node.js Express backend)
- 31,542 transactions in last 7 days
- Actively reporting performance metrics

**Synthetic Monitors** (2):
- Dead on Film - Homepage Availability (every 5 min, 2 locations)
- Dead on Film - API Health Check (every 1 min, 1 location)

**Dashboards** (3 quickstart templates):
- Docker dashboard
- Logs Analysis
- Node.js

**Custom Events** (25+ types):
- ActorView, MovieView, ShowView, DeathDetailsView
- CauseOfDeathLookup, ClaudeAPICall, ClaudeCleanedData
- CliScriptRun (now expanded with 13 scripts)
- Search, PageView, and more

### Cleanup Results

**No stale entities found** - All dashboards and monitors are recent and actively used.

---

## Phase 2: Enhanced Instrumentation (✅ Completed)

### 2.1 Redis Operations Monitoring

**New Files Created**:
- `server/src/lib/redis-instrumentation.ts` - Instrumented Redis wrapper
- `server/src/lib/redis-instrumentation.test.ts` - Test suite (15 tests passing)

**Files Modified**:
- `server/src/lib/cache.ts` - Updated to use instrumented Redis operations

**Features**:
- Tracks Redis operation latency (get, set, del, scan, ping)
- Monitors cache hit/miss rates per key prefix
- Records operation success/failure
- Custom `RedisOperation` events with metrics:
  - `operation` (get, set, del, scan, ping)
  - `keyPrefix` (first segment for cardinality control)
  - `hit` (true/false for GET operations)
  - `durationMs` (operation latency)
  - `success` (true/false)
  - `ttl` (for SET operations)
  - `error` (error message if failed)

**NRQL Queries for Redis Monitoring**:

```nrql
-- Redis Hit Rate
SELECT percentage(count(*), WHERE hit IS true) FROM RedisOperation WHERE operation = 'get' TIMESERIES

-- Redis Operation Latency (p50, p95, p99)
SELECT percentile(durationMs, 50, 95, 99) FROM RedisOperation FACET operation TIMESERIES

-- Cache Operations by Key Prefix
SELECT count(*) FROM RedisOperation FACET keyPrefix TIMESERIES

-- Redis Errors
SELECT count(*) FROM RedisOperation WHERE success IS false FACET error TIMESERIES
```

### 2.2 CLI Script Instrumentation

**Scripts Instrumented** (13 total):

Previously instrumented (3):
1. `seed-movies.ts`
2. `sync-tmdb-changes.ts`
3. `sitemap-generate.ts`

Newly instrumented (10):
4. `backfill-actor-obscure.ts`
5. `backfill-mortality-stats.ts`
6. `backfill-episodes-fallback.ts`
7. `backfill-external-ids.ts`
8. `verify-death-info.ts`
9. `verify-shows.ts`
10. `fix-death-details.ts`
11. `backfill-omdb-ratings.ts`
12. `backfill-trakt-ratings.ts`
13. `backfill-thetvdb-scores.ts`

**Implementation Pattern**:
- Import `withNewRelicTransaction` from `newrelic-cli.js`
- Wrap main logic in transaction
- Record custom metrics:
  - `recordsProcessed` - Total records processed
  - `recordsUpdated` - Records successfully updated
  - `recordsCreated` - New records created
  - `errorsEncountered` - Failed operations
  - Script-specific metrics (e.g., `episodesSaved`, `actorsSaved`, `causesUpdated`)

**Features**:
- Automatic `CliScriptRun` events for all scripts
- Full transaction traces with database queries
- Error tracking with stack traces
- Graceful handling of --dry-run modes (skips instrumentation)

**NRQL Queries for CLI Scripts**:

```nrql
-- Script Execution Times
SELECT average(durationMs) FROM CliScriptRun FACET scriptName TIMESERIES

-- Script Success Rate
SELECT percentage(count(*), WHERE success IS true) FROM CliScriptRun FACET scriptName TIMESERIES

-- Records Processed Per Run
SELECT sum(recordsProcessed) FROM CliScriptRun FACET scriptName TIMESERIES

-- Failed Script Runs
SELECT count(*) FROM CliScriptRun WHERE success IS false FACET scriptName, errorMessage SINCE 7 days ago

-- Last Run Time
SELECT latest(timestamp) FROM CliScriptRun FACET scriptName
```

### 2.3 PostgreSQL Monitoring

**New Files Created**:
- `newrelic-postgres-config.yml` - PostgreSQL integration configuration

**Files Modified**:
- `newrelic-infra.dockerfile` - Installed nri-postgresql integration
- `docker-compose.yml` - Added PostgreSQL config mount and environment variables

**Features**:
- Monitors PostgreSQL database metrics:
  - Connection count
  - Commits/rollbacks per second
  - Database lock metrics
  - Query performance
- 15-second collection interval
- SSL disabled for local Docker connections
- Automatic discovery via Docker networking

**PostgreSQL Metrics Available**:
- `db.connections` - Active connections
- `db.commitsPerSecond` - Transaction commit rate
- `db.rollbacksPerSecond` - Transaction rollback rate
- Lock metrics and bloat metrics

---

## Phase 3: Infrastructure Improvements

### Docker Compose Updates

**New Relic Infrastructure Agent**:
- Added PostgreSQL integration
- Mounted configuration file for PostgreSQL monitoring
- Added depends_on for database health check
- Environment variables for PostgreSQL credentials

**Configuration**:
```yaml
agent:
  volumes:
    - "./newrelic-postgres-config.yml:/etc/newrelic-infra/integrations.d/postgresql-config.yml:ro"
  environment:
    - POSTGRES_USER=${POSTGRES_USER:-deadonfilm}
    - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    - POSTGRES_DB=${POSTGRES_DB:-deadonfilm}
  depends_on:
    db:
      condition: service_healthy
```

---

## Phase 4: Recommended Dashboards (To Be Created)

### Dashboard 1: Application Overview

```nrql
-- Response Time (p50, p95, p99)
SELECT percentile(duration, 50, 95, 99) FROM Transaction WHERE appName = 'Dead on Film' TIMESERIES

-- Throughput
SELECT rate(count(*), 1 minute) FROM Transaction WHERE appName = 'Dead on Film' TIMESERIES

-- Error Rate
SELECT percentage(count(*), WHERE error IS true) FROM Transaction WHERE appName = 'Dead on Film' TIMESERIES

-- Top 10 Slowest Transactions
SELECT average(duration) FROM Transaction WHERE appName = 'Dead on Film' FACET name LIMIT 10
```

### Dashboard 2: Cache Performance

```nrql
-- Redis Hit Rate
SELECT percentage(count(*), WHERE hit IS true) FROM RedisOperation WHERE operation = 'get' TIMESERIES

-- Redis Operation Latency
SELECT percentile(durationMs, 50, 95, 99) FROM RedisOperation FACET operation TIMESERIES

-- Cache Operations by Type
SELECT count(*) FROM RedisOperation FACET operation TIMESERIES

-- Most Cached Keys
SELECT count(*) FROM RedisOperation FACET keyPrefix LIMIT 20
```

### Dashboard 3: Background Jobs

```nrql
-- Script Execution Times
SELECT average(durationMs) FROM CliScriptRun FACET scriptName TIMESERIES

-- Script Success Rate
SELECT percentage(count(*), WHERE success IS true) FROM CliScriptRun FACET scriptName TIMESERIES

-- Records Processed Per Run
SELECT sum(recordsProcessed) FROM CliScriptRun FACET scriptName TIMESERIES

-- Last Run Time
SELECT latest(timestamp) FROM CliScriptRun FACET scriptName
```

### Dashboard 4: Database Performance

```nrql
-- PostgreSQL Connections
SELECT latest(db.connections) FROM PostgreSqlDatabaseSample TIMESERIES

-- Transaction Rate
SELECT rate(sum(db.commitsPerSecond), 1 minute) FROM PostgreSqlDatabaseSample TIMESERIES

-- Rollback Rate
SELECT rate(sum(db.rollbacksPerSecond), 1 minute) FROM PostgreSqlDatabaseSample TIMESERIES

-- Slowest Queries
SELECT average(databaseDuration) FROM Transaction FACET databaseCallStatement LIMIT 20
```

### Dashboard 5: User Activity

```nrql
-- Page Views by Route
SELECT count(*) FROM PageView FACET path SINCE 7 days ago LIMIT 20

-- Most Viewed Movies
SELECT count(*) FROM MovieView FACET movieTitle SINCE 7 days ago LIMIT 20

-- Search Analytics
SELECT count(*) FROM Search FACET query SINCE 7 days ago LIMIT 20

-- User Sessions
SELECT uniqueCount(session) FROM PageView TIMESERIES
```

---

## Phase 5: Recommended Alert Policies

### Critical Alerts

**Application Down**:
```nrql
SELECT count(*) FROM Transaction WHERE appName = 'Dead on Film'
```
- Threshold: < 1 for at least 5 minutes
- Action: Email + PagerDuty

**High Error Rate**:
```nrql
SELECT percentage(count(*), WHERE error IS true) FROM Transaction WHERE appName = 'Dead on Film'
```
- Threshold: > 5% for at least 5 minutes
- Action: Email + PagerDuty

**Database Connection Failure**:
```nrql
SELECT count(*) FROM TransactionError WHERE error.class LIKE '%Connection%'
```
- Threshold: > 10 for at least 5 minutes
- Action: Email

### Performance Alerts

**Slow Response Time**:
```nrql
SELECT percentile(duration, 95) FROM Transaction WHERE appName = 'Dead on Film'
```
- Threshold: > 2000ms for at least 10 minutes
- Action: Email

**Low Cache Hit Rate**:
```nrql
SELECT percentage(count(*), WHERE hit IS true) FROM RedisOperation WHERE operation = 'get'
```
- Threshold: < 60% for at least 30 minutes
- Action: Email

### Background Job Alerts

**Script Failure**:
```nrql
SELECT count(*) FROM CliScriptRun WHERE success IS false AND scriptName IN ('sync-tmdb-changes', 'sitemap-generate', 'seed-movies')
```
- Threshold: > 0 (immediate notification)
- Action: Email

**Script Taking Too Long**:
```nrql
SELECT average(durationMs) FROM CliScriptRun WHERE scriptName = 'sync-tmdb-changes'
```
- Threshold: > 600000ms (10 min) for at least 1 occurrence
- Action: Email

---

## Verification Steps

### 1. Test Redis Instrumentation

```bash
# Trigger API requests that use cache
curl http://localhost:8080/api/movies/the-matrix-1999-603

# Verify RedisOperation events in New Relic
newrelic nrql query --accountId 7418892 --query "SELECT * FROM RedisOperation SINCE 10 minutes ago LIMIT 10"
```

### 2. Test CLI Script Instrumentation

```bash
# Run an instrumented script
cd server
npm run backfill:actor-obscure -- --limit 10

# Verify CliScriptRun event
newrelic nrql query --accountId 7418892 --query "SELECT * FROM CliScriptRun WHERE scriptName = 'backfill-actor-obscure' SINCE 10 minutes ago"
```

### 3. Test PostgreSQL Monitoring

```bash
# After deploying with new docker-compose.yml
docker compose up -d --build agent

# Check agent logs
docker logs newrelic-infra

# Verify PostgreSQL metrics in New Relic (wait 15 seconds)
newrelic nrql query --accountId 7418892 --query "SELECT * FROM PostgreSqlDatabaseSample SINCE 5 minutes ago LIMIT 1"
```

---

## Deployment Instructions

### 1. Build and Deploy

```bash
# On production server
cd /opt/deadonfilm

# Pull latest code
git pull origin main

# Rebuild the New Relic Infrastructure agent with PostgreSQL integration
docker compose build agent

# Restart services
docker compose up -d
```

### 2. Verify Deployment

```bash
# Check all services are healthy
docker compose ps

# Check New Relic Infrastructure agent logs
docker logs newrelic-infra

# Verify PostgreSQL integration is working
docker exec newrelic-infra ls -la /etc/newrelic-infra/integrations.d/
```

### 3. Create Dashboards (via New Relic UI)

1. Navigate to: https://one.newrelic.com/dashboards
2. Click "Create dashboard"
3. Add widgets using the NRQL queries from Phase 4 above
4. Save and share

### 4. Configure Alerts (via New Relic UI)

1. Navigate to: https://one.newrelic.com/alerts-ai/policies
2. Click "Create alert policy"
3. Add conditions using the NRQL queries from Phase 5 above
4. Configure notification channels
5. Save

---

## Files Changed Summary

### New Files Created (3)
1. `server/src/lib/redis-instrumentation.ts` - Redis monitoring wrapper
2. `server/src/lib/redis-instrumentation.test.ts` - Redis instrumentation tests
3. `newrelic-postgres-config.yml` - PostgreSQL integration configuration

### Files Modified (16)

**Server Code**:
1. `server/src/lib/cache.ts` - Use instrumented Redis operations
2. `server/scripts/backfill-actor-obscure.ts` - Add New Relic instrumentation
3. `server/scripts/backfill-mortality-stats.ts` - Add New Relic instrumentation
4. `server/scripts/backfill-episodes-fallback.ts` - Add New Relic instrumentation
5. `server/scripts/backfill-external-ids.ts` - Add New Relic instrumentation
6. `server/scripts/verify-death-info.ts` - Add New Relic instrumentation
7. `server/scripts/verify-shows.ts` - Add New Relic instrumentation
8. `server/scripts/fix-death-details.ts` - Add New Relic instrumentation
9. `server/scripts/backfill-omdb-ratings.ts` - Add New Relic instrumentation
10. `server/scripts/backfill-trakt-ratings.ts` - Add New Relic instrumentation
11. `server/scripts/backfill-thetvdb-scores.ts` - Add New Relic instrumentation

**Infrastructure**:
12. `newrelic-infra.dockerfile` - Install PostgreSQL integration
13. `docker-compose.yml` - Add PostgreSQL monitoring configuration

**Documentation**:
14. `NEW_RELIC_OPTIMIZATION.md` - This file

---

## Expected Outcomes

### Visibility Improvements
- ✅ Redis cache hit rate, latency, and error tracking
- ✅ All 13 CLI scripts instrumented (up from 3)
- ✅ PostgreSQL database monitoring active
- ✅ Enhanced custom event tracking
- 🔜 5 custom dashboards (to be created via UI)
- 🔜 Proactive alerts for critical failures (to be configured via UI)
- ✅ Synthetic monitoring for uptime (already active)

### Account Cleanup
- ✅ No stale entities to remove
- ✅ Clean entity inventory
- ✅ Well-organized monitoring setup

### Cost Optimization Opportunities
- Monitor high-cardinality attributes in RedisOperation events
- Adjust CLI script sampling if needed
- Review synthetic monitor frequencies

---

## Next Steps

### Immediate (Week 1)
1. Deploy updated infrastructure with PostgreSQL monitoring
2. Verify all instrumentation is working in production
3. Create the 5 recommended dashboards via New Relic UI

### Short-term (Week 2-4)
4. Configure alert policies via New Relic UI
5. Set up notification channels (email, Slack, PagerDuty)
6. Monitor Redis performance and optimize cache strategies
7. Review CLI script performance and identify bottlenecks

### Long-term (Month 2+)
8. Add external API attribution (TMDB, Claude, Wikidata) for cost tracking
9. Add database query attribution for entity-level tracking
10. Create custom synthetic monitors for critical user journeys
11. Set up anomaly detection for key metrics
12. Regular review and optimization based on New Relic insights

---

## Support and Resources

### Documentation
- New Relic APM: https://docs.newrelic.com/docs/apm/
- New Relic Infrastructure: https://docs.newrelic.com/docs/infrastructure/
- PostgreSQL Integration: https://docs.newrelic.com/docs/infrastructure/host-integrations/host-integrations-list/postgresql-monitoring-integration/
- NRQL Reference: https://docs.newrelic.com/docs/nrql/

### Contacts
- Implementation: Claude Code (January 2026)
- Questions: See GitHub repository

---

**End of Implementation Summary**
