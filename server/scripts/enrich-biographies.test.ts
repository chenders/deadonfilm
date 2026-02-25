import { describe, it, expect } from "vitest"
import { InvalidArgumentError } from "commander"
import { parseNonNegativeInt } from "./enrich-biographies.js"

describe("enrich-biographies argument parsing", () => {
  describe("parseNonNegativeInt", () => {
    it("parses valid non-negative integers", () => {
      expect(parseNonNegativeInt("0")).toBe(0)
      expect(parseNonNegativeInt("1")).toBe(1)
      expect(parseNonNegativeInt("100")).toBe(100)
    })

    it("rejects negative numbers", () => {
      expect(() => parseNonNegativeInt("-1")).toThrow(InvalidArgumentError)
      expect(() => parseNonNegativeInt("-50")).toThrow(InvalidArgumentError)
    })

    it("truncates floating point input to integer (parseInt behavior)", () => {
      expect(parseNonNegativeInt("1.5")).toBe(1)
      expect(parseNonNegativeInt("10.9")).toBe(10)
    })

    it("rejects non-numeric strings", () => {
      expect(() => parseNonNegativeInt("abc")).toThrow(InvalidArgumentError)
      expect(() => parseNonNegativeInt("")).toThrow(InvalidArgumentError)
    })
  })
})
