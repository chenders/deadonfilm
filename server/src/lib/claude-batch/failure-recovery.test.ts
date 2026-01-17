import { describe, it, expect, vi, beforeEach, type Mock } from "vitest"
import { storeFailure, reprocessFailures } from "./failure-recovery.js"
import type { Pool, QueryResult } from "pg"

// Mock dependencies
vi.mock("./actor-updater.js", () => ({
  applyUpdate: vi.fn(),
}))

vi.mock("./response-parser.js", () => ({
  stripMarkdownCodeFences: vi.fn((text: string) => text),
  parseClaudeResponse: vi.fn(() => ({
    cause: "heart failure",
    cause_confidence: "high",
  })),
}))

vi.mock("./schemas.js", () => ({
  createEmptyCheckpoint: vi.fn(() => ({
    batchId: null,
    processedActorIds: [],
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    stats: {
      submitted: 0,
      succeeded: 0,
      errored: 0,
      expired: 0,
      updatedCause: 0,
      updatedDetails: 0,
      updatedBirthday: 0,
      updatedDeathday: 0,
      updatedManner: 0,
      updatedCategories: 0,
      updatedCircumstances: 0,
      createdCircumstancesRecord: 0,
    },
  })),
}))

function createMockPool(): Pool {
  return {
    query: vi.fn(),
  } as unknown as Pool
}

describe("storeFailure", () => {
  let mockPool: Pool

  beforeEach(() => {
    mockPool = createMockPool()
    vi.clearAllMocks()
  })

  it("inserts failure record into database", async () => {
    ;(mockPool.query as Mock).mockResolvedValue({ rows: [] })

    await storeFailure(
      mockPool,
      "batch-123",
      456,
      "actor-456",
      '{"cause": "unknown"}',
      "JSON parse error",
      "json_parse"
    )

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO batch_response_failures"),
      ["batch-123", 456, "actor-456", '{"cause": "unknown"}', "JSON parse error", "json_parse"]
    )
  })

  it("uses ON CONFLICT DO NOTHING to avoid duplicates", async () => {
    ;(mockPool.query as Mock).mockResolvedValue({ rows: [] })

    await storeFailure(mockPool, "batch-1", 1, "actor-1", "response", "error", "unknown")

    const query = (mockPool.query as Mock).mock.calls[0][0]
    expect(query).toContain("ON CONFLICT DO NOTHING")
  })

  it("does not throw when database query fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    ;(mockPool.query as Mock).mockRejectedValue(new Error("DB connection failed"))

    // Should not throw
    await expect(
      storeFailure(mockPool, "batch-1", 1, "actor-1", "response", "error", "unknown")
    ).resolves.not.toThrow()

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to store failure record"),
      expect.any(Error)
    )

    consoleSpy.mockRestore()
  })

  it("accepts all valid error types", async () => {
    ;(mockPool.query as Mock).mockResolvedValue({ rows: [] })

    const errorTypes = [
      "json_parse",
      "date_parse",
      "validation",
      "api_error",
      "expired",
      "unknown",
    ] as const

    for (const errorType of errorTypes) {
      await storeFailure(mockPool, "batch-1", 1, "actor-1", "response", "error", errorType)
    }

    expect(mockPool.query).toHaveBeenCalledTimes(errorTypes.length)
  })
})

describe("reprocessFailures", () => {
  let mockPool: Pool

  beforeEach(() => {
    mockPool = createMockPool()
    vi.clearAllMocks()
  })

  it("returns zeros when no failures found", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    ;(mockPool.query as Mock).mockResolvedValue({ rows: [] })

    const result = await reprocessFailures(mockPool)

    expect(result).toEqual({ total: 0, succeeded: 0, failed: 0 })
    expect(consoleSpy).toHaveBeenCalledWith("No unprocessed failures found.")

    consoleSpy.mockRestore()
  })

  it("queries all failures when no batchId provided", async () => {
    ;(mockPool.query as Mock).mockResolvedValue({ rows: [] })

    await reprocessFailures(mockPool)

    const query = (mockPool.query as Mock).mock.calls[0][0]
    expect(query).toContain("WHERE reprocessed_at IS NULL")
    expect(query).not.toContain("batch_id = $1")
    expect((mockPool.query as Mock).mock.calls[0][1]).toEqual([])
  })

  it("filters by batchId when provided", async () => {
    ;(mockPool.query as Mock).mockResolvedValue({ rows: [] })

    await reprocessFailures(mockPool, "specific-batch-123")

    const query = (mockPool.query as Mock).mock.calls[0][0]
    expect(query).toContain("batch_id = $1")
    expect((mockPool.query as Mock).mock.calls[0][1]).toEqual(["specific-batch-123"])
  })

  it("processes failures and returns stats", async () => {
    const { applyUpdate } = await import("./actor-updater.js")
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    // First call returns failures, subsequent calls are updates
    ;(mockPool.query as Mock)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            batch_id: "batch-1",
            actor_id: 100,
            custom_id: "actor-100",
            raw_response: '{"cause": "cancer"}',
            error_type: "json_parse",
          },
          {
            id: 2,
            batch_id: "batch-1",
            actor_id: 200,
            custom_id: "actor-200",
            raw_response: '{"cause": "heart attack"}',
            error_type: "json_parse",
          },
        ],
      })
      .mockResolvedValue({ rows: [] }) // For update queries

    const result = await reprocessFailures(mockPool)

    expect(result.total).toBe(2)
    expect(result.succeeded).toBe(2)
    expect(result.failed).toBe(0)
    expect(applyUpdate).toHaveBeenCalledTimes(2)

    consoleSpy.mockRestore()
  })

  it("marks successful reprocessing in database", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    ;(mockPool.query as Mock)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 42,
            batch_id: "batch-1",
            actor_id: 100,
            custom_id: "actor-100",
            raw_response: '{"cause": "cancer"}',
            error_type: "json_parse",
          },
        ],
      })
      .mockResolvedValue({ rows: [] })

    await reprocessFailures(mockPool)

    // Find the UPDATE call
    const updateCall = (mockPool.query as Mock).mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" && call[0].includes("UPDATE batch_response_failures")
    )
    expect(updateCall).toBeDefined()
    expect(updateCall![0]).toContain("SET reprocessed_at = NOW()")
    expect(updateCall![1][1]).toBe(42) // failure id

    consoleSpy.mockRestore()
  })

  it("handles parse errors during reprocessing", async () => {
    const { parseClaudeResponse } = await import("./response-parser.js")
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    ;(parseClaudeResponse as Mock).mockImplementationOnce(() => {
      throw new Error("Invalid JSON structure")
    })
    ;(mockPool.query as Mock).mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          batch_id: "batch-1",
          actor_id: 100,
          custom_id: "actor-100",
          raw_response: "invalid json",
          error_type: "json_parse",
        },
      ],
    })

    const result = await reprocessFailures(mockPool)

    expect(result.total).toBe(1)
    expect(result.succeeded).toBe(0)
    expect(result.failed).toBe(1)
    // The error is logged as a single formatted string
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Actor 100: Invalid JSON structure")
    )

    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  it("logs summary after processing", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    ;(mockPool.query as Mock)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            batch_id: "batch-1",
            actor_id: 100,
            custom_id: "actor-100",
            raw_response: '{"cause": "test"}',
            error_type: "json_parse",
          },
        ],
      })
      .mockResolvedValue({ rows: [] })

    await reprocessFailures(mockPool)

    expect(consoleSpy).toHaveBeenCalledWith("\nReprocessing complete:")
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Total:"))
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Succeeded:"))
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Failed:"))

    consoleSpy.mockRestore()
  })
})
