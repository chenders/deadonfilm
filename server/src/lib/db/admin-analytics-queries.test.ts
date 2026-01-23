/**
 * Tests for admin analytics database queries
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Pool, QueryResult } from "pg"
import { getCostBySource } from "./admin-analytics-queries.js"

describe("Admin Analytics Queries", () => {
  let mockPool: Pool
  let mockQuery: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockQuery = vi.fn()
    mockPool = {
      query: mockQuery,
    } as unknown as Pool
  })

  describe("getCostBySource", () => {
    const mockQueryResult: QueryResult = {
      rows: [
        {
          source: "wikidata",
          total_cost: "25.50",
          queries_count: "100",
          avg_cost_per_query: "0.255000",
          last_used: "2024-01-15T10:30:00Z",
        },
        {
          source: "wikipedia",
          total_cost: "0.00",
          queries_count: "200",
          avg_cost_per_query: "0.000000",
          last_used: "2024-01-14T09:00:00Z",
        },
      ],
      command: "SELECT",
      rowCount: 2,
      oid: 0,
      fields: [],
    }

    it("fetches cost by source without date filtering", async () => {
      mockQuery.mockResolvedValue(mockQueryResult)

      const result = await getCostBySource(mockPool)

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("SELECT"), [])
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("FROM source_query_cache"),
        []
      )
      expect(mockPool.query).toHaveBeenCalledWith(expect.not.stringContaining("WHERE"), [])

      expect(result).toEqual({
        sources: [
          {
            source: "wikidata",
            total_cost: 25.5,
            queries_count: 100,
            avg_cost_per_query: 0.255,
            last_used: "2024-01-15T10:30:00Z",
          },
          {
            source: "wikipedia",
            total_cost: 0,
            queries_count: 200,
            avg_cost_per_query: 0,
            last_used: "2024-01-14T09:00:00Z",
          },
        ],
        totalCost: 25.5,
        totalQueries: 300,
      })
    })

    it("applies start date filter", async () => {
      mockQuery.mockResolvedValue(mockQueryResult)

      await getCostBySource(mockPool, "2024-01-01")

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE queried_at >= $1"),
        ["2024-01-01"]
      )
    })

    it("applies end date filter", async () => {
      mockQuery.mockResolvedValue(mockQueryResult)

      await getCostBySource(mockPool, undefined, "2024-01-31")

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE queried_at <= $1"),
        ["2024-01-31"]
      )
    })

    it("applies both start and end date filters", async () => {
      mockQuery.mockResolvedValue(mockQueryResult)

      await getCostBySource(mockPool, "2024-01-01", "2024-01-31")

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE queried_at >= $1 AND queried_at <= $2"),
        ["2024-01-01", "2024-01-31"]
      )
    })

    it("handles empty results", async () => {
      mockQuery.mockResolvedValue({
        ...mockQueryResult,
        rows: [],
        rowCount: 0,
      })

      const result = await getCostBySource(mockPool)

      expect(result).toEqual({
        sources: [],
        totalCost: 0,
        totalQueries: 0,
      })
    })

    it("orders results by total_cost DESC", async () => {
      mockQuery.mockResolvedValue(mockQueryResult)

      await getCostBySource(mockPool)

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY total_cost DESC"),
        []
      )
    })

    it("groups by source_type", async () => {
      mockQuery.mockResolvedValue(mockQueryResult)

      await getCostBySource(mockPool)

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("GROUP BY source_type"),
        []
      )
    })

    it("calculates correct aggregates", async () => {
      const mixedCostResult: QueryResult = {
        ...mockQueryResult,
        rows: [
          {
            source: "source1",
            total_cost: "10.00",
            queries_count: "50",
            avg_cost_per_query: "0.200000",
            last_used: "2024-01-15T10:30:00Z",
          },
          {
            source: "source2",
            total_cost: "5.50",
            queries_count: "25",
            avg_cost_per_query: "0.220000",
            last_used: "2024-01-14T09:00:00Z",
          },
        ],
      }
      mockQuery.mockResolvedValue(mixedCostResult)

      const result = await getCostBySource(mockPool)

      expect(result.totalCost).toBe(15.5)
      expect(result.totalQueries).toBe(75)
    })

    it("handles null last_used dates", async () => {
      const nullLastUsedResult: QueryResult = {
        ...mockQueryResult,
        rows: [
          {
            source: "wikidata",
            total_cost: "10.00",
            queries_count: "50",
            avg_cost_per_query: "0.200000",
            last_used: null,
          },
        ],
      }
      mockQuery.mockResolvedValue(nullLastUsedResult)

      const result = await getCostBySource(mockPool)

      expect(result.sources[0].last_used).toBeNull()
    })
  })
})
