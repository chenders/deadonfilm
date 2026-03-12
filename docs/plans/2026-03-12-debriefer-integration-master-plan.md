# Debriefer Integration Master Plan

**Date**: 2026-03-12
**Branch**: `test-debriefer-integration` (PR #567)
**Test environment**: `http://megadude:3001`
**Test database**: Full production clone on port 5438

This plan consolidates all debriefer integration work for deadonfilm. It supersedes the individual plans that were created during development.

---

## Status Overview

| Phase | Description | Status |
|-------|-------------|--------|
| A | Death enrichment refactor | Done |
| B | Debriefer API gaps | Done (debriefer side) |
| C | Death integration gaps (deadonfilm) | Done |
| D | Job handler migration + cleanup | **In progress** (D1 done, D2 pending) |
| E | Test & verify on test environment | Not started |
| F | Biography enrichment migration | Not started |
| G | Publish debriefer to npm | Not started |

---

## Phase A: Death Enrichment Refactor (DONE)

Replaced `DeathEnrichmentOrchestrator` with debriefer's `ResearchOrchestrator`.

- [x] Add debriefer + debriefer-sources as `file:` path dependencies
- [x] Create `finding-mapper.ts` — maps `ScoredFinding[]` → `RawSourceData[]`
- [x] Create `legacy-source-adapter.ts` — wraps deadonfilm `BaseDataSource` as debriefer `BaseResearchSource`
- [x] Create `adapter.ts` — builds `ResearchOrchestrator` with 8-phase structure (27 debriefer-sources + 17 legacy adapters)
- [x] Create `haiku-section-selector.ts` — Claude Haiku-based Wikipedia section filter
- [x] Modify `enrichment-runner.ts` — use `debriefActor()` instead of old orchestrator
- [x] Update tests (41 new/updated, 5,586 total pass)

**Architecture:**
```
CLI Script / Job Handler → EnrichmentRunner
  → debriefActor() → ResearchOrchestrator (NoopSynthesizer)
    ├── debriefer-sources (27 standard sources)
    └── LegacySourceAdapter (17 deadonfilm-only sources)
  → mapFindings() → RawSourceData[]
  → cleanupWithClaude() (existing, unchanged)
  → DB writer (existing, unchanged)
```

---

## Phase B: Debriefer API Gaps (DONE)

Changes made in the debriefer repo to support deadonfilm's needs.

- [x] Sequential phase execution (`sequential: true` on `SourcePhaseGroup`) — for cost-controlled AI model phases
- [x] Async Wikipedia section filter (`asyncSectionFilter` callback) — for AI-based section selection
- [x] Wikipedia person validation (`validatePerson` callback) — for birth/death year verification (debriefer PR #17)
- [x] Link following configuration (`maxLinksToFollow`, `linkSelector`, `fetchPage` callbacks) — debriefer PR #15

**Pinned debriefer SHA**: See `.github/workflows/ci.yml` and `.github/workflows/deploy-test.yml` — update all references together when bumping.

---

## Phase C: Death Integration Gaps — Deadonfilm Side (DONE)

### C1: Wikipedia `validatePerson` Wiring (DONE — PR #569)
- [x] Create `person-validator.ts` — AI (Gemini Flash) + regex fallback + 1-year tolerance
- [x] Wire into `adapter.ts` with 8 disambiguation suffixes
- [x] Add `useAIDateValidation` config flag
- [x] 20 tests

### C2: Lifecycle Hooks for Observability (DONE — PR #570)
- [x] Create `lifecycle-hooks.ts` — per-subject Pino logging + New Relic events
- [x] Wire into `adapter.ts` via `orchestrator.debrief(subject, { hooks })`
- [x] 6 tests

---

## Phase D: Job Handler Migration + Cleanup (IN PROGRESS)

### D1: BullMQ Job Handler Migration (DONE — PR #571)
- [x] Rewrite `enrich-death-details.ts` to use `EnrichmentRunner` with `actorIds: [actorId]`
- [x] Remove `DeathEnrichmentOrchestrator` import (last consumer)
- [x] 9 tests

### D2: Remove Old Orchestrator
**Priority**: Low | **Effort**: Small | **Status**: Not started (blocked on D1 merge)

- [ ] Remove or deprecate `server/src/lib/death-sources/orchestrator.ts`
- [ ] Remove unused exports from `server/src/lib/death-sources/index.ts`
- [ ] Remove `StatusBar` and related dead code
- [ ] Remove `EnrichmentLogger` if no longer used

**Test checkpoint after D2**: Deploy to test environment, run a quick smoke test (enrich 1 actor via admin UI) to verify the old orchestrator removal didn't break anything.

---

## Phase E: Test & Verify on Test Environment (NOT STARTED)

Validate the integration on `http://megadude:3001` before merging `test-debriefer-integration` to main. The test database is a full production clone.

### E1: CLI Enrichment Smoke Test
**When**: After D2 is merged
**How**: SSH to server, exec into the test app container, run the enrichment script

```bash
docker exec -it deadonfilm-test-app sh -c \
  "cd /app/server && node dist/scripts/enrich-death-details.js --actor-id 2157 --limit 1"
```

**Verify**:
- [ ] Script runs without errors
- [ ] Sources are attempted (check Pino logs for lifecycle hook output)
- [ ] Claude cleanup produces structured data
- [ ] Data is written to `actor_death_circumstances` table
- [ ] Cost is tracked correctly

### E2: Admin UI Single-Actor Enrichment
**When**: After E1 passes
**How**: Open `http://megadude:3001/admin` → find an actor → click "Enrich"

**Verify**:
- [ ] Enrichment starts without errors
- [ ] Progress updates appear in the UI
- [ ] Results are visible on the actor's page
- [ ] Death page (`/actor/{slug}/death`) renders correctly

### E3: Admin UI Batch Enrichment (Small Batch)
**When**: After E2 passes
**How**: Admin dashboard → Enrichment tab → start a batch with limit=5

**Verify**:
- [ ] Batch job starts and appears in BullMQ queue (Bull Board at `/admin/bull-board`)
- [ ] Progress updates in the enrichment run details page
- [ ] All 5 actors processed (check `enrichment_runs` table)
- [ ] Source hit rates populated in the run summary
- [ ] Cost tracking matches expectations

### E4: Quality Comparison
**When**: After E3 passes
**How**: Pick 3-5 actors that were enriched in production, re-enrich on test, compare

**Verify**:
- [ ] Circumstances narratives are comparable quality
- [ ] Notable factors are being extracted
- [ ] Confidence levels are reasonable
- [ ] No regressions in cause-of-death extraction
- [ ] Sources attribution looks correct

### E5: Full CI Verification
**When**: Before merging to main

**Verify**:
- [ ] All CI checks pass on `test-debriefer-integration`
- [ ] No test regressions (full test suite)
- [ ] E2E tests pass

---

## Phase F: Biography Enrichment Migration (NOT STARTED)

Separate effort after death enrichment is stable on main. Same pattern as Phase A but for the biography pipeline.

- [ ] Create `server/src/lib/biography-sources/debriefer-adapter.ts`
- [ ] Map `ActorForBiography` → `ResearchSubject`
- [ ] Wrap biography-only sources as `BaseResearchSource` instances
- [ ] Provide biography synthesis prompt to `ClaudeSynthesizer` (or keep `NoopSynthesizer` + existing claude-cleanup)
- [ ] Run golden tests to verify quality
- [ ] Remove old biography orchestrator

---

## Phase G: Publish Debriefer to npm (NOT STARTED)

Once debriefer is stable, publish to npm and switch from `file:` path deps. This eliminates the need for `Dockerfile.test`, the debriefer clone step in CI, and simplifies the Docker build.

- [ ] Publish `debriefer` and `debriefer-sources` to npm
- [ ] Update `server/package.json` to use npm versions
- [ ] Remove `Dockerfile.test` (use standard `Dockerfile`)
- [ ] Remove debriefer clone steps from CI and deploy workflows
- [ ] Update pinned SHA references

---

## Infrastructure Notes

### Test Deployment
- `test-*` branches auto-deploy to `http://megadude:3001` via `.github/workflows/deploy-test.yml`
- Uses `Dockerfile.test` which clones debriefer into the Docker build context
- Debriefer SHA pinned in both `ci.yml` and `deploy-test.yml` — update both when bumping

### Test Database
- Full production clone restored via `pg_dump -Fc` / `pg_restore`
- Port 5438, database name `deadonfilm_test`
- To reset: `docker compose stop app worker cron` → drop/recreate DB → `pg_restore` → restart

### Docker Build (file: deps)
- `npm ci` creates symlinks for `file:` deps — full debriefer monorepo must be COPY'd to both build and production stages in `Dockerfile.test`
- The `test-latest` Docker tag uses a separate buildcache (`buildcache-test`)

### CI
- Backend build/test jobs clone debriefer at pinned SHA before `npm ci`
- Debriefer SHA is pinned in `.github/workflows/ci.yml` and `.github/workflows/deploy-test.yml` — update all references together when bumping

---

## Superseded Plans

This plan consolidates and supersedes:
- `docs/plans/2026-03-07-debriefer-platform-vision.md` (vision doc — keep as reference)
- `docs/plans/2026-03-07-debriefer-design.md` (design doc — keep as reference)
- `docs/plans/2026-03-07-debriefer-implementation-plan.md` (phases 1-11 — replaced by this plan for deadonfilm scope)
- Debriefer repo: `docs/plans/2026-03-10-deadonfilm-integration-design.md` (v1 design — done)
- Debriefer repo: `docs/plans/2026-03-10-deadonfilm-integration-implementation.md` (v1 impl — done)
- Debriefer repo: `docs/plans/2026-03-11-deadonfilm-integration-gaps.md` (gaps — done, merged into debriefer)
- Debriefer repo: `docs/plans/2026-03-12-deadonfilm-integration-v2.md` (v2 gaps — merged into Phase C/D above)
