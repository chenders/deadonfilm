/**
 * Tests for Wikidata Sitelinks API Client
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
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
  mockFetch.mockReset()
})

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

    const result = await fetchSitelinksByTmdbId(500)
    expect(result).toBe(85)
    expect(mockFetch).toHaveBeenCalledOnce()
    expect(mockFetch.mock.calls[0][0]).toContain("P4985")
    expect(mockFetch.mock.calls[0][0]).toContain("500")
  })

  it("returns null when no results found", async () => {
    mockFetch.mockResolvedValueOnce(sparqlResponse([]))

    const result = await fetchSitelinksByTmdbId(99999999)
    expect(result).toBeNull()
  })

  it("returns null on network error after retries", async () => {
    // All 4 attempts (initial + 3 retries) fail
    mockFetch
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"))

    const result = await fetchSitelinksByTmdbId(500)
    expect(result).toBeNull()
  }, 30_000)

  it("retries on 429 response", async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(429))
      .mockResolvedValueOnce(
        sparqlResponse([{ item: { value: "Q1" }, sitelinks: { value: "42" } }])
      )

    const result = await fetchSitelinksByTmdbId(500)
    expect(result).toBe(42)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  }, 30_000)

  it("retries on 500 response", async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(
        sparqlResponse([{ item: { value: "Q1" }, sitelinks: { value: "30" } }])
      )

    const result = await fetchSitelinksByTmdbId(500)
    expect(result).toBe(30)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  }, 30_000)

  it("returns null after max retries exhausted on 429", async () => {
    // 4 total calls: initial + 3 retries, all 429
    mockFetch.mockResolvedValue(errorResponse(429))

    const result = await fetchSitelinksByTmdbId(500)
    expect(result).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(4)
  }, 30_000)

  it("returns 0 when sitelinks value is missing", async () => {
    mockFetch.mockResolvedValueOnce(sparqlResponse([{ item: { value: "Q1" } }]))

    const result = await fetchSitelinksByTmdbId(500)
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

    const result = await fetchSitelinksByWikipediaUrl("https://en.wikipedia.org/wiki/Tom_Cruise")
    expect(result).toBe(85)
    // URL encodes the name with spaces (Tom_Cruise → Tom Cruise → Tom%20Cruise)
    expect(mockFetch.mock.calls[0][0]).toContain("Tom%20Cruise")
  })

  it("handles mobile Wikipedia URLs", async () => {
    mockFetch.mockResolvedValueOnce(
      sparqlResponse([{ item: { value: "Q1" }, sitelinks: { value: "50" } }])
    )

    const result = await fetchSitelinksByWikipediaUrl("https://en.m.wikipedia.org/wiki/Tom_Cruise")
    expect(result).toBe(50)
  })

  it("returns null for non-English Wikipedia URLs", async () => {
    const result = await fetchSitelinksByWikipediaUrl("https://fr.wikipedia.org/wiki/Tom_Cruise")
    expect(result).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("returns null for invalid URLs", async () => {
    const result = await fetchSitelinksByWikipediaUrl("not-a-url")
    expect(result).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("returns null for empty URL", async () => {
    const result = await fetchSitelinksByWikipediaUrl("")
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

    const result = await fetchSitelinksBatch([500, 6193, 192])
    expect(result.size).toBe(3)
    expect(result.get(500)).toBe(85)
    expect(result.get(6193)).toBe(72)
    expect(result.get(192)).toBe(45)
  })

  it("returns empty map when no results", async () => {
    mockFetch.mockResolvedValueOnce(sparqlResponse([]))

    const result = await fetchSitelinksBatch([99999])
    expect(result.size).toBe(0)
  })

  it("handles partial results (some actors not on Wikidata)", async () => {
    mockFetch.mockResolvedValueOnce(
      sparqlResponse([{ tmdbId: { value: "500" }, sitelinks: { value: "85" } }])
    )

    const result = await fetchSitelinksBatch([500, 99999])
    expect(result.size).toBe(1)
    expect(result.get(500)).toBe(85)
    expect(result.has(99999)).toBe(false)
  })

  it("returns empty map on error after retries", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"))

    const result = await fetchSitelinksBatch([500, 6193])
    expect(result.size).toBe(0)
  }, 30_000)

  it("handles empty input array", async () => {
    const result = await fetchSitelinksBatch([])
    expect(result.size).toBe(0)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
