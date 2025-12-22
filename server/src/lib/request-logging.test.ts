import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import express, { type Express } from "express"
import request from "supertest"
import { logger } from "./logger.js"

// Mock the logger module
vi.mock("./logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

/**
 * Creates a test Express app with the request logging middleware.
 * This is the same middleware used in index.ts
 */
function createTestApp(): Express {
  const app = express()

  // Request logging middleware (exact copy from index.ts)
  app.use((req, res, next) => {
    const start = Date.now()
    res.on("finish", () => {
      const duration = Date.now() - start
      // Skip health checks to reduce log noise
      if (req.path !== "/health") {
        logger.info(
          {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration,
            userAgent: req.get("user-agent"),
          },
          `${req.method} ${req.path} ${res.statusCode} ${duration}ms`
        )
      }
    })
    next()
  })

  // Test routes
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" })
  })

  app.get("/api/test", (_req, res) => {
    res.json({ data: "test" })
  })

  app.post("/api/create", (_req, res) => {
    res.status(201).json({ created: true })
  })

  app.get("/api/error", (_req, res) => {
    res.status(500).json({ error: "Internal error" })
  })

  app.get("/api/slow", async (_req, res) => {
    await new Promise((resolve) => setTimeout(resolve, 50))
    res.json({ slow: true })
  })

  return app
}

describe("request logging middleware", () => {
  let app: Express

  beforeEach(() => {
    vi.clearAllMocks()
    app = createTestApp()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("logging requests", () => {
    it("logs GET requests with correct attributes", async () => {
      await request(app).get("/api/test").set("User-Agent", "TestAgent/1.0")

      expect(logger.info).toHaveBeenCalledTimes(1)
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          path: "/api/test",
          statusCode: 200,
          duration: expect.any(Number),
          userAgent: "TestAgent/1.0",
        }),
        expect.stringMatching(/GET \/api\/test 200 \d+ms/)
      )
    })

    it("logs POST requests with correct attributes", async () => {
      await request(app).post("/api/create").set("User-Agent", "TestAgent/1.0")

      expect(logger.info).toHaveBeenCalledTimes(1)
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          path: "/api/create",
          statusCode: 201,
        }),
        expect.stringMatching(/POST \/api\/create 201 \d+ms/)
      )
    })

    it("logs error responses correctly", async () => {
      await request(app).get("/api/error")

      expect(logger.info).toHaveBeenCalledTimes(1)
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
        }),
        expect.stringMatching(/GET \/api\/error 500 \d+ms/)
      )
    })

    it("captures duration for slow requests", async () => {
      await request(app).get("/api/slow")

      expect(logger.info).toHaveBeenCalledTimes(1)
      const logCall = vi.mocked(logger.info).mock.calls[0]
      const logObject = logCall[0] as { duration: number }

      // Duration should be at least 50ms due to the timeout
      expect(logObject.duration).toBeGreaterThanOrEqual(50)
    })

    it("handles missing user-agent header", async () => {
      await request(app).get("/api/test").unset("User-Agent")

      expect(logger.info).toHaveBeenCalledTimes(1)
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          userAgent: undefined,
        }),
        expect.any(String)
      )
    })
  })

  describe("health check exclusion", () => {
    it("does not log health check requests", async () => {
      await request(app).get("/health")

      expect(logger.info).not.toHaveBeenCalled()
    })

    it("logs other endpoints when health check is not logged", async () => {
      // Make both requests
      await request(app).get("/health")
      await request(app).get("/api/test")

      // Only the /api/test should be logged
      expect(logger.info).toHaveBeenCalledTimes(1)
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/api/test",
        }),
        expect.any(String)
      )
    })
  })

  describe("log message format", () => {
    it("formats log message correctly", async () => {
      await request(app).get("/api/test")

      const logCall = vi.mocked(logger.info).mock.calls[0]
      const logMessage = logCall[1] as string

      // Message should be in format: "METHOD PATH STATUS DURATIONms"
      expect(logMessage).toMatch(/^GET \/api\/test 200 \d+ms$/)
    })

    it("includes all required fields in structured log", async () => {
      await request(app).get("/api/test").set("User-Agent", "Mozilla/5.0")

      const logCall = vi.mocked(logger.info).mock.calls[0]
      const logObject = logCall[0] as Record<string, unknown>

      expect(logObject).toHaveProperty("method")
      expect(logObject).toHaveProperty("path")
      expect(logObject).toHaveProperty("statusCode")
      expect(logObject).toHaveProperty("duration")
      expect(logObject).toHaveProperty("userAgent")
    })
  })
})
