import { describe, it, expect } from "vitest"
import { splitSearchWords } from "./search-utils.js"

describe("splitSearchWords", () => {
  it("splits single word", () => {
    expect(splitSearchWords("paul")).toEqual(["paul"])
  })

  it("splits multiple words", () => {
    expect(splitSearchWords("paul smith")).toEqual(["paul", "smith"])
  })

  it("handles extra whitespace between words", () => {
    expect(splitSearchWords("paul   l   smith")).toEqual(["paul", "l", "smith"])
  })

  it("trims leading and trailing whitespace", () => {
    expect(splitSearchWords("  paul smith  ")).toEqual(["paul", "smith"])
  })

  it("returns empty array for empty string", () => {
    expect(splitSearchWords("")).toEqual([])
  })

  it("returns empty array for whitespace-only string", () => {
    expect(splitSearchWords("   ")).toEqual([])
  })

  it("returns empty array for tab/newline whitespace", () => {
    expect(splitSearchWords("\t\n ")).toEqual([])
  })
})
