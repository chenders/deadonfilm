import { describe, it, expect } from "vitest"
import { InvalidArgumentError } from "commander"
import { parsePositiveInt, parseYear, type SeedResult } from "./seed-movies.js"

describe("parsePositiveInt", () => {
  it("parses valid positive integers", () => {
    expect(parsePositiveInt("1")).toBe(1)
    expect(parsePositiveInt("42")).toBe(42)
    expect(parsePositiveInt("500")).toBe(500)
    expect(parsePositiveInt("1000")).toBe(1000)
  })

  it("throws for zero", () => {
    expect(() => parsePositiveInt("0")).toThrow(InvalidArgumentError)
    expect(() => parsePositiveInt("0")).toThrow("Must be a positive integer")
  })

  it("throws for negative numbers", () => {
    expect(() => parsePositiveInt("-1")).toThrow(InvalidArgumentError)
    expect(() => parsePositiveInt("-100")).toThrow(InvalidArgumentError)
  })

  it("truncates decimal values to integers", () => {
    // JavaScript parseInt truncates decimals, so "1.5" becomes 1
    expect(parsePositiveInt("1.5")).toBe(1)
    expect(parsePositiveInt("3.14")).toBe(3)
  })

  it("throws for non-numeric strings", () => {
    expect(() => parsePositiveInt("abc")).toThrow(InvalidArgumentError)
    expect(() => parsePositiveInt("")).toThrow(InvalidArgumentError)
  })
})

describe("parseYear", () => {
  const currentYear = new Date().getFullYear()

  it("parses valid years", () => {
    expect(parseYear("1920")).toBe(1920)
    expect(parseYear("2000")).toBe(2000)
    expect(parseYear(String(currentYear))).toBe(currentYear)
    expect(parseYear(String(currentYear + 1))).toBe(currentYear + 1)
  })

  it("throws for years before 1920", () => {
    expect(() => parseYear("1919")).toThrow(InvalidArgumentError)
    expect(() => parseYear("1900")).toThrow(InvalidArgumentError)
    expect(() => parseYear("1800")).toThrow(InvalidArgumentError)
  })

  it("throws for years too far in the future", () => {
    expect(() => parseYear(String(currentYear + 2))).toThrow(InvalidArgumentError)
    expect(() => parseYear("3000")).toThrow(InvalidArgumentError)
  })

  it("throws for non-numeric strings", () => {
    expect(() => parseYear("abc")).toThrow(InvalidArgumentError)
    expect(() => parseYear("")).toThrow(InvalidArgumentError)
  })

  it("throws for decimal years", () => {
    // parseYear uses parseInt which truncates, but 1919.9 -> 1919 is invalid
    expect(() => parseYear("1919.9")).toThrow(InvalidArgumentError)
  })
})

describe("SeedResult interface", () => {
  it("has the correct structure", () => {
    const result: SeedResult = {
      totalMovies: 100,
      totalAppearances: 3000,
    }
    expect(result.totalMovies).toBe(100)
    expect(result.totalAppearances).toBe(3000)
  })
})
