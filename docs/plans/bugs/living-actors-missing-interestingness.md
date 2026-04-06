# Bug: Living Actors Have No Interestingness Score

## Problem

No living actor has an `interestingness_score`. All 547,931 living actors have `NULL` for this field. Additionally, 6,455 deceased actors with `dof_popularity > 20` also lack scores.

## Impact

- "Sort by interestingness" in the admin actors page is useless for living actors
- Biography enrichment batch runs sorted by interestingness will never prioritize living actors
- Any future features using interestingness (e.g., the proposed surprise-discovery agent) can't use this signal for living actors

## Root Cause

The interestingness score computation likely only runs for deceased actors. Living actors are never evaluated.

## Diagnosis Steps

1. Find where `interestingness_score` is computed — likely in the popularity calculation job handler or a dedicated script
2. Check if it has a `deathday IS NOT NULL` guard
3. Determine if the interestingness formula inherently requires death data (e.g., uses cause of death, years lost) or if it could apply to living actors with modifications

## Verification

```sql
-- Zero living actors have interestingness scores
SELECT COUNT(*) FROM actors WHERE deathday IS NULL AND interestingness_score IS NOT NULL;
-- Result: 0

-- Many popular deceased actors also missing
SELECT COUNT(*) FROM actors WHERE deathday IS NOT NULL AND dof_popularity > 20 AND interestingness_score IS NULL;
-- Result: 6455
```

## Fix

If the interestingness formula can apply to living actors (even partially — e.g., popularity + credit diversity without death-related factors), extend it. If it fundamentally requires death data, document that limitation and consider a separate "biographical interestingness" score for living actors.

## Discovered

2026-04-04, while investigating biography enrichment for Helen Mirren.
