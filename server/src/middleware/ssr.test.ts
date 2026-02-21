/**
 * Tests for SSR middleware
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { PassThrough } from "node:stream"
import type { Request, Response, NextFunction } from "express"

// Mock cache module
vi.mock("../lib/cache.js", () => ({
  getCached: vi.fn(),
  setCached: vi.fn().mockResolvedValue(undefined),
  buildCacheKey: vi.fn((prefix: string, params?: Record<string, unknown>) => {
    if (!params || Object.keys(params).length === 0) return prefix
    const parts = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
    return `${prefix}:${parts.join(":")}`
  }),
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

// Mock fs module — the SSR middleware reads template + loads SSR module from disk
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi
      .fn()
      .mockReturnValue(
        '<!DOCTYPE html><html><head><!--app-head--></head><body><div id="root"><!--app-html--></div></body></html>'
      ),
  },
}))

// Create a mock SSR module that resolves immediately
function createMockSSRModule() {
  return {
    render: vi.fn(
      (
        _url: string,
        _queryClient: unknown,
        streamOptions: Record<string, (...args: unknown[]) => void>
      ) => {
        // Simulate immediate render completion
        const pt = new PassThrough()

        // Schedule the onAllReady callback to fire after render returns
        setTimeout(() => {
          streamOptions.onAllReady()
          pt.end("<div>SSR content</div>")
        }, 0)

        return {
          stream: { pipe: (dest: NodeJS.WritableStream) => pt.pipe(dest), abort: vi.fn() },
          helmetContext: {
            helmet: {
              title: { toString: () => "<title>Test Page</title>" },
              meta: { toString: () => '<meta name="description" content="Test">' },
              link: { toString: () => "" },
              script: { toString: () => "" },
            },
          },
          getDehydratedState: () => ({ queries: [] }),
        }
      }
    ),
    createQueryClient: vi.fn(() => ({
      prefetchQuery: vi.fn().mockResolvedValue(undefined),
    })),
    matchRouteLoaders: vi.fn().mockReturnValue(null),
  }
}

// We need to mock dynamic import for the SSR module
const mockSSRModule = createMockSSRModule()

// Override the SSR module import path resolution
vi.mock("node:path", async () => {
  const actual = await vi.importActual<typeof import("node:path")>("node:path")
  return {
    ...actual,
    default: {
      ...actual,
      dirname: actual.dirname,
      join: actual.join,
      resolve: actual.resolve,
    },
  }
})

import { ssrMiddleware } from "./ssr.js"
import { getCached, setCached } from "../lib/cache.js"

function makeReq(overrides: Record<string, unknown> = {}): Request {
  const path = (overrides.path as string) || "/actor/john-wayne-2157"
  return {
    method: "GET",
    path,
    originalUrl: (overrides.originalUrl as string) || path,
    socket: { localPort: 8080 },
    ...overrides,
  } as unknown as Request
}

describe("ssrMiddleware", () => {
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

  it("skips non-GET requests", async () => {
    await ssrMiddleware(makeReq({ method: "POST" }), res as Response, next)
    expect(next).toHaveBeenCalled()
    expect(getCached).not.toHaveBeenCalled()
  })

  it("skips /api/ paths", async () => {
    await ssrMiddleware(makeReq({ path: "/api/actor/123" }), res as Response, next)
    expect(next).toHaveBeenCalled()
    expect(getCached).not.toHaveBeenCalled()
  })

  it("skips /admin paths", async () => {
    await ssrMiddleware(makeReq({ path: "/admin/dashboard" }), res as Response, next)
    expect(next).toHaveBeenCalled()
    expect(getCached).not.toHaveBeenCalled()
  })

  it("skips /health path", async () => {
    await ssrMiddleware(makeReq({ path: "/health" }), res as Response, next)
    expect(next).toHaveBeenCalled()
    expect(getCached).not.toHaveBeenCalled()
  })

  it("skips /sitemap paths", async () => {
    await ssrMiddleware(makeReq({ path: "/sitemap.xml" }), res as Response, next)
    expect(next).toHaveBeenCalled()
    expect(getCached).not.toHaveBeenCalled()
  })

  it("skips /assets paths", async () => {
    await ssrMiddleware(makeReq({ path: "/assets/index-abc123.js" }), res as Response, next)
    expect(next).toHaveBeenCalled()
    expect(getCached).not.toHaveBeenCalled()
  })

  it("skips /nr-browser.js", async () => {
    await ssrMiddleware(makeReq({ path: "/nr-browser.js" }), res as Response, next)
    expect(next).toHaveBeenCalled()
    expect(getCached).not.toHaveBeenCalled()
  })

  it("skips /og/ paths", async () => {
    await ssrMiddleware(makeReq({ path: "/og/movie/694" }), res as Response, next)
    expect(next).toHaveBeenCalled()
    expect(getCached).not.toHaveBeenCalled()
  })

  it("skips requests for files with extensions", async () => {
    await ssrMiddleware(makeReq({ path: "/favicon.ico" }), res as Response, next)
    expect(next).toHaveBeenCalled()
    expect(getCached).not.toHaveBeenCalled()
  })

  // ── Cache hit ────────────────────────────────────────────────────

  it("returns cached HTML on Redis hit", async () => {
    vi.mocked(getCached).mockResolvedValue("<html>cached SSR</html>")

    await ssrMiddleware(makeReq(), res as Response, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.set).toHaveBeenCalledWith("Content-Type", "text/html")
    expect(res.set).toHaveBeenCalledWith("X-SSR", "hit")
    expect(res.send).toHaveBeenCalledWith("<html>cached SSR</html>")
  })

  // ── Trailing slash normalization ─────────────────────────────────

  it("normalizes trailing slash in cache key", async () => {
    vi.mocked(getCached).mockResolvedValue("<html>cached</html>")

    await ssrMiddleware(
      makeReq({ path: "/actor/john-wayne-2157/", originalUrl: "/actor/john-wayne-2157/" }),
      res as Response,
      next
    )

    // buildCacheKey should be called with the path without trailing slash
    const { buildCacheKey } = await import("../lib/cache.js")
    expect(buildCacheKey).toHaveBeenCalledWith("ssr", { path: "/actor/john-wayne-2157" })
  })

  it("preserves root path as / when normalizing", async () => {
    vi.mocked(getCached).mockResolvedValue("<html>home</html>")

    await ssrMiddleware(makeReq({ path: "/", originalUrl: "/" }), res as Response, next)

    const { buildCacheKey } = await import("../lib/cache.js")
    expect(buildCacheKey).toHaveBeenCalledWith("ssr", { path: "/" })
  })

  // ── Query parameter handling ────────────────────────────────────

  it("includes query parameters in cache key", async () => {
    vi.mocked(getCached).mockResolvedValue("<html>cached</html>")

    await ssrMiddleware(
      makeReq({
        path: "/deaths/notable",
        originalUrl: "/deaths/notable?page=2&filter=strange",
        query: { page: "2", filter: "strange" },
      }),
      res as Response,
      next
    )

    const { buildCacheKey } = await import("../lib/cache.js")
    expect(buildCacheKey).toHaveBeenCalledWith("ssr", {
      path: "/deaths/notable?filter=strange&page=2",
    })
  })

  it("sorts query parameters for consistent cache keys", async () => {
    vi.mocked(getCached).mockResolvedValue("<html>cached</html>")

    // Same params in different order should produce the same cache key
    await ssrMiddleware(
      makeReq({
        path: "/deaths/notable",
        originalUrl: "/deaths/notable?filter=all&page=1",
        query: { filter: "all", page: "1" },
      }),
      res as Response,
      next
    )

    const { buildCacheKey } = await import("../lib/cache.js")
    expect(buildCacheKey).toHaveBeenCalledWith("ssr", {
      path: "/deaths/notable?filter=all&page=1",
    })
  })

  it("uses path-only cache key when no query parameters", async () => {
    vi.mocked(getCached).mockResolvedValue("<html>cached</html>")

    await ssrMiddleware(
      makeReq({ path: "/actor/john-wayne-2157", query: {} }),
      res as Response,
      next
    )

    const { buildCacheKey } = await import("../lib/cache.js")
    expect(buildCacheKey).toHaveBeenCalledWith("ssr", {
      path: "/actor/john-wayne-2157",
    })
  })

  // ── Error handling ───────────────────────────────────────────────

  it("serves SPA fallback when Redis errors", async () => {
    vi.mocked(getCached).mockRejectedValue(new Error("Redis connection refused"))

    await ssrMiddleware(makeReq(), res as Response, next)

    // Should serve the SPA fallback (template without SSR content)
    expect(res.set).toHaveBeenCalledWith("Content-Type", "text/html")
    expect(res.set).toHaveBeenCalledWith("X-SSR", "fallback")
    expect(res.send).toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })
})
