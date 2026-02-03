# Phase 3: Enhanced Per-Field History & Revert

**Date:** 2026-02-01
**Status:** Ready for implementation
**Branch:** `feat/admin-actor-editor`

## Overview

Enhance the Admin Actor Editor with expanded per-field history and revert-to-any-value functionality. This is Phase 3 of the 5-phase Admin Actor Editor feature.

### Goals

- Allow users to see complete change history for any field
- Enable reverting to any historical value (not just the previous one)
- Keep history inline with editing flow (no separate tabs)
- Lazy-load history to keep initial page load fast

### Non-Goals

- Dedicated History tab (deferred to later phase if needed)
- Batch undo/redo across multiple fields
- History comparison/diff view

## API Design

### New Endpoint: `GET /admin/api/actors/:id/history/:field`

Returns paginated history for a specific field.

**Request:**
```
GET /admin/api/actors/123/history/cause_of_death?limit=50
```

**Response:**
```json
{
  "field": "cause_of_death",
  "history": [
    {
      "id": 456,
      "old_value": "heart attack",
      "new_value": "cardiac arrest",
      "source": "admin-manual-edit",
      "batch_id": "admin-edit-1234567890",
      "created_at": "2026-01-15T10:30:00Z"
    }
  ],
  "total": 12,
  "hasMore": false
}
```

**Field name handling:**
- Actor fields: `cause_of_death`, `deathday`, `name`, etc.
- Circumstances fields: `circumstances.circumstances`, `circumstances.location_of_death`, etc.

**Query parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 50 | Max entries to return (max 200) |
| `offset` | number | 0 | For pagination |

**Error responses:**
- `400` - Invalid field name
- `404` - Actor not found

## Frontend Design

### New Hook: `useFieldHistory`

**Location:** `src/hooks/admin/useFieldHistory.ts`

```typescript
interface FieldHistoryEntry {
  id: number
  old_value: string | null
  new_value: string | null
  source: string
  batch_id: string | null
  created_at: string
}

interface UseFieldHistoryResult {
  history: FieldHistoryEntry[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  total: number
  hasMore: boolean
}

function useFieldHistory(
  actorId: number | undefined,
  fieldName: string,
  enabled: boolean
): UseFieldHistoryResult
```

**Behavior:**
- Only fetches when `enabled` is `true` (panel expanded)
- Uses React Query with `staleTime: 60000` (1 min)
- Query key: `["admin", "actor", actorId, "history", fieldName]`

### EditableField Enhancement

**Collapsed state** (unchanged):
- Shows "Show history" link if history exists
- Quick revert button for last change

**Expanded state** (new):
- Scrollable panel (max-height ~200px)
- Each row shows:
  - Timestamp and source
  - Old value → New value
  - "Revert" button
- Loading skeleton while fetching
- "Hide" button to collapse

**Revert behavior:**
- Clicking "Revert" calls `onRevert(entry.old_value)`
- Stages the value as a pending change
- User must click "Save Changes" to commit

## Implementation Plan

### Step 1: API Endpoint

**File:** `server/src/routes/admin/actors.ts`

Add `GET /:id/history/:field` route:
- Validate actor exists (404 if not)
- Validate field name against allowed list (400 if invalid)
- Query `actor_death_info_history` table
- Return paginated results, newest first

**Tests:** `server/src/routes/admin/actors.test.ts`
- Valid field request returns history
- Invalid field returns 400
- Non-existent actor returns 404
- Pagination works correctly

### Step 2: Frontend Hook

**File:** `src/hooks/admin/useFieldHistory.ts`

Create hook with:
- React Query integration
- Enabled flag for lazy loading
- Error handling

**Tests:** `src/hooks/admin/useFieldHistory.test.ts`
- Returns data when enabled
- Does not fetch when disabled
- Handles errors gracefully

### Step 3: EditableField Enhancement

**File:** `src/components/admin/actor-editor/EditableField.tsx`

Changes:
- Add `showFullHistory` state
- Integrate `useFieldHistory` hook
- Render expanded panel with history rows
- Add loading skeleton
- Wire up revert buttons

**Tests:** `src/components/admin/actor-editor/EditableField.test.tsx`
- Expand/collapse panel
- Shows loading state
- Renders all history entries
- Revert from any row calls onRevert with correct value

## Files Summary

| File | Action |
|------|--------|
| `server/src/routes/admin/actors.ts` | Add endpoint |
| `server/src/routes/admin/actors.test.ts` | Add tests |
| `src/hooks/admin/useFieldHistory.ts` | Create |
| `src/hooks/admin/useFieldHistory.test.ts` | Create |
| `src/components/admin/actor-editor/EditableField.tsx` | Enhance |
| `src/components/admin/actor-editor/EditableField.test.tsx` | Update |

## Testing Strategy

- **Unit tests:** All new code has tests
- **Integration:** Manual testing of full flow
- **Edge cases:** Empty history, long values, special characters
