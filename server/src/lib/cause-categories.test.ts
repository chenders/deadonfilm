import { describe, it, expect } from "vitest"
import {
  CAUSE_CATEGORIES,
  CATEGORY_SLUGS,
  isValidCategorySlug,
  getCategoryBySlug,
  getCategoryKeyBySlug,
  buildCategoryCondition,
  buildCategoryCaseStatement,
  categorizeCauseOfDeath,
  createCauseSlug,
  getCategoryLabel,
} from "./cause-categories.js"

describe("cause-categories", () => {
  describe("CAUSE_CATEGORIES", () => {
    it("contains all expected categories", () => {
      const categoryKeys = Object.keys(CAUSE_CATEGORIES)
      expect(categoryKeys).toContain("cancer")
      expect(categoryKeys).toContain("heart_disease")
      expect(categoryKeys).toContain("respiratory")
      expect(categoryKeys).toContain("neurological")
      expect(categoryKeys).toContain("accident")
      expect(categoryKeys).toContain("overdose")
      expect(categoryKeys).toContain("suicide")
      expect(categoryKeys).toContain("homicide")
      expect(categoryKeys).toContain("infectious")
      expect(categoryKeys).toContain("liver_kidney")
      expect(categoryKeys).toContain("natural")
      expect(categoryKeys).toContain("other")
    })

    it("has labels and slugs for all categories", () => {
      for (const [key, category] of Object.entries(CAUSE_CATEGORIES)) {
        expect(category.label).toBeDefined()
        expect(category.slug).toBeDefined()
        expect(category.patterns).toBeDefined()
        expect(Array.isArray(category.patterns)).toBe(true)
        // 'other' is the only category with empty patterns
        if (key !== "other") {
          expect(category.patterns.length).toBeGreaterThan(0)
        }
      }
    })
  })

  describe("CATEGORY_SLUGS", () => {
    it("contains all category slugs", () => {
      expect(CATEGORY_SLUGS).toContain("cancer")
      expect(CATEGORY_SLUGS).toContain("heart-disease")
      expect(CATEGORY_SLUGS).toContain("respiratory")
      expect(CATEGORY_SLUGS).toContain("neurological")
      expect(CATEGORY_SLUGS).toContain("accident")
      expect(CATEGORY_SLUGS).toContain("overdose")
      expect(CATEGORY_SLUGS).toContain("suicide")
      expect(CATEGORY_SLUGS).toContain("homicide")
      expect(CATEGORY_SLUGS).toContain("infectious")
      expect(CATEGORY_SLUGS).toContain("liver-kidney")
      expect(CATEGORY_SLUGS).toContain("natural")
      expect(CATEGORY_SLUGS).toContain("other")
    })

    it("has the same count as CAUSE_CATEGORIES", () => {
      expect(CATEGORY_SLUGS.length).toBe(Object.keys(CAUSE_CATEGORIES).length)
    })
  })

  describe("isValidCategorySlug", () => {
    it("returns true for valid slugs", () => {
      expect(isValidCategorySlug("cancer")).toBe(true)
      expect(isValidCategorySlug("heart-disease")).toBe(true)
      expect(isValidCategorySlug("other")).toBe(true)
    })

    it("returns false for invalid slugs", () => {
      expect(isValidCategorySlug("invalid")).toBe(false)
      expect(isValidCategorySlug("")).toBe(false)
      expect(isValidCategorySlug("CANCER")).toBe(false) // case sensitive
    })
  })

  describe("getCategoryBySlug", () => {
    it("returns category for valid slug", () => {
      const category = getCategoryBySlug("cancer")
      expect(category).not.toBeNull()
      expect(category?.label).toBe("Cancer")
      expect(category?.slug).toBe("cancer")
    })

    it("returns null for invalid slug", () => {
      expect(getCategoryBySlug("invalid")).toBeNull()
      expect(getCategoryBySlug("")).toBeNull()
    })
  })

  describe("getCategoryKeyBySlug", () => {
    it("returns key for valid slug", () => {
      expect(getCategoryKeyBySlug("cancer")).toBe("cancer")
      expect(getCategoryKeyBySlug("heart-disease")).toBe("heart_disease")
      expect(getCategoryKeyBySlug("liver-kidney")).toBe("liver_kidney")
    })

    it("returns null for invalid slug", () => {
      expect(getCategoryKeyBySlug("invalid")).toBeNull()
    })
  })

  describe("buildCategoryCondition", () => {
    it("builds SQL condition for patterns", () => {
      const condition = buildCategoryCondition(["cancer", "tumor"])
      expect(condition).toContain("LOWER(cause_of_death) LIKE '%cancer%'")
      expect(condition).toContain("LOWER(cause_of_death) LIKE '%tumor%'")
      expect(condition).toContain(" OR ")
    })

    it("returns TRUE for empty patterns", () => {
      expect(buildCategoryCondition([])).toBe("TRUE")
    })

    it("escapes SQL LIKE special characters", () => {
      const condition = buildCategoryCondition(["100% fatal"])
      expect(condition).toContain("100\\% fatal")
    })

    it("handles underscore special character", () => {
      const condition = buildCategoryCondition(["covid_19"])
      expect(condition).toContain("covid\\_19")
    })
  })

  describe("buildCategoryCaseStatement", () => {
    it("returns valid SQL CASE statement without manner", () => {
      const caseStmt = buildCategoryCaseStatement()
      expect(caseStmt).toContain("CASE")
      expect(caseStmt).toContain("WHEN")
      expect(caseStmt).toContain("THEN 'cancer'")
      expect(caseStmt).toContain("THEN 'heart-disease'")
      expect(caseStmt).toContain("ELSE 'other'")
      expect(caseStmt).toContain("END")
    })

    it("handles all non-other categories", () => {
      const caseStmt = buildCategoryCaseStatement()
      // All categories except 'other' should have a WHEN clause
      for (const [key, category] of Object.entries(CAUSE_CATEGORIES)) {
        if (key !== "other") {
          expect(caseStmt).toContain(`THEN '${category.slug}'`)
        }
      }
    })

    it("includes manner checks when mannerColumn is provided", () => {
      const caseStmt = buildCategoryCaseStatement("cmm.manner")
      // Should check manner for intent-based categories
      expect(caseStmt).toContain("cmm.manner = 'suicide'")
      expect(caseStmt).toContain("cmm.manner = 'homicide'")
      expect(caseStmt).toContain("cmm.manner = 'accident'")
      // Should still have text pattern fallbacks
      expect(caseStmt).toContain("cmm.manner IS NULL")
      // Medical categories should NOT have manner checks
      expect(caseStmt).not.toContain("cmm.manner = 'cancer'")
    })
  })

  describe("categorizeCauseOfDeath", () => {
    it("categorizes cancer-related causes", () => {
      expect(categorizeCauseOfDeath("lung cancer")).toBe("cancer")
      expect(categorizeCauseOfDeath("Pancreatic Cancer")).toBe("cancer")
      expect(categorizeCauseOfDeath("brain tumor")).toBe("cancer")
      expect(categorizeCauseOfDeath("leukemia")).toBe("cancer")
      expect(categorizeCauseOfDeath("lymphoma")).toBe("cancer")
      expect(categorizeCauseOfDeath("melanoma")).toBe("cancer")
    })

    it("categorizes heart disease causes", () => {
      expect(categorizeCauseOfDeath("heart attack")).toBe("heart_disease")
      expect(categorizeCauseOfDeath("cardiac arrest")).toBe("heart_disease")
      expect(categorizeCauseOfDeath("myocardial infarction")).toBe("heart_disease")
      expect(categorizeCauseOfDeath("heart failure")).toBe("heart_disease")
      expect(categorizeCauseOfDeath("cardiovascular disease")).toBe("heart_disease")
    })

    it("categorizes respiratory causes", () => {
      expect(categorizeCauseOfDeath("pneumonia")).toBe("respiratory")
      expect(categorizeCauseOfDeath("COPD")).toBe("respiratory")
      expect(categorizeCauseOfDeath("pulmonary embolism")).toBe("respiratory")
      expect(categorizeCauseOfDeath("respiratory failure")).toBe("respiratory")
    })

    it("categorizes neurological causes", () => {
      expect(categorizeCauseOfDeath("Alzheimer's disease")).toBe("neurological")
      expect(categorizeCauseOfDeath("Parkinson's disease")).toBe("neurological")
      expect(categorizeCauseOfDeath("stroke")).toBe("neurological")
      expect(categorizeCauseOfDeath("ALS")).toBe("neurological")
    })

    it("categorizes accidents", () => {
      expect(categorizeCauseOfDeath("car accident")).toBe("accident")
      expect(categorizeCauseOfDeath("plane crash")).toBe("accident")
      expect(categorizeCauseOfDeath("motorcycle crash")).toBe("accident")
    })

    it("does not categorize ambiguous mechanisms as accidents without manner", () => {
      expect(categorizeCauseOfDeath("drowning")).toBe("other")
      expect(categorizeCauseOfDeath("fell from a building")).toBe("other")
    })

    it("categorizes overdoses", () => {
      expect(categorizeCauseOfDeath("drug overdose")).toBe("overdose")
      expect(categorizeCauseOfDeath("fentanyl overdose")).toBe("overdose")
      expect(categorizeCauseOfDeath("accidental overdose")).toBe("overdose")
    })

    it("categorizes suicides", () => {
      expect(categorizeCauseOfDeath("suicide")).toBe("suicide")
      expect(categorizeCauseOfDeath("died by suicide")).toBe("suicide")
      expect(categorizeCauseOfDeath("self-inflicted gunshot")).toBe("suicide")
    })

    it("categorizes homicides", () => {
      expect(categorizeCauseOfDeath("murder")).toBe("homicide")
      expect(categorizeCauseOfDeath("assassinated")).toBe("homicide")
    })

    it("does not categorize ambiguous mechanisms as homicide without manner", () => {
      expect(categorizeCauseOfDeath("gunshot wound")).toBe("other")
      expect(categorizeCauseOfDeath("stabbed to death")).toBe("other")
    })

    it("categorizes mechanisms correctly when manner is provided", () => {
      expect(categorizeCauseOfDeath("gunshot wound", "homicide")).toBe("homicide")
      expect(categorizeCauseOfDeath("gunshot wound", "suicide")).toBe("suicide")
      expect(categorizeCauseOfDeath("gunshot wound", "accident")).toBe("accident")
      expect(categorizeCauseOfDeath("drowning", "accident")).toBe("accident")
      expect(categorizeCauseOfDeath("drowning", "suicide")).toBe("suicide")
    })

    it("uses text patterns when manner is null or natural", () => {
      expect(categorizeCauseOfDeath("lung cancer", null)).toBe("cancer")
      expect(categorizeCauseOfDeath("lung cancer", "natural")).toBe("cancer")
      expect(categorizeCauseOfDeath("heart attack", "natural")).toBe("heart_disease")
    })

    it("manner overrides text patterns for intent-based categories", () => {
      // Even if the cause text doesn't match any pattern, manner wins
      expect(categorizeCauseOfDeath("unknown cause", "suicide")).toBe("suicide")
      expect(categorizeCauseOfDeath("unknown cause", "homicide")).toBe("homicide")
      expect(categorizeCauseOfDeath("unknown cause", "accident")).toBe("accident")
    })

    it("categorizes infectious diseases", () => {
      expect(categorizeCauseOfDeath("COVID-19")).toBe("infectious")
      expect(categorizeCauseOfDeath("AIDS-related illness")).toBe("infectious")
      expect(categorizeCauseOfDeath("sepsis")).toBe("infectious")
      expect(categorizeCauseOfDeath("tuberculosis")).toBe("infectious")
    })

    it("categorizes liver and kidney diseases", () => {
      expect(categorizeCauseOfDeath("liver failure")).toBe("liver_kidney")
      expect(categorizeCauseOfDeath("cirrhosis")).toBe("liver_kidney")
      expect(categorizeCauseOfDeath("kidney failure")).toBe("liver_kidney")
      expect(categorizeCauseOfDeath("renal failure")).toBe("liver_kidney")
    })

    it("categorizes natural causes", () => {
      expect(categorizeCauseOfDeath("natural causes")).toBe("natural")
      expect(categorizeCauseOfDeath("old age")).toBe("natural")
      expect(categorizeCauseOfDeath("died peacefully in sleep")).toBe("natural")
    })

    it("returns other for unknown causes", () => {
      expect(categorizeCauseOfDeath("unknown illness")).toBe("other")
      expect(categorizeCauseOfDeath("undisclosed")).toBe("other")
      expect(categorizeCauseOfDeath("")).toBe("other")
    })

    it("returns other for null", () => {
      expect(categorizeCauseOfDeath(null)).toBe("other")
    })

    it("is case insensitive", () => {
      expect(categorizeCauseOfDeath("CANCER")).toBe("cancer")
      expect(categorizeCauseOfDeath("Cancer")).toBe("cancer")
      expect(categorizeCauseOfDeath("CaNcEr")).toBe("cancer")
    })
  })

  describe("createCauseSlug", () => {
    it("creates URL-safe slugs", () => {
      expect(createCauseSlug("Heart Attack")).toBe("heart-attack")
      expect(createCauseSlug("Lung Cancer")).toBe("lung-cancer")
      expect(createCauseSlug("COVID-19")).toBe("covid-19")
    })

    it("removes special characters", () => {
      expect(createCauseSlug("Parkinson's Disease")).toBe("parkinsons-disease")
      expect(createCauseSlug("Heart (cardiac) failure")).toBe("heart-cardiac-failure")
    })

    it("handles multiple spaces and hyphens", () => {
      expect(createCauseSlug("  Multiple   Spaces  ")).toBe("multiple-spaces")
      expect(createCauseSlug("already-hyphenated")).toBe("already-hyphenated")
    })

    it("removes leading and trailing hyphens", () => {
      expect(createCauseSlug("-Leading and Trailing-")).toBe("leading-and-trailing")
    })
  })

  describe("getCategoryLabel", () => {
    it("returns label for valid slug", () => {
      expect(getCategoryLabel("cancer")).toBe("Cancer")
      expect(getCategoryLabel("heart-disease")).toBe("Heart Disease")
      expect(getCategoryLabel("liver-kidney")).toBe("Liver & Kidney Disease")
    })

    it("returns Unknown for invalid slug", () => {
      expect(getCategoryLabel("invalid")).toBe("Unknown")
      expect(getCategoryLabel("")).toBe("Unknown")
    })
  })
})
