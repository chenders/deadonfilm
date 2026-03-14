# Phase F: Biography Enrichment Migration to Debriefer

**Date**: 2026-03-14
**Status**: In progress
**Depends on**: Phase G (done — debriefer published to npm), PR #574 (feature parity fixes), PR #577 (reliability-weighted truncation)

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

## Biography-Specific Features to Preserve

| Feature | Description | Implementation |
|---------|-------------|----------------|
| Dual-threshold early stopping | Requires BOTH confidence >= 0.6 AND reliability >= 0.6 | debriefer config: `confidenceThreshold: 0.6, reliabilityThreshold: 0.6` |
| SOURCE_FAMILY grouping | Wikimedia (Wikidata + Wikipedia) count as one family for early stop | Map to debriefer's source family concept |
| BOOKS phase always tried | Books phase runs even after early stop | Phase config or post-early-stop hook |
| Re-synthesis from cache | Re-run Claude synthesis without re-fetching sources | Standalone function reading from `source_query_cache` |
| Golden test framework | 7 test actors with fact recall scoring (0-100) | Runs against new adapter, compare scores |
| Biography keywords | Personal life keywords for confidence calculation | Debriefer-sources use their own confidence; legacy sources keep bio keywords |

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

### Create
- `server/src/lib/biography-sources/debriefer/adapter.ts` — orchestrator builder with 7-phase structure
- `server/src/lib/biography-sources/debriefer/finding-mapper.ts` — ScoredFinding[] → bio source data
- `server/src/lib/biography-sources/debriefer/lifecycle-hooks.ts` — logging, NR events, cache bridge
- `server/src/lib/biography-sources/debriefer/__tests__/adapter.test.ts`
- `server/src/lib/biography-sources/debriefer/__tests__/finding-mapper.test.ts`

### Modify
- `server/src/lib/biography-sources/claude-cleanup.ts` — add reliability-weighted truncation
- `server/src/lib/jobs/handlers/enrich-biographies-batch.ts` — use new adapter
- `server/src/routes/admin/biography-enrichment.ts` — use new adapter for inline enrichment
- `server/scripts/enrich-biographies.ts` — use new adapter

### Delete
- `server/src/lib/biography-sources/orchestrator.ts` (947 lines)

### Keep unchanged
- `server/src/lib/biography-enrichment-db-writer.ts` — DB writer stays as-is
- `server/src/lib/biography/golden-test-cases.ts` — golden test framework stays
- `server/scripts/resynthesize-biographies.ts` — reads from cache, independent of orchestrator

## Consumers to Migrate

1. `scripts/enrich-biographies.ts` — CLI script (Commander.js)
2. `src/lib/jobs/handlers/enrich-biographies-batch.ts` — BullMQ batch handler
3. `src/routes/admin/biography-enrichment.ts` — admin routes (inline + batch)

## Testing Strategy

1. **Unit tests**: Adapter, finding-mapper (mirrors death enrichment test patterns)
2. **Golden tests**: Run 7-actor golden test suite, compare scores before/after migration
3. **Cost comparison**: Enrich same actor with old and new, compare costs
4. **Integration**: Admin UI inline enrichment, BullMQ batch job, CLI script

## Success Criteria

- Golden test average score >= previous average (no quality regression)
- Per-actor cost within 20% of old system
- All existing admin UI features work (enrichment status, logs, batch jobs)
- Re-synthesis from cache works
- Source cache entries appear in `source_query_cache` for debriefer sources
