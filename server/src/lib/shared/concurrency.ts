/**
 * Shared concurrency utilities for enrichment systems.
 *
 * - SourceRateLimiter: per-domain async rate limiter with thundering herd prevention
 * - BatchCostTracker: synchronous cost accumulation with limit checking
 * - ParallelBatchRunner: concurrency-limited batch processor
 */

import pLimit from "p-limit"

/**
 * Source execution phases. Sources within a phase run concurrently.
 * Phases run sequentially so early stopping can be applied between phases.
 */
export enum SourcePhase {
  STRUCTURED_DATA = "structured_data",
  WEB_SEARCH = "web_search",
  REFERENCE = "reference",
  BOOKS = "books",
  NEWS = "news",
  OBITUARY = "obituary",
  ARCHIVES = "archives",
  GENEALOGY = "genealogy",
  AI_MODELS = "ai_models",
}

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

    try {
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
    } finally {
      state.processing = false
    }
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

/**
 * Synchronous cost accumulation with limit checking.
 *
 * All reads and writes are synchronous (no await between check and update),
 * so the Node event loop guarantees atomicity.
 */
export class BatchCostTracker {
  private totalCost = 0
  private costBySource: Record<string, number> = {}

  constructor(private readonly maxTotalCost: number) {}

  /** Add cost for a completed item. Returns whether the limit is now exceeded. */
  addCost(cost: number): boolean {
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
 * abort signals, and progress callbacks. Results are returned in input order.
 */
export class ParallelBatchRunner<T, R> {
  private options: ParallelBatchRunnerOptions<T, R>

  constructor(options: ParallelBatchRunnerOptions<T, R>) {
    this.options = options
  }

  async run(items: T[], processItem: (item: T) => Promise<R>): Promise<R[]> {
    const { concurrency, costTracker, getCost, onItemComplete, signal } = this.options
    const limit = pLimit(concurrency)
    const results: (R | undefined)[] = new Array(items.length).fill(undefined)
    let completed = 0
    let inFlight = 0
    let costLimitHit = false

    const promises = items.map((item, index) =>
      limit(async () => {
        // Check abort and cost limit before starting
        if (signal?.aborted || costLimitHit) return

        inFlight++
        try {
          const result = await processItem(item)

          // Track cost
          if (costTracker && getCost) {
            const exceeded = costTracker.addCost(getCost(result))
            if (exceeded) costLimitHit = true
          }

          results[index] = result
          completed++
          inFlight--

          // Progress callback
          if (onItemComplete) {
            await onItemComplete(item, result, {
              completed,
              total: items.length,
              inFlight,
            })
          }
        } catch (error) {
          inFlight--
          completed++
          throw error
        }
      })
    )

    await Promise.allSettled(promises)
    return results.filter((r): r is R => r !== undefined)
  }
}
