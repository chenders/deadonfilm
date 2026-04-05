import { describe, it, expect, vi, beforeEach } from "vitest"
import { writeGscSnapshot, type GscSnapshotInput } from "../src/lib/db/admin-gsc-queries.js"

describe("capture-gsc-snapshot", () => {
  describe("writeGscSnapshot", () => {
    let mockQuery: ReturnType<typeof vi.fn>
    let mockClient: { query: ReturnType<typeof vi.fn> }

    const baseSitemaps = [
      {
        contents: [
          { type: "web", submitted: 100, indexed: 80 },
          { type: "image", submitted: 50, indexed: 40 },
        ],
      },
    ]

    function makeInput(overrides?: Partial<GscSnapshotInput>): GscSnapshotInput {
      return {
        yesterday: "2026-03-19",
        performance: {
          rows: [{ keys: ["2026-03-19"], clicks: 10, impressions: 100, ctr: 0.1, position: 5.5 }],
        },
        queries: {
          rows: [{ keys: ["dead on film"], clicks: 5, impressions: 50, ctr: 0.1, position: 3.2 }],
        },
        pages: [
          {
            page_url: "https://deadonfilm.com/actor/john-wayne",
            page_type: "actor",
            clicks: 3,
            impressions: 30,
            ctr: 0.1,
            position: 4.0,
          },
        ],
        pageTypes: {
          actor: { clicks: 20, impressions: 200, ctr: 0.1, position: 4.5 },
        },
        sitemaps: baseSitemaps,
        ...overrides,
      }
    }

    beforeEach(() => {
      vi.clearAllMocks()
      mockQuery = vi.fn().mockResolvedValue({ rows: [] })
      mockClient = { query: mockQuery }
    })

    it("writes search performance rows with upsert", async () => {
      await writeGscSnapshot(mockClient as never, makeInput())

      const perfCall = mockQuery.mock.calls.find(
        ([sql]: [string]) => typeof sql === "string" && sql.includes("gsc_search_performance")
      )
      expect(perfCall).toBeDefined()
      expect(perfCall![1]).toEqual(["2026-03-19", "web", 10, 100, 0.1, 5.5])
    })

    it("deletes stale top queries before inserting", async () => {
      await writeGscSnapshot(mockClient as never, makeInput())

      const calls = mockQuery.mock.calls.map(([sql]: [string]) => sql)
      const deleteIdx = calls.findIndex(
        (sql: string) => sql.includes("DELETE") && sql.includes("gsc_top_queries")
      )
      const insertIdx = calls.findIndex(
        (sql: string) => sql.includes("INSERT") && sql.includes("gsc_top_queries")
      )
      expect(deleteIdx).toBeGreaterThanOrEqual(0)
      expect(insertIdx).toBeGreaterThan(deleteIdx)
    })

    it("deletes stale top pages before inserting", async () => {
      await writeGscSnapshot(mockClient as never, makeInput())

      const calls = mockQuery.mock.calls.map(([sql]: [string]) => sql)
      const deleteIdx = calls.findIndex(
        (sql: string) => sql.includes("DELETE") && sql.includes("gsc_top_pages")
      )
      const insertIdx = calls.findIndex(
        (sql: string) => sql.includes("INSERT") && sql.includes("gsc_top_pages")
      )
      expect(deleteIdx).toBeGreaterThanOrEqual(0)
      expect(insertIdx).toBeGreaterThan(deleteIdx)
    })

    it("writes page type performance", async () => {
      await writeGscSnapshot(mockClient as never, makeInput())

      const ptCall = mockQuery.mock.calls.find(
        ([sql]: [string]) => typeof sql === "string" && sql.includes("gsc_page_type_performance")
      )
      expect(ptCall).toBeDefined()
      expect(ptCall![1]).toEqual(["2026-03-19", "actor", 20, 200, 0.1, 4.5])
    })

    it("writes indexing status from sitemaps", async () => {
      await writeGscSnapshot(mockClient as never, makeInput())

      const indexCall = mockQuery.mock.calls.find(
        ([sql]: [string]) => typeof sql === "string" && sql.includes("gsc_indexing_status")
      )
      expect(indexCall).toBeDefined()
      // totalSubmitted = 100 + 50, totalIndexed = 80 + 40
      expect(indexCall![1][1]).toBe(150)
      expect(indexCall![1][2]).toBe(120)
    })

    it("skips indexing status when sitemaps is empty", async () => {
      await writeGscSnapshot(mockClient as never, makeInput({ sitemaps: [] }))

      const indexCall = mockQuery.mock.calls.find(
        ([sql]: [string]) => typeof sql === "string" && sql.includes("gsc_indexing_status")
      )
      expect(indexCall).toBeUndefined()
    })

    it("returns correct summary", async () => {
      const result = await writeGscSnapshot(mockClient as never, makeInput())

      expect(result).toEqual({
        performanceDays: 1,
        queries: 1,
        pages: 1,
        pageTypes: 1,
        indexing: { totalSubmitted: 150, totalIndexed: 120 },
      })
    })

    it("returns summary without indexing when sitemaps empty", async () => {
      const result = await writeGscSnapshot(mockClient as never, makeInput({ sitemaps: [] }))

      expect(result).toEqual({
        performanceDays: 1,
        queries: 1,
        pages: 1,
        pageTypes: 1,
      })
    })

    it("handles multiple performance rows", async () => {
      const input = makeInput({
        performance: {
          rows: [
            { keys: ["2026-03-18"], clicks: 8, impressions: 80, ctr: 0.1, position: 6.0 },
            { keys: ["2026-03-19"], clicks: 10, impressions: 100, ctr: 0.1, position: 5.5 },
          ],
        },
      })

      const result = await writeGscSnapshot(mockClient as never, input)

      const perfCalls = mockQuery.mock.calls.filter(
        ([sql]: [string]) =>
          typeof sql === "string" &&
          sql.includes("INSERT") &&
          sql.includes("gsc_search_performance")
      )
      expect(perfCalls).toHaveLength(2)
      expect(result.performanceDays).toBe(2)
    })

    it("propagates database errors", async () => {
      mockQuery.mockRejectedValueOnce(new Error("connection lost"))

      await expect(writeGscSnapshot(mockClient as never, makeInput())).rejects.toThrow(
        "connection lost"
      )
    })
  })
})
