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

  /** Add cost for a completed actor. Returns whether the limit is now exceeded. */
  addActorCost(_actorId: number, cost: number): boolean {
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
