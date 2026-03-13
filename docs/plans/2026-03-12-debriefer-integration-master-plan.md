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
| D | Job handler migration + cleanup | **Done** |
| E | Test & verify on test environment | **Done** |
| F | Biography enrichment migration | Not started |
| G | Publish debriefer to npm | **Done** |

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

## Phase D: Job Handler Migration + Cleanup (DONE)

### D1: BullMQ Job Handler Migration (DONE — PR #571)
- [x] Rewrite `enrich-death-details.ts` to use `EnrichmentRunner` with `actorIds: [actorId]`
- [x] Remove `DeathEnrichmentOrchestrator` import (last consumer)
- [x] 9 tests

### D2: Remove Old Orchestrator + CLI Scripts (DONE — PR #572)
- [x] Remove `server/src/lib/death-sources/orchestrator.ts` (1,394 lines)
- [x] Remove `server/src/lib/death-sources/orchestrator.test.ts` (243 lines)
- [x] Remove `server/scripts/enrich-death-details.ts` (1,404 lines) — replaced by admin UI
- [x] Remove `server/scripts/test-browser-auth.ts` (474 lines)
- [x] Migrate inline enrichment endpoint to `EnrichmentRunner`
- [x] StatusBar and EnrichmentLogger confirmed still in active use (not dead code)

---

## Phase E: Test & Verify on Test Environment (DONE)

Validated on `http://megadude:3001` with production clone database.

- [x] Test deployment healthy (all services running)
- [x] Single-actor inline enrichment: 3 sources, 37s, no errors
- [x] Batch enrichment (5 actors): 5/5 enriched, $0.92 cost, 0 errors
- [x] Quality verified (Maggie Smith, Kris Kristofferson): rich narratives, correct locations, entity linking
- [x] All CI checks pass

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

## Phase G: Publish Debriefer to npm (DONE)

Published `debriefer` and `debriefer-sources` to npm with provenance attestation.

- [x] Published `debriefer@1.0.1` and `debriefer-sources@1.0.1` to npm (with SLSA provenance)
- [x] Added publish workflow (`.github/workflows/publish.yml` in debriefer repo) triggered by GitHub Release
- [x] Updated `server/package.json` to use `^1.0.1` instead of `file:` paths
- [x] Deleted `Dockerfile.test` (standard `Dockerfile` works for both prod and test)
- [x] Removed debriefer clone steps from `ci.yml`, `deploy.yml`, and `deploy-test.yml`
- [x] Removed debriefer COPY lines from `Dockerfile`
- [x] No more pinned SHA management

---

## Infrastructure Notes

### Test Deployment
- `test-*` branches auto-deploy to `http://megadude:3001` via `.github/workflows/deploy-test.yml`
- Uses standard `Dockerfile` (same as production)

### Test Database
- Full production clone restored via `pg_dump -Fc` / `pg_restore`
- Port 5438, database name `deadonfilm_test`
- To reset: `docker compose stop app worker cron` → drop/recreate DB → `pg_restore` → restart

### Debriefer Packages
- Published to npm: `debriefer@^1.0.1`, `debriefer-sources@^1.0.1`
- Source: github.com/chenders/debriefer
- Publish workflow: create a GitHub Release → auto-publishes with provenance
- NPM_TOKEN secret in debriefer repo (90-day granular token, expires ~June 2026)

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
