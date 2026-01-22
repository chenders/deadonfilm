# Admin Section - Phase 3: Interactive Enrichment Controls

This document describes the implementation of Phase 3 (completing Admin Stage 2) of the Dead on Film admin section, which adds interactive controls for enrichment runs.

## Overview

Phase 3 completes the enrichment monitoring functionality by adding:
- **Start enrichment runs from UI** with configuration options
- **Real-time progress tracking** with auto-polling
- **Stop running enrichments** gracefully
- **Live status updates** showing current actor, cost, and time remaining

## Architecture

### Database Schema

**Migration**: `1769043522858_add-enrichment-run-status-tracking.cjs`

Added columns to `enrichment_runs` table:
- `status` - Current state: `pending`, `running`, `completed`, `failed`, `stopped`
- `process_id` - PID of running enrichment process
- `current_actor_index` - Progress tracking (0-based index)
- `current_actor_name` - Name of actor currently being processed

### Backend Components

#### 1. Enrichment Process Manager
**File**: `server/src/lib/enrichment-process-manager.ts`

Core functionality:
- **`startEnrichmentRun(config)`** - Spawns enrichment script as child process
  - Creates database record with `status='pending'`
  - Builds CLI arguments from config
  - Spawns process with `npx tsx enrich-death-details.ts`
  - Updates status to `running` with PID
  - Sets up event handlers (exit, error, stdout/stderr)
- **`stopEnrichmentRun(runId)`** - Sends SIGTERM for graceful shutdown
  - Checks if process exists in memory map
  - Falls back to killing by PID from database
  - Updates status to `stopped` with `exit_reason='interrupted'`
- **`getEnrichmentRunProgress(runId)`** - Queries current progress
  - Fetches status, current actor, counts, cost from database
  - Calculates progress percentage
  - Estimates time remaining based on elapsed time and progress

**Process Management**:
- In-memory map: `runningProcesses: Map<runId, ChildProcess>`
- Event handlers:
  - `exit` - Marks run as failed if non-zero exit code
  - `error` - Logs error and marks run as failed
  - `stdout/stderr` - Logs output for debugging

#### 2. Enrichment Script Updates
**File**: `server/scripts/enrich-death-details.ts`

New features:
- **`--run-id <number>`** parameter for tracking
- **Progress tracking functions**:
  - `updateRunProgress()` - Updates database with current state
  - `completeEnrichmentRun()` - Marks run complete with final stats
- **SIGTERM handling** - Graceful shutdown when stopped from UI
  - Sets `shouldStop` flag
  - Completes current actor before exiting
  - Updates database with `exit_reason='interrupted'`

Progress updates:
1. Initial: Sets `actors_queried` after query
2. During: Updates `current_actor_index`, `current_actor_name`, costs (via orchestrator)
3. Completion: Sets final stats and `exit_reason`
4. Error: Marks as `failed` with error message

#### 3. API Endpoints
**File**: `server/src/routes/admin/enrichment.ts`

**POST `/admin/api/enrichment/start`**
- Validates configuration (limits, costs)
- Logs admin action
- Calls `startEnrichmentRun()`
- Returns run ID and status

**POST `/admin/api/enrichment/runs/:id/stop`**
- Validates run ID
- Logs admin action
- Calls `stopEnrichmentRun()`
- Returns success status

**GET `/admin/api/enrichment/runs/:id/progress`**
- Validates run ID
- Calls `getEnrichmentRunProgress()`
- Returns real-time progress data

### Frontend Components

#### 1. React Query Hooks
**File**: `src/hooks/admin/useEnrichmentRuns.ts`

**Mutations**:
- `useStartEnrichmentRun()` - Start new run
  - Invalidates runs list on success
- `useStopEnrichmentRun()` - Stop running run
  - Invalidates run details and runs list

**Queries**:
- `useEnrichmentRunProgress(runId, enabled)` - Auto-polling progress
  - Polls every 2 seconds if status is `running` or `pending`
  - Stops polling when `completed`, `failed`, or `stopped`
  - `staleTime: 0` for always fresh data

#### 2. Start Enrichment Page
**File**: `src/pages/admin/StartEnrichmentPage.tsx`

