# Sync Admin Improvements Design

**Date:** 2026-01-30
**Status:** Ready for implementation

## Problem

The admin sync page at `/admin/sync` lacks visibility and control:
1. No way to see progress while a sync is running (items stay at 0 until completion)
2. No way to cancel/stop a stuck sync
3. Error messages from failed syncs aren't visible in the UI

## Solution

### Backend Changes

#### 1. New Cancel Endpoint

**`POST /admin/api/sync/:id/cancel`**

Forcefully stops a stuck sync by:
1. Verifying sync exists with status='running'
2. Deleting Redis lock `lock:sync:tmdb`
3. Updating `sync_history`: status='failed', completed_at=NOW(), error_message='Manually cancelled by admin'
4. Returning updated sync record

Response:
```json
{
  "id": 1,
  "status": "failed",
  "errorMessage": "Manually cancelled by admin",
  ...
}
```

Error cases:
- 404: Sync not found
- 400: Sync not in 'running' status

#### 2. Progress Tracking in Sync Script

Modify `scripts/sync-tmdb-changes.ts`:

- Add optional `syncId` parameter to `runSync()` and `SyncOptions`
- Every 100 items processed OR every 30 seconds (whichever comes first), update `sync_history`:
  ```sql
  UPDATE sync_history SET
    items_checked = $1,
    items_updated = $2,
    new_deaths_found = $3
  WHERE id = $4
  ```
- Pass `syncId` from the admin route when triggering sync

### Frontend Changes

#### 1. Enhanced Status Card

When sync is running, display:
- Live progress counters: "Checked: 1,234 | Updated: 56 | Deaths: 3"
- Elapsed time: "Running for 2m 34s" (client-side timer)
- Red "Force Stop" button

Poll `/admin/api/sync/:id` using `currentSyncId` to get progress updates.

#### 2. Force Stop Button

- Red button, only visible when sync is running
- Click shows confirmation dialog: "Are you sure? This will mark the sync as failed."
- On confirm: POST to `/admin/api/sync/:id/cancel`
- On success: invalidate queries, show success message
- On error: show error toast

#### 3. Expandable History Rows

Click any row in history table to expand/collapse details panel showing:
- Error message (full text, if failed)
- Parameters used (days, types, dryRun)
- Sync ID
- Start/end times

Visual behavior:
- Chevron icon (▶/▼) indicates expand state
- Only one row expanded at a time
- Subtle background change for expanded row

## Files to Modify

**Backend:**
- `server/src/routes/admin/sync.ts` - add cancel endpoint
- `server/scripts/sync-tmdb-changes.ts` - add progress updates

**Frontend:**
- `src/pages/admin/SyncPage.tsx` - status card, force stop, expandable rows
- `src/hooks/admin/useAdminSync.ts` - add cancel mutation

**Tests:**
- `server/src/routes/admin/sync.test.ts` - cancel endpoint tests
- `src/pages/admin/SyncPage.test.tsx` - UI interaction tests

## Non-Goals

- Graceful cancellation (sending signal to running process) - too complex, force-clear covers 99% of cases
- WebSocket/SSE for real-time updates - polling every 5 seconds is sufficient
- Separate details page - expandable rows are simpler
