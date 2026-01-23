/**
 * Tests for page visit tracking middleware
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Request, Response, NextFunction } from "express"
import { pageVisitTracker } from "./page-visit-tracker.js"

// Mock the pool module
vi.mock("../lib/db/pool.js", () => ({
  getPool: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  })),
}))

// Mock the logger module
vi.mock("../lib/logger.js", () => ({
  logger: {
    error: vi.fn(),
  },
}))

describe("pageVisitTracker middleware", () => {
  let req: Partial<Request>
  let res: Partial<Response>
  let next: NextFunction
  let mockQuery: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 })

    // Reset mocks
    vi.resetModules()
    const { getPool } = await import("../lib/db/pool.js")
    vi.mocked(getPool).mockReturnValue({
      query: mockQuery,
    } as any)

    req = {
      method: "GET",
      path: "/movie/godfather-1972-238",
      url: "/movie/godfather-1972-238",
      hostname: "deadonfilm.com",
      headers: {},
      cookies: {},
    }
    res = {
      cookie: vi.fn(),
    }
    next = vi.fn()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("tracks page visits for GET requests", async () => {
    pageVisitTracker(req as Request, res as Response, next)

    // Wait for async DB operation
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(next).toHaveBeenCalled()
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO page_visits"),
      expect.arrayContaining(["/movie/godfather-1972-238"])
    )
  })

  it("does not track non-GET requests", async () => {
    req.method = "POST"

    pageVisitTracker(req as Request, res as Response, next)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(next).toHaveBeenCalled()
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it("does not track API endpoints", async () => {
    req = {
      ...req,
      path: "/api/movie/123",
      url: "/api/movie/123",
    }

    pageVisitTracker(req as Request, res as Response, next)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(next).toHaveBeenCalled()
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it("does not track admin API endpoints", async () => {
    req = {
      ...req,
      path: "/admin/api/analytics",
      url: "/admin/api/analytics",
    }

    pageVisitTracker(req as Request, res as Response, next)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(next).toHaveBeenCalled()
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it("does not track static assets", async () => {
    req = {
      ...req,
      path: "/assets/logo.png",
      url: "/assets/logo.png",
    }

    pageVisitTracker(req as Request, res as Response, next)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(next).toHaveBeenCalled()
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it("generates session ID if not present", async () => {
    pageVisitTracker(req as Request, res as Response, next)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(res.cookie).toHaveBeenCalledWith(
      "visitor_session",
      expect.any(String),
      expect.objectContaining({
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        httpOnly: true,
        sameSite: "lax",
      })
    )
  })

  it("reuses existing session ID", async () => {
    req.cookies = { visitor_session: "existing-session-id" }

    pageVisitTracker(req as Request, res as Response, next)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(res.cookie).not.toHaveBeenCalled()
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO page_visits"),
      expect.arrayContaining(["existing-session-id"])
    )
  })

  it("tracks internal referrals", async () => {
    req.headers = {
      referer: "https://deadonfilm.com/",
    }

    pageVisitTracker(req as Request, res as Response, next)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO page_visits"),
      expect.arrayContaining(["/", true]) // referrer_path, is_internal_referral
    )
  })

  it("does not mark external referrals as internal", async () => {
    req.headers = {
      referer: "https://google.com/search",
    }

    pageVisitTracker(req as Request, res as Response, next)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO page_visits"),
      expect.arrayContaining([null, false]) // referrer_path (null), is_internal_referral (false)
    )
  })

  it("includes user agent in tracking data", async () => {
    req.headers = {
      "user-agent": "Mozilla/5.0",
    }

    pageVisitTracker(req as Request, res as Response, next)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO page_visits"),
      expect.arrayContaining(["Mozilla/5.0"])
    )
  })

  it("includes query string in visited path", async () => {
    req = {
      ...req,
      path: "/search",
      url: "/search?q=godfather",
    }

    pageVisitTracker(req as Request, res as Response, next)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO page_visits"),
      expect.arrayContaining(["/search?q=godfather"])
    )
  })

  it("does not block request on database error", async () => {
    mockQuery.mockRejectedValue(new Error("Database error"))

    pageVisitTracker(req as Request, res as Response, next)

    // Should call next immediately
    expect(next).toHaveBeenCalled()

    await new Promise((resolve) => setTimeout(resolve, 10))

    // Error should be logged but not thrown
    const { logger } = await import("../lib/logger.js")
    expect(logger.error).toHaveBeenCalled()
  })

  it("calls next() immediately without waiting for database", () => {
    pageVisitTracker(req as Request, res as Response, next)

    // next() should be called synchronously
    expect(next).toHaveBeenCalled()
  })
})
