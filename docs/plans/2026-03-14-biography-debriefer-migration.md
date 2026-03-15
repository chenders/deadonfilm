# Phase F: Biography Enrichment Migration to Debriefer

**Date**: 2026-03-14
**Status**: In progress
**Depends on**: Phase G (done — debriefer published to npm), PR #574 (feature parity fixes), PR #577 (reliability-weighted truncation)

## Mandate

**No features may be lost in deadonfilm as a result of this migration.** Every capability the old `BiographyEnrichmentOrchestrator` provided must work identically or better after migration. If a feature cannot be preserved in the initial PR, it must be tracked here and completed before this phase is marked done.

## Goal

Replace the self-contained `BiographyOrchestrator` (947 lines) with debriefer's `ResearchOrchestrator`, matching the pattern used for death enrichment. Include all infrastructure fixes from the start to avoid the feature regressions that plagued the death migration.

## Architecture

```
Admin UI / BullMQ Job / CLI Script
  → biography enrichment runner
    → createBioDebriefOrchestrator() → ResearchOrchestrator (debriefer)
      ├── debriefer-sources (28 shared: Wikipedia, Wikidata, news, search, archives)
      └── LegacySourceAdapter (9 biography-only: Britannica, Biography.com, TCM, etc.)
    → mapFindings() → RawBiographySourceData[]
    → biography Claude synthesis (existing claude-cleanup.ts)
    → biography DB writer (existing, unchanged)
```

Re-synthesis flow (preserved):
```
Admin route / CLI → resynthesizeFromCache()
  → Read cached raw sources from source_query_cache
  → Run Claude synthesis with updated prompt
  → Write to DB (no re-fetching)
```

## Infrastructure Included From Start

