import { describe, it, expect } from "vitest"
import { toSentenceCase } from "./text-utils.js"

describe("toSentenceCase", () => {
  describe("basic capitalization", () => {
    it("capitalizes first letter of lowercase string", () => {
      expect(toSentenceCase("lung cancer")).toBe("Lung cancer")
    })

    it("converts all-caps to sentence case", () => {
      expect(toSentenceCase("HEART ATTACK")).toBe("Heart attack")
    })

    it("converts title case to sentence case", () => {
      expect(toSentenceCase("Lung Cancer")).toBe("Lung cancer")
    })

    it("leaves already correct sentence case unchanged", () => {
      expect(toSentenceCase("Heart failure")).toBe("Heart failure")
    })

    it("handles single word", () => {
      expect(toSentenceCase("cancer")).toBe("Cancer")
      expect(toSentenceCase("CANCER")).toBe("Cancer")
    })
  })

  describe("medical acronyms", () => {
    it("preserves COVID-19", () => {
      expect(toSentenceCase("covid-19 complications")).toBe("COVID-19 complications")
      expect(toSentenceCase("COVID-19 COMPLICATIONS")).toBe("COVID-19 complications")
    })

    it("preserves ALS", () => {
      expect(toSentenceCase("als")).toBe("ALS")
      expect(toSentenceCase("complications from als")).toBe("Complications from ALS")
    })

    it("preserves AIDS", () => {
      expect(toSentenceCase("aids-related illness")).toBe("AIDS-related illness")
    })

    it("preserves COPD", () => {
      expect(toSentenceCase("copd")).toBe("COPD")
      expect(toSentenceCase("chronic copd")).toBe("Chronic COPD")
    })

    it("preserves HIV", () => {
      expect(toSentenceCase("hiv/aids complications")).toBe("HIV/AIDS complications")
    })

    it("preserves multiple acronyms in one string", () => {
      expect(toSentenceCase("covid-19 and copd")).toBe("COVID-19 and COPD")
    })
  })

  describe("edge cases", () => {
    it("returns empty string for empty input", () => {
      expect(toSentenceCase("")).toBe("")
    })

    it("returns null/undefined as-is", () => {
      expect(toSentenceCase(null as unknown as string)).toBe(null)
      expect(toSentenceCase(undefined as unknown as string)).toBe(undefined)
    })

    it("handles strings with numbers", () => {
      expect(toSentenceCase("stage 4 lung cancer")).toBe("Stage 4 lung cancer")
    })

    it("handles strings with special characters", () => {
      expect(toSentenceCase("heart attack (myocardial infarction)")).toBe(
        "Heart attack (myocardial infarction)"
      )
    })

    it("handles acronym at start of string", () => {
      expect(toSentenceCase("copd complications")).toBe("COPD complications")
    })
  })

  describe("real-world causes of death", () => {
    it("formats common causes correctly", () => {
      expect(toSentenceCase("pancreatic cancer")).toBe("Pancreatic cancer")
      expect(toSentenceCase("CARDIAC ARREST")).toBe("Cardiac arrest")
      expect(toSentenceCase("Complications From Diabetes")).toBe("Complications from diabetes")
      expect(toSentenceCase("natural causes")).toBe("Natural causes")
    })

    it("handles compound conditions", () => {
      expect(toSentenceCase("lung cancer and pneumonia")).toBe("Lung cancer and pneumonia")
      expect(toSentenceCase("heart failure due to covid-19")).toBe("Heart failure due to COVID-19")
    })
  })
})
