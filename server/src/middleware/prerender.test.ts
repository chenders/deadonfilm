/**
 * Tests for prerender middleware
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response, NextFunction } from "express"

// Mock cache module
vi.mock("../lib/cache.js", () => ({
  getCached: vi.fn(),
  setCached: vi.fn().mockResolvedValue(undefined),
  CACHE_KEYS: {
    prerender: (urlPath: string) => ({
      html: `prerender:path:${urlPath}`,
    }),
  },
  CACHE_TTL: {
    PRERENDER: 86400,
    PRERENDER_DYNAMIC: 3600,
  },
}))

// Mock logger
vi.mock("../lib/logger.js", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock url-patterns
vi.mock("../lib/prerender/url-patterns.js", () => ({
  matchUrl: vi.fn(),
}))

// Mock data-fetchers
vi.mock("../lib/prerender/data-fetchers.js", () => ({
  fetchPageData: vi.fn(),
}))

// Mock renderer
vi.mock("../lib/prerender/renderer.js", () => ({
  renderPrerenderHtml: vi.fn(),
  renderFallbackHtml: vi.fn(),
}))

import { prerenderMiddleware } from "./prerender.js"
import { getCached } from "../lib/cache.js"
import { matchUrl } from "../lib/prerender/url-patterns.js"
import { fetchPageData } from "../lib/prerender/data-fetchers.js"
import { renderPrerenderHtml, renderFallbackHtml } from "../lib/prerender/renderer.js"

function makeReq(overrides: Record<string, unknown> = {}): Request {
  const path = (overrides.path as string) || "/actor/john-wayne-2157"
  return {
    method: "GET",
    path,
    originalUrl: (overrides.originalUrl as string) || path,
    headers: { "x-prerender": "1" },
    ...overrides,
  } as unknown as Request
}

describe("prerenderMiddleware", () => {
  let res: Partial<Response>
  let next: NextFunction

  beforeEach(() => {
    vi.clearAllMocks()

    res = {
      set: vi.fn().mockReturnThis(),
      send: vi.fn(),
      status: vi.fn().mockReturnThis(),
    }
    next = vi.fn()
  })

  // ── Skip conditions ──────────────────────────────────────────────

  it("skips requests without X-Prerender header", async () => {
    await prerenderMiddleware(makeReq({ headers: {} }), res as Response, next)

    expect(next).toHaveBeenCalled()
    expect(getCached).not.toHaveBeenCalled()
  })

  it("skips non-GET requests", async () => {
    await prerenderMiddleware(makeReq({ method: "POST" }), res as Response, next)

    expect(next).toHaveBeenCalled()
    expect(getCached).not.toHaveBeenCalled()
  })

  it("skips /api/ paths", async () => {
    await prerenderMiddleware(makeReq({ path: "/api/actor/123" }), res as Response, next)

    expect(next).toHaveBeenCalled()
    expect(getCached).not.toHaveBeenCalled()
  })

  it("skips /admin/ paths", async () => {
    await prerenderMiddleware(makeReq({ path: "/admin/dashboard" }), res as Response, next)

    expect(next).toHaveBeenCalled()
    expect(getCached).not.toHaveBeenCalled()
  })

  it("skips exact /admin path", async () => {
    await prerenderMiddleware(makeReq({ path: "/admin" }), res as Response, next)

    expect(next).toHaveBeenCalled()
    expect(getCached).not.toHaveBeenCalled()
  })

  it("skips /health path", async () => {
    await prerenderMiddleware(makeReq({ path: "/health" }), res as Response, next)

    expect(next).toHaveBeenCalled()
    expect(getCached).not.toHaveBeenCalled()
  })

  it("skips /sitemap paths", async () => {
    await prerenderMiddleware(makeReq({ path: "/sitemap.xml" }), res as Response, next)

    expect(next).toHaveBeenCalled()
    expect(getCached).not.toHaveBeenCalled()
  })

  it("skips /assets paths", async () => {
    await prerenderMiddleware(makeReq({ path: "/assets/index-abc123.js" }), res as Response, next)

    expect(next).toHaveBeenCalled()
    expect(getCached).not.toHaveBeenCalled()
  })

  // ── Cache hit ────────────────────────────────────────────────────

  it("returns cached HTML on Redis hit", async () => {
    vi.mocked(getCached).mockResolvedValue("<html>cached</html>")

    await prerenderMiddleware(makeReq(), res as Response, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.set).toHaveBeenCalledWith("Content-Type", "text/html")
    expect(res.set).toHaveBeenCalledWith("X-Prerender-Cache", "HIT")
    expect(res.send).toHaveBeenCalledWith("<html>cached</html>")
    expect(matchUrl).not.toHaveBeenCalled()
  })

  // ── Cache miss — successful render ───────────────────────────────

  it("renders HTML on cache miss and caches result", async () => {
    vi.mocked(getCached).mockResolvedValue(null)
    vi.mocked(matchUrl).mockReturnValue({ pageType: "actor", params: { actorId: "2157" } })
    vi.mocked(fetchPageData).mockResolvedValue({
      title: "John Wayne — Dead on Film",
      description: "John Wayne filmography",
      ogType: "profile",
      canonicalUrl: "https://deadonfilm.com/actor/john-wayne-2157",
      heading: "John Wayne",
    })
    vi.mocked(renderPrerenderHtml).mockReturnValue("<html>rendered</html>")

    await prerenderMiddleware(makeReq(), res as Response, next)

    expect(fetchPageData).toHaveBeenCalledWith({
      pageType: "actor",
      params: { actorId: "2157" },
    })
    expect(renderPrerenderHtml).toHaveBeenCalled()
    expect(res.set).toHaveBeenCalledWith("X-Prerender-Cache", "MISS")
    expect(res.send).toHaveBeenCalledWith("<html>rendered</html>")
    expect(next).not.toHaveBeenCalled()
  })

  // ── Dynamic TTLs ─────────────────────────────────────────────────

  it("uses dynamic TTL for /death-watch", async () => {
    vi.mocked(getCached).mockResolvedValue(null)
    vi.mocked(matchUrl).mockReturnValue({ pageType: "death-watch", params: {} })
    vi.mocked(fetchPageData).mockResolvedValue({
      title: "Death Watch",
      description: "Oldest living actors",
      ogType: "website",
      canonicalUrl: "https://deadonfilm.com/death-watch",
      heading: "Death Watch",
    })
    vi.mocked(renderPrerenderHtml).mockReturnValue("<html>death-watch</html>")

    const { setCached: mockSetCached } = await import("../lib/cache.js")

    await prerenderMiddleware(
      makeReq({ path: "/death-watch", originalUrl: "/death-watch" }),
      res as Response,
      next
    )

    // Wait for fire-and-forget setCached
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(mockSetCached).toHaveBeenCalledWith(expect.any(String), "<html>death-watch</html>", 3600)
  })

  it("uses dynamic TTL for home page", async () => {
    vi.mocked(getCached).mockResolvedValue(null)
    vi.mocked(matchUrl).mockReturnValue({ pageType: "home", params: {} })
    vi.mocked(fetchPageData).mockResolvedValue({
      title: "Dead on Film",
      description: "Movie cast mortality database",
      ogType: "website",
      canonicalUrl: "https://deadonfilm.com",
      heading: "Dead on Film",
    })
    vi.mocked(renderPrerenderHtml).mockReturnValue("<html>home</html>")

    const { setCached: mockSetCached } = await import("../lib/cache.js")

    await prerenderMiddleware(makeReq({ path: "/", originalUrl: "/" }), res as Response, next)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(mockSetCached).toHaveBeenCalledWith(expect.any(String), "<html>home</html>", 3600)
  })

  // ── Unrecognized path ────────────────────────────────────────────

  it("serves fallback HTML for unrecognized paths", async () => {
    vi.mocked(getCached).mockResolvedValue(null)
    vi.mocked(matchUrl).mockReturnValue(null)
    vi.mocked(renderFallbackHtml).mockReturnValue("<html>fallback</html>")

    await prerenderMiddleware(
      makeReq({ path: "/unknown/path", originalUrl: "/unknown/path" }),
      res as Response,
      next
    )

    expect(renderFallbackHtml).toHaveBeenCalledWith("/unknown/path")
    expect(res.set).toHaveBeenCalledWith("X-Prerender-Cache", "FALLBACK")
    expect(res.send).toHaveBeenCalledWith("<html>fallback</html>")
  })

  // ── Entity not found ─────────────────────────────────────────────

  it("returns 404 when entity not found in database", async () => {
    vi.mocked(getCached).mockResolvedValue(null)
    vi.mocked(matchUrl).mockReturnValue({ pageType: "actor", params: { actorId: "99999999" } })
    vi.mocked(fetchPageData).mockResolvedValue(null)

    await prerenderMiddleware(makeReq(), res as Response, next)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.send).toHaveBeenCalledWith("")
  })

  // ── Error handling ───────────────────────────────────────────────

  it("serves fallback HTML on database error", async () => {
    vi.mocked(getCached).mockResolvedValue(null)
    vi.mocked(matchUrl).mockReturnValue({ pageType: "actor", params: { actorId: "2157" } })
    vi.mocked(fetchPageData).mockRejectedValue(new Error("DB connection failed"))
    vi.mocked(renderFallbackHtml).mockReturnValue("<html>error-fallback</html>")

    await prerenderMiddleware(makeReq(), res as Response, next)

    expect(res.set).toHaveBeenCalledWith("X-Prerender-Cache", "ERROR-FALLBACK")
    expect(res.send).toHaveBeenCalledWith("<html>error-fallback</html>")
    expect(next).not.toHaveBeenCalled()
  })

  it("falls through when even fallback rendering fails", async () => {
    vi.mocked(getCached).mockRejectedValue(new Error("Redis error"))
    vi.mocked(renderFallbackHtml).mockImplementation(() => {
      throw new Error("Render failed")
    })

    await prerenderMiddleware(makeReq(), res as Response, next)

    expect(next).toHaveBeenCalled()
  })

  // ── Query parameter handling ─────────────────────────────────────

  it("preserves query parameters in cache key", async () => {
    vi.mocked(getCached).mockResolvedValue(null)
    vi.mocked(matchUrl).mockReturnValue({ pageType: "deaths-all", params: {} })
    vi.mocked(fetchPageData).mockResolvedValue({
      title: "All Deaths",
      description: "All actor deaths",
      ogType: "website",
      canonicalUrl: "https://deadonfilm.com/deaths/all",
      heading: "All Deaths",
    })
    vi.mocked(renderPrerenderHtml).mockReturnValue("<html>page2</html>")

    await prerenderMiddleware(
      makeReq({
        path: "/deaths/all",
        originalUrl: "/deaths/all?page=2&includeObscure=true",
      }),
      res as Response,
      next
    )

    // Cache key should include query string
    expect(getCached).toHaveBeenCalledWith("prerender:path:/deaths/all?page=2&includeObscure=true")
  })
})
