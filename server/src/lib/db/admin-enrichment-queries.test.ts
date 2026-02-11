import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Pool } from "pg"
import { getEnrichmentRunActors } from "./admin-enrichment-queries.js"

describe("Admin Enrichment Queries", () => {
  let mockPool: Pool

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    } as unknown as Pool
  })

  describe("getEnrichmentRunActors", () => {
    it("sorts by dof_popularity with stable tie-breaker", async () => {
      // Mock count query
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [{ count: "1" }] } as any)
        // Mock data query
        .mockResolvedValueOnce({
          rows: [
            {
              actor_id: 1,
              actor_name: "Test Actor",
              actor_tmdb_id: 123,
              was_enriched: true,
              created_death_page: false,
              confidence: "0.85",
              sources_attempted: 2,
              winning_source: "claude",
              processing_time_ms: 500,
              cost_usd: "0.01",
              links_followed: 1,
              pages_fetched: 2,
              error: null,
              has_logs: true,
            },
          ],
        } as any)

      await getEnrichmentRunActors(mockPool, 1, 1, 50)

      // Verify the data query uses dof_popularity ordering with tie-breaker
      const dataQueryCall = vi.mocked(mockPool.query).mock.calls[1]
      const sql = dataQueryCall[0] as string
      expect(sql).toContain("ORDER BY a.dof_popularity DESC NULLS LAST")
      expect(sql).toContain("era.actor_id ASC")
    })
  })
})
