import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Pool } from "pg"
import {
  persistLog,
  persistLogRequired,
  extractLogEntry,
  type LogEntry,
} from "./log-persistence.js"

// Mock pool
const createMockPool = () => ({
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
})

describe("log-persistence", () => {
  let mockPool: ReturnType<typeof createMockPool>

  beforeEach(() => {
    mockPool = createMockPool()
    vi.clearAllMocks()
  })

  describe("persistLog", () => {
    it("should persist error level logs", async () => {
      const entry: LogEntry = {
        level: "error",
        source: "route",
        message: "Test error message",
        requestId: "req-123",
        path: "/api/test",
        method: "GET",
      }

      await persistLog(mockPool as unknown as Pool, entry)

      expect(mockPool.query).toHaveBeenCalledTimes(1)
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO error_logs"),
        expect.arrayContaining(["error", "route", "Test error message"])
      )
    })

    it("should persist fatal level logs", async () => {
      const entry: LogEntry = {
        level: "fatal",
        source: "startup",
        message: "Fatal startup error",
      }

      await persistLog(mockPool as unknown as Pool, entry)

      expect(mockPool.query).toHaveBeenCalledTimes(1)
    })

    it("should NOT persist info level logs", async () => {
      const entry: LogEntry = {
        level: "info",
        source: "route",
        message: "Info message",
      }

      await persistLog(mockPool as unknown as Pool, entry)

      expect(mockPool.query).not.toHaveBeenCalled()
    })

    it("should NOT persist warn level logs", async () => {
      const entry: LogEntry = {
        level: "warn",
        source: "route",
        message: "Warning message",
      }

      await persistLog(mockPool as unknown as Pool, entry)

      expect(mockPool.query).not.toHaveBeenCalled()
    })

    it("should NOT persist debug level logs", async () => {
      const entry: LogEntry = {
        level: "debug",
        source: "route",
        message: "Debug message",
      }

      await persistLog(mockPool as unknown as Pool, entry)

      expect(mockPool.query).not.toHaveBeenCalled()
    })

    it("should NOT persist trace level logs", async () => {
      const entry: LogEntry = {
        level: "trace",
        source: "route",
        message: "Trace message",
      }

      await persistLog(mockPool as unknown as Pool, entry)

      expect(mockPool.query).not.toHaveBeenCalled()
    })

    it("should handle database errors gracefully", async () => {
      mockPool.query.mockRejectedValue(new Error("Database connection failed"))
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      const entry: LogEntry = {
        level: "error",
        source: "route",
        message: "Test error",
      }

      // Should not throw
      await expect(persistLog(mockPool as unknown as Pool, entry)).resolves.not.toThrow()

      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to persist log entry to database:",
        expect.any(Error)
      )
      consoleSpy.mockRestore()
    })

    it("should include all optional fields when provided", async () => {
      const entry: LogEntry = {
        level: "error",
        source: "script",
        message: "Script error",
        details: { actorId: 123, attempt: 2 },
        requestId: "req-456",
        path: "/api/actors",
        method: "POST",
        scriptName: "sync-tmdb",
        jobName: "sync-changes",
        errorStack: "Error: Something failed\n  at line 10",
      }

      await persistLog(mockPool as unknown as Pool, entry)

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          "error",
          "script",
          "Script error",
          JSON.stringify({ actorId: 123, attempt: 2 }),
          "req-456",
          "/api/actors",
          "POST",
          "sync-tmdb",
          "sync-changes",
          "Error: Something failed\n  at line 10",
        ])
      )
    })

    it("should pass null for missing optional fields", async () => {
      const entry: LogEntry = {
        level: "error",
        source: "route",
        message: "Minimal error",
      }

      await persistLog(mockPool as unknown as Pool, entry)

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          "error",
          "route",
          "Minimal error",
          null, // details
          null, // requestId
          null, // path
          null, // method
          null, // scriptName
          null, // jobName
          null, // errorStack
        ])
      )
    })
  })

  describe("persistLogRequired", () => {
    it("should throw on database error", async () => {
      mockPool.query.mockRejectedValue(new Error("Database connection failed"))

      const entry: LogEntry = {
        level: "error",
        source: "route",
        message: "Test error",
      }

      await expect(persistLogRequired(mockPool as unknown as Pool, entry)).rejects.toThrow(
        "Database connection failed"
      )
    })

    it("should persist error level logs successfully", async () => {
      const entry: LogEntry = {
        level: "error",
        source: "script",
        message: "Script error",
      }

      await persistLogRequired(mockPool as unknown as Pool, entry)

      expect(mockPool.query).toHaveBeenCalledTimes(1)
    })

    it("should NOT persist non-error level logs", async () => {
      const entry: LogEntry = {
        level: "info",
        source: "route",
        message: "Info message",
      }

      await persistLogRequired(mockPool as unknown as Pool, entry)

      expect(mockPool.query).not.toHaveBeenCalled()
    })
  })

  describe("extractLogEntry", () => {
    it("should extract basic fields from pino log", () => {
      const pinoLog = {
        source: "route",
        requestId: "req-789",
        path: "/api/movies",
        method: "GET",
      }

      const entry = extractLogEntry(pinoLog, "Test message")

      expect(entry.message).toBe("Test message")
      expect(entry.source).toBe("route")
      expect(entry.requestId).toBe("req-789")
      expect(entry.path).toBe("/api/movies")
      expect(entry.method).toBe("GET")
    })

    it("should extract script context", () => {
      const pinoLog = {
        source: "script",
        scriptName: "sync-tmdb-changes",
      }

      const entry = extractLogEntry(pinoLog, "Script running")

      expect(entry.source).toBe("script")
      expect(entry.scriptName).toBe("sync-tmdb-changes")
    })

    it("should extract job context", () => {
      const pinoLog = {
        source: "cronjob",
        jobName: "enrich-death-details",
      }

      const entry = extractLogEntry(pinoLog, "Job started")

      expect(entry.source).toBe("cronjob")
      expect(entry.jobName).toBe("enrich-death-details")
    })

    it("should extract error stack from error object", () => {
      const pinoLog = {
        source: "route",
        error: {
          message: "Something went wrong",
          stack: "Error: Something went wrong\n  at handler (/app/routes.ts:10)",
        },
      }

      const entry = extractLogEntry(pinoLog, "Request failed")

      expect(entry.errorStack).toBe("Error: Something went wrong\n  at handler (/app/routes.ts:10)")
    })

    it("should collect non-standard fields as details", () => {
      const pinoLog = {
        source: "route",
        actorId: 123,
        movieTitle: "Test Movie",
        attempt: 3,
        // Standard fields should not appear in details
        level: 50,
        time: Date.now(),
        pid: 1234,
        hostname: "localhost",
        msg: "Test message",
        service: "dead-on-film",
        env: "test",
      }

      const entry = extractLogEntry(pinoLog, "Test message")

      expect(entry.details).toEqual({
        actorId: 123,
        movieTitle: "Test Movie",
        attempt: 3,
      })
    })

    it("should default source to 'other' when not provided", () => {
      const pinoLog = {
        customField: "value",
      }

      const entry = extractLogEntry(pinoLog, "Unknown source")

      expect(entry.source).toBe("other")
    })

    it("should not include details when no extra fields exist", () => {
      const pinoLog = {
        source: "route",
        // Only standard fields
        level: 50,
        time: Date.now(),
        pid: 1234,
      }

      const entry = extractLogEntry(pinoLog, "Simple log")

      expect(entry.details).toBeUndefined()
    })
  })
})
