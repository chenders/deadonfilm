/**
 * Tests for AI usage tracking functions.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  recordAIUsage,
  updateUsageQuality,
  getAIUsageStats,
  getAIUsageByModel,
  aiUsageTableExists,
  type AIUsageRecord,
  type ResultQuality,
} from "./ai-usage-tracker.js"

// Mock Pool type
interface MockPool {
  query: ReturnType<typeof vi.fn>
}

describe("AI Usage Tracker", () => {
  let mockPool: MockPool

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    }
  })

  describe("recordAIUsage", () => {
    it("inserts usage record into database", async () => {
      mockPool.query.mockResolvedValue({ rows: [] })

      const record: Omit<AIUsageRecord, "id" | "createdAt"> = {
        actorId: 123,
        model: "claude-sonnet-4-20250514",
        operation: "link_selection",
        inputTokens: 1000,
        outputTokens: 200,
        costUsd: 0.003,
        latencyMs: 1500,
        resultQuality: null,
        circumstancesLength: null,
        notableFactorsCount: null,
        hasLocation: false,
      }

      await recordAIUsage(mockPool as unknown as import("pg").Pool, record)

      expect(mockPool.query).toHaveBeenCalledTimes(1)
      const [query, params] = mockPool.query.mock.calls[0]
      expect(query).toContain("INSERT INTO ai_helper_usage")
      expect(params).toContain(123) // actorId
      expect(params).toContain("claude-sonnet-4-20250514") // model
      expect(params).toContain("link_selection") // operation
    })
  })

  describe("updateUsageQuality", () => {
    it("updates quality metrics for a usage record", async () => {
      mockPool.query.mockResolvedValue({ rows: [] })

      await updateUsageQuality(mockPool as unknown as import("pg").Pool, 1, "high", {
        circumstancesLength: 250,
        notableFactorsCount: 3,
        hasLocation: true,
      })

      expect(mockPool.query).toHaveBeenCalledTimes(1)
      const [query, params] = mockPool.query.mock.calls[0]
      expect(query).toContain("UPDATE ai_helper_usage")
      expect(params).toContain("high") // resultQuality
      expect(params).toContain(250) // circumstancesLength
      expect(params).toContain(3) // notableFactorsCount
      expect(params).toContain(true) // hasLocation
      expect(params).toContain(1) // id
    })
  })

  describe("getAIUsageStats", () => {
    it("returns aggregated stats from database", async () => {
      // Mock for main stats query
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              total_calls: "10",
              total_cost_usd: "0.05",
              avg_latency_ms: "1500",
              avg_input_tokens: "1000",
              avg_output_tokens: "200",
            },
          ],
        })
        // Mock for quality breakdown query
        .mockResolvedValueOnce({
          rows: [
            { result_quality: "high", count: "5" },
            { result_quality: "medium", count: "3" },
            { result_quality: "low", count: "2" },
          ],
        })

      const stats = await getAIUsageStats(mockPool as unknown as import("pg").Pool)

      expect(stats.totalCalls).toBe(10)
      expect(stats.totalCostUsd).toBe(0.05)
      expect(stats.avgLatencyMs).toBe(1500)
      expect(stats.avgInputTokens).toBe(1000)
      expect(stats.avgOutputTokens).toBe(200)
      expect(stats.qualityBreakdown).toEqual({
        high: 5,
        medium: 3,
        low: 2,
      })
    })

    it("applies filters when provided", async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              total_calls: "5",
              total_cost_usd: "0.025",
              avg_latency_ms: "1200",
              avg_input_tokens: "800",
              avg_output_tokens: "150",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { result_quality: "high", count: "3" },
            { result_quality: "medium", count: "2" },
          ],
        })

      await getAIUsageStats(mockPool as unknown as import("pg").Pool, {
        model: "claude-sonnet-4-20250514",
        operation: "link_selection",
      })

      expect(mockPool.query).toHaveBeenCalledTimes(2)
      const [query, params] = mockPool.query.mock.calls[0]
      expect(query).toContain("model = $")
      expect(query).toContain("operation = $")
      expect(params).toContain("claude-sonnet-4-20250514")
      expect(params).toContain("link_selection")
    })
  })

  describe("getAIUsageByModel", () => {
    it("returns stats grouped by model", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            model: "claude-sonnet-4-20250514",
            calls: "100",
            total_cost: "0.50",
            avg_latency: "1500",
            avg_quality: "0.8",
          },
          {
            model: "gpt-4o-mini",
            calls: "50",
            total_cost: "0.15",
            avg_latency: "800",
            avg_quality: "0.7",
          },
        ],
      })

      const result = await getAIUsageByModel(mockPool as unknown as import("pg").Pool)

      expect(result.size).toBe(2)
      expect(result.get("claude-sonnet-4-20250514")?.calls).toBe(100)
      expect(result.get("gpt-4o-mini")?.calls).toBe(50)
    })
  })

  describe("aiUsageTableExists", () => {
    it("returns true when table exists", async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ exists: true }],
      })

      const exists = await aiUsageTableExists(mockPool as unknown as import("pg").Pool)

      expect(exists).toBe(true)
      expect(mockPool.query).toHaveBeenCalledTimes(1)
    })

    it("returns false when table does not exist", async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ exists: false }],
      })

      const exists = await aiUsageTableExists(mockPool as unknown as import("pg").Pool)

      expect(exists).toBe(false)
    })

    it("returns false on query error", async () => {
      mockPool.query.mockImplementation(() => Promise.reject(new Error("Connection failed")))

      const exists = await aiUsageTableExists(mockPool as unknown as import("pg").Pool)

      expect(exists).toBe(false)
    })
  })
})
