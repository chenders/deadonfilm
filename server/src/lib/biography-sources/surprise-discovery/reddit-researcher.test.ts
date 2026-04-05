import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { researchOnReddit, extractSubreddit } from "./reddit-researcher.js"

// Mock the logger to suppress output during tests
vi.mock("../../logger.js", () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

// Mock cache module — cache always misses by default, writes are no-ops
vi.mock("../../death-sources/cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

import { getCachedQuery, setCachedQuery } from "../../death-sources/cache.js"

const GOOGLE_CSE_RESPONSE = {
  items: [
    {
      title: "Did John Wayne really invent GPS? : r/history",
      link: "https://www.reddit.com/r/history/comments/abc123/did_john_wayne_really_invent_gps/",
      snippet: "There's a popular story that John Wayne's ranch helped develop GPS technology...",
    },
    {
      title: "John Wayne and GPS navigation - interesting connection : r/todayilearned",
      link: "https://www.reddit.com/r/todayilearned/comments/def456/john_wayne_gps/",
      snippet: "TIL that John Wayne's estate was used in early GPS satellite testing.",
    },
    {
      title: "John Wayne GPS discussion : r/movies",
      link: "https://www.reddit.com/r/movies/comments/ghi789/john_wayne_gps_discussion/",
      snippet: "Interesting thread about the actor's connection to navigation technology.",
    },
  ],
}

const BRAVE_RESPONSE = {
  web: {
    results: [
      {
        title: "Helen Mirren and the unexpected karate connection : r/martialarts",
        url: "https://www.reddit.com/r/martialarts/comments/xyz111/helen_mirren_karate/",
        description: "Helen Mirren trained as a black belt before becoming famous as an actress.",
      },
      {
        title: "Helen Mirren martial arts discussion : r/movies",
        url: "https://www.reddit.com/r/movies/comments/xyz222/helen_mirren_martial_arts/",
        description: "Discussion about celebrities with unexpected martial arts backgrounds.",
      },
    ],
  },
}

describe("extractSubreddit", () => {
  it("extracts subreddit name from a standard Reddit URL", () => {
    const url = "https://www.reddit.com/r/history/comments/abc123/some_title/"
    expect(extractSubreddit(url)).toBe("history")
  })

  it("extracts subreddit from short URL", () => {
    const url = "https://reddit.com/r/todayilearned/comments/abc/"
    expect(extractSubreddit(url)).toBe("todayilearned")
  })

  it("returns 'reddit' when URL has no subreddit pattern", () => {
    const url = "https://www.reddit.com/user/someuser"
    expect(extractSubreddit(url)).toBe("reddit")
  })

  it("returns 'reddit' for a non-Reddit URL", () => {
    const url = "https://example.com/page"
    expect(extractSubreddit(url)).toBe("reddit")
  })
})

describe("researchOnReddit", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_SEARCH_API_KEY", "test-google-key")
    vi.stubEnv("GOOGLE_SEARCH_CX", "test-cx")
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "")
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("searches Reddit via Google CSE and returns thread info", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => GOOGLE_CSE_RESPONSE,
    } as Response)

    const result = await researchOnReddit("John Wayne", "GPS navigation")

    expect(fetch).toHaveBeenCalledOnce()
    const [calledUrl] = vi.mocked(fetch).mock.calls[0]
    expect(String(calledUrl)).toContain("googleapis.com/customsearch")
    expect(String(calledUrl)).toContain("site%3Areddit.com")
    expect(String(calledUrl)).toContain("John+Wayne")

    expect(result.threads).toHaveLength(3)
    expect(result.threads[0]).toEqual({
      url: "https://www.reddit.com/r/history/comments/abc123/did_john_wayne_really_invent_gps/",
      subreddit: "history",
      title: "Did John Wayne really invent GPS? : r/history",
      upvotes: 0,
    })
    expect(result.costUsd).toBe(0)
  })

  it("extracts claim from the first result's snippet", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => GOOGLE_CSE_RESPONSE,
    } as Response)

    const result = await researchOnReddit("John Wayne", "GPS navigation")

    expect(result.claimExtracted).toBe(
      "There's a popular story that John Wayne's ranch helped develop GPS technology..."
    )
  })

  it("extracts subreddit from URL correctly for each thread", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => GOOGLE_CSE_RESPONSE,
    } as Response)

    const result = await researchOnReddit("John Wayne", "GPS navigation")

    expect(result.threads[0].subreddit).toBe("history")
    expect(result.threads[1].subreddit).toBe("todayilearned")
    expect(result.threads[2].subreddit).toBe("movies")
  })

  it("returns empty results when no Reddit URLs are in response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            title: "Some non-Reddit result",
            link: "https://www.wikipedia.org/wiki/John_Wayne",
            snippet: "John Wayne was an actor.",
          },
        ],
      }),
    } as Response)

    const result = await researchOnReddit("John Wayne", "GPS navigation")

    expect(result.threads).toHaveLength(0)
    expect(result.claimExtracted).toBe("")
    expect(result.costUsd).toBe(0)
  })

  it("returns empty results when Google returns no items", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response)

    const result = await researchOnReddit("John Wayne", "GPS navigation")

    expect(result.threads).toHaveLength(0)
    expect(result.claimExtracted).toBe("")
    expect(result.costUsd).toBe(0)
  })

  it("falls back to Brave when Google CSE is not configured", async () => {
    vi.stubEnv("GOOGLE_SEARCH_API_KEY", "")
    vi.stubEnv("GOOGLE_SEARCH_CX", "")
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "test-brave-key")

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => BRAVE_RESPONSE,
    } as Response)

    const result = await researchOnReddit("Helen Mirren", "karate black belt")

    expect(fetch).toHaveBeenCalledOnce()
    const [calledUrl, calledInit] = vi.mocked(fetch).mock.calls[0]
    expect(String(calledUrl)).toContain("search.brave.com")
    expect((calledInit as RequestInit).headers).toMatchObject({
      "X-Subscription-Token": "test-brave-key",
    })

    expect(result.threads).toHaveLength(2)
    expect(result.threads[0]).toEqual({
      url: "https://www.reddit.com/r/martialarts/comments/xyz111/helen_mirren_karate/",
      subreddit: "martialarts",
      title: "Helen Mirren and the unexpected karate connection : r/martialarts",
      upvotes: 0,
    })
  })

  it("uses Google CSE when both Google and Brave are configured", async () => {
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "test-brave-key")

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => GOOGLE_CSE_RESPONSE,
    } as Response)

    const result = await researchOnReddit("John Wayne", "GPS navigation")

    const [calledUrl] = vi.mocked(fetch).mock.calls[0]
    expect(String(calledUrl)).toContain("googleapis.com/customsearch")
    expect(result.threads).toHaveLength(3)
  })

  it("handles Google CSE API errors gracefully and returns empty results", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    } as Response)

    const result = await researchOnReddit("John Wayne", "GPS navigation")

    expect(result.threads).toHaveLength(0)
    expect(result.claimExtracted).toBe("")
    expect(result.costUsd).toBe(0)
  })

  it("handles Brave Search API errors gracefully and returns empty results", async () => {
    vi.stubEnv("GOOGLE_SEARCH_API_KEY", "")
    vi.stubEnv("GOOGLE_SEARCH_CX", "")
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "test-brave-key")

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    } as Response)

    const result = await researchOnReddit("Helen Mirren", "karate black belt")

    expect(result.threads).toHaveLength(0)
    expect(result.claimExtracted).toBe("")
    expect(result.costUsd).toBe(0)
  })

  it("handles fetch network errors gracefully", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"))

    const result = await researchOnReddit("John Wayne", "GPS navigation")

    expect(result.threads).toHaveLength(0)
    expect(result.claimExtracted).toBe("")
    expect(result.costUsd).toBe(0)
  })

  it("warns and returns empty when no search API is configured", async () => {
    vi.stubEnv("GOOGLE_SEARCH_API_KEY", "")
    vi.stubEnv("GOOGLE_SEARCH_CX", "")
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "")

    const { logger } = await import("../../logger.js")

    const result = await researchOnReddit("John Wayne", "GPS navigation")

    expect(fetch).not.toHaveBeenCalled()
    expect(result.threads).toHaveLength(0)
    expect(result.claimExtracted).toBe("")
    expect(result.costUsd).toBe(0)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ actorName: "John Wayne", term: "GPS navigation" }),
      expect.stringContaining("no search API configured")
    )
  })

  it("limits results to top 5 threads", async () => {
    const manyItems = Array.from({ length: 8 }, (_, i) => ({
      title: `Reddit thread ${i + 1}`,
      link: `https://www.reddit.com/r/sub${i + 1}/comments/thread${i + 1}/`,
      snippet: `Snippet for thread ${i + 1}`,
    }))

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: manyItems }),
    } as Response)

    const result = await researchOnReddit("John Wayne", "GPS navigation")

    expect(result.threads).toHaveLength(5)
  })

  it("always returns costUsd of 0", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => GOOGLE_CSE_RESPONSE,
    } as Response)

    const result = await researchOnReddit("John Wayne", "GPS navigation")

    expect(result.costUsd).toBe(0)
  })

  it("returns cached result on cache hit without making fetch calls", async () => {
    const cachedResult = {
      threads: [
        {
          url: "https://www.reddit.com/r/history/comments/abc123/cached/",
          subreddit: "history",
          title: "Cached thread title",
          upvotes: 0,
        },
      ],
      claimExtracted: "Cached claim text",
      costUsd: 0,
    }
    vi.mocked(getCachedQuery).mockResolvedValueOnce({
      id: 1,
      sourceType: "reddit-discovery" as never,
      actorId: null,
      queryString: "John Wayne::GPS navigation",
      queryHash: "abc123",
      responseStatus: 200,
      responseRaw: cachedResult,
      isCompressed: false,
      responseSizeBytes: null,
      errorMessage: null,
      queriedAt: new Date(),
      responseTimeMs: null,
      costUsd: null,
    })

    const result = await researchOnReddit("John Wayne", "GPS navigation")

    expect(result).toEqual(cachedResult)
    expect(fetch).not.toHaveBeenCalled()
    expect(setCachedQuery).not.toHaveBeenCalled()
  })
})
