import { describe, it, expect } from "vitest"
import {
  normalizeDateToString,
  getYearFromDate,
  getMonthDayFromDate,
  getBirthYear,
  getDeathYear,
} from "./date-utils.js"

describe("normalizeDateToString", () => {
  it("returns null for null input", () => {
    expect(normalizeDateToString(null)).toBeNull()
  })

  it("returns null for undefined input", () => {
    expect(normalizeDateToString(undefined)).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(normalizeDateToString("")).toBeNull()
  })

  it("normalizes Date object to YYYY-MM-DD", () => {
    const date = new Date(Date.UTC(1945, 5, 15)) // June 15, 1945 UTC
    expect(normalizeDateToString(date)).toBe("1945-06-15")
  })

  it("returns null for invalid Date object", () => {
    const invalidDate = new Date("invalid")
    expect(normalizeDateToString(invalidDate)).toBeNull()
  })

  it("returns YYYY-MM-DD string as-is", () => {
    expect(normalizeDateToString("1945-06-15")).toBe("1945-06-15")
  })

  it("converts year-only string to YYYY-01-01", () => {
    expect(normalizeDateToString("1945")).toBe("1945-01-01")
  })

  it("converts year-month string to YYYY-MM-01", () => {
    expect(normalizeDateToString("1945-06")).toBe("1945-06-01")
  })

  it("parses ISO date strings with time component", () => {
    expect(normalizeDateToString("1945-06-15T00:00:00Z")).toBe("1945-06-15")
  })

  it("parses various date string formats", () => {
    expect(normalizeDateToString("June 15, 1945")).toBe("1945-06-15")
  })

  it("handles all months correctly", () => {
    expect(normalizeDateToString("2000-01")).toBe("2000-01-01")
    expect(normalizeDateToString("2000-12")).toBe("2000-12-01")
  })

  it("rejects invalid month values", () => {
    expect(normalizeDateToString("2000-00")).toBeNull()
    expect(normalizeDateToString("2000-13")).toBeNull()
  })

  it("accepts years in reasonable range", () => {
    expect(normalizeDateToString("1800")).toBe("1800-01-01")
    expect(normalizeDateToString("2000")).toBe("2000-01-01")
    expect(normalizeDateToString("2100")).toBe("2100-01-01")
  })

  it("rejects years outside reasonable range", () => {
    expect(normalizeDateToString("1799")).toBeNull()
    expect(normalizeDateToString("2101")).toBeNull()
    expect(normalizeDateToString("0001")).toBeNull()
    expect(normalizeDateToString("9999")).toBeNull()
  })
})

describe("getYearFromDate", () => {
  it("returns null for null input", () => {
    expect(getYearFromDate(null)).toBeNull()
  })

  it("returns null for undefined input", () => {
    expect(getYearFromDate(undefined)).toBeNull()
  })

  it("extracts year from Date object", () => {
    const date = new Date(Date.UTC(1945, 5, 15))
    expect(getYearFromDate(date)).toBe(1945)
  })

  it("extracts year from YYYY-MM-DD string", () => {
    expect(getYearFromDate("1945-06-15")).toBe(1945)
  })

  it("extracts year from year-only string", () => {
    expect(getYearFromDate("1945")).toBe(1945)
  })

  it("extracts year from ISO date string", () => {
    expect(getYearFromDate("2023-12-25T10:30:00Z")).toBe(2023)
  })
})

describe("getMonthDayFromDate", () => {
  it("returns null for null input", () => {
    expect(getMonthDayFromDate(null)).toBeNull()
  })

  it("returns null for undefined input", () => {
    expect(getMonthDayFromDate(undefined)).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(getMonthDayFromDate("")).toBeNull()
  })

  it("extracts month and day from Date object", () => {
    const date = new Date(Date.UTC(1945, 5, 15)) // June 15, 1945 UTC
    expect(getMonthDayFromDate(date)).toEqual({ month: "06", day: "15" })
  })

  it("extracts month and day from YYYY-MM-DD string", () => {
    expect(getMonthDayFromDate("1945-06-15")).toEqual({ month: "06", day: "15" })
  })

  it("returns null month and day for year-only string", () => {
    expect(getMonthDayFromDate("1945")).toEqual({ month: null, day: null })
  })

  it("returns month and null day for YYYY-MM string", () => {
    expect(getMonthDayFromDate("1945-06")).toEqual({ month: "06", day: null })
  })

  it("extracts month and day from ISO date string", () => {
    expect(getMonthDayFromDate("2023-12-25T10:30:00Z")).toEqual({ month: "12", day: "25" })
  })

  it("pads single-digit months and days", () => {
    const date = new Date(Date.UTC(2000, 0, 5)) // January 5, 2000 UTC
    expect(getMonthDayFromDate(date)).toEqual({ month: "01", day: "05" })
  })
})

describe("getBirthYear and getDeathYear", () => {
  it("getBirthYear is an alias for getYearFromDate", () => {
    expect(getBirthYear("1945-06-15")).toBe(1945)
    expect(getBirthYear(null)).toBeNull()
  })

  it("getDeathYear is an alias for getYearFromDate", () => {
    expect(getDeathYear("2023-12-25")).toBe(2023)
    expect(getDeathYear(null)).toBeNull()
  })
})
