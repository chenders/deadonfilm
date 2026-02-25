import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Pool } from "pg"
import {
  getCoverageStats,
  getActorsForCoverage,
  getCoverageTrends,
  getEnrichmentCandidates,
  captureCurrentSnapshot,
  getDistinctCausesOfDeath,
  getActorPreview,
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

    it("casts popularity to float to ensure numeric type", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any)

      await getActorsForCoverage(mockPool, {}, 1, 50)

      const calls = vi.mocked(mockPool.query).mock.calls
      // Verify the SQL includes popularity::float cast to prevent string type issues
      expect(calls[0][0]).toContain("popularity::float")
    })

    it("applies hasDeathPage filter for without death page", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any)

      await getActorsForCoverage(mockPool, { hasDeathPage: false }, 1, 50)

      const calls = vi.mocked(mockPool.query).mock.calls
      // hasDeathPage=false should check for NULL or false (most actors have NULL)
      expect(calls[0][0]).toContain(
        "has_detailed_death_info IS NULL OR has_detailed_death_info = false"
      )
      expect(calls[0][1]).toEqual([0, 1, 50, 0]) // isAsc=0, isDesc=1, limit, offset
    })

    it("applies hasDeathPage filter for with death page", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any)

      await getActorsForCoverage(mockPool, { hasDeathPage: true }, 1, 50)

      const calls = vi.mocked(mockPool.query).mock.calls
      expect(calls[0][0]).toContain("has_detailed_death_info = true")
      expect(calls[0][1]).toEqual([0, 1, 50, 0]) // isAsc=0, isDesc=1, limit, offset
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

    it("applies interestingness ordering", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any)

      await getActorsForCoverage(
        mockPool,
        { orderBy: "interestingness", orderDirection: "desc" },
        1,
        50
      )

      const calls = vi.mocked(mockPool.query).mock.calls
      expect(calls[0][0]).toContain("CASE WHEN")
      expect(calls[0][0]).toContain("interestingness_score")
      expect(calls[0][1]).toEqual([0, 1, 50, 0]) // isAsc=0, isDesc=1, LIMIT, OFFSET
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

    it("applies causeOfDeath filter", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any)

      await getActorsForCoverage(mockPool, { causeOfDeath: "heart attack" }, 1, 50)

      const calls = vi.mocked(mockPool.query).mock.calls
      // Should match both normalized and original causes
      expect(calls[0][0]).toContain("cause_of_death_normalizations")
      expect(calls[0][0]).toContain("normalized_cause")
      // Filter value should appear 3 times (for three match conditions)
      expect(calls[0][1]).toContain("heart attack")
    })

    it("applies deathManner filter", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any)

      await getActorsForCoverage(mockPool, { deathManner: "natural" }, 1, 50)

      const calls = vi.mocked(mockPool.query).mock.calls
      expect(calls[0][0]).toContain("death_manner = $1")
      expect(calls[0][1]).toEqual(["natural", 0, 1, 50, 0]) // deathManner, isAsc=0, isDesc=1, limit, offset
    })

    it("applies deathManner filter with other filters", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any)

      await getActorsForCoverage(mockPool, { deathManner: "accident", minPopularity: 10 }, 1, 50)

      const calls = vi.mocked(mockPool.query).mock.calls
      expect(calls[0][0]).toContain("death_manner")
      expect(calls[0][0]).toContain("popularity >= $1")
      expect(calls[0][1]).toContain(10)
      expect(calls[0][1]).toContain("accident")
    })

    it("applies causeOfDeath filter with other filters", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any)

      await getActorsForCoverage(mockPool, { causeOfDeath: "cancer", minPopularity: 10 }, 1, 50)

      const calls = vi.mocked(mockPool.query).mock.calls
      expect(calls[0][0]).toContain("popularity >= $1")
      expect(calls[0][0]).toContain("cause_of_death_normalizations")
      expect(calls[0][1]).toContain(10)
      expect(calls[0][1]).toContain("cancer")
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

    it("casts popularity to float to ensure numeric type", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any)

      await getEnrichmentCandidates(mockPool)

      const calls = vi.mocked(mockPool.query).mock.calls
      // Verify the SQL includes popularity::float cast to prevent string type issues
      expect(calls[0][0]).toContain("popularity::float")
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

  describe("getDistinctCausesOfDeath", () => {
    it("returns distinct causes with counts", async () => {
      const mockCauses = [
        { cause: "heart attack", count: "50" },
        { cause: "cancer", count: "45" },
        { cause: "natural causes", count: "30" },
      ]

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockCauses,
      } as any)

      const result = await getDistinctCausesOfDeath(mockPool)

      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({ value: "heart attack", label: "heart attack", count: 50 })
      expect(result[1]).toEqual({ value: "cancer", label: "cancer", count: 45 })
      expect(result[2]).toEqual({ value: "natural causes", label: "natural causes", count: 30 })
    })

    it("uses normalization table for grouping", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any)

      await getDistinctCausesOfDeath(mockPool)

      const calls = vi.mocked(mockPool.query).mock.calls
      expect(calls[0][0]).toContain("cause_of_death_normalizations")
      expect(calls[0][0]).toContain("COALESCE(n.normalized_cause, a.cause_of_death)")
    })

    it("filters out causes with fewer than 3 actors", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any)

      await getDistinctCausesOfDeath(mockPool)

      const calls = vi.mocked(mockPool.query).mock.calls
      expect(calls[0][0]).toContain("HAVING COUNT(*) >= 3")
    })

    it("limits results to 100", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any)

      await getDistinctCausesOfDeath(mockPool)

      const calls = vi.mocked(mockPool.query).mock.calls
      expect(calls[0][0]).toContain("LIMIT 100")
    })

    it("orders by count descending", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any)

      await getDistinctCausesOfDeath(mockPool)

      const calls = vi.mocked(mockPool.query).mock.calls
      expect(calls[0][0]).toContain("ORDER BY COUNT(*) DESC")
    })

    it("handles empty results", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any)

      const result = await getDistinctCausesOfDeath(mockPool)

      expect(result).toEqual([])
    })
  })

  describe("getActorPreview", () => {
    it("returns top movies and shows for an actor", async () => {
      const mockMovies = [
        { title: "Movie 1", release_year: 2020, character_name: "Hero", dof_popularity: 100 },
        { title: "Movie 2", release_year: 2018, character_name: "Villain", dof_popularity: 80 },
      ]
      const mockShows = [
        { name: "Show 1", first_air_year: 2015, character_name: "Lead", episode_count: 50 },
      ]
      const mockCounts = { total_movies: "10", total_shows: "5" }

      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: mockMovies } as any)
        .mockResolvedValueOnce({ rows: mockShows } as any)
        .mockResolvedValueOnce({ rows: [mockCounts] } as any)

      const result = await getActorPreview(mockPool, 123)

      expect(result.topMovies).toHaveLength(2)
      expect(result.topMovies[0]).toEqual({
        title: "Movie 1",
        releaseYear: 2020,
        character: "Hero",
        popularity: 100,
      })
      expect(result.topShows).toHaveLength(1)
      expect(result.topShows[0]).toEqual({
        name: "Show 1",
        firstAirYear: 2015,
        character: "Lead",
        episodeCount: 50,
      })
      expect(result.totalMovies).toBe(10)
      expect(result.totalShows).toBe(5)
    })

    it("queries movies ordered by popularity", async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [{ total_movies: "0", total_shows: "0" }] } as any)

      await getActorPreview(mockPool, 456)

      const moviesCall = vi.mocked(mockPool.query).mock.calls[0]
      expect(moviesCall[0]).toContain("ORDER BY m.dof_popularity DESC")
      expect(moviesCall[0]).toContain("LIMIT 5")
      expect(moviesCall[1]).toEqual([456])
    })

    it("queries shows ordered by episode count", async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [{ total_movies: "0", total_shows: "0" }] } as any)

      await getActorPreview(mockPool, 789)

      const showsCall = vi.mocked(mockPool.query).mock.calls[1]
      expect(showsCall[0]).toContain("ORDER BY COUNT(*) DESC")
      expect(showsCall[0]).toContain("LIMIT 3")
      expect(showsCall[1]).toEqual([789])
    })

    it("handles actor with no movies or shows", async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [{ total_movies: "0", total_shows: "0" }] } as any)

      const result = await getActorPreview(mockPool, 999)

      expect(result.topMovies).toEqual([])
      expect(result.topShows).toEqual([])
      expect(result.totalMovies).toBe(0)
      expect(result.totalShows).toBe(0)
    })

    it("handles null popularity and episode counts", async () => {
      const mockMovies = [
        { title: "Movie 1", release_year: null, character_name: null, dof_popularity: null },
      ]
      const mockShows = [
        { name: "Show 1", first_air_year: null, character_name: null, episode_count: null },
      ]

      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: mockMovies } as any)
        .mockResolvedValueOnce({ rows: mockShows } as any)
        .mockResolvedValueOnce({ rows: [{ total_movies: "1", total_shows: "1" }] } as any)

      const result = await getActorPreview(mockPool, 123)

      expect(result.topMovies[0].popularity).toBe(0) // null coalesced to 0
      expect(result.topMovies[0].releaseYear).toBeNull()
      expect(result.topMovies[0].character).toBeNull()
      expect(result.topShows[0].episodeCount).toBe(0) // null coalesced to 0
      expect(result.topShows[0].firstAirYear).toBeNull()
      expect(result.topShows[0].character).toBeNull()
    })

    it("handles missing counts row", async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any) // Empty counts result

      const result = await getActorPreview(mockPool, 123)

      expect(result.totalMovies).toBe(0)
      expect(result.totalShows).toBe(0)
    })

    it("casts movie popularity to float to ensure numeric type", async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [{ total_movies: "0", total_shows: "0" }] } as any)

      await getActorPreview(mockPool, 123)

      const moviesCall = vi.mocked(mockPool.query).mock.calls[0]
      // Verify the SQL uses COALESCE and ::float cast to prevent string type issues
      // pg driver returns decimal as string, which breaks .toFixed() in the frontend
      expect(moviesCall[0]).toContain("COALESCE(m.dof_popularity, 0)::float")
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
