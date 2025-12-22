import { describe, it, expect } from "vitest"
import { InvalidArgumentError } from "commander"
import { parsePositiveInt, parsePhase, PHASE_THRESHOLDS, type ImportPhase } from "./verify-shows.js"

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

  it("parses leading digits from mixed strings", () => {
    // JavaScript parseInt stops at first non-digit, so "12abc" becomes 12
    expect(parsePositiveInt("12abc")).toBe(12)
  })

  it("throws for whitespace", () => {
    expect(() => parsePositiveInt(" ")).toThrow(InvalidArgumentError)
    expect(() => parsePositiveInt("\t")).toThrow(InvalidArgumentError)
  })
})

describe("parsePhase", () => {
  it("parses valid phase values", () => {
    expect(parsePhase("popular")).toBe("popular")
    expect(parsePhase("standard")).toBe("standard")
    expect(parsePhase("obscure")).toBe("obscure")
  })

  it("throws for invalid phase values", () => {
    expect(() => parsePhase("invalid")).toThrow(InvalidArgumentError)
    expect(() => parsePhase("invalid")).toThrow("Phase must be: popular, standard, or obscure")
  })

  it("throws for empty string", () => {
    expect(() => parsePhase("")).toThrow(InvalidArgumentError)
  })

  it("throws for similar but incorrect values", () => {
    expect(() => parsePhase("Popular")).toThrow(InvalidArgumentError) // case-sensitive
    expect(() => parsePhase("POPULAR")).toThrow(InvalidArgumentError)
    expect(() => parsePhase("pop")).toThrow(InvalidArgumentError)
    expect(() => parsePhase("std")).toThrow(InvalidArgumentError)
  })
})

describe("PHASE_THRESHOLDS", () => {
  it("has correct thresholds for popular phase", () => {
    expect(PHASE_THRESHOLDS.popular.min).toBe(50)
    expect(PHASE_THRESHOLDS.popular.max).toBe(Infinity)
  })

  it("has correct thresholds for standard phase", () => {
    expect(PHASE_THRESHOLDS.standard.min).toBe(10)
    expect(PHASE_THRESHOLDS.standard.max).toBe(50)
  })

  it("has correct thresholds for obscure phase", () => {
    expect(PHASE_THRESHOLDS.obscure.min).toBe(0)
    expect(PHASE_THRESHOLDS.obscure.max).toBe(10)
  })

  it("has non-overlapping ranges", () => {
    // obscure: 0-10, standard: 10-50, popular: 50+
    expect(PHASE_THRESHOLDS.standard.min).toBe(PHASE_THRESHOLDS.obscure.max)
    expect(PHASE_THRESHOLDS.popular.min).toBe(PHASE_THRESHOLDS.standard.max)
  })
})

// Note: The database query functions (findCastCountMismatches, findDeceasedFlagIssues, etc.)
// would require integration tests with a test database. They are exported for testing
// but are not tested here to avoid database dependencies in unit tests.
//
// To test them, you would need to:
// 1. Set up a test database with known data
// 2. Run the query functions
// 3. Assert the expected results
//
// Example integration test structure:
//
// describe("findCastCountMismatches (integration)", () => {
//   beforeAll(async () => {
//     // Set up test database with known shows and appearances
//   })
//
//   afterAll(async () => {
//     // Clean up test database
//   })
//
//   it("finds shows where cast_count differs from actual appearances", async () => {
//     const mismatches = await findCastCountMismatches()
//     expect(mismatches).toHaveLength(expectedCount)
//   })
// })
