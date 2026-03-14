---
globs: ["server/src/lib/shared/**", "server/src/lib/jobs/**", "server/src/lib/claude-batch/**", "server/src/lib/entity-linker/**", "server/src/lib/enrichment-*.ts", "server/src/lib/bio-enrichment-*.ts", "server/src/lib/run-logger.ts", "server/src/lib/newrelic-cli.ts"]
---
# Shared Enrichment Infrastructure

The death and biography enrichment systems share significant infrastructure. This documents the generic layer that both systems build on.

## Shared Utilities (`server/src/lib/shared/`)

| File | Purpose | Domain Coupling |
|------|---------|-----------------|
| `concurrency.ts` | `SourceRateLimiter` (per-key async queue), `BatchCostTracker`, `ParallelBatchRunner<T,R>`, `withTimeout<T>`, `SourcePhase` enum | `SourcePhase` has domain-specific phase names but is otherwise generic |
| `duckduckgo-search.ts` | Multi-tier DDG search: fetch → Playwright stealth → CAPTCHA solver. Also `webSearch()` with Google CSE fallback | Lazy-imports `browser-fetch.js` and `browser-auth/` from `death-sources/` |
| `readability-extract.ts` | `@mozilla/readability` + `jsdom` wrapper → `ArticleExtractionResult` | Zero coupling — fully generic |
| `sanitize-source-text.ts` | Regex pipeline for Wikipedia/web text artifacts | Zero coupling — Wikipedia-biased patterns are useful defaults |
| `fetch-page-with-fallbacks.ts` | 4-step fetch chain: direct → archive.org → archive.is (HTTP) → archive.is (browser+solver) | Lazy-imports from `death-sources/` for archive fallback |
| `google-books-api.ts` | Google Books API v1 client | Imports `decodeHtmlEntities` from `death-sources/html-utils.ts` |
| `open-library-api.ts` | Open Library API client | Zero coupling |
| `ia-books-api.ts` | Internet Archive search + OCR | Zero coupling |
| `search-utils.ts` | `splitSearchWords()` string utility | Zero coupling |

## Architecture Pattern (Both Systems)

Both enrichment systems follow the same layered architecture:

```
CLI Script / Admin Route → Config construction, subject selection
       ↓
ProcessManager           → Creates run record in DB, enqueues BullMQ job
       ↓
BullMQ Job Handler       → Progress callback, RunLogger wiring, cost tracking
       ↓
Orchestrator             → Phase execution, early stopping, source coordination
       ↓
BaseSource               → Rate limiting, caching, confidence scoring
       ↓
Claude Synthesis         → Gather-all raw data → AI synthesis → structured output
       ↓
DB Writer                → COALESCE upsert preserving existing non-null values
       ↓
Post-Processing          → Entity linking (death), cache invalidation (both)
```

## Source Plugin Pattern

Both `BaseDataSource` (death) and `BaseBiographySource` (bio) implement the same interface:

- **Shared behavior**: caching via `source_query_cache` table, rate limiting via `SourceRateLimiter`, timeout signal creation, `calculateConfidence()` algorithm (identical in both)
- **Each source declares**: `name`, `type` (enum value), `isFree`, `estimatedCostPerQuery`, `reliabilityTier`, `reliabilityScore`, `domain` (for rate limit coordination)
- **Sources override**: `isAvailable()` (check env vars), `lookup(subject)` (actual data fetching)

**Known wart**: Bio base class casts `this.type as unknown as DataSourceType` for every cache call because the cache module is typed to `DataSourceType`. Both share the same `source_query_cache` table.

## Orchestrator Pattern

Both orchestrators execute identically:
1. Initialize sources filtered by category flags and `isAvailable()`
2. Inject shared `SourceRateLimiter` into all sources
3. For each subject: iterate phases sequentially, within each phase `Promise.allSettled()` all sources concurrently
4. Accumulate all raw source data into `rawSources[]`
5. Check early-stopping between phases (source family count threshold)
6. Send all accumulated data to Claude synthesis
7. Return structured output

**Key difference**: Death orchestrator has link-follow config injection and AI models phase (sequential by ascending cost). Biography orchestrator has `resynthesizeFromCache()` and a `SOURCE_FAMILIES` grouping concept.

## Operational Infrastructure

### Run Tracking Tables

