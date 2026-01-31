import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { InvalidArgumentError } from "commander"
import { parsePositiveInt, SyncProgressTracker } from "./sync-tmdb-changes.js"

// Mock the db module
const mockQuery = vi.fn()
vi.mock("../src/lib/db.js", () => ({
  getPool: () => ({
    query: mockQuery,
  }),
}))

describe("parsePositiveInt", () => {
  it("parses valid positive integers", () => {
    expect(parsePositiveInt("1")).toBe(1)
    expect(parsePositiveInt("42")).toBe(42)
    expect(parsePositiveInt("500")).toBe(500)
    expect(parsePositiveInt("1000")).toBe(1000)
  })

  it("throws for zero", () => {
    expect(() => parsePositiveInt("0")).toThrow(InvalidArgumentError)
    expect(() => parsePositiveInt("0")).toThrow("Must be a positive integer")
  })

  it("throws for negative numbers", () => {
    expect(() => parsePositiveInt("-1")).toThrow(InvalidArgumentError)
    expect(() => parsePositiveInt("-100")).toThrow(InvalidArgumentError)
  })

  it("truncates decimal values to integers", () => {
    // JavaScript parseInt truncates decimals, so "1.5" becomes 1
    expect(parsePositiveInt("1.5")).toBe(1)
    expect(parsePositiveInt("3.14")).toBe(3)
  })

  it("throws for non-numeric strings", () => {
    expect(() => parsePositiveInt("abc")).toThrow(InvalidArgumentError)
    expect(() => parsePositiveInt("")).toThrow(InvalidArgumentError)
  })

  it("parses leading digits from mixed strings", () => {
    // JavaScript parseInt stops at first non-digit, so "12abc" becomes 12
    expect(parsePositiveInt("12abc")).toBe(12)
  })

  it("throws for whitespace", () => {
    expect(() => parsePositiveInt(" ")).toThrow(InvalidArgumentError)
    expect(() => parsePositiveInt("\t")).toThrow(InvalidArgumentError)
  })
})

describe("SyncProgressTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockQuery.mockResolvedValue({ rowCount: 1 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("update throttling", () => {
    it("does not persist to database when syncId is null", async () => {
      const tracker = new SyncProgressTracker()

      // Update with many items
      await tracker.update({ itemsChecked: 200, itemsUpdated: 10, newDeathsFound: 1 })

      expect(mockQuery).not.toHaveBeenCalled()
    })

    it("persists after 100 items checked threshold", async () => {
      const tracker = new SyncProgressTracker(42)

      // First update - below threshold
      await tracker.update({ itemsChecked: 50, itemsUpdated: 5, newDeathsFound: 1 })
      expect(mockQuery).not.toHaveBeenCalled()

      // Second update - crosses 100 item threshold
      await tracker.update({ itemsChecked: 150, itemsUpdated: 15, newDeathsFound: 2 })
      expect(mockQuery).toHaveBeenCalledTimes(1)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE sync_history"),
        [150, 15, 2, 42]
      )
    })

    it("persists after 30 seconds time threshold", async () => {
      const tracker = new SyncProgressTracker(42)

      // First update - no items, no time elapsed
      await tracker.update({ itemsChecked: 10 })
      expect(mockQuery).not.toHaveBeenCalled()

      // Advance time by 30 seconds
      vi.advanceTimersByTime(30_000)

      // Second update - still below item threshold but time has passed
      await tracker.update({ itemsChecked: 20 })
      expect(mockQuery).toHaveBeenCalledTimes(1)
    })

    it("resets thresholds after persisting", async () => {
      const tracker = new SyncProgressTracker(42)

      // Cross threshold
      await tracker.update({ itemsChecked: 100, itemsUpdated: 10, newDeathsFound: 1 })
      expect(mockQuery).toHaveBeenCalledTimes(1)

      // Update again - now we need another 100 items from 100 (so total 200)
      await tracker.update({ itemsChecked: 150 })
      expect(mockQuery).toHaveBeenCalledTimes(1) // Still 1, not triggered again

      await tracker.update({ itemsChecked: 200 })
      expect(mockQuery).toHaveBeenCalledTimes(2) // Now triggered
    })
  })

  describe("flush", () => {
    it("forces immediate database update", async () => {
      const tracker = new SyncProgressTracker(42)

      // Update below threshold
      await tracker.update({ itemsChecked: 10, itemsUpdated: 2, newDeathsFound: 0 })
      expect(mockQuery).not.toHaveBeenCalled()

      // Flush forces the update
      await tracker.flush()
      expect(mockQuery).toHaveBeenCalledTimes(1)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE sync_history"),
        [10, 2, 0, 42]
      )
    })

    it("does nothing when syncId is null", async () => {
      const tracker = new SyncProgressTracker()

      await tracker.update({ itemsChecked: 100 })
      await tracker.flush()

      expect(mockQuery).not.toHaveBeenCalled()
    })
  })

  describe("error handling", () => {
    it("logs but does not throw when database update fails", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      mockQuery.mockRejectedValueOnce(new Error("Database connection failed"))

      const tracker = new SyncProgressTracker(42)

      // Should not throw
      await expect(tracker.update({ itemsChecked: 100 })).resolves.not.toThrow()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to update sync progress")
      )

      consoleSpy.mockRestore()
    })
  })

  describe("progress accumulation", () => {
    it("correctly tracks cumulative counts", async () => {
      const tracker = new SyncProgressTracker(42)

      // Incremental updates
      await tracker.update({ itemsChecked: 30, itemsUpdated: 3, newDeathsFound: 1 })
      await tracker.update({ itemsChecked: 60, itemsUpdated: 6, newDeathsFound: 1 })
      await tracker.update({ itemsChecked: 100, itemsUpdated: 10, newDeathsFound: 2 })

      // Third update should trigger persist with cumulative values
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE sync_history"),
        [100, 10, 2, 42]
      )
    })
  })
})