**Form sections**:
1. **Actor Selection**
   - Number of actors (1-1000)
   - Minimum popularity (0-100)
   - Recent deaths only checkbox
2. **Cost Limits**
   - Max total cost (required)
   - Max cost per actor (optional)
3. **Quality Settings**
   - Confidence threshold (0.0-1.0)

**Features**:
- Form validation
- Real-time CLI command preview
- Auto-navigation to run details on success
- Error display

#### 3. Enrichment Run Details Page
**File**: `src/pages/admin/EnrichmentRunDetailsPage.tsx`

**New features**:
- **Stop button** - Appears in header when run is active
  - Confirmation dialog
  - Disables during stop operation
- **Real-time progress panel** - Shows when `isRunning`
  - Progress bar with percentage
  - Current actor name
  - Live stats: enriched count, cost, elapsed time, estimated remaining
  - Auto-updates every 2 seconds

**UI design**:
- Blue highlight panel for running enrichments
- Progress bar with smooth transitions
- Grid layout for stats (2 cols mobile, 4 cols desktop)

## Usage

### Starting an Enrichment Run

**From UI**:
1. Navigate to Admin → Enrichment Runs
2. Click "Start New Run"
3. Configure limits and costs
4. Click "Start Enrichment Run"
5. Redirected to run details with live progress

**From CLI** (still supported):
```bash
cd server && npm run enrich:death-details -- --limit 100 --max-total-cost 10
```

### Monitoring Progress

**Run Details Page**:
- Real-time progress bar
- Current actor being processed
- Actors processed / total
- Cost spent so far
- Elapsed time
- Estimated time remaining

**Progress API** (for external monitoring):
```bash
curl http://localhost:3000/admin/api/enrichment/runs/1/progress
```

### Stopping an Enrichment

**From UI**:
1. Navigate to running enrichment's details page
2. Click "Stop Run" button
3. Confirm in dialog
4. Process receives SIGTERM and exits gracefully

**Graceful shutdown behavior**:
- Completes current actor
- Writes final stats to database
- Sets `exit_reason='interrupted'`
- Cache rebuilds if any actors were enriched

## Testing

### Backend Tests

**Process Manager** (`enrichment-process-manager.test.ts`):
- Starting runs with various configs
- Building CLI arguments correctly
- Stopping runs (in-memory and by PID)
- Progress calculation
- Event handlers (exit, error)

**API Endpoints** (`enrichment.test.ts`):
- Starting runs with valid/invalid configs
- Validation (limits, costs)
- Stopping runs
- Progress fetching
- Error handling

### Manual Testing Checklist

1. **Start Run**:
   - [ ] Form validation works
   - [ ] Run starts and shows in list
   - [ ] Redirects to details page
   - [ ] Progress bar appears

2. **Progress Tracking**:
   - [ ] Progress bar updates every 2 seconds
   - [ ] Current actor name shows
   - [ ] Percentage is accurate
   - [ ] Time estimates are reasonable
   - [ ] Stops polling when complete

3. **Stop Run**:
   - [ ] Stop button appears for running enrichments
   - [ ] Confirmation dialog shows
   - [ ] Run stops gracefully
   - [ ] Status updates to "stopped"
   - [ ] Progress polling stops

4. **Error Handling**:
   - [ ] Invalid limits show errors
   - [ ] Network errors display gracefully
   - [ ] Process crashes mark run as failed

## Database Queries

### Check running enrichments
```sql
SELECT id, started_at, status, process_id, current_actor_name, actors_processed, actors_queried
FROM enrichment_runs
WHERE status = 'running'
ORDER BY started_at DESC;
```

### Get progress for a run
```sql
SELECT
  status,
  current_actor_index,
  current_actor_name,
  actors_queried,
  actors_processed,
  actors_enriched,
  total_cost_usd,
  EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000 AS elapsed_ms
FROM enrichment_runs
WHERE id = 1;
```

### Find failed runs
```sql
SELECT id, started_at, completed_at, exit_reason, errors
FROM enrichment_runs
WHERE status = 'failed'
ORDER BY started_at DESC
LIMIT 10;
```

