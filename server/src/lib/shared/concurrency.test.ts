import { describe, it, expect, beforeEach } from "vitest"
import { SourceRateLimiter, BatchCostTracker } from "./concurrency.js"

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
  it("accumulates cost across actors", () => {
    const tracker = new BatchCostTracker(10.0)
    tracker.addActorCost(1, 0.05)
    tracker.addActorCost(2, 0.03)
    expect(tracker.getTotalCost()).toBeCloseTo(0.08)
    expect(tracker.isLimitExceeded()).toBe(false)
  })

  it("detects when limit is exceeded", () => {
    const tracker = new BatchCostTracker(0.1)
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
