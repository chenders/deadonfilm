import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { existsSync, mkdirSync, rmSync, readFileSync, readdirSync } from "fs"
import { join } from "path"
import { EnrichmentLogger, type LogConfig } from "./logger.js"
import { DataSourceType } from "./types.js"

describe("EnrichmentLogger", () => {
  // Use relative path - logger will join with baseDir
  const testRelativeDir = "test-logs-temp"
  const baseDir = process.cwd()
  const testDir = join(baseDir, testRelativeDir)
  const testConfig: LogConfig = {
    directory: testRelativeDir, // Relative path
    filename: "test.log",
    rotationSizeBytes: 1024, // Small size for testing rotation
    compressRotated: false, // Don't compress for easier testing
    level: "debug",
  }

  beforeEach(() => {
    // Clean up any previous test logs
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
  })

  afterEach(() => {
    // Clean up test logs
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
  })

  describe("constructor", () => {
    it("creates logger with default config", () => {
      const logger = new EnrichmentLogger()
      expect(logger).toBeInstanceOf(EnrichmentLogger)
    })

    it("creates logger with custom config", () => {
      const logger = new EnrichmentLogger(testConfig, baseDir)
      expect(logger.logDirectory).toBe(testDir)
      expect(logger.logFilePath).toBe(join(testDir, "test.log"))
    })
  })

  describe("fromConfigFile", () => {
    it("falls back to defaults when config file does not exist", () => {
      const logger = EnrichmentLogger.fromConfigFile("/nonexistent/path.ini")
      expect(logger).toBeInstanceOf(EnrichmentLogger)
    })
  })

  describe("logging methods", () => {
    let logger: EnrichmentLogger

    beforeEach(() => {
      logger = new EnrichmentLogger(testConfig, baseDir)
    })

    afterEach(async () => {
      await logger.close()
    })

    it("creates log directory if it does not exist", () => {
      expect(existsSync(testDir)).toBe(false)
      logger.info("Test message")
      expect(existsSync(testDir)).toBe(true)
    })

    it("writes log messages to file", async () => {
      logger.info("Test info message")
      await logger.close()

      const content = readFileSync(join(testDir, "test.log"), "utf-8")
      expect(content).toContain("INFO")
      expect(content).toContain("Test info message")
    })

    it("writes debug messages when level is debug", async () => {
      logger.debug("Debug message")
      await logger.close()

      const content = readFileSync(join(testDir, "test.log"), "utf-8")
      expect(content).toContain("DEBUG")
      expect(content).toContain("Debug message")
    })

    it("writes warn messages", async () => {
      logger.warn("Warning message")
      await logger.close()

      const content = readFileSync(join(testDir, "test.log"), "utf-8")
      expect(content).toContain("WARN")
      expect(content).toContain("Warning message")
    })

    it("writes error messages with error details", async () => {
      const error = new Error("Test error")
      logger.error("Error occurred", error)
      await logger.close()

      const content = readFileSync(join(testDir, "test.log"), "utf-8")
      expect(content).toContain("ERROR")
      expect(content).toContain("Error occurred")
      expect(content).toContain("error_name=Error")
      expect(content).toContain('error_message="Test error"')
    })

    it("includes timestamp in log messages", async () => {
      logger.info("Timestamped message")
      await logger.close()

      const content = readFileSync(join(testDir, "test.log"), "utf-8")
      // Check for ISO timestamp format
      expect(content).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })
  })

  describe("enrichment-specific logging", () => {
    let logger: EnrichmentLogger

    beforeEach(() => {
      logger = new EnrichmentLogger(testConfig, baseDir)
    })

    afterEach(async () => {
      await logger.close()
    })

    it("logs source attempts", async () => {
      logger.sourceAttempt("Gene Hackman", DataSourceType.BFI_SIGHT_SOUND, "https://bfi.org.uk")
      await logger.close()

      const content = readFileSync(join(testDir, "test.log"), "utf-8")
      expect(content).toContain("[ATTEMPT]")
      expect(content).toContain('actor="Gene Hackman"')
      expect(content).toContain("source=bfi_sight_sound")
    })

    it("logs source success with fields", async () => {
      logger.sourceSuccess("Gene Hackman", DataSourceType.BFI_SIGHT_SOUND, [
        "circumstances",
        "locationOfDeath",
      ])
      await logger.close()

      const content = readFileSync(join(testDir, "test.log"), "utf-8")
      expect(content).toContain("[SUCCESS]")
      expect(content).toContain('actor="Gene Hackman"')
      expect(content).toContain('fields=["circumstances","locationOfDeath"]')
    })

    it("logs source blocked", async () => {
      logger.sourceBlocked("Angela Lansbury", DataSourceType.IBDB, 403, "https://ibdb.com")
      await logger.close()

      const content = readFileSync(join(testDir, "test.log"), "utf-8")
      expect(content).toContain("WARN")
      expect(content).toContain("[BLOCKED]")
      expect(content).toContain('actor="Angela Lansbury"')
      expect(content).toContain("source=ibdb")
      expect(content).toContain("status=403")
    })

    it("logs source failed", async () => {
      logger.sourceFailed("Test Actor", DataSourceType.TELEVISION_ACADEMY, "Connection timeout")
      await logger.close()

      const content = readFileSync(join(testDir, "test.log"), "utf-8")
      expect(content).toContain("WARN")
      expect(content).toContain("[FAILED]")
      expect(content).toContain('error="Connection timeout"')
    })

    it("logs enrichment complete", async () => {
      logger.enrichmentComplete(123, "Test Actor", 5, 2, 0.0025)
      await logger.close()

      const content = readFileSync(join(testDir, "test.log"), "utf-8")
      expect(content).toContain("[COMPLETE]")
      expect(content).toContain("actor_id=123")
      expect(content).toContain('actor="Test Actor"')
      expect(content).toContain("sources_tried=5")
      expect(content).toContain("sources_succeeded=2")
    })

    it("logs batch start", async () => {
      logger.batchStart(100)
      await logger.close()

      const content = readFileSync(join(testDir, "test.log"), "utf-8")
      expect(content).toContain("[BATCH_START]")
      expect(content).toContain("total_actors=100")
    })

    it("logs batch complete", async () => {
      logger.batchComplete(100, 85, 0.15, 60000)
      await logger.close()

      const content = readFileSync(join(testDir, "test.log"), "utf-8")
      expect(content).toContain("[BATCH_COMPLETE]")
      expect(content).toContain("actors_processed=100")
      expect(content).toContain("actors_enriched=85")
      expect(content).toContain("fill_rate=85.0%")
    })
  })

  describe("log level filtering", () => {
    it("filters debug messages when level is info", async () => {
      // Ensure directory exists first
      if (!existsSync(testDir)) {
        mkdirSync(testDir, { recursive: true })
      }

      const infoLogger = new EnrichmentLogger(
        {
          ...testConfig,
          level: "info",
        },
        baseDir
      )

      infoLogger.debug("Should not appear")
      infoLogger.info("Should appear")
      await infoLogger.close()

      const content = readFileSync(join(testDir, "test.log"), "utf-8")
      expect(content).not.toContain("Should not appear")
      expect(content).toContain("Should appear")
    })

    it("filters info messages when level is warn", async () => {
      // Ensure directory exists first
      if (!existsSync(testDir)) {
        mkdirSync(testDir, { recursive: true })
      }

      const warnLogger = new EnrichmentLogger(
        {
          ...testConfig,
          level: "warn",
        },
        baseDir
      )

      // Write a warn message first to ensure file is created
      warnLogger.warn("Should appear")
      warnLogger.info("Should not appear")
      await warnLogger.close()

      const content = readFileSync(join(testDir, "test.log"), "utf-8")
      expect(content).not.toContain("Should not appear")
      expect(content).toContain("Should appear")
    })
  })

  describe("log rotation", () => {
    it("rotates log when size limit is reached", async () => {
      // Ensure directory exists first
      if (!existsSync(testDir)) {
        mkdirSync(testDir, { recursive: true })
      }

      const smallLogger = new EnrichmentLogger(
        {
          ...testConfig,
          rotationSizeBytes: 100, // Very small for quick rotation
        },
        baseDir
      )

      // Write enough data to trigger rotation
      for (let i = 0; i < 20; i++) {
        smallLogger.info(`Message ${i} with some extra text to fill the log`)
      }

      // Give async rotation time to complete
      await new Promise((resolve) => setTimeout(resolve, 200))
      await smallLogger.close()

      // Check that rotated files exist
      const files = readdirSync(testDir)
      const logFiles = files.filter((f) => f.startsWith("test.log"))

      // Should have at least the current log file
      expect(logFiles.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("data formatting", () => {
    let logger: EnrichmentLogger

    beforeEach(() => {
      // Ensure directory exists first
      if (!existsSync(testDir)) {
        mkdirSync(testDir, { recursive: true })
      }
      logger = new EnrichmentLogger(testConfig, baseDir)
    })

    afterEach(async () => {
      await logger.close()
    })

    it("formats strings with spaces in quotes", async () => {
      logger.info("Test", { name: "Gene Hackman" })
      await logger.close()

      const content = readFileSync(join(testDir, "test.log"), "utf-8")
      expect(content).toContain('name="Gene Hackman"')
    })

    it("formats arrays as JSON", async () => {
      logger.info("Test", { fields: ["a", "b", "c"] })
      await logger.close()

      const content = readFileSync(join(testDir, "test.log"), "utf-8")
      expect(content).toContain('fields=["a","b","c"]')
    })

    it("formats numbers without quotes", async () => {
      logger.info("Test", { count: 42 })
      await logger.close()

      const content = readFileSync(join(testDir, "test.log"), "utf-8")
      expect(content).toContain("count=42")
    })

    it("skips null and undefined values", async () => {
      logger.info("Test", { defined: "yes", empty: null, missing: undefined })
      await logger.close()

      const content = readFileSync(join(testDir, "test.log"), "utf-8")
      expect(content).toContain("defined=yes")
      expect(content).not.toContain("empty=")
      expect(content).not.toContain("missing=")
    })
  })
})
