# PostgreSQL New Relic Extensions Deployment Guide

## Overview

This guide covers deploying the custom PostgreSQL image with New Relic monitoring extensions (`pg_stat_statements`, `pg_wait_sampling`, `pg_stat_monitor`) to your production server.

## Files Created/Modified

- `Dockerfile.postgres` - Custom PostgreSQL 16 image with extensions
- `docker-compose.yml` - Updated to build custom image
- `postgresql.conf` - Added shared_preload_libraries configuration
- `init-newrelic-extensions.sql` - Auto-creates extensions on first startup

## Deployment Steps

### 1. Commit and Push Changes

```bash
cd /Users/chris/Source/deadonfilm
git add Dockerfile.postgres docker-compose.yml postgresql.conf init-newrelic-extensions.sql
git commit -m "Add PostgreSQL New Relic monitoring extensions

- Create custom Dockerfile.postgres with pg_stat_statements, pg_wait_sampling, pg_stat_monitor
- Update docker-compose.yml to build custom image
- Configure postgresql.conf with shared_preload_libraries
- Add init script to create extensions on startup

Required for enhanced New Relic PostgreSQL monitoring."
git push origin main
```

### 2. SSH to Production Server

```bash
ssh your-server
cd /opt/deadonfilm
```

### 3. Pull Latest Code

```bash
git pull origin main
```

### 4. Build the Custom PostgreSQL Image

This builds the image with the extensions baked in:

```bash
docker compose build db
```

**Expected output:**
- Building dependencies (Alpine packages)
- Cloning pg_wait_sampling repo
- Compiling pg_wait_sampling
- Cloning pg_stat_monitor repo
- Compiling pg_stat_monitor
- Cleaning up build dependencies

**Build time:** ~3-5 minutes depending on server

### 5. Stop and Remove Existing Database Container

⚠️ **CRITICAL:** This will cause downtime. Ensure you're in a maintenance window.

```bash
# Stop all services
docker compose down

# Verify containers are stopped
docker ps
```

**Note:** The `postgres-data` volume persists, so your data is safe.

### 6. Start Services with New Image

```bash
docker compose up -d
```

PostgreSQL will:
1. Start with new image containing extensions
2. Load `shared_preload_libraries` from postgresql.conf
3. Run `init-newrelic-extensions.sql` (only if starting fresh DB)
4. Create the extensions if they don't exist

### 7. Verify Extensions Are Loaded

```bash
# Check PostgreSQL logs for extension loading
docker compose logs db | grep -i "extension\|preload"

# Connect to database and verify extensions exist
docker compose exec db psql -U deadonfilm -d deadonfilm -c "SELECT extname, extversion FROM pg_extension WHERE extname IN ('pg_stat_statements', 'pg_wait_sampling', 'pg_stat_monitor');"
```

**Expected output:**
```
      extname       | extversion
--------------------+------------
 pg_stat_statements | 1.10
 pg_wait_sampling   | 1.1
 pg_stat_monitor    | 2.0
(3 rows)
```

### 8. Verify Extensions Are Working

Test each extension:

```bash
# Test pg_stat_statements (query statistics)
docker compose exec db psql -U deadonfilm -d deadonfilm -c "SELECT query, calls, total_exec_time FROM pg_stat_statements LIMIT 5;"

# Test pg_wait_sampling (wait events)
docker compose exec db psql -U deadonfilm -d deadonfilm -c "SELECT * FROM pg_wait_sampling_profile LIMIT 5;"

# Test pg_stat_monitor (enhanced query stats)
docker compose exec db psql -U deadonfilm -d deadonfilm -c "SELECT query, calls FROM pg_stat_monitor LIMIT 5;"
```

### 9. Verify New Relic Is Collecting Data

1. Check New Relic Infrastructure agent logs:
   ```bash
   docker compose logs agent | grep -i postgres
   ```

2. Go to New Relic UI:
   - Navigate to Infrastructure → Hosts
   - Select your `deadonfilm-server` host
   - Check PostgreSQL integration tab
   - Verify metrics are flowing

**Wait 5-10 minutes** for initial data collection.

### 10. Verify Application Health

```bash
# Check all services are healthy
docker compose ps

# Check application logs for errors
docker compose logs app --tail=50

# Test application health endpoint
curl http://localhost:3000/health
```

## Troubleshooting

### Extensions Not Created

If extensions don't exist after startup:

```bash
# Manually create them
docker compose exec db psql -U deadonfilm -d deadonfilm -c "
  CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
  CREATE EXTENSION IF NOT EXISTS pg_wait_sampling;
  CREATE EXTENSION IF NOT EXISTS pg_stat_monitor;
"
```

### Build Fails

If the Docker build fails:

```bash
# Check build logs
docker compose build db --no-cache --progress=plain

# Common issues:
# - Network timeout cloning repos (retry)
# - Compilation errors (check PostgreSQL version compatibility)
```

### PostgreSQL Won't Start

If PostgreSQL fails to start after config changes:

```bash
# Check logs for config errors
docker compose logs db

# Common issues:
# - Typo in shared_preload_libraries
# - Extensions not installed correctly

# Rollback by commenting out the shared_preload_libraries line:
nano /opt/deadonfilm/postgresql.conf
# Comment out: # shared_preload_libraries = 'pg_stat_statements,pg_wait_sampling,pg_stat_monitor'

docker compose up -d db
```

### New Relic Not Collecting Extension Data

1. Verify extensions are active:
   ```bash
   docker compose exec db psql -U deadonfilm -d deadonfilm -c "\dx"
   ```

2. Check New Relic agent config:
   ```bash
   cat newrelic-postgres-config.yml
   ```

3. Restart New Relic agent:
   ```bash
   docker compose restart agent
   ```

## Rollback Plan

If issues occur, rollback to stock PostgreSQL:

```bash
# 1. Stop services
docker compose down

# 2. Edit docker-compose.yml to use stock image
nano docker-compose.yml
# Change:
#   db:
#     image: postgres:16-alpine

# 3. Comment out extensions in postgresql.conf
nano postgresql.conf
# Comment out: # shared_preload_libraries = ...

# 4. Start services
docker compose up -d
```

## Performance Impact

**Minimal overhead expected:**
- `pg_stat_statements`: ~1-2% CPU overhead
- `pg_wait_sampling`: ~0.5% CPU overhead
- `pg_stat_monitor`: ~1-2% CPU overhead

**Total impact:** ~3-5% CPU overhead for comprehensive monitoring.

**Memory:** Each extension uses ~5-10MB shared memory.

## Maintenance

**Extension updates:**
- Extensions are compiled into the image
- To update, rebuild the image with latest extension versions
- Run `git pull` in the extension clone commands in Dockerfile

**Resetting statistics:**
```sql
-- Reset pg_stat_statements
SELECT pg_stat_statements_reset();

-- Reset pg_stat_monitor
SELECT pg_stat_monitor_reset();
```

## Next Steps

After successful deployment:

1. Configure New Relic alert policies for PostgreSQL metrics
2. Create dashboards for slow queries using pg_stat_statements data
3. Set up alerts for wait events using pg_wait_sampling data
4. Review pg_stat_monitor enhanced query analytics

## Questions?

- New Relic PostgreSQL docs: https://docs.newrelic.com/docs/infrastructure/host-integrations/host-integrations-list/postgresql-monitoring-integration/
- pg_stat_statements: https://www.postgresql.org/docs/16/pgstatstatements.html
- pg_wait_sampling: https://github.com/postgrespro/pg_wait_sampling
- pg_stat_monitor: https://github.com/percona/pg_stat_monitor
