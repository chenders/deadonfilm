import { describe, it, expect } from "vitest"
import { formatDate, subtractDays, getDateRanges, MAX_QUERY_DAYS } from "./date-utils.js"

describe("date-utils", () => {
  describe("formatDate", () => {
    it("formats a UTC date to YYYY-MM-DD", () => {
      const date = new Date(Date.UTC(2024, 2, 15, 12, 0, 0)) // March 15, 2024
      expect(formatDate(date)).toBe("2024-03-15")
    })

    it("handles single-digit months and days with zero padding", () => {
      const date = new Date(Date.UTC(2024, 0, 5, 12, 0, 0)) // January 5, 2024
      expect(formatDate(date)).toBe("2024-01-05")
    })
  })

  describe("subtractDays", () => {
    it("subtracts days from a date string", () => {
      expect(subtractDays("2024-03-15", 5)).toBe("2024-03-10")
    })

    it("handles month boundaries", () => {
      expect(subtractDays("2024-03-05", 10)).toBe("2024-02-24")
    })

    it("handles year boundaries", () => {
      expect(subtractDays("2024-01-05", 10)).toBe("2023-12-26")
    })

    it("subtracts zero days correctly", () => {
      expect(subtractDays("2024-03-15", 0)).toBe("2024-03-15")
    })
  })

  describe("getDateRanges", () => {
    it("returns single range for same-day query", () => {
      const ranges = getDateRanges("2024-03-15", "2024-03-15")
      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toEqual({ start: "2024-03-15", end: "2024-03-15" })
    })

    it("returns single range for short period within MAX_QUERY_DAYS", () => {
      const ranges = getDateRanges("2024-03-01", "2024-03-07")
      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toEqual({ start: "2024-03-01", end: "2024-03-07" })
    })

    it("returns single range for period exactly MAX_QUERY_DAYS (14 days)", () => {
      // Mar 1 to Mar 14 is 14 days inclusive - fits in one range
      const ranges = getDateRanges("2024-03-01", "2024-03-14")
      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toEqual({ start: "2024-03-01", end: "2024-03-14" })
    })

    it("splits into two ranges when period exceeds MAX_QUERY_DAYS", () => {
      // Mar 1 to Mar 15 is 15 days - splits into two ranges
      const ranges = getDateRanges("2024-03-01", "2024-03-15")
      expect(ranges).toHaveLength(2)
      expect(ranges[0]).toEqual({ start: "2024-03-01", end: "2024-03-14" })
      expect(ranges[1]).toEqual({ start: "2024-03-15", end: "2024-03-15" })
    })

    it("handles 28-day period with two ranges", () => {
      // 28 days: Mar 1-14 (14 days), Mar 15-28 (14 days)
      const ranges = getDateRanges("2024-03-01", "2024-03-28")
      expect(ranges).toHaveLength(2)
      expect(ranges[0]).toEqual({ start: "2024-03-01", end: "2024-03-14" })
      expect(ranges[1]).toEqual({ start: "2024-03-15", end: "2024-03-28" })
    })

    it("handles 30-day period with three ranges", () => {
      // 30 days: Mar 1-14 (14 days), Mar 15-28 (14 days), Mar 29-30 (2 days)
      const ranges = getDateRanges("2024-03-01", "2024-03-30")
      expect(ranges).toHaveLength(3)
      expect(ranges[0]).toEqual({ start: "2024-03-01", end: "2024-03-14" })
      expect(ranges[1]).toEqual({ start: "2024-03-15", end: "2024-03-28" })
      expect(ranges[2]).toEqual({ start: "2024-03-29", end: "2024-03-30" })
    })

    it("handles month boundaries correctly", () => {
      // Feb 25 to Mar 10 is 15 days (Feb 25-29 = 5 days + Mar 1-10 = 10 days)
      // Should split: Feb 25 to Mar 9 (14 days), then Mar 10
      const ranges = getDateRanges("2024-02-25", "2024-03-10")
      expect(ranges).toHaveLength(2)
      expect(ranges[0]).toEqual({ start: "2024-02-25", end: "2024-03-09" })
      expect(ranges[1]).toEqual({ start: "2024-03-10", end: "2024-03-10" })
    })

    it("handles year boundaries correctly", () => {
      const ranges = getDateRanges("2023-12-20", "2024-01-10")
      expect(ranges).toHaveLength(2)
      // Dec 20 to Jan 2 (14 days)
      expect(ranges[0]).toEqual({ start: "2023-12-20", end: "2024-01-02" })
      // Jan 3 to Jan 10
      expect(ranges[1]).toEqual({ start: "2024-01-03", end: "2024-01-10" })
    })

    it("produces non-overlapping ranges", () => {
      const ranges = getDateRanges("2024-01-01", "2024-02-15")

      for (let i = 1; i < ranges.length; i++) {
        const prevEnd = new Date(ranges[i - 1].end)
        const currStart = new Date(ranges[i].start)
        // Current range should start the day after previous range ends
        const expectedStart = new Date(prevEnd)
        expectedStart.setDate(expectedStart.getDate() + 1)
        expect(currStart.getTime()).toBe(expectedStart.getTime())
      }
    })

    it("covers the entire date range without gaps", () => {
      const startDate = "2024-01-15"
      const endDate = "2024-03-15"
      const ranges = getDateRanges(startDate, endDate)

      // First range should start at startDate
      expect(ranges[0].start).toBe(startDate)

      // Last range should end at or after endDate
      expect(ranges[ranges.length - 1].end).toBe(endDate)
    })

    it("each range is at most MAX_QUERY_DAYS days", () => {
      const ranges = getDateRanges("2024-01-01", "2024-06-30")

      for (const range of ranges) {
        const start = new Date(range.start)
        const end = new Date(range.end)
        const daysDiff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
        // Each range should be at most MAX_QUERY_DAYS - 1 (0-indexed days, so 13 = 14 days inclusive)
        expect(daysDiff).toBeLessThanOrEqual(MAX_QUERY_DAYS - 1)
      }
    })
  })

  describe("MAX_QUERY_DAYS constant", () => {
    it("is set to 14 (TMDB API limit)", () => {
      expect(MAX_QUERY_DAYS).toBe(14)
    })
  })
})