## Troubleshooting

### Run stuck in "running" status

**Symptoms**: Run shows as running but no process exists

**Diagnosis**:
```sql
SELECT id, status, process_id FROM enrichment_runs WHERE status = 'running';
```

Check if process exists:
```bash
ps -p <process_id>
```

**Fix**:
```sql
UPDATE enrichment_runs
SET status = 'failed',
    exit_reason = 'error',
    completed_at = NOW(),
    process_id = NULL
WHERE id = <run_id> AND status = 'running';
```

### Progress not updating

**Symptoms**: Progress bar frozen, stats not changing

**Possible causes**:
1. Enrichment script doesn't have `--run-id` parameter
2. Database connection issues in script
3. Process crashed without updating status

**Check process logs**:
```bash
# If running in Docker
docker compose logs server | grep "enrichment"

# If running locally
# Logs should show progress updates
```

### Stop button not working

**Symptoms**: Click "Stop Run" but nothing happens

**Diagnosis**:
1. Check if process is in memory map
2. Check if PID is valid
3. Check database status

**Manual stop** (if UI fails):
```bash
# Find process
ps aux | grep enrich-death-details

# Kill gracefully
kill -TERM <pid>

# Force kill (last resort)
kill -9 <pid>

# Update database
psql -d <database> -c "UPDATE enrichment_runs SET status = 'stopped', exit_reason = 'interrupted', completed_at = NOW(), process_id = NULL WHERE id = <run_id>;"
```

## Performance Considerations

### Polling Frequency

Progress API polls every 2 seconds:
- **Database load**: Minimal (simple SELECT query)
- **Network overhead**: ~100-200 bytes per request
- **UI responsiveness**: Good balance between freshness and overhead

To adjust polling interval, edit `useEnrichmentRunProgress`:
```typescript
refetchInterval: (data) => {
  if (data?.status === "running" || data?.status === "pending") {
    return 5000 // Change to 5 seconds
  }
  return false
}
```

### Concurrent Runs

**Current limitation**: Single enrichment run at a time recommended

**Reason**: Database contention, cost tracking complexity

**Future enhancement**: Queue system with run priorities

## Security Considerations

### Authentication

All enrichment endpoints protected by `adminAuthMiddleware`:
- Requires valid JWT token
- Checks `req.isAdmin` flag

### Audit Logging

All actions logged to `admin_audit_log`:
- `start_enrichment` - Config, timestamp, IP
- `stop_enrichment` - Run ID, timestamp, IP

### Input Validation

Strict validation on all inputs:
- Limits: 1-1000 actors
- Costs: Must be positive
- Run IDs: Must be valid integers

### Process Isolation

Enrichment runs in separate child process:
- Doesn't block API server
- Resource limits enforced by OS
- Crashes don't affect main process

## Future Enhancements

### Planned for Stage 3 (Cost Management)
- Cost breakdown charts
- Budget alerts
- Cost trends over time

### Planned for Stage 4 (Data Quality)
- Review enrichment results before committing
- Confidence score filtering
- Manual overrides

### Potential Improvements
- **Concurrent runs**: Run multiple enrichments in parallel
- **Run scheduling**: Cron-like scheduling of enrichment runs
- **Run templates**: Save common configurations
- **Notifications**: Email/Slack alerts on completion
- **Progress persistence**: Store progress history for analysis
- **WebSocket updates**: Replace polling with real-time push

## Related Documentation

- [Admin Master Plan](~/.claude/plans/graceful-sauteeing-mist.md) - Overall admin section design
- [CLAUDE.md](../CLAUDE.md) - Project guidelines
- [Enrichment Script](../server/scripts/enrich-death-details.ts) - CLI tool
- [Mortality Stats](mortality.md) - Death information enrichment logic

## Changelog

**2026-01-21** - Phase 3 Complete
- Added database migration for status tracking
- Implemented enrichment process manager
- Updated enrichment script with progress tracking
- Created admin API endpoints (start, stop, progress)
- Built StartEnrichmentPage UI
- Added real-time progress to EnrichmentRunDetailsPage
- Wrote comprehensive tests
