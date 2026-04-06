# Fix GSC writeGscSnapshot inconsistent `indexing` return

## Problem

`writeGscSnapshot` in `server/src/lib/db/admin-gsc-queries.ts` only returns `indexing` (and only upserts `gsc_indexing_status`) when `sitemaps.length > 0`. In environments where GSC returns zero sitemaps, the admin snapshot response omits `indexing`, but the frontend snapshot result type/UI may expect it to exist.

## Suggested Fix

Return `indexing` consistently (e.g., `{totalSubmitted: 0, totalIndexed: 0}`) when sitemaps is empty, and consider upserting a zero row for the date as well. This keeps the API contract stable.

## Origin

Raised by GitHub Copilot in PR #594 (comment ID 3037509091) on `server/src/lib/db/admin-gsc-queries.ts`. Declined as out of scope for that PR since the behavior is pre-existing and the PR only narrowed the parameter type to `PoolClient`.

## Files

- `server/src/lib/db/admin-gsc-queries.ts` — `writeGscSnapshot()` function
- `server/src/routes/admin/gsc.ts` — caller that returns the result to the frontend
