# Parallel Enrichment Design

## Overview

Redesign both the death and biography enrichment systems to process actors and sources concurrently, and replace the death enrichment "first-wins" merge strategy with the "gather-all + Claude synthesis" approach already used by biography enrichment.

**Goals** (equal priority):
1. **Throughput**: ~10-15x faster batch processing via actor-level + source-level parallelism
2. **Quality**: Death enrichment always gathers from all available sources then synthesizes, producing richer cross-referenced results

## Architecture Changes

### 1. Death Enrichment: Remove First-Wins, Always Gather-All

Currently the death orchestrator has two modes: first-wins (default, fills fields from the first source that returns data) and gather-all (optional, accumulates raw data from all sources then sends to Claude synthesis). First-wins is removed entirely.

**New behavior:**
- Always accumulate `rawSources[]` from every source that returns data
- Early stopping between phases based on source family count (like biography's "3+ high-quality families"), NOT based on a single source filling a field
- Always call `claude-cleanup.ts` synthesis at the end
- `mergeEnrichmentData()` function removed
- `gatherAllSources` config flag removed (it's always gather-all)

**Cost impact:** Every actor pays for Claude synthesis (~$0.01-0.05). Previously actors with high-confidence structured data skipped synthesis. For a 1000-actor batch this adds ~$10-50 in Claude API costs but produces significantly better results.

### 2. Source Phase Groups (Both Systems)

Sources are organized into sequential **phases**. Sources within each phase run concurrently via `Promise.allSettled()`. Phases run sequentially so early stopping can be applied between phases.

| Phase | Death Sources | Biography Sources |
|-------|--------------|-------------------|
| 1: Structured Data | Wikidata, Wikipedia, BFI | Wikidata, Wikipedia |
| 2: Web Search | Google, Bing, DDG, Brave | Google, Bing, DDG, Brave |
| 3: Reference | — | Britannica, Bio.com, TCM, AllMusic |
| 4: Books | Google Books, Open Library, IA Books | Google Books, Open Library, IA Books |
| 5: News | Guardian, NYT, AP, Reuters, BBC, WaPo, LA Times, Rolling Stone, Telegraph, Independent, NPR, Time, PBS, New Yorker, Nat Geo, NewsAPI, Deadline, Variety, HR, TMZ, People, Google News RSS | Guardian, NYT, AP, Reuters, BBC, WaPo, LA Times, Rolling Stone, Telegraph, Independent, NPR, Time, PBS, New Yorker, Nat Geo, People, Smithsonian, History.com |
| 6: Obituary | Find a Grave, Legacy | Find a Grave, Legacy |
| 7: Archives | Trove, Europeana, IA, Chronicling America, FamilySearch | IA, Chronicling America, Trove, Europeana |
| 8: AI Models | Gemini → GPT (by ascending cost) | — (not used in biography) |

**Within-phase execution**: `Promise.allSettled()` fires all available sources in the phase concurrently. Each source still respects its own rate limit via the shared `SourceRateLimiter`.

**Between-phase early stopping**: After each phase completes, check source family count against threshold. If enough high-quality families collected, skip remaining phases. Per-actor cost limit also checked between phases.

**AI Models (Phase 8)**: Remain sequential within the phase because they're ordered by ascending cost — stop at the cheapest one that works.

### 3. Actor-Level Parallelism

Multiple actors are processed concurrently using a concurrency-limited batch runner (built on `p-limit` or `p-map`).

**Concurrency**: Configurable, default 5, range 1-20. Exposed via CLI `--concurrency <n>` and admin UI.

```
Batch of 100 actors, concurrency = 5:

Actor 1:  [Phase1] [Phase2] ... [Synthesis] [DB Write]
Actor 2:  [Phase1] [Phase2] ... [Synthesis] [DB Write]
Actor 3:  [Phase1] [Phase2] ... [Synthesis] [DB Write]
Actor 4:  [Phase1] [Phase2] ... [Synthesis] [DB Write]
Actor 5:  [Phase1] [Phase2] ... [Synthesis] [DB Write]
           ↓ actor 6 starts when any of 1-5 finishes
```

### 4. Shared Infrastructure

New module: `server/src/lib/shared/concurrency.ts`

**SourceRateLimiter** — Per-domain async rate limiter shared across all source instances. Uses an async queue per domain to prevent thundering herd (multiple callers sleeping the same duration then firing simultaneously). Each source declares its `domain` property and calls `rateLimiter.acquire(domain, minDelayMs)`.

**BatchCostTracker** — Synchronous cost accumulation with limit checking. Safe in Node's single-threaded event loop (no await between read and write). Tracks total batch cost, per-source cost breakdown.

**ParallelBatchRunner** — Generic concurrency-limited batch processor. Replaces the `for` loop in both enrichment systems. Handles: configurable concurrency via `p-limit`, cost limit checking after each item, abort signal propagation, progress callbacks.

### 5. Rate Limiting Model

Current: per-instance `lastRequestTime` on each source object (useless when multiple actors hit the same source concurrently).

New: shared `SourceRateLimiter` with per-domain queues. Sources that share an external domain (e.g., multiple news sources using DuckDuckGo site-search) share the same domain rate limit.

DuckDuckGo is a special bottleneck (~15+ sources depend on it). Limited to 2-3 concurrent DDG requests to prevent CAPTCHA triggers.

### 6. Progress Reporting

Current: `currentActorIndex` / `currentActorName` (assumes sequential processing).

New:
```typescript
interface EnrichmentProgress {
  actorsInFlight: number      // Currently being processed
  actorsCompleted: number     // Finished (success or skip)
  actorsEnriched: number      // Finished with data
  actorsWithDeathPage: number // Has substantive content (death only)
  totalCostUsd: number
  phase: "processing" | "completed"
}
```

Admin UI changes from "Processing actor 47/100: John Wayne" to "Processing 5 actors (47/100 completed)".

## Files Changed

### New Files
| File | Purpose |
|------|---------|
| `server/src/lib/shared/concurrency.ts` | `SourceRateLimiter`, `BatchCostTracker`, `ParallelBatchRunner` |
| `server/src/lib/shared/concurrency.test.ts` | Tests for all three utilities |

### Death Enrichment
| File | Change |
|------|--------|
| `orchestrator.ts` | Remove `mergeEnrichmentData()`. Remove first-wins/gather-all branching. Always accumulate + synthesize. Organize sources into phase groups. `Promise.allSettled()` within phases. |
| `base-source.ts` | Replace internal `waitForRateLimit()` with shared `SourceRateLimiter`. Add `domain` property. |
| `types.ts` | Add `SourcePhase` enum. Add `concurrency` to config. Remove `gatherAllSources`. |
| `enrichment-runner.ts` | Replace `for` loop with `ParallelBatchRunner`. Update progress model. |
| Each source file | Add `domain` property. |

### Biography Enrichment
| File | Change |
|------|--------|
| `orchestrator.ts` | Organize sources into phase groups. `Promise.allSettled()` within phases. Replace actor loop with `ParallelBatchRunner`. Remove 500ms inter-actor delay. |
| `base-source.ts` | Replace `waitForRateLimit()` with shared `SourceRateLimiter`. Add `domain` property. |
| `types.ts` | Add `SourcePhase` enum. Add `concurrency` to config. |
| Each source file | Add `domain` property. |

### Batch Job Handlers
| File | Change |
|------|--------|
| `enrich-death-details-batch.ts` | Pass `concurrency` from job payload. Update progress reporting. |
| `enrich-biographies-batch.ts` | Pass `concurrency` from job payload. Update progress reporting. |

### CLI Scripts
| File | Change |
|------|--------|
| `enrich-death-details.ts` | Add `--concurrency <n>` option (default 5). |
| `enrich-biographies.ts` | Add `--concurrency <n>` option (default 5). |

### Admin UI
| File | Change |
|------|--------|
| `EnrichmentRunDetailsPage.tsx` | Updated progress display. |
| `BioEnrichmentRunDetailsPage.tsx` | Updated progress display. |
| Enrichment config forms | Add concurrency config. |

### Unchanged
| File | Why |
|------|-----|
| `claude-cleanup.ts` (both) | Already handles multi-source synthesis |
| `content-cleaner.ts` | Stateless, per-source |
| `biography-enrichment-db-writer.ts` | Uses `ON CONFLICT`, already safe for concurrent writes |
| Redis caching layer | Already thread-safe |

## Implementation Order

| Step | Description | Risk | Rollback |
|------|-------------|------|----------|
| 1 | Shared infrastructure (`concurrency.ts`) | None — new code, fully tested | Delete file |
| 2 | Death: remove first-wins, always gather-all | Quality change, no parallelism yet | Revert commit |
| 3 | Source phase grouping (both systems) | Restructuring only, no behavior change | Revert commit |
| 4 | Source-level parallelism (`Promise.allSettled` within phases) | First parallelism — test with concurrency=1 actor | Config flag `sourceParallelism: false` |
| 5 | Actor-level parallelism (`ParallelBatchRunner`) | Full parallelism — start with concurrency=2 | Set `concurrency: 1` |
| 6 | UI/CLI updates (progress model, concurrency config) | Cosmetic | Revert commit |

Each step is independently deployable and testable.

## Estimated Throughput Impact

| Batch Size | Current (sequential) | After (concurrency=5) | Improvement |
|-----------|---------------------|----------------------|-------------|
| 10 actors | ~5-10 min | ~30-60s | ~10x |
| 100 actors | ~50-100 min | ~5-10 min | ~10x |
| 1000 actors | ~8-16 hrs | ~30-60 min | ~15x |

Actor parallelism provides ~5x, source-phase parallelism provides ~2-3x per actor, together ~10-15x.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| External API rate limit violations (429s) | Medium | Low | Per-domain semaphore. Start conservative. Monitor 429 rates. |
| DuckDuckGo CAPTCHA increase | Medium | Medium | Limit DDG concurrency to 2-3. Browser fallback exists. |
| Claude synthesis cost increase (death) | Certain | Low | Expected. Cost limits still enforced. ~$0.01-0.05/actor. |
| Race condition in cost tracking | Low | Medium | Synchronous check-and-update in single-threaded Node. |
| Batch cost overshoot | Low | Low | At most N-1 actors over limit (where N is concurrency). Acceptable. |

## Testing Strategy

| Component | Test Approach |
|-----------|---------------|
| `SourceRateLimiter` | Verify same-domain spacing. Verify cross-domain parallelism. Verify thundering herd prevention. |
| `BatchCostTracker` | Verify atomic accumulation and limit checking. |
| `ParallelBatchRunner` | Verify concurrency limit, cost limit stops, abort signal, progress callbacks. |
| Death gather-all | Run 10-20 known actors. Compare quality vs first-wins. Verify Claude synthesis cost. |
| Source phase parallelism | Single actor with concurrency=1. Verify overlapping timestamps in phase. Verify rate limits. |
| Actor parallelism | 10-actor batch with concurrency=3. Verify no duplicate writes. Verify progress counts. |
| Load test | 20-actor batch with concurrency=10. Monitor external API 429 rates. |
