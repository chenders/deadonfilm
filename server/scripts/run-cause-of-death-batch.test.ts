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

vi.mock("../src/lib/newrelic.js", () => ({}))

import { processResults, markActorAsChecked, setVerboseMode } from "./run-cause-of-death-batch.js"
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
        updatedManner: 0,
        updatedCategories: 0,
        updatedCircumstances: 0,
        createdCircumstancesRecord: 0,
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

  describe("force parameter behavior", () => {
    it("overwrites existing cause_of_death when force=true", async () => {
      // Mock actor with existing cause
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ name: "Test Actor" }] }) // Name lookup
        .mockResolvedValueOnce({
          rows: [
            {
              cause_of_death: "existing cause",
              cause_of_death_details: "existing details",
            },
          ],
        }) // Actor data lookup
        .mockResolvedValue({ rows: [] }) // Subsequent queries

      const validJson = JSON.stringify({ cause: "new cause", details: "new details" })
      vi.mocked(stripMarkdownCodeFences).mockReturnValue(validJson)

      const mockResults = [
        {
          custom_id: "actor-700",
          result: {
            type: "succeeded" as const,
            message: {
              content: [{ type: "text" as const, text: validJson }],
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

      await processResults(mockAnthropic, "test-batch", mockCheckpoint, true) // force=true

      // Should have called UPDATE with cause_of_death
      const updateCalls = mockDb.query.mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("UPDATE actors SET")
      )
      expect(updateCalls.length).toBeGreaterThan(0)
      const updateCall = updateCalls[0]
      expect(updateCall[0]).toContain("cause_of_death =")
      expect(updateCall[1]).toContain("New cause") // Sentence case applied

      // Stats should show updated
      expect(mockCheckpoint.stats.updatedCause).toBe(1)
      expect(mockCheckpoint.stats.updatedDetails).toBe(1)
    })

    it("preserves existing cause_of_death when force=false (default)", async () => {
      // Mock actor with existing cause
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ name: "Test Actor" }] }) // Name lookup
        .mockResolvedValueOnce({
          rows: [
            {
              cause_of_death: "existing cause",
              cause_of_death_details: "existing details",
            },
          ],
        }) // Actor data lookup
        .mockResolvedValue({ rows: [] }) // Subsequent queries

      const validJson = JSON.stringify({ cause: "new cause", details: "new details" })
      vi.mocked(stripMarkdownCodeFences).mockReturnValue(validJson)

      const mockResults = [
        {
          custom_id: "actor-701",
          result: {
            type: "succeeded" as const,
            message: {
              content: [{ type: "text" as const, text: validJson }],
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

      await processResults(mockAnthropic, "test-batch", mockCheckpoint, false) // force=false

      // The UPDATE should NOT include cause_of_death (only checked_at and updated_at)
      const updateCalls = mockDb.query.mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("UPDATE actors SET")
      )
      expect(updateCalls.length).toBeGreaterThan(0)
      const updateCall = updateCalls[0]
      // Should not have cause_of_death param value in values array (only actor ID)
      expect(updateCall[1]).toEqual([701])

      // Stats should NOT show updates
      expect(mockCheckpoint.stats.updatedCause).toBe(0)
      expect(mockCheckpoint.stats.updatedDetails).toBe(0)
    })

    it("updates cause_of_death when force=false and actor has no existing cause", async () => {
      // Mock actor WITHOUT existing cause
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ name: "Test Actor" }] }) // Name lookup
        .mockResolvedValueOnce({
          rows: [
            {
              cause_of_death: null,
              cause_of_death_details: null,
            },
          ],
        }) // Actor data lookup
        .mockResolvedValue({ rows: [] }) // Subsequent queries

      const validJson = JSON.stringify({ cause: "heart attack", details: "sudden cardiac arrest" })
      vi.mocked(stripMarkdownCodeFences).mockReturnValue(validJson)

      const mockResults = [
        {
          custom_id: "actor-702",
          result: {
            type: "succeeded" as const,
            message: {
              content: [{ type: "text" as const, text: validJson }],
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

      await processResults(mockAnthropic, "test-batch", mockCheckpoint, false) // force=false

      // Should have called UPDATE with cause_of_death (because no existing value)
      const updateCalls = mockDb.query.mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("UPDATE actors SET")
      )
      expect(updateCalls.length).toBeGreaterThan(0)
      const updateCall = updateCalls[0]
      expect(updateCall[0]).toContain("cause_of_death =")

      // Stats should show updated
      expect(mockCheckpoint.stats.updatedCause).toBe(1)
      expect(mockCheckpoint.stats.updatedDetails).toBe(1)
    })

    it("creates history records when force overwrites existing values", async () => {
      // Mock actor with existing cause
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ name: "Test Actor" }] }) // Name lookup
        .mockResolvedValueOnce({
          rows: [
            {
              cause_of_death: "old cause",
              cause_of_death_details: "old details",
            },
          ],
        }) // Actor data lookup
        .mockResolvedValue({ rows: [] }) // Subsequent queries

      const validJson = JSON.stringify({ cause: "new cause", details: "new details" })
      vi.mocked(stripMarkdownCodeFences).mockReturnValue(validJson)

      const mockResults = [
        {
          custom_id: "actor-703",
          result: {
            type: "succeeded" as const,
            message: {
              content: [{ type: "text" as const, text: validJson }],
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

      await processResults(mockAnthropic, "test-batch", mockCheckpoint, true) // force=true

      // Should have created history records
      const historyInserts = mockDb.query.mock.calls.filter(
        (call) =>
          typeof call[0] === "string" && call[0].includes("INSERT INTO actor_death_info_history")
      )

      // Should have 2 history inserts (one for cause, one for details)
      expect(historyInserts.length).toBe(2)

      // Check cause history record
      const causeHistory = historyInserts.find((call) => call[1]?.[1] === "cause_of_death")
      expect(causeHistory).toBeDefined()
      expect(causeHistory![1]).toContain("old cause") // old_value
      expect(causeHistory![1]).toContain("New cause") // new_value (sentence case)

      // Check details history record
      const detailsHistory = historyInserts.find(
        (call) => call[1]?.[1] === "cause_of_death_details"
      )
      expect(detailsHistory).toBeDefined()
      expect(detailsHistory![1]).toContain("old details") // old_value
      expect(detailsHistory![1]).toContain("new details") // new_value
    })
  })

  describe("verbose mode logging", () => {
    afterEach(() => {
      // Reset to default verbose mode after each test
      setVerboseMode(true)
    })

    it("calls console.log when verboseMode is true", async () => {
      setVerboseMode(true)

      // Mock actor without existing cause
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ name: "Test Actor" }] }) // Name lookup
        .mockResolvedValueOnce({
          rows: [{ cause_of_death: null, cause_of_death_details: null }],
        }) // Actor data lookup
        .mockResolvedValue({ rows: [] }) // Subsequent queries

      const validJson = JSON.stringify({ cause: "heart attack", details: "sudden cardiac arrest" })
      vi.mocked(stripMarkdownCodeFences).mockReturnValue(validJson)

      const mockResults = [
        {
          custom_id: "actor-800",
          result: {
            type: "succeeded" as const,
            message: {
              content: [{ type: "text" as const, text: validJson }],
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

      await processResults(mockAnthropic, "test-batch", mockCheckpoint, false)

      // In verbose mode, console.log should have been called with actor info
      expect(console.log).toHaveBeenCalled()
    })

    it("does not log actor details when verboseMode is false", async () => {
      setVerboseMode(false)

      // Mock actor without existing cause
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ name: "Test Actor" }] }) // Name lookup
        .mockResolvedValueOnce({
          rows: [{ cause_of_death: null, cause_of_death_details: null }],
        }) // Actor data lookup
        .mockResolvedValue({ rows: [] }) // Subsequent queries

      const validJson = JSON.stringify({ cause: "heart attack", details: "sudden cardiac arrest" })
      vi.mocked(stripMarkdownCodeFences).mockReturnValue(validJson)

      const mockResults = [
        {
          custom_id: "actor-801",
          result: {
            type: "succeeded" as const,
            message: {
              content: [{ type: "text" as const, text: validJson }],
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

      // Clear previous console.log calls from beforeEach setup
      vi.mocked(console.log).mockClear()

      await processResults(mockAnthropic, "test-batch", mockCheckpoint, false)

      // In quiet mode, console.log should NOT have been called with actor-specific info
      // (only checkpoint progress messages are allowed)
      const logCalls = vi.mocked(console.log).mock.calls
      const actorLogCalls = logCalls.filter(
        (call) =>
          call[0]?.toString().includes("Test Actor") ||
          call[0]?.toString().includes("heart attack") ||
          call[0]?.toString().includes("Cause:")
      )
      expect(actorLogCalls).toHaveLength(0)
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
