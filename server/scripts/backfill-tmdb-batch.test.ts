import { describe, it, expect, vi, beforeEach } from "vitest"
import { InvalidArgumentError } from "commander"
import {
  validateDate,
  parseBatchSize,
  parseCheckpointFrequency,
  generateBatches,
} from "./backfill-tmdb-batch.js"

// Suppress console output during tests
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("backfill-tmdb-batch argument parsing", () => {
  describe("validateDate", () => {
    it("accepts valid YYYY-MM-DD dates", () => {
      expect(validateDate("2026-01-15")).toBe("2026-01-15")
      expect(validateDate("2024-12-31")).toBe("2024-12-31")
      expect(validateDate("2025-06-01")).toBe("2025-06-01")
    })

    it("rejects invalid date formats", () => {
      expect(() => validateDate("2026-1-15")).toThrow(InvalidArgumentError)
      expect(() => validateDate("2026-1-15")).toThrow("Date must be in YYYY-MM-DD format")
      expect(() => validateDate("01-15-2026")).toThrow(InvalidArgumentError)
      expect(() => validateDate("2026/01/15")).toThrow(InvalidArgumentError)
      expect(() => validateDate("20260115")).toThrow(InvalidArgumentError)
    })

    it("rejects non-date strings", () => {
      expect(() => validateDate("abc")).toThrow(InvalidArgumentError)
      expect(() => validateDate("")).toThrow(InvalidArgumentError)
      expect(() => validateDate("not a date")).toThrow(InvalidArgumentError)
    })
  })

  describe("parseBatchSize", () => {
    it("parses valid batch sizes", () => {
      expect(parseBatchSize("1")).toBe(1)
      expect(parseBatchSize("2")).toBe(2)
      expect(parseBatchSize("7")).toBe(7)
      expect(parseBatchSize("30")).toBe(30)
      expect(parseBatchSize("365")).toBe(365)
    })

    it("rejects zero", () => {
      expect(() => parseBatchSize("0")).toThrow(InvalidArgumentError)
      expect(() => parseBatchSize("0")).toThrow("Batch size must be a positive integer")
    })

    it("rejects negative numbers", () => {
      expect(() => parseBatchSize("-1")).toThrow(InvalidArgumentError)
      expect(() => parseBatchSize("-10")).toThrow(InvalidArgumentError)
    })

    it("rejects floating point numbers", () => {
      expect(() => parseBatchSize("1.5")).toThrow(InvalidArgumentError)
      expect(() => parseBatchSize("10.0")).toThrow(InvalidArgumentError)
    })

    it("rejects values exceeding 365 days", () => {
      expect(() => parseBatchSize("366")).toThrow(InvalidArgumentError)
      expect(() => parseBatchSize("366")).toThrow("Batch size cannot exceed 365 days")
      expect(() => parseBatchSize("1000")).toThrow(InvalidArgumentError)
    })

    it("rejects non-numeric strings", () => {
      expect(() => parseBatchSize("abc")).toThrow(InvalidArgumentError)
      expect(() => parseBatchSize("")).toThrow(InvalidArgumentError)
      expect(() => parseBatchSize("ten")).toThrow(InvalidArgumentError)
    })
  })

  describe("parseCheckpointFrequency", () => {
    it("parses valid checkpoint frequencies", () => {
      expect(parseCheckpointFrequency("1")).toBe(1)
      expect(parseCheckpointFrequency("10")).toBe(10)
      expect(parseCheckpointFrequency("100")).toBe(100)
      expect(parseCheckpointFrequency("1000")).toBe(1000)
    })

    it("rejects zero", () => {
      expect(() => parseCheckpointFrequency("0")).toThrow(InvalidArgumentError)
      expect(() => parseCheckpointFrequency("0")).toThrow(
        "Checkpoint frequency must be a positive integer"
      )
    })

    it("rejects negative numbers", () => {
      expect(() => parseCheckpointFrequency("-1")).toThrow(InvalidArgumentError)
      expect(() => parseCheckpointFrequency("-100")).toThrow(InvalidArgumentError)
    })

    it("rejects floating point numbers", () => {
      expect(() => parseCheckpointFrequency("1.5")).toThrow(InvalidArgumentError)
      expect(() => parseCheckpointFrequency("100.0")).toThrow(InvalidArgumentError)
    })

    it("rejects non-numeric strings", () => {
      expect(() => parseCheckpointFrequency("abc")).toThrow(InvalidArgumentError)
      expect(() => parseCheckpointFrequency("")).toThrow(InvalidArgumentError)
    })
  })
})

describe("backfill-tmdb-batch batch generation", () => {
  describe("generateBatches", () => {
    it("generates single batch when date range is within batch size", () => {
      const batches = generateBatches("2026-01-01", "2026-01-02", 7)
      expect(batches).toHaveLength(1)
      expect(batches[0]).toEqual({ start: "2026-01-01", end: "2026-01-02" })
    })

    it("generates multiple batches for longer date ranges", () => {
      const batches = generateBatches("2026-01-01", "2026-01-10", 2)
      expect(batches).toHaveLength(5)
      expect(batches[0]).toEqual({ start: "2026-01-01", end: "2026-01-02" })
      expect(batches[1]).toEqual({ start: "2026-01-03", end: "2026-01-04" })
      expect(batches[2]).toEqual({ start: "2026-01-05", end: "2026-01-06" })
      expect(batches[3]).toEqual({ start: "2026-01-07", end: "2026-01-08" })
      expect(batches[4]).toEqual({ start: "2026-01-09", end: "2026-01-10" })
    })

    it("handles end date not aligned with batch size", () => {
      const batches = generateBatches("2026-01-01", "2026-01-08", 3)
      expect(batches).toHaveLength(3)
      expect(batches[0]).toEqual({ start: "2026-01-01", end: "2026-01-03" })
      expect(batches[1]).toEqual({ start: "2026-01-04", end: "2026-01-06" })
      // Last batch should be truncated to end date
      expect(batches[2]).toEqual({ start: "2026-01-07", end: "2026-01-08" })
    })

    it("generates single batch when start and end are the same", () => {
      const batches = generateBatches("2026-01-15", "2026-01-15", 7)
      expect(batches).toHaveLength(1)
      expect(batches[0]).toEqual({ start: "2026-01-15", end: "2026-01-15" })
    })

    it("handles default batch size of 2 days", () => {
      const batches = generateBatches("2026-01-01", "2026-01-06")
      expect(batches).toHaveLength(3)
      expect(batches[0]).toEqual({ start: "2026-01-01", end: "2026-01-02" })
      expect(batches[1]).toEqual({ start: "2026-01-03", end: "2026-01-04" })
      expect(batches[2]).toEqual({ start: "2026-01-05", end: "2026-01-06" })
    })

    it("handles large batch sizes", () => {
      const batches = generateBatches("2026-01-01", "2026-01-31", 30)
      expect(batches).toHaveLength(2)
      expect(batches[0]).toEqual({ start: "2026-01-01", end: "2026-01-30" })
      expect(batches[1]).toEqual({ start: "2026-01-31", end: "2026-01-31" })
    })

    it("handles month boundaries correctly", () => {
      const batches = generateBatches("2026-01-30", "2026-02-02", 2)
      expect(batches).toHaveLength(2)
      expect(batches[0]).toEqual({ start: "2026-01-30", end: "2026-01-31" })
      expect(batches[1]).toEqual({ start: "2026-02-01", end: "2026-02-02" })
    })
  })
})
