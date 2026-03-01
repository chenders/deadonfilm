# Parallel Enrichment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Parallelize both enrichment systems (actor-level + source-level) and replace death enrichment's first-wins with gather-all + Claude synthesis.

**Architecture:** Shared concurrency utilities (`SourceRateLimiter`, `BatchCostTracker`, `ParallelBatchRunner`) in `server/src/lib/shared/concurrency.ts`. Both orchestrators organize sources into sequential phases with `Promise.allSettled()` within each phase. `ParallelBatchRunner` wraps the actor loop with configurable concurrency (default 5). Death enrichment removes `mergeEnrichmentData()` and always accumulates raw sources for Claude synthesis.

**Tech Stack:** TypeScript, `p-limit` (new dependency), Vitest, existing orchestrators/base sources

**Design Doc:** `docs/plans/2026-03-01-parallel-enrichment-design.md`

---

## Task 1: Install `p-limit` Dependency

**Files:**
- Modify: `server/package.json`

**Step 1: Install p-limit**

```bash
cd server && npm install p-limit
```

`p-limit` v6+ is ESM-only, which matches our project. It has zero dependencies and is the standard Node.js concurrency limiter.

**Step 2: Verify import works**

```bash
cd server && node -e "import('p-limit').then(m => console.log('OK:', typeof m.default))"
```

Expected: `OK: function`

**Step 3: Commit**

```bash
git add server/package.json server/package-lock.json
git commit -m "Add p-limit dependency for enrichment parallelism"
```

---

## Task 2: Create `SourceRateLimiter`

**Files:**
- Create: `server/src/lib/shared/concurrency.ts`
- Create: `server/src/lib/shared/concurrency.test.ts`

**Step 1: Write the failing tests for SourceRateLimiter**

```typescript
// server/src/lib/shared/concurrency.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { SourceRateLimiter } from "./concurrency.js"

describe("SourceRateLimiter", () => {
  let limiter: SourceRateLimiter

  beforeEach(() => {
    limiter = new SourceRateLimiter()
  })

  it("enforces minimum delay between same-domain requests", async () => {
    const start = Date.now()
    await limiter.acquire("example.com", 100)
    await limiter.acquire("example.com", 100)
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(90) // allow small timing variance
  })

  it("allows concurrent requests to different domains", async () => {
    const start = Date.now()
    await Promise.all([
      limiter.acquire("a.com", 100),
      limiter.acquire("b.com", 100),
    ])
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(50) // both should resolve immediately
  })

  it("prevents thundering herd on same domain", async () => {
    // Fire 3 requests simultaneously to same domain with 100ms delay
    const timestamps: number[] = []
    const start = Date.now()
    await Promise.all([
      limiter.acquire("x.com", 100).then(() => timestamps.push(Date.now() - start)),
      limiter.acquire("x.com", 100).then(() => timestamps.push(Date.now() - start)),
      limiter.acquire("x.com", 100).then(() => timestamps.push(Date.now() - start)),
    ])
    timestamps.sort((a, b) => a - b)
    // Each should be ~100ms apart, not all at 0
    expect(timestamps[1]).toBeGreaterThanOrEqual(90)
    expect(timestamps[2]).toBeGreaterThanOrEqual(190)
  })

  it("tracks stats per domain", async () => {
    await limiter.acquire("a.com", 50)
    await limiter.acquire("a.com", 50)
    await limiter.acquire("b.com", 50)
    const stats = limiter.getStats()
    expect(stats.get("a.com")?.totalRequests).toBe(2)
    expect(stats.get("b.com")?.totalRequests).toBe(1)
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
cd server && npx vitest run src/lib/shared/concurrency.test.ts
```

Expected: FAIL — module not found

**Step 3: Implement SourceRateLimiter**

