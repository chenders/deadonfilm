import { describe, it, expect, beforeEach } from "vitest"
import {
  SourceRateLimiter,
  BatchCostTracker,
  ParallelBatchRunner,
  withTimeout,
  type BatchProgress,
} from "./concurrency.js"

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
    await Promise.all([limiter.acquire("a.com", 100), limiter.acquire("b.com", 100)])
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

describe("BatchCostTracker", () => {
  it("accumulates cost", () => {
    const tracker = new BatchCostTracker(10.0)
    tracker.addCost(0.05)
    tracker.addCost(0.03)
    expect(tracker.getTotalCost()).toBeCloseTo(0.08)
    expect(tracker.isLimitExceeded()).toBe(false)
  })

  it("detects when limit is exceeded", () => {
    const tracker = new BatchCostTracker(0.1)
    tracker.addCost(0.05)
    tracker.addCost(0.06)
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
    tracker.addCost(100)
    expect(tracker.isLimitExceeded()).toBe(false)
  })
})

describe("ParallelBatchRunner", () => {
  it("respects concurrency limit", async () => {
    let maxConcurrent = 0
    let currentConcurrent = 0

    const runner = new ParallelBatchRunner<number, number>({ concurrency: 2 })
    const results = await runner.run([1, 2, 3, 4], async (item) => {
      currentConcurrent++
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
      await new Promise((r) => setTimeout(r, 50))
      currentConcurrent--
      return item * 2
    })

    expect(results).toEqual([2, 4, 6, 8])
    expect(maxConcurrent).toBe(2)
  })

  it("stops processing when cost limit exceeded", async () => {
    const costTracker = new BatchCostTracker(0.1)
    const processed: number[] = []

    const runner = new ParallelBatchRunner<number, number>({
      concurrency: 1,
      costTracker,
      getCost: () => 0.05,
    })

    await runner.run([1, 2, 3, 4, 5], async (item) => {
      processed.push(item)
      return item
    })

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
    expect(progressUpdates[0]?.completed).toBe(1)
    expect(progressUpdates[2]?.completed).toBe(3)
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

    await runner.run([1, 2, 3, 4, 5], async (item) => {
      processed.push(item)
      await new Promise((r) => setTimeout(r, 30))
      return item
    })

    expect(processed.length).toBeLessThan(5)
  })

  it("preserves result order matching input", async () => {
    const runner = new ParallelBatchRunner<number, number>({ concurrency: 3 })
    const results = await runner.run([3, 1, 2], async (item) => {
      // Items with higher values finish faster, testing order preservation
      await new Promise((r) => setTimeout(r, (4 - item) * 20))
      return item * 10
    })

    expect(results).toEqual([30, 10, 20])
  })
})

describe("withTimeout", () => {
  it("returns the promise result when it resolves before timeout", async () => {
    const result = await withTimeout(Promise.resolve("fast"), 1000, () => "timed-out")
    expect(result).toBe("fast")
  })

  it("returns the onTimeout value when promise exceeds timeout", async () => {
    const result = await withTimeout(
      new Promise<string>((resolve) => setTimeout(() => resolve("slow"), 500)),
      50,
      () => "timed-out"
    )
    expect(result).toBe("timed-out")
  })

  it("clears the timer when promise resolves first", async () => {
    const start = Date.now()
    await withTimeout(Promise.resolve("instant"), 5000, () => "timed-out")
    // Should not wait 5 seconds
    expect(Date.now() - start).toBeLessThan(100)
  })
})
