/**
 * Tests for admin page visit analytics database queries
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Pool, QueryResult } from "pg"
import {
  getInternalReferralsOverTime,
  getTopNavigationPaths,
  getMostPopularPagesByInternalReferrals,
  getNavigationByHourOfDay,
  getPageVisitStats,
} from "./admin-page-visit-queries.js"

describe("Admin Page Visit Queries", () => {
  let mockPool: Pool
  let mockQuery: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockQuery = vi.fn()
    mockPool = {
      query: mockQuery,
    } as unknown as Pool
  })

  describe("getInternalReferralsOverTime", () => {
    const mockTimeSeriesResult: QueryResult = {
      rows: [
        {
          timestamp: new Date("2024-01-15T00:00:00Z"),
          count: "150",
        },
        {
          timestamp: new Date("2024-01-16T00:00:00Z"),
          count: "200",
        },
      ],
      command: "SELECT",
      rowCount: 2,
      oid: 0,
      fields: [],
    }

    it("fetches internal referrals over time with day granularity", async () => {
      mockQuery.mockResolvedValue(mockTimeSeriesResult)

      const result = await getInternalReferralsOverTime(mockPool)

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("date_trunc('day', visited_at)"),
        []
      )
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("is_internal_referral = true"),
        []
      )

      expect(result).toEqual([
        {
          timestamp: "2024-01-15T00:00:00.000Z",
          count: 150,
        },
        {
          timestamp: "2024-01-16T00:00:00.000Z",
          count: 200,
        },
      ])
    })

    it("uses hour granularity when specified", async () => {
      mockQuery.mockResolvedValue(mockTimeSeriesResult)

      await getInternalReferralsOverTime(mockPool, undefined, undefined, "hour")

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("date_trunc('hour', visited_at)"),
        []
      )
    })

    it("uses week granularity when specified", async () => {
      mockQuery.mockResolvedValue(mockTimeSeriesResult)

      await getInternalReferralsOverTime(mockPool, undefined, undefined, "week")

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("date_trunc('week', visited_at)"),
        []
      )
    })

    it("applies date filters", async () => {
      mockQuery.mockResolvedValue(mockTimeSeriesResult)

      await getInternalReferralsOverTime(mockPool, "2024-01-01", "2024-01-31")

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("visited_at >= $1"), [
        "2024-01-01",
        "2024-01-31",
      ])
    })
  })

  describe("getTopNavigationPaths", () => {
    const mockNavigationPathsResult: QueryResult = {
      rows: [
        {
          referrer_path: "/",
          visited_path: "/movie/godfather-1972-238",
          count: "100",
          percentage: "25.50",
        },
        {
          referrer_path: "/movie/godfather-1972-238",
          visited_path: "/actor/marlon-brando-3084",
          count: "75",
          percentage: "19.13",
        },
      ],
      command: "SELECT",
      rowCount: 2,
      oid: 0,
      fields: [],
    }

    it("fetches top navigation paths", async () => {
      mockQuery.mockResolvedValue(mockNavigationPathsResult)

      const result = await getTopNavigationPaths(mockPool)

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("is_internal_referral = true"),
        ["20"]
      )

      expect(result).toEqual([
        {
          referrer_path: "/",
          visited_path: "/movie/godfather-1972-238",
          count: 100,
          percentage: 25.5,
        },
        {
          referrer_path: "/movie/godfather-1972-238",
          visited_path: "/actor/marlon-brando-3084",
          count: 75,
          percentage: 19.13,
        },
      ])
    })

    it("respects limit parameter", async () => {
      mockQuery.mockResolvedValue(mockNavigationPathsResult)

      await getTopNavigationPaths(mockPool, undefined, undefined, 10)

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("LIMIT $1"), ["10"])
    })

    it("orders by count DESC", async () => {
      mockQuery.mockResolvedValue(mockNavigationPathsResult)

      await getTopNavigationPaths(mockPool)

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY pc.count DESC"),
        ["20"]
      )
    })
  })

  describe("getMostPopularPagesByInternalReferrals", () => {
    const mockPopularPagesResult: QueryResult = {
      rows: [
        {
          path: "/movie/godfather-1972-238",
          internal_referrals: "150",
          external_referrals: "50",
          direct_visits: "25",
          total_visits: "225",
        },
        {
          path: "/actor/marlon-brando-3084",
          internal_referrals: "100",
          external_referrals: "30",
          direct_visits: "10",
          total_visits: "140",
        },
      ],
      command: "SELECT",
      rowCount: 2,
      oid: 0,
      fields: [],
    }

    it("fetches popular pages by internal referrals", async () => {
      mockQuery.mockResolvedValue(mockPopularPagesResult)

      const result = await getMostPopularPagesByInternalReferrals(mockPool)

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY internal_referrals DESC"),
        ["20"]
      )

      expect(result).toEqual([
        {
          path: "/movie/godfather-1972-238",
          internal_referrals: 150,
          external_referrals: 50,
          direct_visits: 25,
          total_visits: 225,
        },
        {
          path: "/actor/marlon-brando-3084",
          internal_referrals: 100,
          external_referrals: 30,
          direct_visits: 10,
          total_visits: 140,
        },
      ])
    })

    it("uses FILTER clause for counting different visit types", async () => {
      mockQuery.mockResolvedValue(mockPopularPagesResult)

      await getMostPopularPagesByInternalReferrals(mockPool)

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("FILTER (WHERE is_internal_referral = true"),
        ["20"]
      )
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("FILTER (WHERE is_internal_referral = false"),
        ["20"]
      )
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("FILTER (WHERE referrer_path IS NULL"),
        ["20"]
      )
    })
  })

  describe("getNavigationByHourOfDay", () => {
    const mockHourlyPatternsResult: QueryResult = {
      rows: [
        {
          hour: 9,
          count: "100",
        },
        {
          hour: 14,
          count: "150",
        },
        {
          hour: 20,
          count: "200",
        },
      ],
      command: "SELECT",
      rowCount: 3,
      oid: 0,
      fields: [],
    }

    it("fetches navigation by hour of day", async () => {
      mockQuery.mockResolvedValue(mockHourlyPatternsResult)

      const result = await getNavigationByHourOfDay(mockPool)

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("EXTRACT(HOUR FROM visited_at)"),
        []
      )
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("is_internal_referral = true"),
        []
      )

      expect(result).toEqual([
        {
          hour: 9,
          count: 100,
        },
        {
          hour: 14,
          count: 150,
        },
        {
          hour: 20,
          count: 200,
        },
      ])
    })

    it("orders by hour ASC", async () => {
      mockQuery.mockResolvedValue(mockHourlyPatternsResult)

      await getNavigationByHourOfDay(mockPool)

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("ORDER BY hour ASC"), [])
    })
  })

  describe("getPageVisitStats", () => {
    const mockStatsResult: QueryResult = {
      rows: [
        {
          total_visits: "1000",
          internal_referrals: "600",
          external_referrals: "250",
          direct_visits: "150",
          unique_sessions: "400",
          avg_pages_per_session: "2.50",
        },
      ],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    }

    it("fetches page visit statistics", async () => {
      mockQuery.mockResolvedValue(mockStatsResult)

      const result = await getPageVisitStats(mockPool)

      expect(result).toEqual({
        total_visits: 1000,
        internal_referrals: 600,
        external_referrals: 250,
        direct_visits: 150,
        unique_sessions: 400,
        avg_pages_per_session: 2.5,
      })
    })

    it("uses FILTER clauses for different visit types", async () => {
      mockQuery.mockResolvedValue(mockStatsResult)

      await getPageVisitStats(mockPool)

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("FILTER (WHERE is_internal_referral = true)"),
        []
      )
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("FILTER (WHERE is_internal_referral = false"),
        []
      )
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("FILTER (WHERE referrer_path IS NULL"),
        []
      )
    })

    it("counts distinct sessions", async () => {
      mockQuery.mockResolvedValue(mockStatsResult)

      await getPageVisitStats(mockPool)

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("COUNT(DISTINCT session_id)"),
        []
      )
    })

    it("applies date filters", async () => {
      mockQuery.mockResolvedValue(mockStatsResult)

      await getPageVisitStats(mockPool, "2024-01-01", "2024-01-31")

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE visited_at >= $1"),
        ["2024-01-01", "2024-01-31"]
      )
    })
  })
})
