/**
 * Tests for prerender middleware
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response, NextFunction } from "express"

// Mock cache module
vi.mock("../lib/cache.js", () => ({
  getCached: vi.fn(),
  setCached: vi.fn(),
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

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

import { prerenderMiddleware } from "./prerender.js"
import { getCached, setCached } from "../lib/cache.js"

function makeReq(overrides: Record<string, unknown> = {}): Request {
  return {
    method: "GET",
    path: "/actor/john-wayne-2157",
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

  it("returns cached HTML on Redis hit", async () => {
    vi.mocked(getCached).mockResolvedValue("<html>cached</html>")

    await prerenderMiddleware(makeReq(), res as Response, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.set).toHaveBeenCalledWith("Content-Type", "text/html")
    expect(res.set).toHaveBeenCalledWith("X-Prerender-Cache", "HIT")
    expect(res.send).toHaveBeenCalledWith("<html>cached</html>")
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("calls prerender service on cache miss and caches result", async () => {
    vi.mocked(getCached).mockResolvedValue(null)
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html>rendered</html>"),
    })

    await prerenderMiddleware(makeReq(), res as Response, next)

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/render?url="),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(setCached).toHaveBeenCalledWith(
      "prerender:path:/actor/john-wayne-2157",
      "<html>rendered</html>",
      86400 // PRERENDER TTL (24h)
    )
    expect(res.set).toHaveBeenCalledWith("X-Prerender-Cache", "MISS")
    expect(res.send).toHaveBeenCalledWith("<html>rendered</html>")
  })

  it("uses shorter TTL for dynamic paths like /death-watch", async () => {
    vi.mocked(getCached).mockResolvedValue(null)
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html>death-watch</html>"),
    })

    await prerenderMiddleware(makeReq({ path: "/death-watch" }), res as Response, next)

    expect(setCached).toHaveBeenCalledWith(
      expect.any(String),
      "<html>death-watch</html>",
      3600 // PRERENDER_DYNAMIC TTL (1h)
    )
  })

  it("uses shorter TTL for /deaths/* paths", async () => {
    vi.mocked(getCached).mockResolvedValue(null)
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html>deaths</html>"),
    })

    await prerenderMiddleware(makeReq({ path: "/deaths/all" }), res as Response, next)

    expect(setCached).toHaveBeenCalledWith(
      expect.any(String),
      "<html>deaths</html>",
      3600 // PRERENDER_DYNAMIC TTL (1h)
    )
  })

  it("falls through when prerender service returns non-OK status", async () => {
    vi.mocked(getCached).mockResolvedValue(null)
    mockFetch.mockResolvedValue({
      ok: false,
      status: 504,
    })

    await prerenderMiddleware(makeReq(), res as Response, next)

    expect(next).toHaveBeenCalled()
    expect(res.send).not.toHaveBeenCalled()
  })

  it("falls through on fetch error", async () => {
    vi.mocked(getCached).mockResolvedValue(null)
    mockFetch.mockRejectedValue(new Error("Connection refused"))

    await prerenderMiddleware(makeReq(), res as Response, next)

    expect(next).toHaveBeenCalled()
    expect(res.send).not.toHaveBeenCalled()
  })

  it("falls through on cache error", async () => {
    vi.mocked(getCached).mockRejectedValue(new Error("Redis error"))

    await prerenderMiddleware(makeReq(), res as Response, next)

    expect(next).toHaveBeenCalled()
    expect(res.send).not.toHaveBeenCalled()
  })
})
