import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  formatDate,
  getYear,
  calculateAge,
  calculateCurrentAge,
  getDecadeOptions,
} from "./formatDate"

describe("formatDate", () => {
  it("formats a standard date string", () => {
    expect(formatDate("1977-06-14")).toBe("Jun 14, 1977")
  })

  it("formats a date at year boundary", () => {
    expect(formatDate("1999-12-31")).toBe("Dec 31, 1999")
  })

  it("formats a date at start of year", () => {
    expect(formatDate("2000-01-01")).toBe("Jan 1, 2000")
  })

  it('returns "Unknown" for null', () => {
    expect(formatDate(null)).toBe("Unknown")
  })

  it('returns "Unknown" for empty string', () => {
    expect(formatDate("")).toBe("Unknown")
  })

  it("handles ISO timestamp format", () => {
    expect(formatDate("2025-12-10T08:00:00.000Z")).toBe("Dec 10, 2025")
  })

  it("handles historic dates", () => {
    expect(formatDate("1899-05-10")).toBe("May 10, 1899")
  })
})

describe("getYear", () => {
  it("extracts year from date string", () => {
    expect(getYear("1961-10-05")).toBe("1961")
  })

  it("extracts year from recent date", () => {
    expect(getYear("2023-07-21")).toBe("2023")
  })

  it('returns "Unknown" for null', () => {
    expect(getYear(null)).toBe("Unknown")
  })

  it('returns "Unknown" for empty string', () => {
    expect(getYear("")).toBe("Unknown")
  })
})

describe("calculateAge", () => {
  it("calculates age when death is after birthday in same year", () => {
    // Born Jan 1, 1950, died Dec 31, 2000 = 50 years old
    expect(calculateAge("1950-01-01", "2000-12-31")).toBe(50)
  })

  it("calculates age when death is before birthday in same year", () => {
    // Born Dec 31, 1950, died Jan 1, 2000 = 49 years old (birthday not reached)
    expect(calculateAge("1950-12-31", "2000-01-01")).toBe(49)
  })

  it("calculates age for same day death", () => {
    // Born and died on same day of year
    expect(calculateAge("1950-06-15", "2000-06-15")).toBe(50)
  })

  it("handles death before birthday month", () => {
    // Born in December, died in June
    expect(calculateAge("1950-12-15", "2000-06-15")).toBe(49)
  })

  it("handles death in same month but before birthday day", () => {
    // Born on the 20th, died on the 10th
    expect(calculateAge("1950-06-20", "2000-06-10")).toBe(49)
  })

  it("returns null for null birthday", () => {
    expect(calculateAge(null, "2000-01-01")).toBe(null)
  })

  it("calculates age for famous person (Audrey Hepburn)", () => {
    // May 4, 1929 - January 20, 1993 = 63 years old
    expect(calculateAge("1929-05-04", "1993-01-20")).toBe(63)
  })

  it("calculates age for famous person (Marlon Brando)", () => {
    // April 3, 1924 - July 1, 2004 = 80 years old
    expect(calculateAge("1924-04-03", "2004-07-01")).toBe(80)
  })
})

describe("calculateCurrentAge", () => {
  beforeEach(() => {
    // Mock the current date to 2024-06-15
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("calculates current age when birthday has passed this year", () => {
    // Born Jan 1, 1980, current date June 15, 2024 = 44 years old
    expect(calculateCurrentAge("1980-01-01")).toBe(44)
  })

  it("calculates current age when birthday has not passed this year", () => {
    // Born Dec 31, 1980, current date June 15, 2024 = 43 years old
    expect(calculateCurrentAge("1980-12-31")).toBe(43)
  })

  it("calculates age for birthday today", () => {
    // Born June 15, 1980, current date June 15, 2024 = 44 years old
    expect(calculateCurrentAge("1980-06-15")).toBe(44)
  })

  it("returns null for null birthday", () => {
    expect(calculateCurrentAge(null)).toBe(null)
  })

  it("handles very old people", () => {
    // Born 1920, current date 2024 = 103 or 104 depending on birthday
    expect(calculateCurrentAge("1920-01-01")).toBe(104)
  })
})

describe("getDecadeOptions", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2025-12-10T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("generates decade options starting with 'Any'", () => {
    const options = getDecadeOptions()
    expect(options[0]).toEqual({ value: "", label: "Any" })
  })

  it("starts from current decade (2020s in 2025)", () => {
    const options = getDecadeOptions()
    expect(options[1]).toEqual({ value: "2020", label: "2020s" })
  })

  it("defaults to 1930 as minimum decade", () => {
    const options = getDecadeOptions()
    const lastOption = options[options.length - 1]
    expect(lastOption).toEqual({ value: "1930", label: "1930s" })
  })

  it("generates correct number of decades", () => {
    // 2025 → 2020s, 2010s, 2000s, 1990s, 1980s, 1970s, 1960s, 1950s, 1940s, 1930s = 10 decades
    // Plus "Any" = 11 options
    const options = getDecadeOptions()
    expect(options).toHaveLength(11)
  })

  it("respects custom minimum decade", () => {
    const options = getDecadeOptions(1950)
    const lastOption = options[options.length - 1]
    expect(lastOption).toEqual({ value: "1950", label: "1950s" })
    // 2020s through 1950s = 8 decades + "Any" = 9 options
    expect(options).toHaveLength(9)
  })

  it("generates decades in descending order", () => {
    const options = getDecadeOptions(2000)
    expect(options).toEqual([
      { value: "", label: "Any" },
      { value: "2020", label: "2020s" },
      { value: "2010", label: "2010s" },
      { value: "2000", label: "2000s" },
    ])
  })
})
