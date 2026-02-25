import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock the pool
const mockQuery = vi.fn().mockResolvedValue({ rows: [] })
vi.mock("./db/pool.js", () => ({
  getPool: () => ({ query: mockQuery }),
}))

import { RunLogger } from "./run-logger.js"

describe("RunLogger", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockQuery.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("buffers log entries and flushes on flush()", async () => {
    const logger = new RunLogger("death", 42)
    logger.info("Starting enrichment")
    logger.warn("Source failed", { source: "Wikidata" })
    logger.error("Fatal error")

    // Not yet flushed
    expect(mockQuery).not.toHaveBeenCalled()

    await logger.flush()

    expect(mockQuery).toHaveBeenCalledTimes(1)
    const [sql, params] = mockQuery.mock.calls[0]
    expect(sql).toContain("INSERT INTO run_logs")
    expect(params[0]).toBe("death")
    expect(params[1]).toBe(42)
    // 3 entries: timestamps, levels, messages, data arrays, sources array
    expect(params[2]).toHaveLength(3) // timestamps
    expect(params[3]).toEqual(["info", "warn", "error"]) // levels
    expect(params[4]).toEqual(["Starting enrichment", "Source failed", "Fatal error"])
  })

  it("auto-flushes when buffer reaches threshold", async () => {
    const logger = new RunLogger("biography", 10, { flushThreshold: 3 })
    logger.info("msg1")
    logger.info("msg2")
    expect(mockQuery).not.toHaveBeenCalled()

    logger.info("msg3") // triggers flush at threshold
    // Allow microtask to complete
    await vi.advanceTimersByTimeAsync(0)

    expect(mockQuery).toHaveBeenCalledTimes(1)
  })

  it("does nothing on flush() when buffer is empty", async () => {
    const logger = new RunLogger("death", 1)
    await logger.flush()
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it("includes source field when provided", async () => {
    const logger = new RunLogger("death", 5)
    logger.info("Source result", { source: "Wikipedia", confidence: 0.8 }, "wikipedia")

    await logger.flush()

    const [, params] = mockQuery.mock.calls[0]
    expect(params[6]).toEqual(["wikipedia"]) // sources array
  })

  it("still console.logs in addition to buffering", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const logger = new RunLogger("death", 1)
    logger.info("test message")
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
