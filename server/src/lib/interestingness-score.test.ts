import { describe, it, expect } from "vitest"
import {
  calculateInterestingnessScore,
  calculateEraScore,
  calculateDemographicScore,
  calculateDeathDramaScore,
  calculateCulturalCrossoverScore,
  calculateWikiInterestRatioScore,
  calculateInternationalRecognitionScore,
  calculateLifeComplexityScore,
  type InterestingnessInput,
} from "./interestingness-score.js"

// ============================================================================
// Helper: build a default input with all nulls
// ============================================================================

function makeInput(overrides: Partial<InterestingnessInput> = {}): InterestingnessInput {
  return {
    birthday: null,
    deathday: null,
    wikidataGender: null,
    wikidataEthnicity: null,
    wikidataBirthplaceCountry: null,
    wikidataCitizenship: null,
    wikidataMilitaryService: null,
    wikidataOccupations: null,
    deathManner: null,
    yearsLost: null,
    violentDeath: null,
    ageAtDeath: null,
    dofPopularity: null,
    wikipediaAnnualPageviews: null,
    wikidataSitelinks: null,
    ...overrides,
  }
}

// ============================================================================
// Era Score
// ============================================================================

describe("calculateEraScore", () => {
  it("returns 0 for null birthday", () => {
    expect(calculateEraScore(null)).toBe(0)
  })

  it("returns 20 for silent film pioneers (born before 1900)", () => {
    expect(calculateEraScore("1895-01-15")).toBe(20)
  })

  it("returns 18 for Depression/WWII era (born 1900-1919)", () => {
    expect(calculateEraScore("1910-06-01")).toBe(18)
  })

  it("returns 15 for golden age Hollywood (born 1920-1939)", () => {
    expect(calculateEraScore("1930-03-15")).toBe(15)
  })

  it("returns 10 for post-war civil rights era (born 1940-1959)", () => {
    expect(calculateEraScore("1950-07-04")).toBe(10)
  })

  it("returns 5 for born 1960-1979", () => {
    expect(calculateEraScore("1970-12-25")).toBe(5)
  })

  it("returns 2 for born after 1980", () => {
    expect(calculateEraScore("1990-01-01")).toBe(2)
  })
})

// ============================================================================
// Demographic Score
// ============================================================================

describe("calculateDemographicScore", () => {
  it("returns 0 for null birthday", () => {
    expect(calculateDemographicScore(null, null, null, null)).toBe(0)
  })

  it("scores 20 for non-white actor born before 1950", () => {
    expect(calculateDemographicScore("1920-01-01", null, "African Americans", null)).toBe(20)
  })

  it("scores 15 for non-white actor born 1950-1969", () => {
    expect(calculateDemographicScore("1960-01-01", null, "African Americans", null)).toBe(15)
  })

  it("scores 8 for non-white actor born after 1970", () => {
    expect(calculateDemographicScore("1980-01-01", null, "Japanese people", null)).toBe(8)
  })

  it("scores 12 for female actor born before 1940", () => {
    expect(calculateDemographicScore("1930-01-01", "female", null, null)).toBe(12)
  })

  it("scores 8 for female actor born 1940-1959", () => {
    expect(calculateDemographicScore("1950-01-01", "female", null, null)).toBe(8)
  })

  it("stacks ethnicity and gender, capped at 20", () => {
    // Non-white (20) + female before 1940 (12) = 32, capped to 20
    const score = calculateDemographicScore("1920-01-01", "female", "Chinese Americans", null)
    expect(score).toBe(20)
  })

  it("uses birthplace as proxy when ethnicity unknown", () => {
    // Non-Western birthplace, born before 1950 → half of 20 = 10
    const score = calculateDemographicScore("1920-01-01", null, null, "Japan")
    expect(score).toBe(10)
  })

  it("does not use birthplace proxy for US actors", () => {
    const score = calculateDemographicScore("1920-01-01", null, null, "United States of America")
    expect(score).toBe(0)
  })

  it("does not use birthplace proxy for European actors", () => {
    const score = calculateDemographicScore("1920-01-01", null, null, "France")
    expect(score).toBe(0)
  })
})

// ============================================================================
// Death Drama Score
// ============================================================================

describe("calculateDeathDramaScore", () => {
  it("returns 0 with no death data", () => {
    expect(calculateDeathDramaScore(null, null, null, null)).toBe(0)
  })

  it("scores 8 for violent death", () => {
    expect(calculateDeathDramaScore(null, null, true, null)).toBe(8)
  })

  it("scores 13 for violent homicide", () => {
    // violent (8) + homicide (5) = 13
    expect(calculateDeathDramaScore("homicide", null, true, null)).toBe(13)
  })

  it("scores 7 for significant years lost", () => {
    expect(calculateDeathDramaScore(null, 25, null, null)).toBe(7)
  })

  it("scores 4 for moderate years lost", () => {
    expect(calculateDeathDramaScore(null, 15, null, null)).toBe(4)
  })

  it("scores 5 for death before 40", () => {
    expect(calculateDeathDramaScore(null, null, null, 35)).toBe(5)
  })

  it("scores 3 for death between 40-50", () => {
    expect(calculateDeathDramaScore(null, null, null, 45)).toBe(3)
  })

  it("caps at 15 for combined factors", () => {
    // violent (8) + homicide (5) + years_lost>20 (7) + age<40 (5) = 25, capped to 15
    expect(calculateDeathDramaScore("homicide", 25, true, 30)).toBe(15)
  })
})

