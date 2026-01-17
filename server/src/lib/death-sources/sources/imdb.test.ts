import { describe, it, expect, vi, beforeEach } from "vitest"
import { IMDbSource } from "./imdb.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock the cache module
vi.mock("../cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

describe("IMDbSource", () => {
  let source: IMDbSource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new IMDbSource()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("IMDb")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.IMDB)
    })

    it("is free", () => {
      expect(source.isFree).toBe(true)
    })

    it("has zero cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0)
    })

    it("is always available (no API key needed)", () => {
      expect(source.isAvailable()).toBe(true)
    })
  })

  describe("lookup", () => {
    const mockActor = {
      id: 123,
      tmdbId: 456,
      name: "John Smith",
      birthday: "1950-01-15",
      deathday: "2024-06-01",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 10.5,
    }

    it("returns results on successful lookup", async () => {
      // Mock IMDb suggestion API
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          d: [
            {
              id: "nm0001234",
              l: "John Smith",
              s: "Actor, The Great Movie (2020)",
              q: "actor",
            },
          ],
        }),
      })
      // Mock bio page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            <head>
              <script type="application/ld+json">
                {"@type": "Person", "description": "John Smith was an actor", "deathDate": "2024-06-01"}
              </script>
            </head>
            <body>
              <section data-testid="mini-bio">
                <div class="ipc-html-content">
                  John Smith died on June 1, 2024 at his home in Los Angeles.
                  He passed away peacefully after a battle with cancer.
                </div>
              </section>
            </body>
          </html>
        `,
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toBeDefined()
      expect(result.source.url).toContain("imdb.com")
    })

    it("handles no IMDb ID found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ d: [] }),
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Could not find IMDb ID")
    })

    it("throws SourceAccessBlockedError on 403 during search", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await expect(source.lookup(mockActor)).rejects.toThrow(SourceAccessBlockedError)
    })

    it("throws SourceAccessBlockedError on 429 during bio fetch", async () => {
      // Search succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          d: [{ id: "nm0001234", l: "John Smith" }],
        }),
      })
      // Bio page rate limited
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
      })

      await expect(source.lookup(mockActor)).rejects.toThrow(SourceAccessBlockedError)
    })

    it("handles no death info in bio", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          d: [{ id: "nm0001234", l: "John Smith" }],
        }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html><body>
            <section data-testid="mini-bio">
              <div class="ipc-html-content">
                John Smith is a famous actor known for many films.
                He has won several awards during his career.
              </div>
            </section>
          </body></html>
        `,
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No death information")
    })

    it("handles network errors during IMDb ID search", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network timeout"))

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      // Network errors during ID search result in "Could not find IMDb ID"
      expect(result.error).toContain("Could not find IMDb ID")
    })

    it("extracts location of death", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          d: [{ id: "nm0001234", l: "John Smith" }],
        }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html><body>
            <div class="ipc-html-content">
              John Smith died at his home in New York City on June 1, 2024.
              He passed away peacefully surrounded by his family.
            </div>
          </body></html>
        `,
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.data?.locationOfDeath).toBeDefined()
    })

    it("extracts notable factors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          d: [{ id: "nm0001234", l: "John Smith" }],
        }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html><body>
            <div class="ipc-html-content">
              John Smith died after a long battle with cancer.
              He was hospitalized for several weeks before his death.
            </div>
          </body></html>
        `,
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.data?.notableFactors).toContain("cancer")
    })

    it("matches actor by first name when exact match not found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          d: [
            { id: "nm9999999", l: "Johnny Smith Jr.", s: "Some other person" },
            { id: "nm0001234", l: "John Smith III", s: "Actor" },
          ],
        }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html><body>
            <div class="ipc-html-content">
              John Smith III died peacefully on June 1, 2024 at his home.
              He passed away surrounded by family after a long illness.
            </div>
          </body></html>
        `,
      })

      const result = await source.lookup(mockActor)

      // Should find and use nm0001234 based on first name match
      expect(result.success).toBe(true)
    })

    it("only considers person results (nm prefix)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          d: [
            { id: "tt0001234", l: "John Smith: A Documentary" }, // Movie, not person
            { id: "nm0001234", l: "John Smith" }, // Person
          ],
        }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html><body>
            <div class="ipc-html-content">
              John Smith died on June 1, 2024 after a long illness.
              He passed away at his home in Los Angeles.
            </div>
          </body></html>
        `,
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      // Verify bio URL used the person ID
      expect(mockFetch.mock.calls[1][0]).toContain("nm0001234")
    })
  })
})
