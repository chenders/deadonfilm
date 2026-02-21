/**
 * Tests for saveRejectedFactors helper
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { saveRejectedFactors } from "./rejected-factors.js"

vi.mock("./logger.js", () => ({
  logger: {
    error: vi.fn(),
  },
}))

describe("saveRejectedFactors", () => {
  let mockPool: { query: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()
    mockPool = { query: vi.fn().mockResolvedValue({ rowCount: 0 }) }
  })

  it("does nothing when factors array is empty", async () => {
    await saveRejectedFactors(mockPool as any, [], "life", 1, "Test Actor")
    expect(mockPool.query).not.toHaveBeenCalled()
  })

  it("builds correct INSERT for a single factor", async () => {
    await saveRejectedFactors(mockPool as any, ["nepo_baby"], "life", 42, "Jane Fonda")

    expect(mockPool.query).toHaveBeenCalledOnce()
    const [sql, params] = mockPool.query.mock.calls[0]

    // Should have exactly one value group with 5 placeholders
    expect(sql).toContain("VALUES ($1, $2, $3, $4, $5)")
    expect(params).toEqual(["nepo_baby", "life", 42, "Jane Fonda", "biography-enrichment"])
  })

  it("builds correct multi-row INSERT for multiple factors", async () => {
    await saveRejectedFactors(
      mockPool as any,
      ["nepo_baby", "child_star", "controversial"],
      "life",
      42,
      "Jane Fonda"
    )

    expect(mockPool.query).toHaveBeenCalledOnce()
    const [sql, params] = mockPool.query.mock.calls[0]

    // Should have three value groups
    expect(sql).toContain("($1, $2, $3, $4, $5)")
    expect(sql).toContain("($6, $7, $8, $9, $10)")
    expect(sql).toContain("($11, $12, $13, $14, $15)")

    // 3 factors * 5 params each = 15 params
    expect(params).toHaveLength(15)

    // Verify first factor params
    expect(params[0]).toBe("nepo_baby")
    expect(params[1]).toBe("life")
    expect(params[2]).toBe(42)
    expect(params[3]).toBe("Jane Fonda")
    expect(params[4]).toBe("biography-enrichment")

    // Verify second factor params
    expect(params[5]).toBe("child_star")
    expect(params[6]).toBe("life")

    // Verify third factor params
    expect(params[10]).toBe("controversial")
  })

  it("uses 'death-enrichment' source for death type", async () => {
    await saveRejectedFactors(mockPool as any, ["poisoned"], "death", 10, "John Doe")

    const [, params] = mockPool.query.mock.calls[0]
    expect(params[1]).toBe("death")
    expect(params[4]).toBe("death-enrichment")
  })

  it("uses 'biography-enrichment' source for life type", async () => {
    await saveRejectedFactors(mockPool as any, ["nepo_baby"], "life", 10, "Jane Doe")

    const [, params] = mockPool.query.mock.calls[0]
    expect(params[1]).toBe("life")
    expect(params[4]).toBe("biography-enrichment")
  })

  it("logs error on database failure instead of throwing", async () => {
    const { logger } = await import("./logger.js")
    mockPool.query.mockRejectedValue(new Error("DB connection lost"))

    // Should not throw
    await saveRejectedFactors(mockPool as any, ["nepo_baby"], "life", 42, "Jane Fonda")

    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 42,
        actorName: "Jane Fonda",
        type: "life",
        factors: ["nepo_baby"],
      }),
      "Failed to save rejected factors"
    )
  })
})
