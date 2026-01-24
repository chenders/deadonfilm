import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Pool } from "pg"
import {
  getCoverageStats,
  getActorsForCoverage,
  getCoverageTrends,
  getEnrichmentCandidates,
  captureCurrentSnapshot,
} from "./admin-coverage-queries.js"

describe("Admin Coverage Queries", () => {
  let mockPool: Pool

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    } as unknown as Pool
  })

  describe("getCoverageStats", () => {
    it("returns coverage statistics", async () => {
      const mockStats = {
        total_deceased_actors: 1000,
        actors_with_death_pages: 250,
        actors_without_death_pages: 750,
        coverage_percentage: 25.0,
        enrichment_candidates_count: 500,
        high_priority_count: 100,
      }

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockStats],
      } as any)

      const result = await getCoverageStats(mockPool)

      expect(result).toEqual(mockStats)
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("WITH deceased_actors AS")
      )
    })
  })

  describe("getActorsForCoverage", () => {
    it("returns paginated actors with no filters", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: "Test Actor",
            tmdb_id: 123,
            deathday: "2020-01-01",
            popularity: 50.5,
            has_detailed_death_info: false,
            enriched_at: null,
            age_at_death: 75,
            cause_of_death: null,
            total_count: "10",
          },
        ],
      } as any)

      const result = await getActorsForCoverage(mockPool, {}, 1, 50)

      expect(result.items).toHaveLength(1)
      expect(result.total).toBe(10)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(50)
      expect(result.totalPages).toBe(1)
    })

    it("applies hasDeathPage filter", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any)

      await getActorsForCoverage(mockPool, { hasDeathPage: false }, 1, 50)

      const calls = vi.mocked(mockPool.query).mock.calls
      expect(calls[0][0]).toContain("has_detailed_death_info = $1")
      expect(calls[0][1]).toEqual([false, 0, 1, 50, 0]) // includes isAsc=0, isDesc=1
    })

    it("applies popularity range filters", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any)

      await getActorsForCoverage(mockPool, { minPopularity: 10, maxPopularity: 50 }, 1, 50)

      const calls = vi.mocked(mockPool.query).mock.calls
      expect(calls[0][0]).toContain("popularity >= $1")
      expect(calls[0][0]).toContain("popularity <= $2")
      expect(calls[0][1]).toEqual([10, 50, 0, 1, 50, 0]) // includes isAsc=0, isDesc=1
    })

    it("applies death date range filters", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any)

      await getActorsForCoverage(
        mockPool,
        { deathDateStart: "2020-01-01", deathDateEnd: "2020-12-31" },
        1,
        50
      )

      const calls = vi.mocked(mockPool.query).mock.calls
      expect(calls[0][0]).toContain("deathday >= $1")
      expect(calls[0][0]).toContain("deathday <= $2")
      expect(calls[0][1]).toEqual(["2020-01-01", "2020-12-31", 0, 1, 50, 0]) // includes isAsc=0, isDesc=1
    })

    it("applies name search filter", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any)

      await getActorsForCoverage(mockPool, { searchName: "John" }, 1, 50)

      const calls = vi.mocked(mockPool.query).mock.calls
      expect(calls[0][0]).toContain("name ILIKE $1")
      expect(calls[0][1]).toEqual(["%John%", 0, 1, 50, 0]) // includes isAsc=0, isDesc=1
    })

    it("applies custom ordering", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any)

      await getActorsForCoverage(mockPool, { orderBy: "death_date", orderDirection: "asc" }, 1, 50)

      const calls = vi.mocked(mockPool.query).mock.calls
      expect(calls[0][0]).toContain("CASE WHEN")
      expect(calls[0][0]).toContain("deathday")
      expect(calls[0][1]).toEqual([1, 0, 50, 0]) // isAsc=1, isDesc=0, LIMIT, OFFSET
    })

    it("calculates correct pagination", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ total_count: "125" }],
      } as any)

      const result = await getActorsForCoverage(mockPool, {}, 2, 50)

      expect(result.totalPages).toBe(3)
      const calls = vi.mocked(mockPool.query).mock.calls
      expect(calls[0][1]).toContain(50) // LIMIT
      expect(calls[0][1]).toContain(50) // OFFSET (page 2 = skip 50)
    })

    it("handles empty results correctly", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any)

      const result = await getActorsForCoverage(mockPool, {}, 1, 50)

      expect(result.items).toEqual([])
      expect(result.total).toBe(0)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(50)
      expect(result.totalPages).toBe(0)
    })
  })

  describe("getCoverageTrends", () => {
    it("returns daily trends", async () => {
      const mockTrends = [
        {
          captured_at: "2024-01-01T00:00:00Z",
          total_deceased_actors: 1000,
          actors_with_death_pages: 250,
          actors_without_death_pages: 750,
          coverage_percentage: 25.0,
          enrichment_candidates_count: 500,
          high_priority_count: 100,
        },
      ]

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockTrends,
      } as any)

      const result = await getCoverageTrends(mockPool, "2024-01-01", "2024-01-31", "daily")

      expect(result).toEqual(mockTrends)
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("FROM death_coverage_snapshots"),
        ["2024-01-01", "2024-01-31"]
      )
    })

    it("returns weekly aggregated trends", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any)

      await getCoverageTrends(mockPool, "2024-01-01", "2024-01-31", "weekly")

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("TO_CHAR(captured_at, $3)"),
        ["2024-01-01", "2024-01-31", "YYYY-IW"]
      )
    })

    it("returns monthly aggregated trends", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any)

      await getCoverageTrends(mockPool, "2024-01-01", "2024-12-31", "monthly")

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("TO_CHAR(captured_at, $3)"),
        ["2024-01-01", "2024-12-31", "YYYY-MM"]
      )
    })
  })

  describe("getEnrichmentCandidates", () => {
    it("returns prioritized candidates", async () => {
      const mockCandidates = [
        {
          id: 1,
          name: "High Priority Actor",
          tmdb_id: 123,
          deathday: "2020-01-01",
          popularity: 75.0,
          has_detailed_death_info: false,
          enriched_at: null,
          age_at_death: 65,
          cause_of_death: null,
        },
      ]

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockCandidates,
      } as any)

      const result = await getEnrichmentCandidates(mockPool, 10, 100)

      expect(result).toEqual(mockCandidates)
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("popularity >= $1"),
        [10, 100]
      )
    })

    it("uses default parameters", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any)

      await getEnrichmentCandidates(mockPool)

      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), [5, 100])
    })

    it("filters out recently enriched actors", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any)

      await getEnrichmentCandidates(mockPool, 5, 50)

      const call = vi.mocked(mockPool.query).mock.calls[0]
      expect(call[0]).toContain("enriched_at IS NULL")
      expect(call[0]).toContain("enriched_at < NOW() - INTERVAL '30 days'")
    })
  })

  describe("captureCurrentSnapshot", () => {
    it("captures and inserts snapshot", async () => {
      const mockStats = {
        total_deceased_actors: 1000,
        actors_with_death_pages: 250,
        actors_without_death_pages: 750,
        coverage_percentage: 25.0,
        enrichment_candidates_count: 500,
        high_priority_count: 100,
      }

      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [mockStats] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)

      await captureCurrentSnapshot(mockPool)

      expect(mockPool.query).toHaveBeenCalledTimes(2)
      const insertCall = vi.mocked(mockPool.query).mock.calls[1]
      expect(insertCall[0]).toContain("INSERT INTO death_coverage_snapshots")
      expect(insertCall[1]).toEqual([
        mockStats.total_deceased_actors,
        mockStats.actors_with_death_pages,
        mockStats.actors_without_death_pages,
        mockStats.coverage_percentage,
        mockStats.enrichment_candidates_count,
        mockStats.high_priority_count,
      ])
    })
  })
})