```typescript
// server/src/lib/shared/concurrency.ts

/**
 * Shared concurrency utilities for enrichment systems.
 *
 * - SourceRateLimiter: per-domain async rate limiter with thundering herd prevention
 * - BatchCostTracker: synchronous cost accumulation with limit checking
 * - ParallelBatchRunner: concurrency-limited batch processor
 */

interface DomainState {
  lastRequestTime: number
  queue: Array<{
    minDelayMs: number
    resolve: () => void
  }>
  processing: boolean
  totalRequests: number
  totalWaitMs: number
}

/**
 * Per-domain async rate limiter shared across all source instances.
 *
 * Uses an async queue per domain to prevent thundering herd — when multiple
 * callers request the same domain simultaneously, they're serialized so each
 * waits the correct delay after the previous one, rather than all sleeping
 * the same amount and firing together.
 */
export class SourceRateLimiter {
  private domains = new Map<string, DomainState>()

  private getOrCreateDomain(domain: string): DomainState {
    let state = this.domains.get(domain)
    if (!state) {
      state = {
        lastRequestTime: 0,
        queue: [],
        processing: false,
        totalRequests: 0,
        totalWaitMs: 0,
      }
      this.domains.set(domain, state)
    }
    return state
  }

  /**
   * Acquire permission to make a request to the given domain.
   * Blocks until minDelayMs has passed since the last request to this domain.
   */
  async acquire(domain: string, minDelayMs: number): Promise<void> {
    const state = this.getOrCreateDomain(domain)

    return new Promise<void>((resolve) => {
      state.queue.push({ minDelayMs, resolve })
      this.processQueue(state)
    })
  }

  private async processQueue(state: DomainState): Promise<void> {
    if (state.processing || state.queue.length === 0) return
    state.processing = true

    while (state.queue.length > 0) {
      const item = state.queue.shift()!
      const now = Date.now()
      const timeSinceLast = now - state.lastRequestTime
      const waitTime = Math.max(0, item.minDelayMs - timeSinceLast)

      if (waitTime > 0) {
        state.totalWaitMs += waitTime
        await new Promise<void>((r) => setTimeout(r, waitTime))
      }

      state.lastRequestTime = Date.now()
      state.totalRequests++
      item.resolve()
    }

    state.processing = false
  }

  /** Get rate limiting stats per domain */
  getStats(): Map<string, { totalRequests: number; totalWaitMs: number }> {
    const stats = new Map<string, { totalRequests: number; totalWaitMs: number }>()
    for (const [domain, state] of this.domains) {
      stats.set(domain, {
        totalRequests: state.totalRequests,
        totalWaitMs: state.totalWaitMs,
      })
    }
    return stats
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
cd server && npx vitest run src/lib/shared/concurrency.test.ts
```

Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add server/src/lib/shared/concurrency.ts server/src/lib/shared/concurrency.test.ts
git commit -m "Add SourceRateLimiter with per-domain async queuing"
```

---

## Task 3: Create `BatchCostTracker`

**Files:**
- Modify: `server/src/lib/shared/concurrency.ts`
- Modify: `server/src/lib/shared/concurrency.test.ts`

**Step 1: Write the failing tests**

Add to `concurrency.test.ts`:

```typescript
import { BatchCostTracker } from "./concurrency.js"

