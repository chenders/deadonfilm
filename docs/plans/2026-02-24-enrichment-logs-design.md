# Enrichment Logs Parity & Run-Level Log Capture

## Goal

Add rich per-actor log viewing to biography enrichment (matching death enrichment's modal UI), and add run-level log capture (all levels, not just errors) to both enrichment systems.

## Current State

### Death Enrichment
- **Per-actor logs**: Stored in `enrichment_run_actors.log_entries` JSONB. Displayed in a rich **ActorLogsModal** with timestamps, level badges (INFO/WARN/ERROR/DEBUG), formatted JSON payloads, collapsible Claude I/O sections.
- **Run-level logs**: Only errors via `error_logs` table. "Error Logs" section with level filter dropdown but only Fatal/Error options.
- **Actor results table**: Has "View" button that opens the modal.

### Biography Enrichment
- **Per-actor logs**: Stored in `bio_enrichment_run_actors.log_entries` JSONB. Displayed **inline** in expandable table rows — tiny (60px), no JSON formatting, no Claude I/O collapsibles. Only 3 summary-level entries logged currently.
- **Run-level logs**: None. Errors stored in `bio_enrichment_runs.errors` JSONB array but not displayed in a logs section.
- **Actor results table**: Has "Show (N)" button that expands inline row.

## Design

### 1. Shared `ActorLogsModal` Component

Extract the existing `ActorLogsModal` from `EnrichmentRunDetailsPage.tsx` into `src/components/admin/ActorLogsModal.tsx`. Both pages use it.

**Props:**
```typescript
interface ActorLogsModalProps {
  title: string          // "Enrichment Logs" or "Biography Logs"
  subtitle: string       // "Run #162 / Actor #6361"
  logEntries: ActorLogEntry[]
  onClose: () => void
}
```

The modal handles: timestamps (HH:MM:SS), level badges, JSON payload formatting, collapsible `[CLAUDE_REQUEST]` / `[CLAUDE_RESPONSE]` sections.

### 2. Bio Enrichment Actor Logs API

New endpoint: `GET /admin/api/biography-enrichment/runs/:id/actors/:actorId/logs`

Returns `{ actorName: string, logEntries: ActorLogEntry[] }` — same shape as the death enrichment equivalent. This enables the modal to fetch detailed logs on demand rather than loading them inline.

### 3. Run-Level Log Capture (New `run_logs` Table)

**Migration:**
```sql
CREATE TABLE run_logs (
  id SERIAL PRIMARY KEY,
  run_type TEXT NOT NULL,          -- 'death' or 'biography'
  run_id INTEGER NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level TEXT NOT NULL,             -- 'info', 'warn', 'error', 'debug'
  message TEXT NOT NULL,
  data JSONB,
  source TEXT
);
CREATE INDEX idx_run_logs_lookup ON run_logs (run_type, run_id, timestamp);
```

**`RunLogger` utility class** (`server/src/lib/run-logger.ts`):
- Instantiated by both orchestrators at run start
- Methods: `.info()`, `.warn()`, `.error()`, `.debug()`
- Buffers entries in memory, flushes to DB in batches (every 50 entries or 5s)
- Final `.flush()` at run end
- Each orchestrator replaces its `console.log` calls with `runLogger.info(...)` etc.

### 4. Shared `RunLogsSection` Component

New component: `src/components/admin/RunLogsSection.tsx`

**Props:**
```typescript
interface RunLogsSectionProps {
  runType: 'death' | 'biography'
  runId: number
}
```

Features:
- Level filter dropdown (All Levels, Info, Warn, Error, Debug)
- Paginated log entries (50 per page)
- Timestamps, level badges, messages, expandable JSON data
- Stack traces in collapsible `<details>` for errors

### 5. API Endpoints for Run Logs

- `GET /admin/api/enrichment/runs/:id/run-logs?level=&page=&pageSize=` (death)
- `GET /admin/api/biography-enrichment/runs/:id/run-logs?level=&page=&pageSize=` (bio)

Both query the shared `run_logs` table filtered by `run_type` and `run_id`.

The existing death enrichment `/runs/:id/logs` endpoint (which queries `error_logs` table) remains unchanged for backward compatibility.

### 6. UI Updates

**Bio enrichment run details page:**
- Replace inline log expansion with "View" button that opens `ActorLogsModal`
- Add `RunLogsSection` below actor results

**Death enrichment run details page:**
- Add `RunLogsSection` below existing "Error Logs" section (or replace it)
- Keep existing `ActorLogsModal` but import from shared component

### 7. Wire Orchestrators to RunLogger

**Death enrichment orchestrator** (`server/src/lib/death-sources/orchestrator.ts`):
- Create `RunLogger` instance at run start with `run_type: 'death'`
- Log: run start, per-actor processing start, source attempts/results, Claude requests, run completion summary
- Replace existing `console.log` calls

**Bio enrichment orchestrator** (`server/src/lib/biography-sources/orchestrator.ts`):
- Create `RunLogger` instance at run start with `run_type: 'biography'`
- Log: run start, per-actor processing start, source attempts/results, synthesis requests, run completion summary
- Replace existing `console.log` calls

## Non-Goals

- Migrating existing `error_logs` data to `run_logs` (they coexist)
- Capturing Docker container stdout/stderr
- Real-time log streaming via WebSockets
