# Debriefer Integration Master Plan

**Date**: 2026-03-12
**Branch**: `test-debriefer-integration` (PR #567)
**Test environment**: `http://megadude:3001`

This plan consolidates all debriefer integration work for deadonfilm. It supersedes the individual plans that were created during development.

---

## Status Overview

| Phase | Description | Status |
|-------|-------------|--------|
| A | Death enrichment refactor | Done |
| B | Debriefer API gaps | Done (debriefer side) |
| C | Death integration gaps (deadonfilm) | **In progress** |
| D | Job handler migration + cleanup | Not started |
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
- [x] Wikipedia person validation (`validatePerson` callback) — for birth/death year verification
- [x] Link following configuration (`maxLinksToFollow`, `linkSelector`, `fetchPage` callbacks) — debriefer PR #15

**Pinned debriefer SHA**: `eb8232db95b7d53d29f135000f53922984d58f2e`

---

## Phase C: Death Integration Gaps — Deadonfilm Side (IN PROGRESS)

These wire up debriefer features that exist but aren't connected yet in deadonfilm.

### C1: Wikipedia `validatePerson` Wiring
**Priority**: High | **Effort**: Small | **Status**: Not started

Debriefer's `WikipediaOptions.validatePerson` callback exists but deadonfilm doesn't pass one. The old orchestrator used Gemini Flash to validate birth/death years from Wikipedia intro text.

**What to do:**
- Create `server/src/lib/death-sources/debriefer/person-validator.ts`
  - Returns a `validatePerson` callback that extracts birth/death years from article text (regex) and compares against `subject.context.birthday`/`subject.context.deathday`
- Modify `server/src/lib/death-sources/debriefer/adapter.ts` — pass `validatePerson` to `wikipedia()`

### C2: Lifecycle Hooks for Observability
**Priority**: Medium | **Effort**: Small | **Status**: Not started

Debriefer's `ResearchOrchestrator` accepts `LifecycleHooks` with 13 optional callbacks. Deadonfilm doesn't wire any, losing observability from the old orchestrator (New Relic, RunLogger).

**What to do:**
- Create `server/src/lib/death-sources/debriefer/lifecycle-hooks.ts`
  - `onSourceAttempt` / `onSourceComplete` → Pino logging
  - `onEarlyStop` → Log reason
  - `onSubjectComplete` → New Relic custom event (if available)
- Modify `server/src/lib/death-sources/debriefer/adapter.ts` — accept hooks option, pass to `debrief()`

---

## Phase D: Job Handler Migration + Cleanup (NOT STARTED)

### D1: BullMQ Job Handler Migration
**Priority**: Medium | **Effort**: Small | **Status**: Not started

The BullMQ job handler at `server/src/lib/jobs/handlers/enrich-death-details.ts` still uses the old `DeathEnrichmentOrchestrator` directly. It should use `EnrichmentRunner` (which now uses debriefer).

**What to do:**
- Update `server/src/lib/jobs/handlers/enrich-death-details.ts` to construct an `EnrichmentRunner`
- Remove the direct `DeathEnrichmentOrchestrator` import
- This is the last consumer of the old orchestrator

### D2: Remove Old Orchestrator
**Priority**: Low | **Effort**: Small | **Status**: Blocked on D1

Once the BullMQ handler is migrated, the old orchestrator is dead code.

**What to do:**
- Remove or deprecate `server/src/lib/death-sources/orchestrator.ts`
- Remove unused exports from `server/src/lib/death-sources/index.ts`
- Remove `StatusBar` and related dead code

---

## Phase E: Test & Verify (NOT STARTED)

Validate the integration on the test environment before merging to main.

- [ ] Run death enrichment on test environment against a batch of actors
- [ ] Compare results with production enrichment output (spot-check quality)
- [ ] Verify admin dashboard enrichment UI works on `:3001`
- [ ] Run enrichment via BullMQ job (after D1)
- [ ] Check source hit rates and cost attribution in admin analytics
- [ ] Verify no regressions in CI (all tests pass)

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

### Docker Build (file: deps)
- `npm ci` creates symlinks for `file:` deps — full debriefer monorepo must be COPY'd to both build and production stages in `Dockerfile.test`
- The `test-latest` Docker tag uses a separate buildcache (`buildcache-test`)

### CI
- Backend build/test jobs clone debriefer at pinned SHA before `npm ci`
- Debriefer SHA: `eb8232db95b7d53d29f135000f53922984d58f2e`

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