describe("BatchCostTracker", () => {
  it("accumulates cost across actors", () => {
    const tracker = new BatchCostTracker(10.0)
    tracker.addActorCost(1, 0.05)
    tracker.addActorCost(2, 0.03)
    expect(tracker.getTotalCost()).toBeCloseTo(0.08)
    expect(tracker.isLimitExceeded()).toBe(false)
  })

  it("detects when limit is exceeded", () => {
    const tracker = new BatchCostTracker(0.10)
    tracker.addActorCost(1, 0.05)
    tracker.addActorCost(2, 0.06)
    expect(tracker.isLimitExceeded()).toBe(true)
  })

  it("tracks cost by source type", () => {
    const tracker = new BatchCostTracker(10.0)
    tracker.addSourceCost("wikipedia", 0.0)
    tracker.addSourceCost("claude", 0.02)
    tracker.addSourceCost("claude", 0.03)
    const bySource = tracker.getCostBySource()
    expect(bySource["claude"]).toBeCloseTo(0.05)
    expect(bySource["wikipedia"]).toBeCloseTo(0.0)
  })

  it("handles no-limit case (Infinity)", () => {
    const tracker = new BatchCostTracker(Infinity)
    tracker.addActorCost(1, 100)
    expect(tracker.isLimitExceeded()).toBe(false)
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
cd server && npx vitest run src/lib/shared/concurrency.test.ts
```

Expected: FAIL — BatchCostTracker not found

**Step 3: Implement BatchCostTracker**

Add to `concurrency.ts`:

```typescript
/**
 * Thread-safe (single-threaded Node) cost accumulation with limit checking.
 *
 * All reads and writes are synchronous (no await between check and update),
 * so the Node event loop guarantees atomicity.
 */
export class BatchCostTracker {
  private totalCost = 0
  private costBySource: Record<string, number> = {}

  constructor(private readonly maxTotalCost: number) {}

  /** Add cost for a completed actor. Returns whether the limit is now exceeded. */
  addActorCost(actorId: number, cost: number): boolean {
    this.totalCost += cost
    return this.totalCost >= this.maxTotalCost
  }

  /** Track cost by source type (for reporting) */
  addSourceCost(sourceType: string, cost: number): void {
    this.costBySource[sourceType] = (this.costBySource[sourceType] ?? 0) + cost
  }

  getTotalCost(): number {
    return this.totalCost
  }

  isLimitExceeded(): boolean {
    return this.totalCost >= this.maxTotalCost
  }

  getCostBySource(): Record<string, number> {
    return { ...this.costBySource }
  }
}
```

**Step 4: Run tests**

```bash
cd server && npx vitest run src/lib/shared/concurrency.test.ts
```

Expected: All tests PASS

**Step 5: Commit**

```bash
git add server/src/lib/shared/concurrency.ts server/src/lib/shared/concurrency.test.ts
git commit -m "Add BatchCostTracker for atomic cost accumulation"
```

---

## Task 4: Create `ParallelBatchRunner`

**Files:**
- Modify: `server/src/lib/shared/concurrency.ts`
- Modify: `server/src/lib/shared/concurrency.test.ts`

**Step 1: Write the failing tests**

Add to `concurrency.test.ts`:

```typescript
import { ParallelBatchRunner, type BatchProgress } from "./concurrency.js"

describe("ParallelBatchRunner", () => {
  it("respects concurrency limit", async () => {
    let maxConcurrent = 0
    let currentConcurrent = 0

    const runner = new ParallelBatchRunner<number, number>({ concurrency: 2 })
    const results = await runner.run(
      [1, 2, 3, 4],
      async (item) => {
        currentConcurrent++
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
        await new Promise((r) => setTimeout(r, 50))
        currentConcurrent--
        return item * 2
      }
    )

    expect(results).toEqual([2, 4, 6, 8])
    expect(maxConcurrent).toBe(2)
  })

  it("stops processing when cost limit exceeded", async () => {
    const costTracker = new BatchCostTracker(0.10)
    const processed: number[] = []

    const runner = new ParallelBatchRunner<number, number>({
      concurrency: 1,
      costTracker,
      getCost: () => 0.05,
    })

    await runner.run(
      [1, 2, 3, 4, 5],
      async (item) => {
        processed.push(item)
        return item
      }
    )

    // Cost: 0.05, 0.10 (limit hit after 2), should stop
    expect(processed.length).toBe(2)
  })

  it("fires progress callbacks", async () => {
    const progressUpdates: BatchProgress[] = []
    const runner = new ParallelBatchRunner<number, number>({
      concurrency: 1,
      onItemComplete: async (_item, _result, progress) => {
        progressUpdates.push({ ...progress })
      },
    })

    await runner.run([1, 2, 3], async (item) => item)

    expect(progressUpdates).toHaveLength(3)
    expect(progressUpdates[0].completed).toBe(1)
    expect(progressUpdates[2].completed).toBe(3)
  })

  it("respects abort signal", async () => {
    const controller = new AbortController()
    const processed: number[] = []

    const runner = new ParallelBatchRunner<number, number>({
      concurrency: 1,
      signal: controller.signal,
    })

    // Abort after 50ms (should catch items 1-2 during processing)
    setTimeout(() => controller.abort(), 50)

    await runner.run(
      [1, 2, 3, 4, 5],
      async (item) => {
        processed.push(item)
        await new Promise((r) => setTimeout(r, 30))
        return item
      }
    )

    expect(processed.length).toBeLessThan(5)
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
cd server && npx vitest run src/lib/shared/concurrency.test.ts
```

Expected: FAIL — ParallelBatchRunner not found

**Step 3: Implement ParallelBatchRunner**

Add to `concurrency.ts`:

```typescript
import pLimit from "p-limit"

/** Progress info emitted after each item completes */
export interface BatchProgress {
  completed: number
  total: number
  inFlight: number
}

export interface ParallelBatchRunnerOptions<T, R> {
  /** Max concurrent items (default: 5) */
  concurrency: number
  /** Optional cost tracker — stops processing if limit exceeded */
  costTracker?: BatchCostTracker
  /** Extract cost from a result (required if costTracker provided) */
  getCost?: (result: R) => number
  /** Called after each item completes */
  onItemComplete?: (item: T, result: R, progress: BatchProgress) => Promise<void>
  /** Abort signal for cancellation */
  signal?: AbortSignal
}

/**
 * Generic concurrency-limited batch processor.
 *
 * Replaces sequential `for` loops with parallel processing. Handles cost limits,
 * abort signals, and progress callbacks.
 */
export class ParallelBatchRunner<T, R> {
  private options: ParallelBatchRunnerOptions<T, R>

  constructor(options: ParallelBatchRunnerOptions<T, R>) {
    this.options = options
  }

  async run(items: T[], processItem: (item: T) => Promise<R>): Promise<R[]> {
    const { concurrency, costTracker, getCost, onItemComplete, signal } = this.options
    const limit = pLimit(concurrency)
    const results: R[] = []
    let completed = 0
    let inFlight = 0
    let costLimitHit = false

    const promises = items.map((item, index) =>
      limit(async () => {
        // Check abort and cost limit before starting
        if (signal?.aborted || costLimitHit) return undefined

        inFlight++
        try {
          const result = await processItem(item)

          // Track cost
          if (costTracker && getCost) {
            const exceeded = costTracker.addActorCost(index, getCost(result))
            if (exceeded) costLimitHit = true
          }

          results.push(result)
          completed++

          // Progress callback
          inFlight--
          if (onItemComplete) {
            await onItemComplete(item, result, {
              completed,
              total: items.length,
              inFlight,
            })
          }

          return result
        } catch (error) {
          inFlight--
          completed++
          throw error
        }
      })
    )

    await Promise.allSettled(promises)
    return results
  }
}
```

**Step 4: Run tests**

```bash
cd server && npx vitest run src/lib/shared/concurrency.test.ts
```

Expected: All tests PASS

**Step 5: Commit**

```bash
git add server/src/lib/shared/concurrency.ts server/src/lib/shared/concurrency.test.ts
git commit -m "Add ParallelBatchRunner with cost limits and abort support"
```

---

## Task 5: Add `SourcePhase` Enum and Config Changes to Death Types

**Files:**
- Modify: `server/src/lib/death-sources/types.ts` (add `SourcePhase` enum, add `concurrency` to `EnrichmentConfig`, remove `gatherAllSources` from `ClaudeCleanupConfig`)

**Step 1: Add SourcePhase enum**

Add after the `DataSourceType` enum (around line 187):

```typescript
/**
 * Source execution phases. Sources within a phase run concurrently.
 * Phases run sequentially so early stopping can be applied between phases.
 */
export enum SourcePhase {
  STRUCTURED_DATA = "structured_data",
  WEB_SEARCH = "web_search",
  NEWS = "news",
  OBITUARY = "obituary",
  BOOKS = "books",
  ARCHIVES = "archives",
  GENEALOGY = "genealogy",
  AI_MODELS = "ai_models",
}
```

**Step 2: Add `concurrency` to `EnrichmentConfig`**

In `EnrichmentConfig` interface (line ~675), add:

```typescript
  /** Number of actors to process concurrently (default: 5, range: 1-20) */
  concurrency?: number
```

**Step 3: Remove `gatherAllSources` from `ClaudeCleanupConfig`**

In `ClaudeCleanupConfig` interface (line ~506), remove `gatherAllSources: boolean` — it's always gather-all now. The interface becomes:

```typescript
export interface ClaudeCleanupConfig {
  enabled: boolean
  model: "claude-opus-4-5-20251101"
}
```

**Step 4: Run type-check to verify no breakage**

```bash
cd server && npx tsc --noEmit 2>&1 | head -20
```

Expected: May show errors from files that reference `gatherAllSources` — these will be fixed in Task 7. Note the errors for reference.

**Step 5: Commit**

```bash
git add server/src/lib/death-sources/types.ts
git commit -m "Add SourcePhase enum and concurrency config to death enrichment types"
```

---

## Task 6: Add `SourcePhase` Enum and Config Changes to Biography Types

**Files:**
- Modify: `server/src/lib/biography-sources/types.ts` (add `SourcePhase` to config, add `concurrency`)

**Step 1: Read the current biography types file**

Read `server/src/lib/biography-sources/types.ts` to find the `BiographyEnrichmentConfig` interface and add `concurrency` to it.

**Step 2: Add concurrency to config**

Add to `BiographyEnrichmentConfig`:

```typescript
  /** Number of actors to process concurrently (default: 5, range: 1-20) */
  concurrency?: number
```

Import and re-export `SourcePhase` from the death types (since both systems share it), or define it in the biography types too. Prefer importing from a shared location — move `SourcePhase` to `server/src/lib/shared/concurrency.ts` if cleaner.

**Step 3: Commit**

```bash
git add server/src/lib/biography-sources/types.ts
git commit -m "Add concurrency config to biography enrichment types"
```

---

## Task 7: Add `domain` Property to Death Base Source and Wire Up Rate Limiter

**Files:**
- Modify: `server/src/lib/death-sources/base-source.ts`

This is a critical change — all sources get their rate limiting through the shared `SourceRateLimiter` instead of per-instance `lastRequestTime`.

**Step 1: Add domain property and rateLimiter setter to BaseDataSource**

In `base-source.ts`, add:

```typescript
import { SourceRateLimiter } from "../shared/concurrency.js"

// In the class:
  /** External domain this source hits (for shared rate limiting) */
  protected domain = "unknown"

  /** Shared rate limiter (set by orchestrator) */
  private rateLimiter: SourceRateLimiter | null = null

  /** Called by orchestrator to inject shared rate limiter */
  setRateLimiter(limiter: SourceRateLimiter): void {
    this.rateLimiter = limiter
  }
```

**Step 2: Update `waitForRateLimit()` to use shared limiter**

Replace the existing `waitForRateLimit()` implementation:

```typescript
  protected async waitForRateLimit(): Promise<void> {
    if (this.rateLimiter) {
      await this.rateLimiter.acquire(this.domain, this.minDelayMs)
    } else {
      // Fallback to per-instance rate limiting (backward compat for standalone use)
      const now = Date.now()
      const timeSinceLastRequest = now - this.lastRequestTime
      const waitTime = Math.max(0, this.minDelayMs - timeSinceLastRequest)
      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime))
      }
      this.lastRequestTime = Date.now()
    }
  }
```

**Step 3: Run existing death source tests**

```bash
cd server && npx vitest run src/lib/death-sources/
```

Expected: All existing tests should still PASS (fallback path preserves old behavior).

**Step 4: Commit**

```bash
git add server/src/lib/death-sources/base-source.ts
git commit -m "Add domain property and shared rate limiter support to death BaseDataSource"
```

---

## Task 8: Add `domain` Property to All Death Source Files

**Files:**
- Modify: Every file in `server/src/lib/death-sources/sources/*.ts` that extends `BaseDataSource`

Each source needs a `domain` property set in its constructor or as a class property. The domain should match the external API endpoint the source primarily hits.

**Step 1: Add domain to each source**

Examples:

```typescript
// wikidata.ts
protected domain = "query.wikidata.org"

// wikipedia.ts
protected domain = "en.wikipedia.org"

// google-search.ts
protected domain = "www.googleapis.com"

// bing-search.ts
protected domain = "api.bing.microsoft.com"

// duckduckgo.ts
protected domain = "html.duckduckgo.com"

// brave-search.ts
protected domain = "api.search.brave.com"

// guardian.ts
protected domain = "content.guardianapis.com"

// nytimes.ts
protected domain = "api.nytimes.com"

// ap-news.ts (uses DDG site search)
protected domain = "html.duckduckgo.com"

// For all news sources that use DuckDuckGo site: search via news-utils.ts:
// reuters.ts, washington-post.ts, la-times.ts, rolling-stone.ts,
// telegraph.ts, independent.ts, npr.ts, time.ts, pbs.ts, new-yorker.ts,
// national-geographic.ts, deadline.ts, variety.ts, hollywood-reporter.ts,
// tmz.ts, people.ts, bbc-news.ts, legacy.ts
// These all go through DDG, so use:
protected domain = "html.duckduckgo.com"

// find-a-grave.ts (direct API)
protected domain = "api.findagrave.com"

// google-books-death.ts
protected domain = "www.googleapis.com"

// open-library-death.ts
protected domain = "openlibrary.org"

// ia-books-death.ts
protected domain = "archive.org"

// chronicling-america.ts
protected domain = "chroniclingamerica.loc.gov"

// trove.ts
protected domain = "api.trove.nla.gov.au"

// europeana.ts
protected domain = "api.europeana.eu"

// internet-archive.ts
protected domain = "archive.org"

// familysearch.ts
protected domain = "api.familysearch.org"

// AI sources: each has its own API domain
// gemini-flash.ts, gemini-pro.ts
protected domain = "generativelanguage.googleapis.com"
// gpt4o.ts, gpt4o-mini.ts
protected domain = "api.openai.com"
// perplexity.ts
protected domain = "api.perplexity.ai"
// groq-llama.ts
protected domain = "api.groq.com"
// deepseek.ts
protected domain = "api.deepseek.com"
// mistral.ts
protected domain = "api.mistral.ai"
// grok.ts
protected domain = "api.x.ai"

// newsapi.ts
protected domain = "newsapi.org"

// google-news-rss.ts
protected domain = "news.google.com"

// bfi-sight-sound.ts
protected domain = "www2.bfi.org.uk"
```

**Important**: Many news sources (AP, Reuters, BBC, etc.) route through DuckDuckGo `site:` searches via `news-utils.ts`. These should use `domain = "html.duckduckgo.com"` because DDG is the actual external service being hit. This naturally causes them to share DDG rate limits, which is exactly what we want.

**Step 2: Run tests**

```bash
cd server && npx vitest run src/lib/death-sources/
```

Expected: All PASS (domain is just a new property, doesn't change behavior yet).

**Step 3: Commit**

```bash
git add server/src/lib/death-sources/sources/
git commit -m "Add domain property to all death enrichment sources"
```

---

## Task 9: Add `domain` Property to Biography Base Source and All Source Files

**Files:**
- Modify: `server/src/lib/biography-sources/base-source.ts`
- Modify: Every file in `server/src/lib/biography-sources/sources/*.ts`

Same pattern as Tasks 7 and 8, but for biography sources.

**Step 1: Add to biography base source**

Same changes as Task 7 — import `SourceRateLimiter`, add `domain` property, add `setRateLimiter()`, update `waitForRateLimit()` with fallback.

**Step 2: Add domain to each biography source**

Same domain assignments as death sources where they share the same external APIs. Biography-specific sources:

```typescript
// britannica.ts (DDG site search)
protected domain = "html.duckduckgo.com"

// biography-com.ts (DDG site search)
protected domain = "html.duckduckgo.com"

// tcm.ts (DDG site search)
protected domain = "html.duckduckgo.com"

// allmusic.ts (DDG site search)
protected domain = "html.duckduckgo.com"

// smithsonian-magazine.ts (DDG site search)
protected domain = "html.duckduckgo.com"

// history-com.ts (DDG site search)
protected domain = "html.duckduckgo.com"
```

**Step 3: Run tests**

```bash
cd server && npx vitest run src/lib/biography-sources/
```

**Step 4: Commit**

```bash
git add server/src/lib/biography-sources/
git commit -m "Add domain property and shared rate limiter to biography sources"
```

---

## Task 10: Death Orchestrator — Remove First-Wins, Add Phase Groups

**Files:**
- Modify: `server/src/lib/death-sources/orchestrator.ts`

This is the largest single change. The orchestrator must:
1. Remove `mergeEnrichmentData()` function
2. Always accumulate raw sources
3. Organize sources into phase groups
4. Run sources within each phase via `Promise.allSettled()`
5. Always call Claude synthesis at the end

**Step 1: Read the current orchestrator carefully**

Read `server/src/lib/death-sources/orchestrator.ts` in full to understand:
- How `mergeEnrichmentData()` works (around lines 89-145)
- How `initializeSources()` builds the sources array (around lines 244-335)
- How `enrichActor()` processes sources (around lines 420-1045)
- How the gather-all / first-wins branching works (around lines 846-895)

**Step 2: Create phase group structure**

Replace the flat `this.sources` array with a `this.phases` array of arrays:

```typescript
interface SourcePhaseGroup {
  phase: SourcePhase
  sources: DataSource[]
  /** If true, sources run sequentially within this phase (AI models: cost-ordered) */
  sequential?: boolean
}

private phases: SourcePhaseGroup[] = []
```

In `initializeSources()`, group sources by phase instead of pushing to flat array.

**Step 3: Rewrite `enrichActor()` to iterate phases**

```typescript
async enrichActor(actor: ActorForEnrichment): Promise<EnrichmentResult> {
  const rawSources: RawSourceData[] = []
  const actorStats = this.createEmptyStats(actor)

  // Create shared rate limiter for this orchestrator
  // (already created in constructor and injected into sources)

  for (const phaseGroup of this.phases) {
    // Check cost limit between phases
    if (actorStats.totalCostUsd >= this.config.costLimits?.maxCostPerActor) break

    // Check early stopping: enough high-quality source families?
    if (this.hasEnoughSources(rawSources)) break

    if (phaseGroup.sequential) {
      // AI models: try sequentially by ascending cost
      for (const source of phaseGroup.sources) {
        if (!source.isAvailable()) continue
        const result = await this.trySource(source, actor, actorStats)
        if (result) rawSources.push(result)
        // Stop at first successful AI result
        if (result) break
      }
    } else {
      // All other phases: fire concurrently
      const results = await Promise.allSettled(
        phaseGroup.sources
          .filter((s) => s.isAvailable())
          .map((source) => this.trySource(source, actor, actorStats))
      )
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) {
          rawSources.push(r.value)
        }
      }
    }
  }

  // Always synthesize via Claude
  if (rawSources.length > 0) {
    const synthesis = await cleanupWithClaude(actor, rawSources, ...)
    return this.buildResult(synthesis, rawSources, actorStats)
  }

  return this.buildEmptyResult(actorStats)
}
```

**Step 4: Remove `mergeEnrichmentData()` and all per-field `*Source` tracking**

Delete the `mergeEnrichmentData()` function entirely. The `EnrichmentResult` with per-field source tracking (`circumstancesSource`, `notableFactorsSource`, etc.) is no longer needed because Claude synthesis handles field attribution.

**Step 5: Wire up shared rate limiter in constructor**

```typescript
constructor(config: EnrichmentConfig) {
  this.rateLimiter = new SourceRateLimiter()
  this.initializeSources()
  // Inject rate limiter into all sources
  for (const phase of this.phases) {
    for (const source of phase.sources) {
      source.setRateLimiter(this.rateLimiter)
    }
  }
}
```

**Step 6: Run existing tests**

```bash
cd server && npx vitest run src/lib/death-sources/
```

Fix any test failures caused by the structural changes. Tests that mock first-wins behavior need to be updated to expect gather-all + synthesis.

**Step 7: Commit**

```bash
git add server/src/lib/death-sources/orchestrator.ts
git commit -m "Death orchestrator: remove first-wins, add phase groups with concurrent execution"
```

---

## Task 11: Update `enrichment-runner.ts` — Parallel Actor Processing

**Files:**
- Modify: `server/src/lib/enrichment-runner.ts`

**Step 1: Add concurrency to `EnrichmentRunnerConfig`**

```typescript
export interface EnrichmentRunnerConfig {
  // ... existing fields ...
  /** Number of actors to process concurrently (default: 5) */
  concurrency?: number
}
```

**Step 2: Update `EnrichmentProgress` interface**

```typescript
export interface EnrichmentProgress {
  actorsInFlight: number
  actorsCompleted: number
  actorsQueried: number
  actorsProcessed: number
  actorsEnriched: number
  actorsWithDeathPage: number
  totalCostUsd: number
  phase: "processing" | "completed"
}
```

**Step 3: Replace the sequential for loop with `ParallelBatchRunner`**

The core processing loop (currently around lines 356-689) becomes:

```typescript
import { ParallelBatchRunner, BatchCostTracker } from "./shared/concurrency.js"

const costTracker = new BatchCostTracker(this.config.maxTotalCost ?? 10)
const runner = new ParallelBatchRunner<ActorForEnrichment, ActorEnrichmentResult>({
  concurrency: this.config.concurrency ?? 5,
  costTracker,
  getCost: (result) => result.costUsd,
  onItemComplete: async (actor, result, progress) => {
    if (this.onProgress) {
      await this.onProgress({
        actorsInFlight: progress.inFlight,
        actorsCompleted: progress.completed,
        actorsQueried: actorsToEnrich.length,
        actorsProcessed: progress.completed,
        actorsEnriched: this.enrichedCount,
        actorsWithDeathPage: this.deathPageCount,
        totalCostUsd: costTracker.getTotalCost(),
        phase: "completed",
      })
    }
  },
  signal: this.abortSignal,
})

await runner.run(actorsToEnrich, async (actor) => {
  // Existing per-actor enrichment logic (enrich, write to DB, update counts)
  return { costUsd: enrichment.stats.totalCostUsd, ... }
})
```

**Step 4: Remove `gatherAllSources` from config building**

In the method that builds `EnrichmentConfig` from `EnrichmentRunnerConfig`, remove references to `gatherAllSources`. Set `claudeCleanup.enabled = true` always.

**Step 5: Run tests**

```bash
cd server && npx vitest run src/lib/enrichment-runner
```

**Step 6: Commit**

```bash
git add server/src/lib/enrichment-runner.ts
git commit -m "Death enrichment runner: parallel actor processing via ParallelBatchRunner"
```

---

## Task 12: Biography Orchestrator — Add Phase Groups and Parallel Actors

**Files:**
- Modify: `server/src/lib/biography-sources/orchestrator.ts`

**Step 1: Read current orchestrator**

Read the full file to understand `initializeSources()`, `enrichActor()`, and `enrichBatch()`.

**Step 2: Organize sources into phase groups**

Same pattern as death orchestrator (Task 10). Group sources by phase in `initializeSources()`.

**Step 3: Update `enrichActor()` to use phase-by-phase `Promise.allSettled()`**

Replace the sequential source loop with phase iteration. Keep the early stopping logic (3+ high-quality source families) but check it between phases instead of between individual sources.

**Step 4: Update `enrichBatch()` to use `ParallelBatchRunner`**

Replace the sequential `for` loop and 500ms inter-actor delay with `ParallelBatchRunner`.

**Step 5: Wire up shared `SourceRateLimiter`**

Same pattern as death orchestrator — create in constructor, inject into all sources.

**Step 6: Run tests**

```bash
cd server && npx vitest run src/lib/biography-sources/
```

**Step 7: Commit**

```bash
git add server/src/lib/biography-sources/orchestrator.ts
git commit -m "Biography orchestrator: phase groups with concurrent sources and parallel actors"
```

---

## Task 13: Update Death Batch Job Handler

**Files:**
- Modify: `server/src/lib/jobs/handlers/enrich-death-details-batch.ts`

**Step 1: Pass concurrency from job payload**

Add `concurrency` to the job payload type and pass it through to `EnrichmentRunner`.

**Step 2: Update progress reporting**

Update the progress callback to use the new `EnrichmentProgress` fields (`actorsInFlight`, `actorsCompleted` instead of `currentActorIndex`, `currentActorName`).

**Step 3: Update `updateRunProgress()` SQL**

Change the SQL that updates `enrichment_runs` to use `actors_completed` instead of `current_actor_index`. The `current_actor_name` column can be set to a summary like "5 actors in flight".

**Step 4: Run tests**

```bash
cd server && npx vitest run src/lib/jobs/handlers/
```

**Step 5: Commit**

```bash
git add server/src/lib/jobs/handlers/enrich-death-details-batch.ts
git commit -m "Death batch handler: pass concurrency config, update progress reporting"
```

---

## Task 14: Update Biography Batch Job Handler

**Files:**
- Modify: `server/src/lib/jobs/handlers/enrich-biographies-batch.ts`

Same changes as Task 13 but for biography enrichment.

**Step 1: Pass concurrency from job payload**

**Step 2: Update progress reporting**

The biography batch handler currently has its own sequential loop (lines 175-334). Since the orchestrator now handles parallelism internally via `enrichBatch()`, the handler just needs to pass `concurrency` in the config and update the progress model.

**Step 3: Run tests**

```bash
cd server && npx vitest run src/lib/jobs/handlers/
```

**Step 4: Commit**

```bash
git add server/src/lib/jobs/handlers/enrich-biographies-batch.ts
git commit -m "Biography batch handler: pass concurrency config, update progress reporting"
```

---

## Task 15: Update CLI Scripts

**Files:**
- Modify: `server/scripts/enrich-death-details.ts`
- Modify: `server/scripts/enrich-biographies.ts`

**Step 1: Add `--concurrency` flag to death enrichment CLI**

```typescript
.option('--concurrency <n>', 'Number of actors to process concurrently (default: 5)', parsePositiveInt, 5)
```

Pass through to `EnrichmentRunnerConfig.concurrency`.

**Step 2: Add `--concurrency` flag to biography enrichment CLI**

Same pattern.

**Step 3: Remove `--gather-all-sources` flag from death enrichment CLI** (if it exists)

This flag is no longer meaningful since gather-all is always on.

**Step 4: Test manually**

```bash
cd server && npx tsx scripts/enrich-death-details.ts --limit 2 --concurrency 2 --dry-run
cd server && npx tsx scripts/enrich-biographies.ts --limit 2 --concurrency 2 --dry-run
```

**Step 5: Commit**

```bash
git add server/scripts/enrich-death-details.ts server/scripts/enrich-biographies.ts
git commit -m "Add --concurrency flag to enrichment CLI scripts"
```

---

## Task 16: Update Admin UI — Progress Display

**Files:**
- Modify: `src/pages/admin/EnrichmentRunDetailsPage.tsx`
- Modify: `src/pages/admin/BioEnrichmentRunDetailsPage.tsx`

**Step 1: Read current progress display logic**

Find where `current_actor_index` and `current_actor_name` are displayed.

**Step 2: Update progress display**

Change from:
```
Processing actor 47/100: John Wayne
```

To:
```
Processing 5 actors (47/100 completed)
```

Use `actorsCompleted` / total actors for the fraction, and show `actorsInFlight` as the concurrent count.

**Step 3: Run frontend tests**

```bash
npm test -- --run src/pages/admin/EnrichmentRunDetailsPage.test.tsx src/pages/admin/BioEnrichmentRunDetailsPage.test.tsx
```

**Step 4: Commit**

```bash
git add src/pages/admin/EnrichmentRunDetailsPage.tsx src/pages/admin/BioEnrichmentRunDetailsPage.tsx
git commit -m "Update admin UI progress display for parallel enrichment"
```

---

## Task 17: Update Admin UI — Concurrency Config

**Files:**
- Modify: The enrichment config/launch forms in the admin UI (find the components that render the "Start Enrichment" forms)

**Step 1: Find enrichment launch forms**

Search for components that submit enrichment batch jobs. These need a concurrency input.

**Step 2: Add concurrency input**

Add a number input or dropdown for concurrency (default 5, range 1-20) to both death and biography enrichment launch forms.

**Step 3: Pass concurrency in API call**

Ensure the admin API routes accept `concurrency` in the POST body and pass it through to the job payload.

**Step 4: Update admin API routes**

Modify `server/src/routes/admin/enrichment.ts` and `server/src/routes/admin/biography-enrichment.ts` to accept and forward the `concurrency` parameter.

**Step 5: Run tests**

```bash
npm test -- --run src/pages/admin/
cd server && npx vitest run src/routes/admin/enrichment.test.ts src/routes/admin/biography-enrichment.test.ts
```

**Step 6: Commit**

```bash
git add src/ server/src/routes/admin/
git commit -m "Add concurrency config to admin enrichment UI and API routes"
```

---

## Task 18: Integration Testing

**Files:**
- No new files — run existing test suites

**Step 1: Run full test suite**

```bash
npm test
cd server && npm test
```

**Step 2: Run type-check**

```bash
npm run type-check
cd server && npm run type-check
```

**Step 3: Run lint**

```bash
npm run lint
cd server && npm run lint
```

**Step 4: Manual smoke test with real APIs**

```bash
# Test death enrichment with 3 actors, concurrency 2
cd server && npx tsx scripts/enrich-death-details.ts --limit 3 --concurrency 2 --free

# Test biography enrichment with 3 actors, concurrency 2
cd server && npx tsx scripts/enrich-biographies.ts --limit 3 --concurrency 2
```

Verify:
- Rate limits are respected (check logs for timing)
- All sources return data (not all 429s)
- Claude synthesis produces valid output
- Progress reporting works correctly
- Cost tracking sums correctly

**Step 5: Fix any issues found**

**Step 6: Final commit**

```bash
git add -A
git commit -m "Fix integration issues from parallel enrichment testing"
```

---

## Summary

| Task | Component | Risk | Estimated Effort |
|------|-----------|------|------------------|
| 1 | Install p-limit | None | 2 min |
| 2 | SourceRateLimiter | Low | 30 min |
| 3 | BatchCostTracker | Low | 15 min |
| 4 | ParallelBatchRunner | Low | 30 min |
| 5 | Death types (SourcePhase, concurrency) | Low | 10 min |
| 6 | Biography types (concurrency) | Low | 10 min |
| 7 | Death base source (domain, rate limiter) | Low | 20 min |
| 8 | Death source files (domain property) | Low | 30 min |
| 9 | Biography base + source files (domain) | Low | 30 min |
| 10 | **Death orchestrator rewrite** | **High** | **2-3 hours** |
| 11 | Enrichment runner (parallel actors) | Medium | 1 hour |
| 12 | **Biography orchestrator update** | **Medium** | **1-2 hours** |
| 13 | Death batch handler | Low | 30 min |
| 14 | Biography batch handler | Low | 30 min |
| 15 | CLI scripts | Low | 15 min |
| 16 | Admin UI progress display | Low | 30 min |
| 17 | Admin UI concurrency config | Low | 45 min |
| 18 | Integration testing | Medium | 1 hour |

**Total estimated effort: ~10-12 hours of implementation**

**Critical path**: Tasks 10 and 12 (orchestrator rewrites) are the highest-risk items. Everything else is mechanical.
