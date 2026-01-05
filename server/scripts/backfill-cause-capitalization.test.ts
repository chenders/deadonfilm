import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { toSentenceCase } from "../src/lib/text-utils.js"

// Mock the database module
vi.mock("../src/lib/db.js", () => ({
  getPool: vi.fn(),
  resetPool: vi.fn(),
}))

describe("backfill-cause-capitalization", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("capitalization logic", () => {
    // The core logic uses toSentenceCase, which is already tested in text-utils.test.ts
    // These tests verify the comparison logic used in the backfill script

    it("identifies values that need updating", () => {
      const testCases = [
        { original: "lung cancer", normalized: "Lung cancer", needsUpdate: true },
        { original: "HEART ATTACK", normalized: "Heart attack", needsUpdate: true },
        { original: "Lung Cancer", normalized: "Lung cancer", needsUpdate: true },
        { original: "Heart failure", normalized: "Heart failure", needsUpdate: false },
        { original: "COVID-19", normalized: "COVID-19", needsUpdate: false },
      ]

      for (const { original, normalized, needsUpdate } of testCases) {
        const result = toSentenceCase(original)
        expect(result).toBe(normalized)
        expect(original !== result).toBe(needsUpdate)
      }
    })

    it("handles medical acronyms correctly", () => {
      // Values with acronyms that are already correct should not need updating
      expect(toSentenceCase("COVID-19 complications")).toBe("COVID-19 complications")
      expect(toSentenceCase("ALS")).toBe("ALS")
      expect(toSentenceCase("HIV/AIDS complications")).toBe("HIV/AIDS complications")

      // Values with lowercase acronyms need updating
      expect(toSentenceCase("covid-19 complications")).toBe("COVID-19 complications")
      expect(toSentenceCase("als")).toBe("ALS")
    })
  })

  describe("batch update logic", () => {
    it("groups updates by distinct cause_of_death value", () => {
      // Simulates the script's approach of updating by distinct values
      // rather than row-by-row
      const distinctValues = ["lung cancer", "HEART ATTACK", "Heart failure"]
      const updates: Array<{ from: string; to: string }> = []

      for (const original of distinctValues) {
        const normalized = toSentenceCase(original)
        if (original !== normalized) {
          updates.push({ from: original, to: normalized })
        }
      }

      // "lung cancer" -> "Lung cancer", "HEART ATTACK" -> "Heart attack"
      // "Heart failure" is already correct
      expect(updates).toHaveLength(2)
      expect(updates).toContainEqual({ from: "lung cancer", to: "Lung cancer" })
      expect(updates).toContainEqual({ from: "HEART ATTACK", to: "Heart attack" })
    })

    it("counts unchanged values correctly", () => {
      const distinctValues = ["Heart failure", "COVID-19", "Lung cancer", "ALS"]
      let updated = 0
      let unchanged = 0

      for (const original of distinctValues) {
        const normalized = toSentenceCase(original)
        if (original !== normalized) {
          updated++
        } else {
          unchanged++
        }
      }

      // All values are already in correct format:
      // - "Heart failure" -> "Heart failure" (correct sentence case)
      // - "COVID-19" -> "COVID-19" (acronym preserved)
      // - "Lung cancer" -> "Lung cancer" (correct sentence case)
      // - "ALS" -> "ALS" (acronym preserved)
      expect(updated).toBe(0)
      expect(unchanged).toBe(4)
    })
  })

  describe("dry-run behavior", () => {
    it("would identify changes without modifying data", () => {
      // Simulates dry-run: calculate what would change without DB writes
      const mockData = [
        { cause_of_death: "lung cancer" },
        { cause_of_death: "Heart failure" },
        { cause_of_death: "PANCREATIC CANCER" },
      ]

      const changes: string[] = []
      for (const row of mockData) {
        const normalized = toSentenceCase(row.cause_of_death)
        if (row.cause_of_death !== normalized) {
          changes.push(`"${row.cause_of_death}" → "${normalized}"`)
        }
      }

      expect(changes).toHaveLength(2)
      expect(changes).toContain('"lung cancer" → "Lung cancer"')
      expect(changes).toContain('"PANCREATIC CANCER" → "Pancreatic cancer"')
    })
  })
})
