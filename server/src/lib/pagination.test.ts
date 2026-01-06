import { describe, it, expect } from "vitest"
import {
  parsePage,
  parsePageSize,
  calculateOffset,
  buildPagination,
  emptyPagination,
} from "./pagination.js"

describe("pagination", () => {
  describe("parsePage", () => {
    it("parses valid page number", () => {
      expect(parsePage("5")).toBe(5)
    })

    it("returns 1 for undefined", () => {
      expect(parsePage(undefined)).toBe(1)
    })

    it("returns 1 for invalid string", () => {
      expect(parsePage("abc")).toBe(1)
    })

    it("returns 1 for zero", () => {
      expect(parsePage("0")).toBe(1)
    })

    it("returns 1 for negative numbers", () => {
      expect(parsePage("-5")).toBe(1)
    })

    it("handles decimal strings by truncating", () => {
      expect(parsePage("2.7")).toBe(2)
    })
  })

  describe("parsePageSize", () => {
    it("parses valid page size", () => {
      expect(parsePageSize("25")).toBe(25)
    })

    it("returns default for undefined", () => {
      expect(parsePageSize(undefined)).toBe(50)
    })

    it("returns custom default when specified", () => {
      expect(parsePageSize(undefined, 20)).toBe(20)
    })

    it("returns default for zero (parseInt returns 0 which is falsy)", () => {
      expect(parsePageSize("0")).toBe(50)
    })

    it("returns 1 for negative numbers", () => {
      expect(parsePageSize("-10")).toBe(1)
    })

    it("caps at max size (default 100)", () => {
      expect(parsePageSize("200")).toBe(100)
    })

    it("caps at custom max size", () => {
      expect(parsePageSize("75", 50, 50)).toBe(50)
    })

    it("returns default for invalid string", () => {
      expect(parsePageSize("abc", 30)).toBe(30)
    })
  })

  describe("calculateOffset", () => {
    it("returns 0 for page 1", () => {
      expect(calculateOffset(1, 50)).toBe(0)
    })

    it("calculates correct offset for page 2", () => {
      expect(calculateOffset(2, 50)).toBe(50)
    })

    it("calculates correct offset for page 3 with pageSize 25", () => {
      expect(calculateOffset(3, 25)).toBe(50)
    })

    it("handles large page numbers", () => {
      expect(calculateOffset(100, 50)).toBe(4950)
    })
  })

  describe("buildPagination", () => {
    it("builds pagination info correctly", () => {
      const result = buildPagination(2, 50, 125)
      expect(result).toEqual({
        page: 2,
        pageSize: 50,
        totalCount: 125,
        totalPages: 3, // Math.ceil(125/50) = 3
      })
    })

    it("handles exact page boundaries", () => {
      const result = buildPagination(1, 50, 100)
      expect(result.totalPages).toBe(2)
    })

    it("handles zero total count", () => {
      const result = buildPagination(1, 50, 0)
      expect(result.totalPages).toBe(0)
    })

    it("caps totalPages when maxPages is specified", () => {
      const result = buildPagination(1, 50, 5000, 20)
      expect(result.totalPages).toBe(20) // Would be 100 without cap
      expect(result.totalCount).toBe(5000) // totalCount is preserved
    })

    it("does not cap when totalPages is below maxPages", () => {
      const result = buildPagination(1, 50, 500, 20)
      expect(result.totalPages).toBe(10) // 500/50 = 10, below cap
    })
  })

  describe("emptyPagination", () => {
    it("returns empty pagination with default pageSize", () => {
      expect(emptyPagination()).toEqual({
        page: 1,
        pageSize: 50,
        totalCount: 0,
        totalPages: 0,
      })
    })

    it("returns empty pagination with custom pageSize", () => {
      expect(emptyPagination(25)).toEqual({
        page: 1,
        pageSize: 25,
        totalCount: 0,
        totalPages: 0,
      })
    })
  })
})
