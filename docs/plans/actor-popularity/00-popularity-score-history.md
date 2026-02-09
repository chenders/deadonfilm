# 00 — Popularity Score History & Periodic Updates

**Priority**: P0 (Critical — must precede all other changes)

**Status**: Proposed

## Problem

The actor popularity improvement plan has 11 scoring proposals (01–11) that will progressively change the algorithm. This document (Proposal 00) is a P0 prerequisite for that work. Currently, only the latest score is stored on each entity — there's no way to:

- **Compare scores before and after** algorithm changes
- **Track trends over time** for individual actors, movies, or shows
- **Verify that changes improved rankings** (did Tom Cruise move up?)
- **Detect regressions** (did a tuning change accidentally tank a well-known actor?)
- **Audit cron runs** (what did last Sunday's run produce?)

Before any algorithm changes are deployed, we need history tracking infrastructure in place.

---

## A. Algorithm Version Constant

Add an `ALGORITHM_VERSION` export to `server/src/lib/popularity-score.ts`:

```typescript
/**
 * Bump this version whenever the score calculation logic changes.
 * - Major: structural changes (new signals, removed signals, changed blending)
 * - Minor: tuning changes (weight adjustments, threshold tweaks)
 */
export const ALGORITHM_VERSION = "1.0"
```

**Rules**:
- Must be bumped in any PR that changes score calculation logic
- Format: `"major.minor"` (major = structural change, minor = tuning)
- The version is recorded in every history snapshot so scores can be grouped by algorithm
- PR checklist should include: "Did you change scoring logic? If yes, bump `ALGORITHM_VERSION`."

---

## B. History Tables

Three separate tables, one per entity type. Separate tables (rather than one polymorphic table) because:
- Entity-specific columns differ (`dof_weight` exists on movies/shows but not actors)
- Simpler FK constraints (no `entity_type` + `entity_id` composite)
- Cleaner queries — no `WHERE entity_type = 'actor'` on every read

### `actor_popularity_history`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `SERIAL PRIMARY KEY` | |
| `actor_id` | `INTEGER NOT NULL REFERENCES actors(id)` | FK to actors |
| `dof_popularity` | `DECIMAL(5,2) NOT NULL` | 0–100 |
| `dof_popularity_confidence` | `DECIMAL(3,2)` | 0–1 |
| `algorithm_version` | `VARCHAR(20) NOT NULL` | e.g. `"1.0"` |
| `run_id` | `INTEGER REFERENCES cronjob_runs(id)` | Links to cron run (NULL for manual/ad-hoc) |
| `snapshot_date` | `DATE NOT NULL DEFAULT CURRENT_DATE` | |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |

### `movie_popularity_history`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `SERIAL PRIMARY KEY` | |
| `movie_id` | `INTEGER NOT NULL REFERENCES movies(id)` | FK to movies |
| `dof_popularity` | `DECIMAL(5,2) NOT NULL` | 0–100 |
| `dof_weight` | `DECIMAL(5,2)` | 0–100 |
| `dof_popularity_confidence` | `DECIMAL(3,2)` | 0–1 |
| `algorithm_version` | `VARCHAR(20) NOT NULL` | |
| `run_id` | `INTEGER REFERENCES cronjob_runs(id)` | |
| `snapshot_date` | `DATE NOT NULL DEFAULT CURRENT_DATE` | |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |

### `show_popularity_history`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `SERIAL PRIMARY KEY` | |
| `show_id` | `INTEGER NOT NULL REFERENCES shows(id)` | FK to shows |
| `dof_popularity` | `DECIMAL(5,2) NOT NULL` | 0–100 |
| `dof_weight` | `DECIMAL(5,2)` | 0–100 |
| `dof_popularity_confidence` | `DECIMAL(3,2)` | 0–1 |
| `algorithm_version` | `VARCHAR(20) NOT NULL` | |
| `run_id` | `INTEGER REFERENCES cronjob_runs(id)` | |
| `snapshot_date` | `DATE NOT NULL DEFAULT CURRENT_DATE` | |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |

### Indexes

Each history table gets four indexes. Concrete DDL per table:

#### `actor_popularity_history`

```sql
CREATE INDEX idx_actor_pop_hist_entity_date ON actor_popularity_history (actor_id, snapshot_date DESC);
CREATE INDEX idx_actor_pop_hist_version_date ON actor_popularity_history (algorithm_version, snapshot_date);
CREATE INDEX idx_actor_pop_hist_run_id ON actor_popularity_history (run_id) WHERE run_id IS NOT NULL;
CREATE UNIQUE INDEX uq_actor_pop_hist_entity_date_version ON actor_popularity_history (actor_id, snapshot_date, algorithm_version);
```

#### `movie_popularity_history`

```sql
CREATE INDEX idx_movie_pop_hist_entity_date ON movie_popularity_history (movie_id, snapshot_date DESC);
CREATE INDEX idx_movie_pop_hist_version_date ON movie_popularity_history (algorithm_version, snapshot_date);
CREATE INDEX idx_movie_pop_hist_run_id ON movie_popularity_history (run_id) WHERE run_id IS NOT NULL;
CREATE UNIQUE INDEX uq_movie_pop_hist_entity_date_version ON movie_popularity_history (movie_id, snapshot_date, algorithm_version);
```

#### `show_popularity_history`

```sql
CREATE INDEX idx_show_pop_hist_entity_date ON show_popularity_history (show_id, snapshot_date DESC);
CREATE INDEX idx_show_pop_hist_version_date ON show_popularity_history (algorithm_version, snapshot_date);
CREATE INDEX idx_show_pop_hist_run_id ON show_popularity_history (run_id) WHERE run_id IS NOT NULL;
CREATE UNIQUE INDEX uq_show_pop_hist_entity_date_version ON show_popularity_history (show_id, snapshot_date, algorithm_version);
```

**Index purposes**:
1. **Entity + date** — history for a specific entity, newest first
2. **Algorithm version + date** — compare scores across algorithm versions
3. **Run ID** — look up what a specific cron run produced
4. **Unique constraint** — prevent duplicate snapshots; enables upsert on re-runs

---

## C. Retention Policy

**Keep all history indefinitely.**

Back-of-the-envelope estimate:
- ~500K actors × 52 weeks × ~50 bytes/row ≈ 1.3 GB/year
- ~200K movies × 52 weeks × ~50 bytes/row ≈ 520 MB/year
- ~50K shows × 52 weeks × ~50 bytes/row ≈ 130 MB/year
- **Total: ~2 GB/year** (trivial for PostgreSQL)

The ~2 GB estimate assumes every entity is snapshotted every week. Even if actual growth is lower (e.g. the cron only touches entities whose inputs changed), the upper bound remains trivial for PostgreSQL.

If growth ever becomes a concern, add a retention policy later (e.g. daily snapshots kept for 90 days, then monthly aggregates). But for now, full history is cheap and invaluable.

---

## D. Querying Patterns

### Compare scores across algorithm versions

```sql
-- How did John Wayne's score change between algorithm 1.0 and 2.0?
-- (actor_id from URL: /actor/john-wayne-2157)
SELECT
  algorithm_version,
  snapshot_date,
  dof_popularity,
  dof_popularity_confidence
FROM actor_popularity_history
WHERE actor_id = 2157
  AND algorithm_version IN ('1.0', '2.0')
ORDER BY snapshot_date DESC, algorithm_version;
```

### Track an entity's score over time

```sql
-- John Wayne's score trend for the last 12 weeks
SELECT snapshot_date, dof_popularity, algorithm_version
FROM actor_popularity_history
WHERE actor_id = 2157  -- /actor/john-wayne-2157
ORDER BY snapshot_date DESC
LIMIT 12;
```

### Detect dramatic score shifts (drift monitoring)

```sql
-- Actors whose score changed by more than 20 points between two consecutive runs
WITH ranked AS (
  SELECT
    actor_id,
    dof_popularity,
    snapshot_date,
    LAG(dof_popularity) OVER (PARTITION BY actor_id ORDER BY snapshot_date) AS prev_score
  FROM actor_popularity_history
  WHERE algorithm_version = '1.0'
)
SELECT actor_id, prev_score, dof_popularity,
       dof_popularity - prev_score AS delta
FROM ranked
WHERE ABS(dof_popularity - prev_score) > 20
ORDER BY ABS(dof_popularity - prev_score) DESC;
```

### Audit a specific cron run

```sql
-- Summary of a specific run
SELECT
  COUNT(*) AS actors_updated,
  ROUND(AVG(dof_popularity), 2) AS avg_score,
  MIN(dof_popularity) AS min_score,
  MAX(dof_popularity) AS max_score
FROM actor_popularity_history
WHERE run_id = 42;
```

---

## E. Periodic Update Formalization

### 1. Weekly full recalculation (existing cron)

The existing scheduled popularity update runs weekly. Every run should:

1. Calculate scores for all entities using the current `ALGORITHM_VERSION`
2. Write updated scores to the entity tables (actors, movies, shows) — existing behavior
3. **New**: Insert snapshot rows into the history tables using `INSERT ... ON CONFLICT DO UPDATE` (upsert on the unique constraint)
4. **New**: Skip snapshot recording if the proposed `--dry-run` flag is specified

### 2. On-demand recalculation after algorithm changes (proposed)

The script currently has no daily-run guard or `--force`/`--dry-run` flags. This proposal adds them:

- **`--force`**: Bypass a new "already ran today" guard so the script can be re-run manually after deploying algorithm changes
- **`--dry-run`**: Calculate scores and log results without writing to entity tables or history tables

When a PR changes the scoring algorithm:

1. Deploy the new code (with bumped `ALGORITHM_VERSION`)
2. Run the update script manually with `--force` to bypass the daily guard
3. The run records snapshots with the new `ALGORITHM_VERSION`, making it easy to compare against previous version's snapshots

```bash
# Normal weekly run (cron)
cd server && npx tsx scripts/scheduled-popularity-update.ts

# Manual run after algorithm change (bypasses proposed daily guard)
cd server && npx tsx scripts/scheduled-popularity-update.ts --force

# Preview without recording snapshots
cd server && npx tsx scripts/scheduled-popularity-update.ts --dry-run
```

### 3. Snapshot recording on every run

Every non-dry-run execution inserts history rows. The per-table upsert constraint (e.g. `(actor_id, snapshot_date, algorithm_version)` for actors) means:
- Re-running on the same day with the same algorithm version updates rather than duplicates
- Running with a different algorithm version on the same day creates separate rows (for comparison)

### 4. Score drift monitoring (optional enhancement)

After each run, log warnings for dramatic shifts:

```typescript
// After updating scores, query for large deltas within the same algorithm version.
// Filtering by algorithm_version prevents misleading alerts after a version bump
// (intentional score changes from a new algorithm are expected, not drift).
const driftReport = await pool.query(`
  WITH current_run AS (
    SELECT actor_id, dof_popularity, algorithm_version
    FROM actor_popularity_history
    WHERE run_id = $1
  ),
  previous AS (
    SELECT DISTINCT ON (p.actor_id) p.actor_id, p.dof_popularity
    FROM actor_popularity_history p
    JOIN current_run c ON c.actor_id = p.actor_id
      AND c.algorithm_version = p.algorithm_version
    WHERE p.run_id != $1
    ORDER BY p.actor_id, p.snapshot_date DESC
  )
  SELECT c.actor_id, p.dof_popularity AS prev, c.dof_popularity AS curr,
         c.dof_popularity - p.dof_popularity AS delta
  FROM current_run c
  JOIN previous p USING (actor_id)
  WHERE ABS(c.dof_popularity - p.dof_popularity) > 20
  ORDER BY ABS(c.dof_popularity - p.dof_popularity) DESC
  LIMIT 50
`, [runId])

if (driftReport.rows.length > 0) {
  log.warn({ count: driftReport.rows.length, top5: driftReport.rows.slice(0, 5) },
    "Score drift detected: actors with >20 point change")
}
```

---

## F. Algorithm Version Discipline

### PR Checklist Addition

Add to the PR template or review checklist:

> **Popularity scoring changes**: If this PR modifies score calculation logic in `popularity-score.ts`, `scheduled-popularity-update.ts`, or related files:
> - [ ] Bumped `ALGORITHM_VERSION` in `server/src/lib/popularity-score.ts`
> - [ ] Noted the version change in the PR description
> - [ ] Plan to run `--force` update after deployment to capture new baseline

### Version History Log

Maintain a simple version log in code comments or in this document:

| Version | Date | Description | PR |
|---------|------|-------------|----|
| 1.0 | (initial) | Current algorithm — baseline before any plan changes | — |

---

## Implementation Steps

1. **Add `ALGORITHM_VERSION` constant** to `server/src/lib/popularity-score.ts`
2. **Create migration** with three history tables + indexes using `npm run migrate:create`
3. **Modify scheduled update script** to insert history snapshots after each run
4. **Add `--force` flag** to bypass daily guard
5. **Add `--dry-run` guard** to skip snapshot recording
6. **Run initial baseline capture** to record current `v1.0` scores before any algorithm changes
7. **(Optional)** Add drift monitoring log output

---

## Dependencies

- None — this is foundational infrastructure that all other proposals depend on
- Must be deployed and baseline captured **before** Proposal 01 (bug fix) is deployed

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Migration fails in production | Low | Medium | Standard migration testing; tables are additive (no schema changes to existing tables) |
| History tables grow too large | Very Low | Low | ~500 MB/year; add retention policy if needed in 2+ years |
| Forgetting to bump version | Medium | Low | PR checklist; CI could lint for version changes when scoring files are modified |
| Snapshot insert slows cron run | Low | Low | Batch inserts; upsert is efficient with the unique index |