Lessons learned from death enrichment (PR #574):

- **Cache bridge**: Per-source findings written to `source_query_cache` via lifecycle hooks
- **Link following**: `fetchPage` callback using deadonfilm's full fallback chain (direct → archive.org → archive.is → browser + CAPTCHA solver → Readability extraction)
- **DDG CAPTCHA resilience**: DuckDuckGo routed through legacy source with Playwright stealth
- **Per-source log entries**: `LogEntryCollector` populates `bio_enrichment_run_actors.log_entries`
- **Per-source cost attribution**: Actual `costUsd` from findings, not even-split
- **Reliability-weighted truncation**: 60K total budget allocated by reliability score

## Feature Parity Checklist

Every feature from the old orchestrator must be preserved. Items marked with status:

| Feature | Old System | New System | Status |
|---------|-----------|------------|--------|
| Parallel actor processing | `ParallelBatchRunner` with configurable concurrency (1-20) | `ParallelBatchRunner` wired in batch handler and CLI | Done |
| Dual-threshold early stopping | confidence >= 0.6 AND reliability >= 0.6 | debriefer config `confidenceThreshold + reliabilityThreshold` | Done |
| SOURCE_FAMILY grouping | Wikimedia, books counted as one family for early stop | Debriefer handles source families | Done |
| BOOKS phase always tried | Runs even after early stop for unique archival content | Phase included but early stop behavior depends on debriefer | **VERIFY** |
| Re-synthesis from cache | `orchestrator.resynthesizeFromCache()` | Old orchestrator kept for this endpoint | Done |
| Golden test framework | 7 test actors, 0-100 scoring | Framework unchanged, uses new pipeline | Done |
| Biography keywords | Personal life keywords for confidence calculation | Legacy sources keep bio keywords; debriefer sources use their own | Done |
| Cache writes use BiographySourceType | `source_query_cache` entries use bio source types | Bio-specific cache bridge writes `BiographySourceType` values | Done |
| Per-source caching | Every source query cached in `source_query_cache` | Cache bridge writes per debriefer source | Done |
| Rate limiting coordination | Shared `SourceRateLimiter` across concurrent actors | Legacy sources keep their own; debriefer has internal limiting | Done |
| Haiku AI content cleaning | Stage 2 Haiku-based content filtering | Removed — death-tuned filter was wrong for biography. Full Wikipedia text used instead. | Done |
| RunLogger DB log stream | Structured logs to `run_logs` table | Removed — per-source logs via lifecycle hooks instead | **VERIFY** equivalence |
| CLI --concurrency flag | Respected by orchestrator | Wired to `ParallelBatchRunner` | Done |
| Admin concurrency setting | Configurable 1-20 in admin UI | Wired to `ParallelBatchRunner` in batch handler | Done |
| Unit test coverage | N/A (old orchestrator had its own tests) | 27 tests: finding-mapper (15) + source-cache-bridge (12) | Done |

## Items Fixed (Previously Blocking Merge)

All items resolved:

1. **Parallel actor processing**: ~~Sequential `for` loop~~ → `ParallelBatchRunner` in batch handler and CLI script. Concurrency 1-20 respected.
2. **Cache bridge source types**: ~~Death `DataSourceType` values~~ → Bio-specific `source-cache-bridge.ts` writes `BiographySourceType` values.
3. **CLI --concurrency**: Wired to `ParallelBatchRunner`.
4. **Unit tests**: 27 tests added (finding-mapper: 15, source-cache-bridge: 12).
5. **Haiku section filter**: ~~Death-tuned filter~~ → Removed. Full Wikipedia text used for biography.
6. **earlyStopThreshold default**: ~~3~~ → 5 (matches old orchestrator).
7. **--disable-haiku-cleanup flag**: Removed (no-op after migration).

## Source Mapping

### Debriefer-sources (28 shared)
Wikipedia, Wikidata, Google Search, Bing Search, Brave Search, DuckDuckGo, AP News, BBC News, Reuters, Guardian, NYTimes, NPR, Independent, Telegraph, Washington Post, LA Times, Time, New Yorker, PBS, Rolling Stone, National Geographic, People, Find a Grave, Legacy, Google Books, Open Library, Chronicling America, Trove, Europeana, Internet Archive

### Legacy adapters (9 biography-only)
Britannica, Biography.com, TCM, AllMusic, Smithsonian, History.com, IA Books (death source variant)

Note: DuckDuckGo uses legacy source (not debriefer) for CAPTCHA resilience.

## Phase Structure (7 phases)

| Phase | Name | Sources |
|-------|------|---------|
| 1 | Structured Data | Wikidata, Wikipedia (with bio section filter + person validator) |
| 2 | Reference Sites | Britannica, Biography.com, TCM, AllMusic (all legacy) |
| 3 | Books | Google Books, Open Library, IA Books (always tried even after early stop) |
| 4 | Web Search | Google Search, Bing Search, DuckDuckGo (legacy), Brave Search |
| 5 | News | 18 sources (AP, BBC, Guardian, NYT, Reuters, etc.) |
| 6 | Obituary | Find a Grave, Legacy |
| 7 | Archives | Internet Archive, Chronicling America, Trove, Europeana |

## Files

### Created
- `server/src/lib/biography-sources/debriefer/adapter.ts` — orchestrator builder with 7-phase structure
- `server/src/lib/biography-sources/debriefer/finding-mapper.ts` — ScoredFinding[] → bio source data
- `server/src/lib/biography-sources/debriefer/lifecycle-hooks.ts` — logging, NR events, cache bridge
- `server/src/lib/biography-sources/debriefer/legacy-source-adapter.ts` — wraps BaseBiographySource

### To Create
- `server/src/lib/biography-sources/debriefer/__tests__/adapter.test.ts`
- `server/src/lib/biography-sources/debriefer/__tests__/finding-mapper.test.ts`
- `server/src/lib/biography-sources/debriefer/__tests__/legacy-source-adapter.test.ts`
- `server/src/lib/biography-sources/debriefer/__tests__/lifecycle-hooks.test.ts`

### Modified
- `server/src/lib/biography-sources/claude-cleanup.ts` — 60K budget (up from 50K)
- `server/src/lib/biography-sources/types.ts` — UNMAPPED enum, logEntries on BiographyResult
- `server/src/lib/jobs/handlers/enrich-biographies-batch.ts` — uses new adapter
- `server/src/lib/jobs/handlers/enrich-biographies-batch.test.ts` — updated mocks
- `server/src/routes/admin/biography-enrichment.ts` — uses new adapter for enrichment + golden test
- `server/src/routes/admin/biography-enrichment.test.ts` — updated mocks
- `server/src/routes/admin/actors.ts` — inline bio enrichment uses new adapter
- `server/scripts/enrich-biographies.ts` — uses new adapter

### To Delete (after all features verified)
- `server/src/lib/biography-sources/orchestrator.ts` (947 lines) — currently kept for re-synthesis only

### Keep Unchanged
- `server/src/lib/biography-enrichment-db-writer.ts` — DB writer stays as-is
- `server/src/lib/biography/golden-test-cases.ts` — golden test framework stays
- `server/scripts/resynthesize-biographies.ts` — reads from cache, independent of orchestrator

## Testing Strategy

1. **Unit tests**: Adapter, finding-mapper, legacy-source-adapter, lifecycle-hooks (mirrors death enrichment test patterns)
2. **Golden tests**: Run 7-actor golden test suite, compare scores before/after migration
3. **Cost comparison**: Enrich same actor with old and new, compare costs
4. **Integration**: Admin UI inline enrichment, BullMQ batch job, CLI script

## Success Criteria

- **No feature regressions** — every capability from the old orchestrator works
- Golden test average score >= previous average (no quality regression)
- Per-actor cost within 20% of old system
- All existing admin UI features work (enrichment status, logs, batch jobs, concurrency setting)
- Re-synthesis from cache works
- Source cache entries appear in `source_query_cache` with correct `BiographySourceType` values
- Parallel actor processing respects the concurrency setting (1-20)
- Unit tests cover all 4 new adapter files
