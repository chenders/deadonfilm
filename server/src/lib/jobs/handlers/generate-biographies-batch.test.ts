/**
 * Tests for GenerateBiographiesBatchHandler
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { GenerateBiographiesBatchHandler } from "./generate-biographies-batch.js"
import { JobType, QueueName } from "../types.js"

// ============================================================
// Mocks
// ============================================================

// Mock Anthropic SDK with a function constructor (NOT arrow function — needed for `new`)
const mockCreate = vi.fn()
const mockRetrieve = vi.fn()
const mockResults = vi.fn()
const mockCancel = vi.fn()

vi.mock("@anthropic-ai/sdk", () => ({
  default: function MockAnthropic() {
    return {
      messages: {
        batches: {
          create: mockCreate,
          retrieve: mockRetrieve,
          results: mockResults,
          cancel: mockCancel,
        },
      },
    }
  },
}))

// Mock database pool
const mockQuery = vi.fn()

vi.mock("../../db.js", () => ({
  getPool: vi.fn(() => ({
    query: mockQuery,
  })),
}))

// Mock TMDB
const mockBatchGetPersonDetails = vi.fn()

vi.mock("../../tmdb.js", () => ({
  batchGetPersonDetails: (...args: unknown[]) => mockBatchGetPersonDetails(...args),
}))

// Mock Wikipedia fetcher
const mockBatchFetchWikipediaIntros = vi.fn()

vi.mock("../../biography/wikipedia-fetcher.js", () => ({
  batchFetchWikipediaIntros: (...args: unknown[]) => mockBatchFetchWikipediaIntros(...args),
}))

// Mock biography generator
vi.mock("../../biography/biography-generator.js", () => ({
  buildBiographyPrompt: vi.fn(
    (name: string, tmdbBio: string, _wikiBio?: string) =>
      `Generate biography for ${name}: ${tmdbBio}`
  ),
  parseResponse: vi.fn((text: string) => ({
    biography: `Parsed: ${text}`,
    hasSubstantiveContent: true,
  })),
  determineSourceUrl: vi.fn((actor: { wikipediaUrl?: string | null }) =>
    actor.wikipediaUrl
      ? { url: actor.wikipediaUrl, type: "wikipedia" }
      : { url: "https://www.themoviedb.org", type: "tmdb" }
  ),
  BATCH_PRICING: {
    input: 1.5,
    output: 7.5,
  },
  MODEL_ID: "claude-sonnet-4-20250514",
}))

// Mock cache
vi.mock("../../cache.js", () => ({
  invalidateActorCache: vi.fn().mockResolvedValue(undefined),
}))

// Mock newrelic
vi.mock("newrelic", () => ({
  default: {
    recordCustomEvent: vi.fn(),
  },
}))

// Mock logger
vi.mock("../../logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}))

// ============================================================
// Helpers
// ============================================================

function createMockJob(data: Record<string, unknown> = {}) {
  return {
    id: "job-123",
    data: {
      limit: 100,
      minPopularity: 0,
      allowRegeneration: false,
      ...data,
    },
    attemptsMade: 0,
    opts: { attempts: 3 },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  }
}

function makeActorRow(
  id: number,
  tmdbId: number,
  name: string,
  wikipediaUrl: string | null = null
) {
  return {
    id,
    tmdb_id: tmdbId,
    name,
    wikipedia_url: wikipediaUrl,
    imdb_person_id: null,
  }
}

async function* asyncResults<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item
  }
}

function makeSucceededResult(actorId: number, responseText: string) {
  return {
    custom_id: `actor-${actorId}`,
    result: {
      type: "succeeded" as const,
      message: {
        content: [{ type: "text" as const, text: responseText }],
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    },
  }
}

// ============================================================
// Tests
// ============================================================

describe("GenerateBiographiesBatchHandler", () => {
  let handler: GenerateBiographiesBatchHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new GenerateBiographiesBatchHandler()
    // Override delay to avoid waiting in tests
    vi.spyOn(handler as any, "delay").mockResolvedValue(undefined)
  })

  describe("configuration", () => {
    it("should have correct job type", () => {
      expect(handler.jobType).toBe(JobType.GENERATE_BIOGRAPHIES_BATCH)
    })

    it("should have correct queue name", () => {
      expect(handler.queueName).toBe(QueueName.ENRICHMENT)
    })
  })

  describe("process", () => {
    it("should return success with zeros when no actors to process", async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      const job = createMockJob({ actorIds: [1, 2, 3] })
      const result = await handler.process(job as any)

      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        total: 0,
        succeeded: 0,
        failed: 0,
        skippedNoContent: 0,
        totalCostUsd: 0,
        anthropicBatchId: null,
      })
      // Should not have called TMDB or Wikipedia or Anthropic
      expect(mockBatchGetPersonDetails).not.toHaveBeenCalled()
      expect(mockBatchFetchWikipediaIntros).not.toHaveBeenCalled()
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it("should skip actors with no substantial TMDB bio and mark them as no-content", async () => {
      const actor1 = makeActorRow(100, 1000, "Short Bio Actor")
      const actor2 = makeActorRow(200, 2000, "Also Short Bio")

      // queryActors returns two actors
      mockQuery.mockResolvedValueOnce({ rows: [actor1, actor2] })
      // Subsequent UPDATE calls for biography_raw_tmdb and no-content flag
      mockQuery.mockResolvedValue({ rows: [] })

      // TMDB returns short bios (< 50 chars)
      mockBatchGetPersonDetails.mockResolvedValue(
        new Map([
          [1000, { biography: "Short." }],
          [2000, { biography: "" }],
        ])
      )
      mockBatchFetchWikipediaIntros.mockResolvedValue(new Map())

      const job = createMockJob({ actorIds: [100, 200] })
      const result = await handler.process(job as any)

      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        total: 2,
        succeeded: 0,
        failed: 0,
        skippedNoContent: 2,
        totalCostUsd: 0,
        anthropicBatchId: null,
      })

      // Should have updated actors with no-content flag
      const noContentCalls = mockQuery.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === "string" &&
          (call[0] as string).includes("biography_has_content = false")
      )
      expect(noContentCalls).toHaveLength(2)

      // Should not have submitted to Anthropic
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it("should process full flow: prefetch, submit batch, poll, process results, update DB", async () => {
      const actor1 = makeActorRow(
        100,
        1000,
        "John Wayne",
        "https://en.wikipedia.org/wiki/John_Wayne"
      )
      const actor2 = makeActorRow(200, 2000, "Marlon Brando")

      // queryActors returns two actors
      mockQuery.mockResolvedValueOnce({ rows: [actor1, actor2] })
      // All subsequent UPDATE queries succeed
      mockQuery.mockResolvedValue({ rows: [] })

      // TMDB returns substantial bios (>= 50 chars)
      const longBio1 =
        "John Wayne was an American actor who became a popular icon through his roles in Western films."
      const longBio2 =
        "Marlon Brando Jr. was an American actor considered one of the most influential actors of all time."
      mockBatchGetPersonDetails.mockResolvedValue(
        new Map([
          [1000, { biography: longBio1 }],
          [2000, { biography: longBio2 }],
        ])
      )

      // Wikipedia returns intro for actor1 (who has wikipedia_url)
      mockBatchFetchWikipediaIntros.mockResolvedValue(
        new Map([[100, "John Wayne wiki intro text."]])
      )

      // Anthropic batch creation
      const batchId = "batch_abc123"
      mockCreate.mockResolvedValue({
        id: batchId,
        processing_status: "in_progress",
        request_counts: { succeeded: 0, processing: 2 },
      })

      // Polling: first call still in progress, second call ended
      mockRetrieve
        .mockResolvedValueOnce({
          id: batchId,
          processing_status: "in_progress",
          request_counts: { succeeded: 1, processing: 1 },
        })
        .mockResolvedValueOnce({
          id: batchId,
          processing_status: "ended",
          request_counts: { succeeded: 2, processing: 0 },
        })

      // Results stream
      mockResults.mockResolvedValue(
        asyncResults([
          makeSucceededResult(100, '{"biography":"John Wayne bio","hasSubstantiveContent":true}'),
          makeSucceededResult(
            200,
            '{"biography":"Marlon Brando bio","hasSubstantiveContent":true}'
          ),
        ])
      )

      const job = createMockJob({ actorIds: [100, 200] })
      const result = await handler.process(job as any)

      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        total: 2,
        succeeded: 2,
        failed: 0,
        skippedNoContent: 0,
        totalCostUsd: expect.any(Number),
        anthropicBatchId: batchId,
      })

      // Verify batch was created with correct number of requests
      expect(mockCreate).toHaveBeenCalledOnce()
      const createArgs = mockCreate.mock.calls[0][0]
      expect(createArgs.requests).toHaveLength(2)
      expect(createArgs.requests[0].custom_id).toBe("actor-100")
      expect(createArgs.requests[1].custom_id).toBe("actor-200")

      // Verify polling happened
      expect(mockRetrieve).toHaveBeenCalledTimes(2)
      expect(mockRetrieve).toHaveBeenCalledWith(batchId)

      // Verify results were streamed
      expect(mockResults).toHaveBeenCalledWith(batchId)

      // Verify DB was updated with biography data for each actor
      const biographyUpdateCalls = mockQuery.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === "string" && (call[0] as string).includes("biography =")
      )
      expect(biographyUpdateCalls).toHaveLength(2)

      // Verify progress was updated through multiple phases
      const progressCalls = job.updateProgress.mock.calls
      expect(progressCalls.length).toBeGreaterThanOrEqual(4)

      // Check that the phases progressed: prefetch -> submit -> polling -> processing -> completed
      const phases = progressCalls.map(
        (call: unknown[]) => (call[0] as Record<string, unknown>).phase
      )
      expect(phases).toContain("prefetch")
      expect(phases).toContain("submit")
      expect(phases).toContain("polling")
      expect(phases).toContain("processing")
      expect(phases).toContain("completed")
    })

    it("should throw timeout error when batch polling exceeds max wait time", async () => {
      const actor1 = makeActorRow(100, 1000, "John Wayne")

      // queryActors returns one actor
      mockQuery.mockResolvedValueOnce({ rows: [actor1] })
      // Subsequent UPDATE queries succeed
      mockQuery.mockResolvedValue({ rows: [] })

      // TMDB returns substantial bio
      const longBio =
        "John Wayne was an American actor who became a popular icon through his roles in Western films."
      mockBatchGetPersonDetails.mockResolvedValue(new Map([[1000, { biography: longBio }]]))
      mockBatchFetchWikipediaIntros.mockResolvedValue(new Map())

      // Anthropic batch creation
      const batchId = "batch_timeout_test"
      mockCreate.mockResolvedValue({
        id: batchId,
        processing_status: "in_progress",
        request_counts: { succeeded: 0, processing: 1 },
      })

      // Polling always returns in_progress — never reaches "ended"
      mockRetrieve.mockResolvedValue({
        id: batchId,
        processing_status: "in_progress",
        request_counts: { succeeded: 0, processing: 1 },
      })

      // Cancel succeeds
      mockCancel.mockResolvedValue(undefined)

      // Override delay to advance Date.now() past the timeout threshold.
      // BATCH_MAX_WAIT_MS = 4 * 60 * 60 * 1000 = 14,400,000 ms
      let callCount = 0
      const realDateNow = Date.now
      vi.spyOn(handler as any, "delay").mockImplementation(async () => {
        callCount++
        if (callCount >= 2) {
          // After a couple polls, make Date.now() return a time past the timeout
          vi.spyOn(Date, "now").mockReturnValue(realDateNow() + 5 * 60 * 60 * 1000)
        }
      })

      const job = createMockJob({ actorIds: [100] })

      await expect(handler.process(job as any)).rejects.toThrow(/timed out/i)

      // Verify the batch was cancelled
      expect(mockCancel).toHaveBeenCalledWith(batchId)

      // Restore Date.now
      vi.restoreAllMocks()
    })

    it("should handle failed batch results gracefully", async () => {
      const actor1 = makeActorRow(100, 1000, "John Wayne")

      mockQuery.mockResolvedValueOnce({ rows: [actor1] })
      mockQuery.mockResolvedValue({ rows: [] })

      const longBio =
        "John Wayne was an American actor who became a popular icon through his roles in Western films."
      mockBatchGetPersonDetails.mockResolvedValue(new Map([[1000, { biography: longBio }]]))
      mockBatchFetchWikipediaIntros.mockResolvedValue(new Map())

      const batchId = "batch_with_failures"
      mockCreate.mockResolvedValue({
        id: batchId,
        processing_status: "ended",
        request_counts: { succeeded: 0, processing: 0 },
      })

      // Results stream has a failed result
      mockResults.mockResolvedValue(
        asyncResults([
          {
            custom_id: "actor-100",
            result: {
              type: "errored",
              error: { message: "Rate limited" },
            },
          },
        ])
      )

      const job = createMockJob({ actorIds: [100] })
      const result = await handler.process(job as any)

      expect(result.success).toBe(true)
      expect(result.data?.succeeded).toBe(0)
      expect(result.data?.failed).toBe(1)
      expect(result.data?.anthropicBatchId).toBe(batchId)
    })

    it("should handle a mix of actors with and without substantial bios", async () => {
      const actor1 = makeActorRow(100, 1000, "Long Bio Actor")
      const actor2 = makeActorRow(200, 2000, "Short Bio Actor")

      mockQuery.mockResolvedValueOnce({ rows: [actor1, actor2] })
      mockQuery.mockResolvedValue({ rows: [] })

      const longBio =
        "This is a substantial biography that exceeds the fifty character minimum length for processing."
      mockBatchGetPersonDetails.mockResolvedValue(
        new Map([
          [1000, { biography: longBio }],
          [2000, { biography: "Too short" }],
        ])
      )
      mockBatchFetchWikipediaIntros.mockResolvedValue(new Map())

      const batchId = "batch_mixed"
      mockCreate.mockResolvedValue({
        id: batchId,
        processing_status: "ended",
        request_counts: { succeeded: 1, processing: 0 },
      })

      mockResults.mockResolvedValue(
        asyncResults([
          makeSucceededResult(100, '{"biography":"Actor bio","hasSubstantiveContent":true}'),
        ])
      )

      const job = createMockJob({ actorIds: [100, 200] })
      const result = await handler.process(job as any)

      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        total: 2,
        succeeded: 1,
        failed: 0,
        skippedNoContent: 1,
        totalCostUsd: expect.any(Number),
        anthropicBatchId: batchId,
      })

      // Only one request should have been sent to Anthropic
      expect(mockCreate.mock.calls[0][0].requests).toHaveLength(1)
      expect(mockCreate.mock.calls[0][0].requests[0].custom_id).toBe("actor-100")
    })
  })
})
