# 01 — Fix Scheduled Job Bugs

**Priority**: P0 (Critical)
**Impact**: 5 | **Difficulty**: 1 | **Feasibility**: 5 | **Confidence**: 5

---

## Problem

The scheduled popularity update script (`server/scripts/scheduled-popularity-update.ts`) has a completely different actor scoring implementation than the library function (`server/src/lib/popularity-score.ts:calculateActorPopularity`). This means actors get different scores depending on which code path runs.

Three specific bugs:

### Bug 1: TMDB ×100 Multiplier (Line 516)

```typescript
// scheduled-popularity-update.ts:515-516
const tmdbPercentile = logPercentile(tmdbPopularity, TMDB_POPULARITY_THRESHOLDS)
const tmdbComponent = (tmdbPercentile ?? 0) * 100  // BUG: already 0-100!
```

`logPercentile()` already returns values on a 0–100 scale. Multiplying by 100 produces 0–10,000. After weighting (×0.3) that's 0–3,000. After clamping to `[0, 100]`, any actor with even minimal TMDB popularity (≥2) gets their score dominated by the TMDB component, effectively making `dof_popularity = 100` for nearly all actors.

**Compare with the library** (`popularity-score.ts:636`):
```typescript
const tmdbScore = logPercentile(tmdbPopularity, PERCENTILE_THRESHOLDS.tmdbPopularity) ?? 0
finalScore = filmographyScore * ACTOR_FILMOGRAPHY_WEIGHT + tmdbScore * ACTOR_TMDB_RECENCY_WEIGHT
```
No ×100 — uses the percentile directly.

### Bug 2: Sum-All-Contributions Instead of Top-10

The library function sorts contributions descending and takes the top 10 (`MAX_APPEARANCES_FOR_SCORE = 10`), then averages them. The scheduled script's SQL sums **all** contributions across the entire filmography:

```sql
-- scheduled-popularity-update.ts:436-453 (movie_contributions CTE)
SUM(
  (COALESCE(m.dof_popularity, 0) * 0.6 + COALESCE(m.dof_weight, 0) * 0.4)
  * CASE ... END
) as contribution  -- Sums ALL, not top 10
```

This means prolific character actors with 100+ minor roles accumulate enormous sums, while the library would only consider their best 10.

### Bug 3: Different Normalization

The script normalizes by dividing the sum by 10 and capping at 100:
```typescript
// scheduled-popularity-update.ts:512
const normalizedFilmography = Math.min(filmographySum / 10, 100)
```

The library averages the top-10 contributions (which are already on approximately a 0–100 scale thanks to the content scores being 0–100).

These are fundamentally different approaches that produce different rankings.

---

## Proposed Solution

**Option A (Recommended)**: Delete the custom actor calculation from the scheduled script and call `calculateActorPopularity()` from the library instead.

This is what the BullMQ job handler (`calculate-actor-popularity.ts`) already does — it fetches filmography per-actor and calls the library function. The scheduled script should do the same.

**Option B**: If SQL performance is critical (processing 100K+ actors), port the library's exact logic into SQL:
1. Use `ROW_NUMBER()` to rank contributions per actor
2. Filter to top 10
3. Average (not sum/10)
4. Remove the ×100 on TMDB percentile

Option A is strongly preferred — a single source of truth prevents future divergence.

### Implementation Sketch (Option A)

```typescript
async function updateActorPopularity(pool, options): Promise<number> {
  // Fetch all deceased actors with filmography
  const actors = await pool.query(`
    SELECT id, tmdb_popularity FROM actors
    WHERE deathday IS NOT NULL
  `)

  for (const actor of actors.rows) {
    // Use the same approach as CalculateActorPopularityHandler
    const appearances = await getActorFilmography(pool, actor.id)
    const result = calculateActorPopularity({
      appearances,
      tmdbPopularity: actor.tmdb_popularity,
    })
    // batch update...
  }
}
```

Performance concern: This requires one filmography query per actor instead of one bulk SQL query. For ~50K deceased actors, this could be slow. Mitigation: batch the filmography queries using `WHERE actor_id = ANY($1)` with batches of 500.

---

## Expected Impact

- **All actors**: Scores will change significantly since the ×100 bug currently dominates
- **Tom Cruise** (alive — not in scheduled script, but relevant for BullMQ path): No change, BullMQ handler already uses the library
- **Clark Gable** (deceased, low TMDB): Currently gets artificially high score from ×100 bug; will get a more accurate filmography-based score
- **Character actors with 100+ roles**: Will no longer benefit from sum-all-contributions; their top-10 average will better reflect their actual fame

---

## Files to Modify

| File | Change |
|------|--------|
| `server/scripts/scheduled-popularity-update.ts` | Replace custom actor calculation (lines 421–549) with calls to `calculateActorPopularity` from the library |
| `server/src/lib/popularity-score.ts` | No changes needed — the library is correct |
| `server/src/lib/jobs/handlers/calculate-actor-popularity.ts` | No changes needed — already uses the library correctly |

---

## Team Assessment

| Specialist | Assessment | Confidence |
|------------|-----------|------------|
| Researcher | "The scheduled script and library function must produce identical results. Two code paths for the same calculation is a maintenance nightmare." | 5/5 |
| Mathematician | "The ×100 bug is catastrophic. It makes the TMDB component 100× too large, saturating the clamp at 100 for nearly every actor. The sum-all vs top-10 discrepancy produces fundamentally different rankings." | 5/5 |
| Salary Specialist | "This needs to be fixed before any other changes — the current numbers are meaningless." | 5/5 |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Score changes affect production rankings | Run with `--dry-run` first, compare old vs new scores for top 100 actors |
| Performance regression (per-actor queries) | Batch filmography queries; benchmark against current bulk SQL approach |
| Other code depends on current (buggy) scores | Search for `dof_popularity` consumers; update any thresholds that assumed buggy values |
