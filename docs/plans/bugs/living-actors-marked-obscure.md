# Bug: All Living Actors Marked as Obscure

## Problem

Every living actor in the database (547,931 actors) has `is_obscure = true`, regardless of their actual popularity. Helen Mirren (`dof_popularity = 57.07`, 116 movie credits, 38 show credits) is marked obscure.

## Impact

- Biography enrichment may skip or deprioritize living actors incorrectly
- Any filtering or display logic using `is_obscure` will exclude well-known living actors
- Admin views sorting/filtering by obscurity are meaningless for living actors

## Root Cause

The `is_obscure` computation likely only runs for deceased actors (those with `deathday IS NOT NULL`). Living actors are never evaluated, so they retain the default value of `true`.

## Diagnosis Steps

1. Find where `is_obscure` is computed — likely in a sync script or the popularity calculation job handler
2. Check if it has a `deathday IS NOT NULL` guard
3. Check the obscure filtering rules in `.claude/rules/mortality.md`:
   - Actors are NOT obscure if: appeared in content with popularity >= 20, OR 3+ English works with popularity >= 5, OR 10+ movies OR 50+ TV episodes
4. These rules should apply regardless of death status

## Verification

```sql
-- Confirm the bug: all living actors are obscure
SELECT COUNT(*) FILTER (WHERE deathday IS NULL AND is_obscure = false) as alive_not_obscure,
       COUNT(*) FILTER (WHERE deathday IS NULL AND is_obscure = true) as alive_obscure
FROM actors;
-- Result: 0 alive_not_obscure, 547931 alive_obscure

-- Example: Helen Mirren
SELECT name, dof_popularity, is_obscure, deathday FROM actors WHERE id = 15854;
-- dof_popularity=57.07, is_obscure=true, deathday=NULL
```

## Fix

Remove the `deathday IS NOT NULL` guard from the obscure scoring computation so it runs for all actors. Then backfill existing living actors.

## Discovered

2026-04-04, while investigating biography enrichment for Helen Mirren.
