import { describe, it, expect } from "vitest"
import {
  selectBiographySections,
  regexFallbackSelection,
  isAISectionSelectionAvailable,
  type WikipediaSection,
} from "./wikipedia-section-selector.js"

describe("isAISectionSelectionAvailable", () => {
  it("always returns false (AI handled by @debriefer/ai in adapter)", () => {
    expect(isAISectionSelectionAvailable()).toBe(false)
  })
})

describe("regexFallbackSelection", () => {
  it("selects biography-relevant sections", () => {
    const sections: WikipediaSection[] = [
      { index: "1", line: "Early life", level: "2", anchor: "Early_life" },
      { index: "2", line: "Career", level: "2", anchor: "Career" },
      { index: "3", line: "Personal life", level: "2", anchor: "Personal_life" },
      { index: "4", line: "Education", level: "2", anchor: "Education" },
      { index: "5", line: "Filmography", level: "2", anchor: "Filmography" },
      { index: "6", line: "Awards and nominations", level: "2", anchor: "Awards" },
      { index: "7", line: "References", level: "2", anchor: "References" },
      { index: "8", line: "External links", level: "2", anchor: "External_links" },
    ]

    const result = regexFallbackSelection(sections)

    expect(result).toContain("Early life")
    expect(result).toContain("Personal life")
    expect(result).toContain("Education")
    expect(result).not.toContain("Career")
    expect(result).not.toContain("Filmography")
    expect(result).not.toContain("Awards and nominations")
    expect(result).not.toContain("References")
    expect(result).not.toContain("External links")
  })

  it("returns empty array when no sections match", () => {
    const sections: WikipediaSection[] = [
      { index: "1", line: "Career", level: "2", anchor: "Career" },
      { index: "2", line: "Filmography", level: "2", anchor: "Filmography" },
    ]
    expect(regexFallbackSelection(sections)).toEqual([])
  })
})

describe("selectBiographySections", () => {
  it("uses regex fallback (AI removed)", async () => {
    const sections: WikipediaSection[] = [
      { index: "1", line: "Early life", level: "2", anchor: "Early_life" },
      { index: "2", line: "Career", level: "2", anchor: "Career" },
      { index: "3", line: "Personal life", level: "2", anchor: "Personal_life" },
    ]

    const result = await selectBiographySections("John Wayne", sections)

    expect(result.usedAI).toBe(false)
    expect(result.costUsd).toBe(0)
    expect(result.selectedSections).toContain("Early life")
    expect(result.selectedSections).toContain("Personal life")
    expect(result.selectedSections).not.toContain("Career")
  })

  it("returns empty when no sections provided", async () => {
    const result = await selectBiographySections("John Wayne", [])
    expect(result.selectedSections).toEqual([])
    expect(result.error).toBe("No sections provided")
  })

  it("respects maxSections", async () => {
    const sections: WikipediaSection[] = [
      { index: "1", line: "Early life", level: "2", anchor: "Early_life" },
      { index: "2", line: "Personal life", level: "2", anchor: "Personal_life" },
      { index: "3", line: "Education", level: "2", anchor: "Education" },
      { index: "4", line: "Family", level: "2", anchor: "Family" },
    ]

    const result = await selectBiographySections("Actor", sections, { maxSections: 2 })
    expect(result.selectedSections.length).toBeLessThanOrEqual(2)
  })
})
