import { describe, it, expect } from "vitest"
import { filterRedundantCauses } from "./cause-categories.js"
import type { DecadeTopCause } from "./types.js"

describe("filterRedundantCauses", () => {
  it("filters out specific causes when general cause is present", () => {
    const causes: DecadeTopCause[] = [
      { cause: "Cancer", count: 50, slug: "cancer" },
      { cause: "Lung Cancer", count: 40, slug: "lung-cancer" },
      { cause: "Heart Attack", count: 30, slug: "heart-attack" },
    ]

    const result = filterRedundantCauses(causes)

    // "Lung Cancer" should be filtered because "Cancer" is a word-subset
    expect(result).toHaveLength(2)
    expect(result.map((c) => c.cause)).toEqual(["Cancer", "Heart Attack"])
  })

  it("keeps distinct causes with shared words", () => {
    const causes: DecadeTopCause[] = [
      { cause: "Heart Attack", count: 40, slug: "heart-attack" },
      { cause: "Heart Disease", count: 35, slug: "heart-disease" },
      { cause: "Stroke", count: 25, slug: "stroke" },
    ]

    const result = filterRedundantCauses(causes)

    // Both should be kept since neither is a word-subset of the other
    expect(result).toHaveLength(3)
    expect(result.map((c) => c.cause)).toEqual(["Heart Attack", "Heart Disease", "Stroke"])
  })

  it("does not create false positives with partial word matches", () => {
    const causes: DecadeTopCause[] = [
      { cause: "Heart Attack", count: 50, slug: "heart-attack" },
      { cause: "Heartburn", count: 40, slug: "heartburn" },
      { cause: "Stroke", count: 30, slug: "stroke" },
    ]

    const result = filterRedundantCauses(causes)

    // "Heartburn" should NOT be filtered even though it contains "heart"
    // because word-boundary matching prevents this false positive
    expect(result).toHaveLength(3)
    expect(result.map((c) => c.cause)).toEqual(["Heart Attack", "Heartburn", "Stroke"])
  })

  it("filters causes with same words in different orders", () => {
    const causes: DecadeTopCause[] = [
      { cause: "Attack Heart", count: 40, slug: "attack-heart" },
      { cause: "Heart Attack", count: 35, slug: "heart-attack" },
      { cause: "Disease Heart", count: 30, slug: "disease-heart" },
    ]

    const result = filterRedundantCauses(causes)

    // "Heart Attack" should be filtered because it has the exact same words as "Attack Heart"
    // "Disease Heart" should be filtered because it shares "heart" with "Attack Heart"
    // Actually, "Disease Heart" should be kept because "disease" is not in "Attack Heart"
    expect(result).toHaveLength(2)
    expect(result.map((c) => c.cause)).toEqual(["Attack Heart", "Disease Heart"])
  })

  it("handles single-word vs multi-word causes correctly", () => {
    const causes: DecadeTopCause[] = [
      { cause: "Cancer", count: 50, slug: "cancer" },
      { cause: "Lung Cancer", count: 40, slug: "lung-cancer" },
      { cause: "Pancreatic Cancer", count: 30, slug: "pancreatic-cancer" },
    ]

    const result = filterRedundantCauses(causes)

    // Both specific cancers should be filtered because "Cancer" is a word-subset
    expect(result).toHaveLength(1)
    expect(result.map((c) => c.cause)).toEqual(["Cancer"])
  })

  it("respects cause ranking order in filtering", () => {
    const causes: DecadeTopCause[] = [
      { cause: "Lung Cancer", count: 50, slug: "lung-cancer" },
      { cause: "Cancer", count: 40, slug: "cancer" },
      { cause: "Heart Attack", count: 30, slug: "heart-attack" },
    ]

    const result = filterRedundantCauses(causes)

    // "Cancer" should be filtered because it's a word-subset of higher-ranked "Lung Cancer"
    expect(result).toHaveLength(2)
    expect(result.map((c) => c.cause)).toEqual(["Lung Cancer", "Heart Attack"])
  })

  it("handles empty array", () => {
    const causes: DecadeTopCause[] = []

    const result = filterRedundantCauses(causes)

    expect(result).toEqual([])
  })

  it("handles single cause", () => {
    const causes: DecadeTopCause[] = [{ cause: "Cancer", count: 50, slug: "cancer" }]

    const result = filterRedundantCauses(causes)

    expect(result).toHaveLength(1)
    expect(result[0].cause).toBe("Cancer")
  })

  it("handles case-insensitive matching", () => {
    const causes: DecadeTopCause[] = [
      { cause: "CANCER", count: 50, slug: "cancer" },
      { cause: "lung cancer", count: 40, slug: "lung-cancer" },
      { cause: "Heart Attack", count: 30, slug: "heart-attack" },
    ]

    const result = filterRedundantCauses(causes)

    // "lung cancer" should be filtered despite case differences
    expect(result).toHaveLength(2)
    expect(result.map((c) => c.cause)).toEqual(["CANCER", "Heart Attack"])
  })

  it("does not filter when causes are identical", () => {
    const causes: DecadeTopCause[] = [
      { cause: "Cancer", count: 50, slug: "cancer" },
      { cause: "Cancer", count: 40, slug: "cancer" },
    ]

    const result = filterRedundantCauses(causes)

    // Identical causes are not filtered (causeLower !== higherCauseLower check)
    expect(result).toHaveLength(2)
  })

  it("handles multiple levels of specificity", () => {
    const causes: DecadeTopCause[] = [
      { cause: "Cancer", count: 100, slug: "cancer" },
      { cause: "Lung Cancer", count: 50, slug: "lung-cancer" },
      { cause: "Small Cell Lung Cancer", count: 25, slug: "small-cell-lung-cancer" },
      { cause: "Heart Attack", count: 40, slug: "heart-attack" },
    ]

    const result = filterRedundantCauses(causes)

    // Both specific cancers should be filtered
    expect(result).toHaveLength(2)
    expect(result.map((c) => c.cause)).toEqual(["Cancer", "Heart Attack"])
  })

  it("handles complex multi-word causes", () => {
    const causes: DecadeTopCause[] = [
      { cause: "Heart Disease", count: 50, slug: "heart-disease" },
      { cause: "Coronary Heart Disease", count: 40, slug: "coronary-heart-disease" },
      { cause: "Coronary Artery Disease", count: 35, slug: "coronary-artery-disease" },
      { cause: "Stroke", count: 30, slug: "stroke" },
    ]

    const result = filterRedundantCauses(causes)

    // "Coronary Heart Disease" should be filtered (Heart + Disease are in higher cause)
    // "Coronary Artery Disease" should be kept (Artery is not in any higher cause)
    expect(result).toHaveLength(3)
    expect(result.map((c) => c.cause)).toEqual([
      "Heart Disease",
      "Coronary Artery Disease",
      "Stroke",
    ])
  })

  it("handles causes with extra whitespace", () => {
    const causes: DecadeTopCause[] = [
      { cause: "Cancer  ", count: 50, slug: "cancer" },
      { cause: "  Lung   Cancer", count: 40, slug: "lung-cancer" },
    ]

    const result = filterRedundantCauses(causes)

    // Extra whitespace should be handled by split(/\s+/)
    expect(result).toHaveLength(1)
    expect(result[0].cause).toBe("Cancer  ")
  })
})
