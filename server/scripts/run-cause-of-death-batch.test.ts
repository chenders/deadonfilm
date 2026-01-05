import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type Anthropic from "@anthropic-ai/sdk"
import type { Checkpoint } from "./backfill-cause-of-death-batch.js"

// Mock dependencies before importing the module under test
vi.mock("../src/lib/db.js", () => ({
  getPool: vi.fn(),
  resetPool: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("./backfill-cause-of-death-batch.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./backfill-cause-of-death-batch.js")>()
  return {
    ...actual,
    saveCheckpoint: vi.fn(),
    storeFailure: vi.fn().mockResolvedValue(undefined),
    stripMarkdownCodeFences: vi.fn((text: string) => text),
  }
})

vi.mock("../src/lib/newrelic.js", () => ({
  initNewRelic: vi.fn(),
  recordCustomEvent: vi.fn(),
}))

import { processResults, markActorAsChecked } from "./run-cause-of-death-batch.js"
import { getPool, resetPool } from "../src/lib/db.js"
import {
  saveCheckpoint,
  storeFailure,
  stripMarkdownCodeFences,
} from "./backfill-cause-of-death-batch.js"

// Suppress console output during tests
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(process.stdout, "write").mockImplementation(() => true)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("markActorAsChecked", () => {
  it("updates the actor record with checked timestamp", async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [] })
    const mockDb = { query: mockQuery }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await markActorAsChecked(mockDb as any, 123)

    expect(mockQuery).toHaveBeenCalledWith(
      `UPDATE actors SET cause_of_death_checked_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [123]
    )
  })
})

describe("processResults", () => {
  let mockDb: { query: ReturnType<typeof vi.fn> }
  let mockCheckpoint: Checkpoint

  beforeEach(() => {
    mockDb = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getPool).mockReturnValue(mockDb as any)

    mockCheckpoint = {
      batchId: "test-batch-123",
      processedActorIds: [],
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      stats: {
        submitted: 10,
        succeeded: 0,
        errored: 0,
        expired: 0,
        updatedCause: 0,
        updatedDetails: 0,
        updatedBirthday: 0,
        updatedDeathday: 0,
      },
    }
  })

  describe("JSON parse error handling", () => {
    it("calls storeFailure with json_parse error type when response is invalid JSON", async () => {
      const invalidJsonResponse = "I cannot provide that information"
      vi.mocked(stripMarkdownCodeFences).mockReturnValue(invalidJsonResponse)

      const mockResults = [
        {
          custom_id: "actor-456",
          result: {
            type: "succeeded" as const,
            message: {
              content: [{ type: "text" as const, text: invalidJsonResponse }],
            },
          },
        },
      ]

      const mockAnthropicResults = async function* () {
        for (const result of mockResults) {
          yield result
        }
      }

      const mockAnthropic = {
        messages: {
          batches: {
            results: vi.fn().mockResolvedValue(mockAnthropicResults()),
          },
        },
      } as unknown as Anthropic

      await processResults(mockAnthropic, "test-batch", mockCheckpoint)

      expect(storeFailure).toHaveBeenCalledWith(
        mockDb,
        "test-batch",
        456,
        "actor-456",
        invalidJsonResponse,
        expect.stringContaining(""), // Error message from JSON.parse
        "json_parse"
      )
    })

    it("marks actor as checked when JSON parsing fails", async () => {
      vi.mocked(stripMarkdownCodeFences).mockReturnValue("invalid json")

      const mockResults = [
        {
          custom_id: "actor-789",
          result: {
            type: "succeeded" as const,
            message: {
              content: [{ type: "text" as const, text: "invalid json" }],
            },
          },
        },
      ]

      const mockAnthropicResults = async function* () {
        for (const result of mockResults) {
          yield result
        }
      }

      const mockAnthropic = {
        messages: {
          batches: {
            results: vi.fn().mockResolvedValue(mockAnthropicResults()),
          },
        },
      } as unknown as Anthropic

      await processResults(mockAnthropic, "test-batch", mockCheckpoint)

      // Should call markActorAsChecked (which calls db.query with UPDATE)
      expect(mockDb.query).toHaveBeenCalledWith(
        `UPDATE actors SET cause_of_death_checked_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [789]
      )
    })

    it("increments checkpoint.stats.errored on JSON parse failure", async () => {
      vi.mocked(stripMarkdownCodeFences).mockReturnValue("not valid json")

      const mockResults = [
        {
          custom_id: "actor-100",
          result: {
            type: "succeeded" as const,
            message: {
              content: [{ type: "text" as const, text: "not valid json" }],
            },
          },
        },
      ]

      const mockAnthropicResults = async function* () {
        for (const result of mockResults) {
          yield result
        }
      }

      const mockAnthropic = {
        messages: {
          batches: {
            results: vi.fn().mockResolvedValue(mockAnthropicResults()),
          },
        },
      } as unknown as Anthropic

      await processResults(mockAnthropic, "test-batch", mockCheckpoint)

      expect(mockCheckpoint.stats.errored).toBe(1)
    })
  })

  describe("API error handling", () => {
    it("calls storeFailure with api_error type when result is errored", async () => {
      const mockError = { type: "api_error", message: "Rate limit exceeded" }

      const mockResults = [
        {
          custom_id: "actor-200",
          result: {
            type: "errored" as const,
            error: mockError,
          },
        },
      ]

      const mockAnthropicResults = async function* () {
        for (const result of mockResults) {
          yield result
        }
      }

      const mockAnthropic = {
        messages: {
          batches: {
            results: vi.fn().mockResolvedValue(mockAnthropicResults()),
          },
        },
      } as unknown as Anthropic

      await processResults(mockAnthropic, "test-batch", mockCheckpoint)

      expect(storeFailure).toHaveBeenCalledWith(
        mockDb,
        "test-batch",
        200,
        "actor-200",
        "",
        JSON.stringify(mockError),
        "api_error"
      )
    })

    it("marks actor as checked when API returns error", async () => {
      const mockResults = [
        {
          custom_id: "actor-201",
          result: {
            type: "errored" as const,
            error: { type: "server_error" },
          },
        },
      ]

      const mockAnthropicResults = async function* () {
        for (const result of mockResults) {
          yield result
        }
      }

      const mockAnthropic = {
        messages: {
          batches: {
            results: vi.fn().mockResolvedValue(mockAnthropicResults()),
          },
        },
      } as unknown as Anthropic

      await processResults(mockAnthropic, "test-batch", mockCheckpoint)

      expect(mockDb.query).toHaveBeenCalledWith(
        `UPDATE actors SET cause_of_death_checked_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [201]
      )
    })

    it("increments checkpoint.stats.errored on API error", async () => {
      const mockResults = [
        {
          custom_id: "actor-202",
          result: {
            type: "errored" as const,
            error: { type: "server_error" },
          },
        },
      ]

      const mockAnthropicResults = async function* () {
        for (const result of mockResults) {
          yield result
        }
      }

      const mockAnthropic = {
        messages: {
          batches: {
            results: vi.fn().mockResolvedValue(mockAnthropicResults()),
          },
        },
      } as unknown as Anthropic

      await processResults(mockAnthropic, "test-batch", mockCheckpoint)

      expect(mockCheckpoint.stats.errored).toBe(1)
    })
  })

  describe("expired request handling", () => {
    it("calls storeFailure with expired type when request expires", async () => {
      const mockResults = [
        {
          custom_id: "actor-300",
          result: {
            type: "expired" as const,
          },
        },
      ]

      const mockAnthropicResults = async function* () {
        for (const result of mockResults) {
          yield result
        }
      }

      const mockAnthropic = {
        messages: {
          batches: {
            results: vi.fn().mockResolvedValue(mockAnthropicResults()),
          },
        },
      } as unknown as Anthropic

      await processResults(mockAnthropic, "test-batch", mockCheckpoint)

      expect(storeFailure).toHaveBeenCalledWith(
        mockDb,
        "test-batch",
        300,
        "actor-300",
        "",
        "Request expired",
        "expired"
      )
    })

    it("marks actor as checked when request expires", async () => {
      const mockResults = [
        {
          custom_id: "actor-301",
          result: {
            type: "expired" as const,
          },
        },
      ]

      const mockAnthropicResults = async function* () {
        for (const result of mockResults) {
          yield result
        }
      }

      const mockAnthropic = {
        messages: {
          batches: {
            results: vi.fn().mockResolvedValue(mockAnthropicResults()),
          },
        },
      } as unknown as Anthropic

      await processResults(mockAnthropic, "test-batch", mockCheckpoint)

      expect(mockDb.query).toHaveBeenCalledWith(
        `UPDATE actors SET cause_of_death_checked_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [301]
      )
    })

    it("increments checkpoint.stats.expired on expired request", async () => {
      const mockResults = [
        {
          custom_id: "actor-302",
          result: {
            type: "expired" as const,
          },
        },
      ]

      const mockAnthropicResults = async function* () {
        for (const result of mockResults) {
          yield result
        }
      }

      const mockAnthropic = {
        messages: {
          batches: {
            results: vi.fn().mockResolvedValue(mockAnthropicResults()),
          },
        },
      } as unknown as Anthropic

      await processResults(mockAnthropic, "test-batch", mockCheckpoint)

      expect(mockCheckpoint.stats.expired).toBe(1)
    })
  })

  describe("mixed result handling", () => {
    it("handles multiple error types in a single batch", async () => {
      vi.mocked(stripMarkdownCodeFences).mockImplementation((text) => text)

      const mockResults = [
        {
          custom_id: "actor-400",
          result: {
            type: "succeeded" as const,
            message: {
              content: [{ type: "text" as const, text: "invalid json response" }],
            },
          },
        },
        {
          custom_id: "actor-401",
          result: {
            type: "errored" as const,
            error: { type: "rate_limit" },
          },
        },
        {
          custom_id: "actor-402",
          result: {
            type: "expired" as const,
          },
        },
      ]

      const mockAnthropicResults = async function* () {
        for (const result of mockResults) {
          yield result
        }
      }

      const mockAnthropic = {
        messages: {
          batches: {
            results: vi.fn().mockResolvedValue(mockAnthropicResults()),
          },
        },
      } as unknown as Anthropic

      const processed = await processResults(mockAnthropic, "test-batch", mockCheckpoint)

      expect(processed).toBe(3)
      expect(mockCheckpoint.stats.errored).toBe(2) // json_parse + api_error
      expect(mockCheckpoint.stats.expired).toBe(1)

      // All three actors should be marked as checked
      expect(mockDb.query).toHaveBeenCalledWith(
        `UPDATE actors SET cause_of_death_checked_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [400]
      )
      expect(mockDb.query).toHaveBeenCalledWith(
        `UPDATE actors SET cause_of_death_checked_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [401]
      )
      expect(mockDb.query).toHaveBeenCalledWith(
        `UPDATE actors SET cause_of_death_checked_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [402]
      )

      // All three should have storeFailure called
      expect(storeFailure).toHaveBeenCalledTimes(3)
    })
  })

  describe("checkpoint tracking", () => {
    it("adds processed actor IDs to checkpoint", async () => {
      vi.mocked(stripMarkdownCodeFences).mockReturnValue("invalid")

      const mockResults = [
        {
          custom_id: "actor-500",
          result: {
            type: "succeeded" as const,
            message: {
              content: [{ type: "text" as const, text: "invalid" }],
            },
          },
        },
      ]

      const mockAnthropicResults = async function* () {
        for (const result of mockResults) {
          yield result
        }
      }

      const mockAnthropic = {
        messages: {
          batches: {
            results: vi.fn().mockResolvedValue(mockAnthropicResults()),
          },
        },
      } as unknown as Anthropic

      await processResults(mockAnthropic, "test-batch", mockCheckpoint)

      expect(mockCheckpoint.processedActorIds).toContain(500)
    })

    it("skips already processed actors", async () => {
      mockCheckpoint.processedActorIds = [600]

      const mockResults = [
        {
          custom_id: "actor-600",
          result: {
            type: "expired" as const,
          },
        },
      ]

      const mockAnthropicResults = async function* () {
        for (const result of mockResults) {
          yield result
        }
      }

      const mockAnthropic = {
        messages: {
          batches: {
            results: vi.fn().mockResolvedValue(mockAnthropicResults()),
          },
        },
      } as unknown as Anthropic

      const processed = await processResults(mockAnthropic, "test-batch", mockCheckpoint)

      expect(processed).toBe(0) // Skipped
      expect(storeFailure).not.toHaveBeenCalled()
    })

    it("saves checkpoint after processing", async () => {
      const mockResults: Array<{
        custom_id: string
        result: { type: "expired" }
      }> = []

      const mockAnthropicResults = async function* () {
        for (const result of mockResults) {
          yield result
        }
      }

      const mockAnthropic = {
        messages: {
          batches: {
            results: vi.fn().mockResolvedValue(mockAnthropicResults()),
          },
        },
      } as unknown as Anthropic

      await processResults(mockAnthropic, "test-batch", mockCheckpoint)

      expect(saveCheckpoint).toHaveBeenCalled()
    })

    it("calls resetPool in finally block", async () => {
      const mockResults: Array<{
        custom_id: string
        result: { type: "expired" }
      }> = []

      const mockAnthropicResults = async function* () {
        for (const result of mockResults) {
          yield result
        }
      }

      const mockAnthropic = {
        messages: {
          batches: {
            results: vi.fn().mockResolvedValue(mockAnthropicResults()),
          },
        },
      } as unknown as Anthropic

      await processResults(mockAnthropic, "test-batch", mockCheckpoint)

      expect(resetPool).toHaveBeenCalled()
    })
  })
})