// ============================================================================
// Cultural Crossover Score
// ============================================================================

describe("calculateCulturalCrossoverScore", () => {
  it("returns 0 for null birthplace", () => {
    expect(calculateCulturalCrossoverScore(null, null)).toBe(0)
  })

  it("returns 0 for US-born actor", () => {
    expect(calculateCulturalCrossoverScore("United States of America", null)).toBe(0)
  })

  it("scores 7 for non-English European birthplace", () => {
    expect(calculateCulturalCrossoverScore("France", null)).toBe(7)
  })

  it("scores 10 for non-Western birthplace", () => {
    expect(calculateCulturalCrossoverScore("Japan", null)).toBe(10)
  })

  it("adds 3 for different citizenship", () => {
    // Japan birthplace (10) + different citizenship (3) = 13, capped to 10
    expect(calculateCulturalCrossoverScore("Japan", "United States of America")).toBe(10)
  })

  it("adds 3 for European emigrant, total 10", () => {
    // France (7) + different citizenship (3) = 10
    expect(calculateCulturalCrossoverScore("France", "United States of America")).toBe(10)
  })

  it("case-insensitive country matching", () => {
    expect(calculateCulturalCrossoverScore("united states of america", null)).toBe(0)
  })
})

// ============================================================================
// Wikipedia Interest Ratio Score
// ============================================================================

describe("calculateWikiInterestRatioScore", () => {
  it("returns 0 with no data", () => {
    expect(calculateWikiInterestRatioScore(null, null)).toBe(0)
  })

  it("returns 0 for zero popularity", () => {
    expect(calculateWikiInterestRatioScore(100000, 0)).toBe(0)
  })

  it("returns 15 for very high ratio (>5.0)", () => {
    // 600000 / (10 * 10000) = 6.0
    expect(calculateWikiInterestRatioScore(600000, 10)).toBe(15)
  })

  it("returns 12 for high ratio (2.0-5.0)", () => {
    // 300000 / (10 * 10000) = 3.0
    expect(calculateWikiInterestRatioScore(300000, 10)).toBe(12)
  })

  it("returns 8 for moderate ratio (1.0-2.0)", () => {
    // 150000 / (10 * 10000) = 1.5
    expect(calculateWikiInterestRatioScore(150000, 10)).toBe(8)
  })

  it("returns 4 for low ratio (0.5-1.0)", () => {
    // 75000 / (10 * 10000) = 0.75
    expect(calculateWikiInterestRatioScore(75000, 10)).toBe(4)
  })

  it("returns 0 for very low ratio (<0.5)", () => {
    // 10000 / (10 * 10000) = 0.1
    expect(calculateWikiInterestRatioScore(10000, 10)).toBe(0)
  })
})

// ============================================================================
// International Recognition Score
// ============================================================================

describe("calculateInternationalRecognitionScore", () => {
  it("returns 0 with no data", () => {
    expect(calculateInternationalRecognitionScore(null, null)).toBe(0)
  })

  it("returns 10 for high sitelinks-to-popularity ratio", () => {
    expect(calculateInternationalRecognitionScore(30, 10)).toBe(10)
  })

  it("returns 7 for moderate ratio", () => {
    expect(calculateInternationalRecognitionScore(15, 10)).toBe(7)
  })

  it("returns 4 for low ratio", () => {
    expect(calculateInternationalRecognitionScore(7, 10)).toBe(4)
  })

  it("returns 0 for very low ratio", () => {
    expect(calculateInternationalRecognitionScore(2, 10)).toBe(0)
  })
})

// ============================================================================
// Life Complexity Score
// ============================================================================

describe("calculateLifeComplexityScore", () => {
  it("returns 0 with no data", () => {
    expect(calculateLifeComplexityScore(null, null)).toBe(0)
  })

  it("scores 5 for military service", () => {
    expect(calculateLifeComplexityScore("United States Army", null)).toBe(5)
  })

  it("scores 3 for single non-acting occupation", () => {
    expect(calculateLifeComplexityScore(null, "singer")).toBe(3)
  })

  it("scores 5 for multiple non-acting occupations", () => {
    expect(calculateLifeComplexityScore(null, "singer, writer")).toBe(5)
  })

  it("scores 10 for military + multiple occupations", () => {
    expect(calculateLifeComplexityScore("Royal Air Force", "singer, writer")).toBe(10)
  })

  it("caps at 10", () => {
    expect(calculateLifeComplexityScore("US Army", "singer, writer, politician")).toBe(10)
  })
})

