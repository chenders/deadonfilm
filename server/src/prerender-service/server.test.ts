/**
 * Tests for prerender service /render endpoint validation logic
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import request from "supertest"
import express from "express"

// Mock renderer
const mockRenderPage = vi.fn()
vi.mock("./renderer.js", () => ({
  renderPage: (...args: unknown[]) => mockRenderPage(...args),
  closeBrowser: vi.fn().mockResolvedValue(undefined),
  isBrowserHealthy: vi.fn().mockReturnValue(true),
}))

// Mock logger
vi.mock("../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}))

// Build a minimal app that mirrors the /render handler from server.ts
// We re-implement the handler here to test the validation logic in isolation
// without starting the full server (which binds a port and registers signal handlers)
function createTestApp() {
  const app = express()
  const TARGET_HOST = "http://nginx:3000"

  app.get("/render", async (req, res) => {
    const rawUrl = req.query.url

    if (!rawUrl || typeof rawUrl !== "string") {
      res.status(400).json({ error: "Missing or invalid url parameter" })
      return
    }

    let parsed: URL
    try {
      parsed = new URL(rawUrl, "http://localhost")
    } catch {
      res.status(400).json({ error: "Invalid URL" })
      return
    }

    const pathname = parsed.pathname

    if (!pathname.startsWith("/")) {
      res.status(400).json({ error: "URL must be an absolute path" })
      return
    }

    const lowerPath = pathname.toLowerCase()
    if (lowerPath.includes("%2f") || lowerPath.includes("%5c")) {
      res.status(400).json({ error: "Encoded path separators not allowed" })
      return
    }

    let decodedPathname: string
    try {
      decodedPathname = pathname
        .split("/")
        .map((segment) => decodeURIComponent(segment))
        .join("/")
    } catch {
      res.status(400).json({ error: "Invalid path encoding" })
      return
    }

    const segments = decodedPathname.split("/")
    if (segments.includes(".") || segments.includes("..")) {
      res.status(400).json({ error: "Path traversal not allowed" })
      return
    }

    const normalizedPath = "/" + segments.filter((s) => s.length > 0).join("/")

    if (
      normalizedPath === "/api" ||
      normalizedPath.startsWith("/api/") ||
      normalizedPath === "/admin" ||
      normalizedPath.startsWith("/admin/")
    ) {
      res.status(400).json({ error: "Cannot render API or admin paths" })
      return
    }

    const fullUrl = `${TARGET_HOST}${pathname}${parsed.search}`

    try {
      const html = await mockRenderPage(fullUrl)
      res.set("Content-Type", "text/html")
      res.set("X-Prerender", "true")
      res.send(html)
    } catch (err) {
      const error = err as Error
      if (error.name === "TimeoutError") {
        res.status(504).json({ error: "Render timeout" })
        return
      }
      res.status(500).json({ error: "Render failed" })
    }
  })

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", browser: "connected" })
  })

  return app
}

describe("prerender service /render endpoint", () => {
  const app = createTestApp()

  beforeEach(() => {
    vi.clearAllMocks()
    mockRenderPage.mockResolvedValue("<html><body>rendered</body></html>")
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  describe("valid requests", () => {
    it("renders a valid URL path", async () => {
      const res = await request(app).get("/render?url=/actor/john-wayne-2157")

      expect(res.status).toBe(200)
      expect(res.headers["content-type"]).toMatch(/text\/html/)
      expect(res.headers["x-prerender"]).toBe("true")
      expect(mockRenderPage).toHaveBeenCalledWith("http://nginx:3000/actor/john-wayne-2157")
    })

    it("preserves query parameters in render URL", async () => {
      const res = await request(app).get(
        "/render?url=" + encodeURIComponent("/deaths/all?page=2&includeObscure=true")
      )

      expect(res.status).toBe(200)
      expect(mockRenderPage).toHaveBeenCalledWith(
        "http://nginx:3000/deaths/all?page=2&includeObscure=true"
      )
    })

    it("renders the home page", async () => {
      const res = await request(app).get("/render?url=/")

      expect(res.status).toBe(200)
      expect(mockRenderPage).toHaveBeenCalledWith("http://nginx:3000/")
    })
  })

  describe("missing or invalid url parameter", () => {
    it("rejects missing url parameter", async () => {
      const res = await request(app).get("/render")

      expect(res.status).toBe(400)
      expect(res.body.error).toBe("Missing or invalid url parameter")
    })

    it("rejects empty url parameter", async () => {
      const res = await request(app).get("/render?url=")

      expect(res.status).toBe(400)
      expect(res.body.error).toBe("Missing or invalid url parameter")
    })

    it("rejects duplicate url parameters", async () => {
      const res = await request(app).get("/render?url=/page1&url=/page2")

      expect(res.status).toBe(400)
      expect(res.body.error).toBe("Missing or invalid url parameter")
    })
  })

  describe("encoded path separators", () => {
    it("rejects paths with encoded forward slashes", async () => {
      // Double-encode so Express does not decode %2F before the handler sees it
      const res = await request(app).get("/render?url=/actor%252Fjohn-wayne")

      expect(res.status).toBe(400)
      expect(res.body.error).toBe("Encoded path separators not allowed")
    })

    it("rejects paths with encoded backslashes", async () => {
      const res = await request(app).get("/render?url=/actor%255Cjohn-wayne")

      expect(res.status).toBe(400)
      expect(res.body.error).toBe("Encoded path separators not allowed")
    })
  })

  describe("path traversal", () => {
    it("rejects dot-dot segments that resolve to blocked paths", async () => {
      // new URL("/../admin/dashboard", base) normalizes to /admin/dashboard
      // which hits the blocklist check
      const res = await request(app).get("/render?url=/../admin/dashboard")

      expect(res.status).toBe(400)
      expect(res.body.error).toBe("Cannot render API or admin paths")
    })

    it("blocks encoded dot-dot that resolves to admin path", async () => {
      // URL constructor decodes %2e%2e to .. and resolves the path,
      // so /%2e%2e/admin normalizes to /admin — caught by blocklist
      const res = await request(app).get("/render?url=/%252e%252e/admin")

      expect(res.status).toBe(400)
      expect(res.body.error).toBe("Cannot render API or admin paths")
    })
  })

  describe("blocked paths", () => {
    it("rejects /api path", async () => {
      const res = await request(app).get("/render?url=/api")

      expect(res.status).toBe(400)
      expect(res.body.error).toBe("Cannot render API or admin paths")
    })

    it("rejects /api/ subpaths", async () => {
      const res = await request(app).get("/render?url=/api/actors/123")

      expect(res.status).toBe(400)
      expect(res.body.error).toBe("Cannot render API or admin paths")
    })

    it("rejects /admin path", async () => {
      const res = await request(app).get("/render?url=/admin")

      expect(res.status).toBe(400)
      expect(res.body.error).toBe("Cannot render API or admin paths")
    })

    it("rejects /admin/ subpaths", async () => {
      const res = await request(app).get("/render?url=/admin/dashboard")

      expect(res.status).toBe(400)
      expect(res.body.error).toBe("Cannot render API or admin paths")
    })
  })

  describe("render errors", () => {
    it("returns 504 on render timeout", async () => {
      const timeoutError = new Error("Timeout")
      timeoutError.name = "TimeoutError"
      mockRenderPage.mockRejectedValue(timeoutError)

      const res = await request(app).get("/render?url=/actor/test-123")

      expect(res.status).toBe(504)
      expect(res.body.error).toBe("Render timeout")
    })

    it("returns 500 on other render errors", async () => {
      mockRenderPage.mockRejectedValue(new Error("Browser crashed"))

      const res = await request(app).get("/render?url=/actor/test-123")

      expect(res.status).toBe(500)
      expect(res.body.error).toBe("Render failed")
    })
  })

  describe("/health endpoint", () => {
    it("returns ok status", async () => {
      const res = await request(app).get("/health")

      expect(res.status).toBe(200)
      expect(res.body.status).toBe("ok")
    })
  })
})