| Table | System | Key Fields |
|-------|--------|------------|
| `enrichment_runs` | Death | config, status, progress, costs, exit_reason, source_hit_rates (JSONB) |
| `enrichment_run_actors` | Death | sources_attempted (JSONB array), winning_source, confidence, cost |
| `bio_enrichment_runs` | Bio | Same + `source_cost_usd`, `synthesis_cost_usd` split |
| `bio_enrichment_run_actors` | Bio | Same + `log_entries` (JSONB) for per-actor debug logs |
| `run_logs` | Both | Structured log stream, filterable by level/source/timestamp |
| `source_query_cache` | Both | Per-source per-subject cached results with gzip compression |
| `job_runs` | Both | BullMQ job lifecycle tracking |
| `job_dead_letter` | Both | Failed jobs that exhausted retries |

### RunLogger (`server/src/lib/run-logger.ts`)

Shared by both systems. Constructor: `(runType, runId)`. Auto-flushes at 50 entries. Dual output: console + batched DB insert to `run_logs`. Wired via `orchestrator.setRunLogger(runLogger)`.

### Process Managers

| File | Purpose |
|------|---------|
| `enrichment-process-manager.ts` | Creates `enrichment_runs` record → enqueues BullMQ job → cancel support |
| `bio-enrichment-process-manager.ts` | Same pattern for `bio_enrichment_runs` |

### DB Writer Pattern

Both writers use `ON CONFLICT ... DO UPDATE SET field = COALESCE(EXCLUDED.field, table.field)` to preserve existing non-null values. Empty arrays MUST be converted to `null` before SQL for COALESCE to work. Death writer has staging/review workflow (`writeToStaging`); bio writer stubs it.

### Claude Batch API (`server/src/lib/claude-batch/`)

Asynchronous batch processing for large-scale enrichment:
- `batch-operations.ts`: File-based checkpoint state machine (submit → poll → process)
- `prompt-builder.ts`: Structured prompt construction
- `response-parser.ts`: JSON extraction with `jsonrepair` for malformed responses
- `actor-updater.ts`: Maps parsed fields to DB writes
- `failure-recovery.ts`: Stores JSON parse failures for reprocessing

### Entity Linker (`server/src/lib/entity-linker/`)

Post-processing step after synthesis: finds actor name mentions in narrative text, stores as `entity_links` JSONB for frontend rendering as clickable links. Uses exact + fuzzy matching.

### New Relic Integration

Hardwired throughout (not behind an interface). Key patterns:
- `withNewRelicTransaction()` in `newrelic-cli.ts` wraps CLI scripts
- `newrelic.recordCustomEvent()` at job lifecycle events, batch milestones, DB writes
- `newrelic.startSegment()` for fine-grained APM tracing in DB writers
- Periodic metrics push from `jobs/monitoring.ts`

### Quality Scoring (`server/src/lib/biography/golden-test-cases.ts`)

7 test actors with known facts. Scoring: fact recall (70pts) + factor accuracy (20pts) - unwanted content penalty (10pts). The scoring algorithm is generic; the test cases are domain-specific.

## Key Scripts

| Script | Purpose | Generic vs Domain-Specific |
|--------|---------|---------------------------|
| `enrich-death-details.ts` | Main death enrichment CLI | Config construction is generic; actor queries are domain-specific |
| `enrich-biographies.ts` | Main bio enrichment CLI | Same pattern as death |
| `resynthesize-biographies.ts` | Re-run Claude synthesis from cached sources | Generic pattern (re-synthesis from cache) |
| `run-cause-of-death-batch.ts` | Continuous batch runner with SIGINT handling | Generic submit→poll→process loop |
| `analyze-enrichment-sources.ts` | Source hit rates, marginal value, redundancy analysis | Generic analytics on JSONB schemas |

## Cross-System Dependencies

These files in `death-sources/` are used by biography sources or shared utilities:
- `death-sources/cache.ts` — shared cache module (bio casts types to use it)
- `death-sources/html-utils.ts` — `htmlToText()`, `decodeHtmlEntities()` used broadly
- `death-sources/browser-fetch.ts` — Playwright browser pool, lazy-imported by shared utils
- `death-sources/browser-auth/` — CAPTCHA solving, lazy-imported by shared utils
- `death-sources/archive-fallback.ts` — archive.org fallback, lazy-imported by shared utils
- `death-sources/types.ts` — `ReliabilityTier` enum and `RELIABILITY_SCORES` used by both systems
