import { describe, it, expect } from "vitest"
import { computeCategories } from "./sync-actor-death-fields.js"

describe("computeCategories", () => {
  it("returns manner-based categories when manner is provided", () => {
    expect(computeCategories("gunshot wound", "homicide")).toContain("homicide")
    expect(computeCategories("gunshot wound", "suicide")).toContain("suicide")
    expect(computeCategories("fell from height", "accident")).toContain("accident")
  })

  it("returns medical categories from cause text patterns", () => {
    expect(computeCategories("lung cancer", null)).toContain("cancer")
    expect(computeCategories("heart attack", null)).toContain("heart-disease")
    expect(computeCategories("pneumonia", null)).toContain("respiratory")
    expect(computeCategories("Alzheimer's disease", null)).toContain("neurological")
  })

  it('returns ["other"] when no patterns match and no manner', () => {
    expect(computeCategories("unknown", null)).toEqual(["other"])
    expect(computeCategories(null, null)).toEqual(["other"])
  })

  it("combines manner and text-based categories", () => {
    const cats = computeCategories("accidental overdose", "accident")
    expect(cats[0]).toBe("accident") // manner first
    expect(cats).toContain("overdose")
  })

  it("does not duplicate categories from manner and text", () => {
    const cats = computeCategories("suicide by hanging", "suicide")
    const suicideCount = cats.filter((c) => c === "suicide").length
    expect(suicideCount).toBe(1)
  })

  it("matches case-insensitively on cause text", () => {
    expect(computeCategories("LUNG CANCER", null)).toContain("cancer")
    expect(computeCategories("Heart Attack", null)).toContain("heart-disease")
  })
})