// ============================================================================
// Full Score Calculation — Real Actor Profiles
// ============================================================================

describe("calculateInterestingnessScore", () => {
  it("returns 0 for completely empty input", () => {
    const result = calculateInterestingnessScore(makeInput())
    expect(result.score).toBe(0)
  })

  it("returns score and breakdown", () => {
    const result = calculateInterestingnessScore(makeInput({ birthday: "1950-01-01" }))
    expect(result).toHaveProperty("score")
    expect(result).toHaveProperty("breakdown")
    expect(result.breakdown).toHaveProperty("eraScore")
    expect(result.breakdown).toHaveProperty("demographicScore")
    expect(result.breakdown).toHaveProperty("deathDramaScore")
    expect(result.breakdown).toHaveProperty("culturalCrossoverScore")
    expect(result.breakdown).toHaveProperty("wikiInterestRatioScore")
    expect(result.breakdown).toHaveProperty("internationalRecognitionScore")
    expect(result.breakdown).toHaveProperty("lifeComplexityScore")
  })

  it("caps total score at 100", () => {
    // Construct a maximally-interesting actor
    const result = calculateInterestingnessScore(
      makeInput({
        birthday: "1890-01-01", // era: 20
        wikidataGender: "female", // demographic stacks
        wikidataEthnicity: "African Americans", // demographic: 20
        wikidataBirthplaceCountry: "Japan", // cultural crossover: 10
        wikidataCitizenship: "United States of America",
        deathManner: "homicide",
        violentDeath: true,
        yearsLost: 30,
        ageAtDeath: 30, // death drama: 15 (capped)
        wikidataMilitaryService: "US Army",
        wikidataOccupations: "singer, writer, politician", // life: 10
        dofPopularity: 10,
        wikipediaAnnualPageviews: 600000, // wiki interest: 15
        wikidataSitelinks: 50, // intl recognition: 10
      })
    )
    expect(result.score).toBe(100)
  })

  describe("real actor profiles", () => {
    it("Anna May Wong scores very high (Chinese-American, early Hollywood)", () => {
      const result = calculateInterestingnessScore(
        makeInput({
          birthday: "1905-01-03",
          deathday: "1961-02-03",
          wikidataGender: "female",
          wikidataEthnicity: "Chinese Americans",
          wikidataBirthplaceCountry: "United States of America",
          ageAtDeath: 56,
          yearsLost: 20,
          dofPopularity: 5,
          wikipediaAnnualPageviews: 500000,
          wikidataSitelinks: 40,
        })
      )
      // era(18) + demo(20) + death(7) + wiki(15) + intl(10) = 70+
      expect(result.score).toBeGreaterThanOrEqual(60)
    })

    it("James Dean scores high (young violent death, 1931)", () => {
      const result = calculateInterestingnessScore(
        makeInput({
          birthday: "1931-02-08",
          deathday: "1955-09-30",
          wikidataGender: "male",
          wikidataBirthplaceCountry: "United States of America",
          deathManner: "accident",
          violentDeath: true,
          ageAtDeath: 24,
          yearsLost: 50,
          dofPopularity: 30,
          wikipediaAnnualPageviews: 3000000,
          wikidataSitelinks: 80,
        })
      )
      // era(15) + death(15) + wiki(15) + intl(7) = 52+
      expect(result.score).toBeGreaterThanOrEqual(45)
    })

    it("modern actor natural death at 85 scores low", () => {
      const result = calculateInterestingnessScore(
        makeInput({
          birthday: "1970-06-15",
          deathday: "2025-01-10",
          wikidataGender: "male",
          wikidataBirthplaceCountry: "United States of America",
          deathManner: "natural",
          violentDeath: false,
          ageAtDeath: 85,
          yearsLost: -5,
          dofPopularity: 50,
          wikipediaAnnualPageviews: 200000,
          wikidataSitelinks: 30,
        })
      )
      // era(5) + demo(0) + death(0) + cross(0) + wiki(low) + intl(low) + life(0)
      expect(result.score).toBeLessThan(20)
    })

    it("Christopher Lee scores high (WWII service, multilingual, early era)", () => {
      const result = calculateInterestingnessScore(
        makeInput({
          birthday: "1922-05-27",
          deathday: "2015-06-07",
          wikidataGender: "male",
          wikidataBirthplaceCountry: "United Kingdom",
          deathManner: "natural",
          violentDeath: false,
          ageAtDeath: 93,
          yearsLost: -14,
          wikidataMilitaryService: "Royal Air Force",
          wikidataOccupations: "singer, author",
          dofPopularity: 40,
          wikipediaAnnualPageviews: 5000000,
          wikidataSitelinks: 90,
        })
      )
      // era(15) + life(10) + wiki(high) + intl(7) = 40+
      expect(result.score).toBeGreaterThanOrEqual(35)
    })
  })
})
