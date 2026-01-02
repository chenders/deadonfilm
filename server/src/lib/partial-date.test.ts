import { describe, it, expect } from "vitest"
import {
  parsePartialDate,
  formatPartialDate,
  getEffectivePrecision,
  detectPrecision,
  type DatePrecision,
} from "./partial-date.js"

describe("partial-date", () => {
  describe("parsePartialDate", () => {
    it("returns null for null input", () => {
      expect(parsePartialDate(null)).toBeNull()
    })

    it("returns null for undefined input", () => {
      expect(parsePartialDate(undefined)).toBeNull()
    })

    it("returns null for empty string", () => {
      expect(parsePartialDate("")).toBeNull()
    })

    it("parses numeric year", () => {
      expect(parsePartialDate(1945)).toEqual({
        date: "1945-01-01",
        precision: "year",
      })
    })

    it("parses string year", () => {
      expect(parsePartialDate("1945")).toEqual({
        date: "1945-01-01",
        precision: "year",
      })
    })

    it("parses YYYY-MM format", () => {
      expect(parsePartialDate("1945-06")).toEqual({
        date: "1945-06-01",
        precision: "month",
      })
    })

    it("parses YYYY-MM-DD format", () => {
      expect(parsePartialDate("1945-06-15")).toEqual({
        date: "1945-06-15",
        precision: "day",
      })
    })

    it("parses ISO format with time", () => {
      expect(parsePartialDate("1945-06-15T10:30:00Z")).toEqual({
        date: "1945-06-15",
        precision: "day",
      })
    })

    it("parses 'Month Year' format", () => {
      expect(parsePartialDate("June 1945")).toEqual({
        date: "1945-06-01",
        precision: "month",
      })
    })

    it("parses 'Month Year' format case-insensitively", () => {
      expect(parsePartialDate("DECEMBER 2000")).toEqual({
        date: "2000-12-01",
        precision: "month",
      })
    })

    it("parses full date string formats", () => {
      expect(parsePartialDate("June 15, 1945")).toEqual({
        date: "1945-06-15",
        precision: "day",
      })
    })

    it("returns null for invalid numeric year", () => {
      expect(parsePartialDate(123)).toBeNull()
      expect(parsePartialDate(99999)).toBeNull()
    })

    it("returns null for unparseable string", () => {
      expect(parsePartialDate("not a date")).toBeNull()
    })
  })

  describe("formatPartialDate", () => {
    it("returns 'Unknown' for null input", () => {
      expect(formatPartialDate(null)).toBe("Unknown")
    })

    it("returns 'Unknown' for undefined input", () => {
      expect(formatPartialDate(undefined)).toBe("Unknown")
    })

    it("returns 'Unknown' for invalid date", () => {
      expect(formatPartialDate("invalid")).toBe("Unknown")
    })

    it("formats year-only precision as just the year", () => {
      expect(formatPartialDate("1945-01-01", "year")).toBe("1945")
    })

    it("formats month precision as 'Month Year'", () => {
      expect(formatPartialDate("1945-06-01", "month")).toBe("June 1945")
    })

    it("formats day precision as 'Mon DD, YYYY'", () => {
      expect(formatPartialDate("1945-06-15", "day")).toBe("Jun 15, 1945")
    })

    it("defaults to day precision", () => {
      expect(formatPartialDate("1945-06-15")).toBe("Jun 15, 1945")
    })

    it("handles dates at year boundaries", () => {
      expect(formatPartialDate("2000-12-31", "day")).toBe("Dec 31, 2000")
      expect(formatPartialDate("2001-01-01", "day")).toBe("Jan 1, 2001")
    })
  })

  describe("getEffectivePrecision", () => {
    it("returns the precision when provided", () => {
      expect(getEffectivePrecision("year")).toBe("year")
      expect(getEffectivePrecision("month")).toBe("month")
      expect(getEffectivePrecision("day")).toBe("day")
    })

    it("defaults to 'day' for null", () => {
      expect(getEffectivePrecision(null)).toBe("day")
    })

    it("defaults to 'day' for undefined", () => {
      expect(getEffectivePrecision(undefined)).toBe("day")
    })
  })

  describe("detectPrecision", () => {
    it("returns null for null input", () => {
      expect(detectPrecision(null)).toBeNull()
    })

    it("returns null for empty string", () => {
      expect(detectPrecision("")).toBeNull()
    })

    it("detects year-only format", () => {
      expect(detectPrecision("1945")).toBe("year")
    })

    it("detects year-month format", () => {
      expect(detectPrecision("1945-06")).toBe("month")
    })

    it("detects full date format", () => {
      expect(detectPrecision("1945-06-15")).toBe("day")
    })

    it("detects ISO format with time", () => {
      expect(detectPrecision("1945-06-15T10:30:00Z")).toBe("day")
    })

    it("returns null for unrecognized formats", () => {
      expect(detectPrecision("June 1945")).toBeNull()
      expect(detectPrecision("not a date")).toBeNull()
    })
  })
})
