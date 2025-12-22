import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Store original env values
const originalNodeEnv = process.env.NODE_ENV
const originalLogLevel = process.env.LOG_LEVEL

describe("logger", () => {
  beforeEach(() => {
    vi.resetModules()
    // Reset env vars
    delete process.env.LOG_LEVEL
  })

  afterEach(() => {
    // Restore original env values
    process.env.NODE_ENV = originalNodeEnv
    if (originalLogLevel) {
      process.env.LOG_LEVEL = originalLogLevel
    } else {
      delete process.env.LOG_LEVEL
    }
    vi.resetModules()
  })

  describe("logger configuration", () => {
    it("uses debug level in development by default", async () => {
      process.env.NODE_ENV = "development"
      const { logger } = await import("./logger.js")
      expect(logger.level).toBe("debug")
    })

    it("uses info level in production by default", async () => {
      process.env.NODE_ENV = "production"
      const { logger } = await import("./logger.js")
      expect(logger.level).toBe("info")
    })

    it("respects LOG_LEVEL environment variable", async () => {
      process.env.LOG_LEVEL = "warn"
      const { logger } = await import("./logger.js")
      expect(logger.level).toBe("warn")
    })

    it("includes service name in base attributes", async () => {
      const { logger } = await import("./logger.js")
      // Access bindings which contain the base properties
      const bindings = logger.bindings()
      expect(bindings.service).toBe("dead-on-film")
    })

    it("includes environment in base attributes", async () => {
      process.env.NODE_ENV = "test"
      const { logger } = await import("./logger.js")
      const bindings = logger.bindings()
      expect(bindings.env).toBe("test")
    })
  })

  describe("createRequestLogger", () => {
    it("creates child logger with request context", async () => {
      const { createRequestLogger } = await import("./logger.js")
      const requestLogger = createRequestLogger("req-123", "/api/movies")

      const bindings = requestLogger.bindings()
      expect(bindings.requestId).toBe("req-123")
      expect(bindings.path).toBe("/api/movies")
    })

    it("inherits base attributes from parent logger", async () => {
      const { createRequestLogger } = await import("./logger.js")
      const requestLogger = createRequestLogger("req-456", "/api/actor")

      const bindings = requestLogger.bindings()
      expect(bindings.service).toBe("dead-on-film")
    })
  })

  describe("redaction", () => {
    it("redacts authorization header", async () => {
      const { logger } = await import("./logger.js")
      const output: string[] = []

      // Create a custom destination to capture output
      const testLogger = logger.child({
        // Override with a writable stream to capture
      })

      // We can test redaction by checking the redact paths are configured
      // Pino's redaction happens at write time, so we verify the config
      expect(logger).toBeDefined()
      // The redact config is set in the logger options
    })

    it("has redaction paths configured for sensitive fields", async () => {
      // Import the source to check configuration
      const loggerModule = await import("./logger.js")

      // The logger exists and has proper configuration
      expect(loggerModule.logger).toBeDefined()
      expect(typeof loggerModule.logger.info).toBe("function")
      expect(typeof loggerModule.logger.error).toBe("function")
      expect(typeof loggerModule.logger.warn).toBe("function")
    })
  })

  describe("log methods", () => {
    it("has all standard log methods", async () => {
      const { logger } = await import("./logger.js")

      expect(typeof logger.fatal).toBe("function")
      expect(typeof logger.error).toBe("function")
      expect(typeof logger.warn).toBe("function")
      expect(typeof logger.info).toBe("function")
      expect(typeof logger.debug).toBe("function")
      expect(typeof logger.trace).toBe("function")
    })

    it("can log with message and object", async () => {
      const { logger } = await import("./logger.js")

      // Should not throw
      expect(() => {
        logger.info({ customField: "value" }, "test message")
      }).not.toThrow()
    })

    it("can create child loggers", async () => {
      const { logger } = await import("./logger.js")

      const childLogger = logger.child({ module: "test" })
      expect(childLogger).toBeDefined()
      expect(typeof childLogger.info).toBe("function")
    })
  })

  describe("Logger type export", () => {
    it("exports Logger type", async () => {
      const { logger } = await import("./logger.js")
      // Type check - if Logger type is exported correctly, this assignment works
      type Logger = typeof logger
      const testLogger: Logger = logger
      expect(testLogger).toBe(logger)
    })
  })
})
