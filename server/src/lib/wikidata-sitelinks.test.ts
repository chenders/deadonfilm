/**
 * Tests for Wikidata Sitelinks API Client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  fetchSitelinksByTmdbId,
  fetchSitelinksByWikipediaUrl,
  fetchSitelinksBatch,
} from "./wikidata-sitelinks.js"

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

function sparqlResponse(bindings: Record<string, { value: string }>[]) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ results: { bindings } }),
  }
}

function errorResponse(status: number) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({}),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  mockFetch.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * Helper to run an async function that uses setTimeout-based retries/rate limiting
 * with fake timers. Starts the operation, then repeatedly advances timers until it resolves.
 */
async function runWithFakeTimers<T>(fn: () => Promise<T>): Promise<T> {
  const promise = fn()
  // Advance all pending timers (rate limiter delays, retry backoffs)
  // Loop because each timer advancement may queue new timers
  for (let i = 0; i < 20; i++) {
    await vi.advanceTimersByTimeAsync(10_000)
  }
  return promise
}

describe("fetchSitelinksByTmdbId", () => {
  it("returns sitelinks count for a valid TMDB ID", async () => {
    mockFetch.mockResolvedValueOnce(
      sparqlResponse([
        {
          item: { value: "http://www.wikidata.org/entity/Q37079" },
          sitelinks: { value: "85" },
        },
      ])
    )

    const result = await runWithFakeTimers(() => fetchSitelinksByTmdbId(500))
    expect(result).toBe(85)
    expect(mockFetch).toHaveBeenCalledOnce()
    const body = mockFetch.mock.calls[0][1]?.body as string
    expect(body).toContain("P4985")
    expect(body).toContain("500")
  })

  it("returns null when no results found", async () => {
    mockFetch.mockResolvedValueOnce(sparqlResponse([]))

    const result = await runWithFakeTimers(() => fetchSitelinksByTmdbId(99999999))
    expect(result).toBeNull()
  })

  it("returns null on network error after retries", async () => {
    // All 4 attempts (initial + 3 retries) fail
    mockFetch
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"))

    const result = await runWithFakeTimers(() => fetchSitelinksByTmdbId(500))
    expect(result).toBeNull()
  })

  it("retries on 429 response", async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(429))
      .mockResolvedValueOnce(
        sparqlResponse([{ item: { value: "Q1" }, sitelinks: { value: "42" } }])
      )

    const result = await runWithFakeTimers(() => fetchSitelinksByTmdbId(500))
    expect(result).toBe(42)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it("retries on 500 response", async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(
        sparqlResponse([{ item: { value: "Q1" }, sitelinks: { value: "30" } }])
      )

    const result = await runWithFakeTimers(() => fetchSitelinksByTmdbId(500))
    expect(result).toBe(30)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it("returns null after max retries exhausted on 429", async () => {
    // 4 total calls: initial + 3 retries, all 429
    mockFetch.mockResolvedValue(errorResponse(429))

    const result = await runWithFakeTimers(() => fetchSitelinksByTmdbId(500))
    expect(result).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(4)
  })

  it("returns 0 when sitelinks value is missing", async () => {
    mockFetch.mockResolvedValueOnce(sparqlResponse([{ item: { value: "Q1" } }]))

    const result = await runWithFakeTimers(() => fetchSitelinksByTmdbId(500))
    // Missing sitelinks property → parsed as "0"
    expect(result).toBe(0)
  })
})

describe("fetchSitelinksByWikipediaUrl", () => {
  it("returns sitelinks count for a valid Wikipedia URL", async () => {
    mockFetch.mockResolvedValueOnce(
      sparqlResponse([
        {
          item: { value: "http://www.wikidata.org/entity/Q37079" },
          sitelinks: { value: "85" },
        },
      ])
    )

    const result = await runWithFakeTimers(() =>
      fetchSitelinksByWikipediaUrl("https://en.wikipedia.org/wiki/Tom_Cruise")
    )
    expect(result).toBe(85)
    // Body URL-encodes the query which includes name with spaces (Tom_Cruise → Tom Cruise → Tom%20Cruise)
    const body = mockFetch.mock.calls[0][1]?.body as string
    expect(body).toContain("Tom%20Cruise")
  })

  it("handles mobile Wikipedia URLs", async () => {
    mockFetch.mockResolvedValueOnce(
      sparqlResponse([{ item: { value: "Q1" }, sitelinks: { value: "50" } }])
    )

    const result = await runWithFakeTimers(() =>
      fetchSitelinksByWikipediaUrl("https://en.m.wikipedia.org/wiki/Tom_Cruise")
    )
    expect(result).toBe(50)
  })

  it("returns null for non-English Wikipedia URLs", async () => {
    const result = await runWithFakeTimers(() =>
      fetchSitelinksByWikipediaUrl("https://fr.wikipedia.org/wiki/Tom_Cruise")
    )
    expect(result).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("returns null for invalid URLs", async () => {
    const result = await runWithFakeTimers(() => fetchSitelinksByWikipediaUrl("not-a-url"))
    expect(result).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("returns null for empty URL", async () => {
    const result = await runWithFakeTimers(() => fetchSitelinksByWikipediaUrl(""))
    expect(result).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe("fetchSitelinksBatch", () => {
  it("returns sitelinks map for multiple TMDB IDs", async () => {
    mockFetch.mockResolvedValueOnce(
      sparqlResponse([
        { tmdbId: { value: "500" }, sitelinks: { value: "85" } },
        { tmdbId: { value: "6193" }, sitelinks: { value: "72" } },
        { tmdbId: { value: "192" }, sitelinks: { value: "45" } },
      ])
    )

    const { results, queriedIds } = await runWithFakeTimers(() =>
      fetchSitelinksBatch([500, 6193, 192])
    )
    expect(results.size).toBe(3)
    expect(results.get(500)).toBe(85)
    expect(results.get(6193)).toBe(72)
    expect(results.get(192)).toBe(45)
    // All IDs should be in queriedIds (successful chunk)
    expect(queriedIds.size).toBe(3)
    expect(queriedIds.has(500)).toBe(true)
    expect(queriedIds.has(6193)).toBe(true)
    expect(queriedIds.has(192)).toBe(true)
  })

  it("returns empty map when no results", async () => {
    mockFetch.mockResolvedValueOnce(sparqlResponse([]))

    const { results, queriedIds } = await runWithFakeTimers(() => fetchSitelinksBatch([99999]))
    expect(results.size).toBe(0)
    // ID was still queried successfully (just not found on Wikidata)
    expect(queriedIds.has(99999)).toBe(true)
  })

  it("handles partial results (some actors not on Wikidata)", async () => {
    mockFetch.mockResolvedValueOnce(
      sparqlResponse([{ tmdbId: { value: "500" }, sitelinks: { value: "85" } }])
    )

    const { results, queriedIds } = await runWithFakeTimers(() => fetchSitelinksBatch([500, 99999]))
    expect(results.size).toBe(1)
    expect(results.get(500)).toBe(85)
    expect(results.has(99999)).toBe(false)
    // Both IDs were in the queried chunk
    expect(queriedIds.has(500)).toBe(true)
    expect(queriedIds.has(99999)).toBe(true)
  })

  it("returns empty results and queriedIds on error after retries", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"))

    const { results, queriedIds } = await runWithFakeTimers(() => fetchSitelinksBatch([500, 6193]))
    expect(results.size).toBe(0)
    // IDs should NOT be in queriedIds (chunk failed)
    expect(queriedIds.size).toBe(0)
  })

  it("handles empty input array", async () => {
    const { results, queriedIds } = await runWithFakeTimers(() => fetchSitelinksBatch([]))
    expect(results.size).toBe(0)
    expect(queriedIds.size).toBe(0)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
