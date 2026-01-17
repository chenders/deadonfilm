import { describe, it, expect, vi, beforeEach } from "vitest"
import { DataSourceType } from "./types.js"

// Mock the database before importing cache module
const mockQuery = vi.fn()
vi.mock("../db.js", () => ({
  getPool: vi.fn(() => ({
    query: mockQuery,
  })),
}))

// Import after mocking
import {
  generateQueryHash,
  getCachedQuery,
  setCachedQuery,
  getCacheStats,
  getCostStats,
  getCachedQueriesForActor,
  deleteCachedQueriesOlderThan,
  deleteCachedQueriesForSource,
  clearWebSearchCache,
  clearCacheForActor,
  clearCacheForActors,
  clearAllCache,
  resetActorEnrichmentStatus,
} from "./cache.js"

describe("cache", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("generateQueryHash", () => {
    it("generates consistent hashes for the same input", () => {
      const hash1 = generateQueryHash(DataSourceType.WIKIDATA, "test query")
      const hash2 = generateQueryHash(DataSourceType.WIKIDATA, "test query")
      expect(hash1).toBe(hash2)
    })

    it("generates different hashes for different queries", () => {
      const hash1 = generateQueryHash(DataSourceType.WIKIDATA, "query 1")
      const hash2 = generateQueryHash(DataSourceType.WIKIDATA, "query 2")
      expect(hash1).not.toBe(hash2)
    })

    it("generates different hashes for different source types", () => {
      const hash1 = generateQueryHash(DataSourceType.WIKIDATA, "same query")
      const hash2 = generateQueryHash(DataSourceType.WIKIPEDIA, "same query")
      expect(hash1).not.toBe(hash2)
    })

    it("generates a 64-character hex string (SHA256)", () => {
      const hash = generateQueryHash(DataSourceType.WIKIDATA, "test")
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })
  })

  describe("getCachedQuery", () => {
    it("returns null when no cache entry exists", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await getCachedQuery(DataSourceType.WIKIDATA, "test query")

      expect(result).toBeNull()
      expect(mockQuery).toHaveBeenCalledTimes(1)
    })

    it("returns cached result when entry exists", async () => {
      const mockRow = {
        id: 1,
        source_type: "wikidata",
        actor_id: 123,
        query_string: "test query",
        query_hash: "abc123",
        response_status: 200,
        response_raw: { success: true, data: "test" },
        response_compressed: null,
        is_compressed: false,
        response_size_bytes: 100,
        error_message: null,
        queried_at: new Date("2024-01-15T10:00:00Z"),
        response_time_ms: 150,
        cost_usd: "0.001",
      }
      mockQuery.mockResolvedValueOnce({ rows: [mockRow] })

      const result = await getCachedQuery(DataSourceType.WIKIDATA, "test query")

      expect(result).not.toBeNull()
      expect(result?.sourceType).toBe("wikidata")
      expect(result?.actorId).toBe(123)
      expect(result?.responseStatus).toBe(200)
      expect(result?.responseRaw).toEqual({ success: true, data: "test" })
      expect(result?.costUsd).toBe(0.001)
    })

    it("returns error message from cached error responses", async () => {
      const mockRow = {
        id: 1,
        source_type: "wikidata",
        actor_id: 123,
        query_string: "test query",
        query_hash: "abc123",
        response_status: 500,
        response_raw: null,
        response_compressed: null,
        is_compressed: false,
        response_size_bytes: null,
        error_message: "Connection timeout",
        queried_at: new Date(),
        response_time_ms: 5000,
        cost_usd: null,
      }
      mockQuery.mockResolvedValueOnce({ rows: [mockRow] })

      const result = await getCachedQuery(DataSourceType.WIKIDATA, "test query")

      expect(result?.errorMessage).toBe("Connection timeout")
      expect(result?.responseRaw).toBeNull()
    })
  })

  describe("setCachedQuery", () => {
    it("inserts a new cache entry", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await setCachedQuery({
        sourceType: DataSourceType.WIKIDATA,
        actorId: 123,
        queryString: "test query",
        responseStatus: 200,
        responseData: { success: true },
        responseTimeMs: 100,
      })

      expect(mockQuery).toHaveBeenCalledTimes(1)
      const [sql, params] = mockQuery.mock.calls[0]
      expect(sql).toContain("INSERT INTO source_query_cache")
      expect(sql).toContain("ON CONFLICT")
      expect(params[0]).toBe("wikidata")
      expect(params[1]).toBe(123)
      expect(params[2]).toBe("test query")
    })

    it("handles null actor_id", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await setCachedQuery({
        sourceType: DataSourceType.DUCKDUCKGO,
        queryString: "search query",
        responseStatus: 200,
        responseData: { results: [] },
      })

      const [, params] = mockQuery.mock.calls[0]
      expect(params[1]).toBeNull() // actor_id
    })

    it("stores error messages", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await setCachedQuery({
        sourceType: DataSourceType.WIKIDATA,
        actorId: 123,
        queryString: "test query",
        responseStatus: 500,
        errorMessage: "Server error",
      })

      const [, params] = mockQuery.mock.calls[0]
      expect(params[9]).toBe("Server error") // error_message
    })

    it("tracks cost for paid sources", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await setCachedQuery({
        sourceType: DataSourceType.DEEPSEEK,
        actorId: 123,
        queryString: "test prompt",
        responseStatus: 200,
        responseData: { answer: "test" },
        costUsd: 0.0005,
      })

      const [, params] = mockQuery.mock.calls[0]
      expect(params[11]).toBe(0.0005) // cost_usd
    })
  })

  describe("getCacheStats", () => {
    it("returns aggregated cache statistics", async () => {
      // Mock for count by source
      mockQuery.mockResolvedValueOnce({
        rows: [
          { source_type: "wikidata", count: "50" },
          { source_type: "wikipedia", count: "30" },
        ],
      })
      // Mock for total size
      mockQuery.mockResolvedValueOnce({ rows: [{ total_size: "1000000" }] })
      // Mock for compressed count
      mockQuery.mockResolvedValueOnce({ rows: [{ count: "5" }] })
      // Mock for error count
      mockQuery.mockResolvedValueOnce({ rows: [{ count: "3" }] })
      // Mock for date range
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            oldest: new Date("2024-01-01"),
            newest: new Date("2024-01-15"),
          },
        ],
      })

      const stats = await getCacheStats()

      expect(stats.totalEntries).toBe(80)
      expect(stats.entriesBySource["wikidata"]).toBe(50)
      expect(stats.entriesBySource["wikipedia"]).toBe(30)
      expect(stats.totalSizeBytes).toBe(1000000)
      expect(stats.compressedEntries).toBe(5)
      expect(stats.errorEntries).toBe(3)
    })
  })

  describe("getCostStats", () => {
    it("returns cost statistics by source", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { source_type: "deepseek", total_cost: "0.05", query_count: "100" },
          { source_type: "perplexity", total_cost: "0.25", query_count: "50" },
        ],
      })

      const stats = await getCostStats()

      expect(stats.totalCostUsd).toBeCloseTo(0.3)
      expect(stats.costBySource["deepseek"]).toBeCloseTo(0.05)
      expect(stats.costBySource["perplexity"]).toBeCloseTo(0.25)
      expect(stats.queriesWithCost).toBe(150)
    })

    it("returns zeros when no paid queries exist", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const stats = await getCostStats()

      expect(stats.totalCostUsd).toBe(0)
      expect(stats.queriesWithCost).toBe(0)
      expect(Object.keys(stats.costBySource)).toHaveLength(0)
    })
  })

  describe("getCachedQueriesForActor", () => {
    it("returns all cached queries for an actor", async () => {
      const mockRows = [
        {
          id: 1,
          source_type: "wikidata",
          actor_id: 123,
          query_string: "query 1",
          query_hash: "hash1",
          response_status: 200,
          response_raw: { data: "test" },
          response_compressed: null,
          is_compressed: false,
          response_size_bytes: 50,
          error_message: null,
          queried_at: new Date(),
          response_time_ms: 100,
          cost_usd: null,
        },
        {
          id: 2,
          source_type: "wikipedia",
          actor_id: 123,
          query_string: "query 2",
          query_hash: "hash2",
          response_status: 200,
          response_raw: { data: "test2" },
          response_compressed: null,
          is_compressed: false,
          response_size_bytes: 75,
          error_message: null,
          queried_at: new Date(),
          response_time_ms: 150,
          cost_usd: null,
        },
      ]
      mockQuery.mockResolvedValueOnce({ rows: mockRows })

      const results = await getCachedQueriesForActor(123)

      expect(results).toHaveLength(2)
      expect(results[0].sourceType).toBe("wikidata")
      expect(results[1].sourceType).toBe("wikipedia")
    })

    it("returns empty array when no queries exist for actor", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const results = await getCachedQueriesForActor(999)

      expect(results).toHaveLength(0)
    })
  })

  describe("deleteCachedQueriesOlderThan", () => {
    it("deletes queries older than specified date", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 15 })

      const cutoffDate = new Date("2024-01-01")
      const deleted = await deleteCachedQueriesOlderThan(cutoffDate)

      expect(deleted).toBe(15)
      expect(mockQuery).toHaveBeenCalledWith(
        "DELETE FROM source_query_cache WHERE queried_at < $1",
        [cutoffDate]
      )
    })
  })

  describe("deleteCachedQueriesForSource", () => {
    it("deletes all queries for a source type", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 100 })

      const deleted = await deleteCachedQueriesForSource(DataSourceType.IBDB)

      expect(deleted).toBe(100)
      expect(mockQuery).toHaveBeenCalledWith(
        "DELETE FROM source_query_cache WHERE source_type = $1",
        ["ibdb"]
      )
    })
  })

  describe("clearWebSearchCache", () => {
    it("clears all web search source caches", async () => {
      // Mock delete for each web search source
      mockQuery.mockResolvedValueOnce({ rowCount: 10 }) // duckduckgo
      mockQuery.mockResolvedValueOnce({ rowCount: 5 }) // google_search
      mockQuery.mockResolvedValueOnce({ rowCount: 3 }) // bing_search
      mockQuery.mockResolvedValueOnce({ rowCount: 0 }) // brave_search

      const result = await clearWebSearchCache()

      expect(result.totalDeleted).toBe(18)
      expect(result.deletedBySource["duckduckgo"]).toBe(10)
      expect(result.deletedBySource["google_search"]).toBe(5)
      expect(result.deletedBySource["bing_search"]).toBe(3)
      expect(result.deletedBySource["brave_search"]).toBeUndefined() // 0 not included
    })

    it("handles empty cache gracefully", async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 })

      const result = await clearWebSearchCache()

      expect(result.totalDeleted).toBe(0)
      expect(Object.keys(result.deletedBySource)).toHaveLength(0)
    })
  })

  describe("clearCacheForActor", () => {
    it("clears cache for a specific actor", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 8 })

      const deleted = await clearCacheForActor(123)

      expect(deleted).toBe(8)
      expect(mockQuery).toHaveBeenCalledWith(
        "DELETE FROM source_query_cache WHERE actor_id = $1",
        [123]
      )
    })
  })

  describe("clearCacheForActors", () => {
    it("clears cache for multiple actors", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 25 })

      const deleted = await clearCacheForActors([123, 456, 789])

      expect(deleted).toBe(25)
      expect(mockQuery).toHaveBeenCalledWith(
        "DELETE FROM source_query_cache WHERE actor_id = ANY($1)",
        [[123, 456, 789]]
      )
    })

    it("returns 0 for empty actor array", async () => {
      const deleted = await clearCacheForActors([])

      expect(deleted).toBe(0)
      expect(mockQuery).not.toHaveBeenCalled()
    })
  })

  describe("clearAllCache", () => {
    it("clears entire cache", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 500 })

      const deleted = await clearAllCache()

      expect(deleted).toBe(500)
      expect(mockQuery).toHaveBeenCalledWith("DELETE FROM source_query_cache")
    })
  })

  describe("resetActorEnrichmentStatus", () => {
    it("resets all actors when no options provided", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 100 })

      const count = await resetActorEnrichmentStatus()

      expect(count).toBe(100)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE actors SET cause_of_death_checked_at = NULL")
      )
    })

    it("resets specific actors by ID", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 3 })

      const count = await resetActorEnrichmentStatus({ actorIds: [1, 2, 3] })

      expect(count).toBe(3)
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("WHERE id = ANY($1)"), [
        [1, 2, 3],
      ])
    })

    it("resets actors by source types", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 50 })

      const count = await resetActorEnrichmentStatus({
        sourceTypes: [DataSourceType.DUCKDUCKGO, DataSourceType.GOOGLE_SEARCH],
      })

      expect(count).toBe(50)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("WHERE source_type = ANY($1)"),
        [[DataSourceType.DUCKDUCKGO, DataSourceType.GOOGLE_SEARCH]]
      )
    })
  })
})
