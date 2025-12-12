import { describe, it, expect } from "vitest"
import { toTitleCase } from "./formatText"

describe("toTitleCase", () => {
  it("capitalizes first letter of each word", () => {
    expect(toTitleCase("natural causes")).toBe("Natural Causes")
  })

  it("handles single word", () => {
    expect(toTitleCase("cancer")).toBe("Cancer")
  })

  it("converts uppercase to title case", () => {
    expect(toTitleCase("HEART ATTACK")).toBe("Heart Attack")
  })

  it("handles mixed case input", () => {
    expect(toTitleCase("cArDiaC aRResT")).toBe("Cardiac Arrest")
  })

  it("handles empty string", () => {
    expect(toTitleCase("")).toBe("")
  })

  it("handles single character words", () => {
    expect(toTitleCase("a b c")).toBe("A B C")
  })

  it("handles multiple spaces between words", () => {
    // Note: multiple spaces are preserved as the function splits on single space
    expect(toTitleCase("heart  attack")).toBe("Heart  Attack")
  })
})
