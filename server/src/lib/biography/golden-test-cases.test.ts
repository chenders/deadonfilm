import { describe, it, expect } from "vitest"
import type { BiographyData } from "../biography-sources/types.js"
import {
  scoreResult,
  scoreAllResults,
  GOLDEN_TEST_CASES,
  type GoldenTestCase,
} from "./golden-test-cases.js"

/**
 * Helper to create a BiographyData object with sensible defaults.
 * Overrides can be passed to customize specific fields.
 */
function makeBiographyData(overrides: Partial<BiographyData> = {}): BiographyData {
  return {
    narrativeTeaser: null,
    narrative: null,
    narrativeConfidence: null,
    lifeNotableFactors: [],
    birthplaceDetails: null,
    familyBackground: null,
    education: null,
    preFameLife: null,
    fameCatalyst: null,
    personalStruggles: null,
    relationships: null,
    lesserKnownFacts: [],
    hasSubstantiveContent: false,
    ...overrides,
  }
}

// Use the Nixon test case for most tests since it has clear expected values
const nixonCase = GOLDEN_TEST_CASES[0]

describe("GOLDEN_TEST_CASES", () => {
  it("contains 7 golden test cases", () => {
    expect(GOLDEN_TEST_CASES).toHaveLength(7)
  })

  it("each test case has required fields", () => {
    for (const tc of GOLDEN_TEST_CASES) {
      expect(tc.actorName).toBeTruthy()
      expect(tc.tmdbId).toBeGreaterThan(0)
      expect(tc.expectedFacts.length).toBeGreaterThan(0)
      expect(tc.expectedFactors.length).toBeGreaterThan(0)
      expect(tc.unexpectedContent.length).toBeGreaterThan(0)
    }
  })
})

describe("scoreResult", () => {
  it("returns perfect score when all facts found, all factors correct, no unwanted content, and compelling teaser", () => {
    const data = makeBiographyData({
      narrativeTeaser: "A Quaker farm boy who turned down a Harvard scholarship to help his family",
      narrative:
        "Nixon grew up in Whittier, California, working at the family store. He was offered a scholarship to Harvard but could not afford to leave home.",
      lifeNotableFactors: ["scholar", "political_figure", "military_service"],
      lesserKnownFacts: [],
      hasSubstantiveContent: true,
    })

    const score = scoreResult(nixonCase, data)

    expect(score.actorName).toBe("Richard Nixon")
    expect(score.factsFound).toBe(4)
    expect(score.factsMissed).toEqual([])
    expect(score.factorsCorrect).toBe(3)
    expect(score.factorsMissed).toEqual([])
    expect(score.unwantedContentFound).toEqual([])
    expect(score.teaserQuality).toBe("compelling")
    expect(score.score).toBe(100)
  })

  it("scores partial fact recall correctly (2 of 4 facts = 30 points)", () => {
    const data = makeBiographyData({
      narrativeTeaser: "A compelling personal story",
      narrative: "Nixon attended Harvard and won a scholarship there.",
      lifeNotableFactors: ["scholar", "political_figure", "military_service"],
      hasSubstantiveContent: true,
    })

    const score = scoreResult(nixonCase, data)

    expect(score.factsFound).toBe(2)
    expect(score.factsMissed).toEqual(["family store", "Whittier"])
    // 2 * (60/4) = 30
    expect(score.score).toBe(30 + 20 + 10 + 10)
  })

  it("scores zero for fact recall when no expected facts are found", () => {
    const data = makeBiographyData({
      narrativeTeaser: "A compelling personal story",
      narrative: "This person lived a quiet life with no notable achievements mentioned here.",
      lifeNotableFactors: ["scholar", "political_figure", "military_service"],
      hasSubstantiveContent: true,
    })

    const score = scoreResult(nixonCase, data)

    expect(score.factsFound).toBe(0)
    expect(score.factsMissed).toEqual(["Harvard", "scholarship", "family store", "Whittier"])
    // 0 for facts + 20 for factors + 10 for no unwanted + 10 for teaser = 40
    expect(score.score).toBe(40)
  })

  it("scores factor accuracy correctly (2 of 3 factors = ~13 points)", () => {
    const data = makeBiographyData({
      narrativeTeaser: "A compelling personal story",
      narrative:
        "Nixon grew up in Whittier, worked at the family store, earned a Harvard scholarship.",
      lifeNotableFactors: ["scholar", "military_service"],
      hasSubstantiveContent: true,
    })

    const score = scoreResult(nixonCase, data)

    expect(score.factorsCorrect).toBe(2)
    expect(score.factorsMissed).toEqual(["political_figure"])
    // factors: 2 * (20/3) = 13.33 -> rounded to 13
    const expectedFactorScore = Math.round(2 * (20 / 3))
    expect(expectedFactorScore).toBe(13)
    // total: 60 (all facts) + 13 (factors) + 10 (no unwanted) + 10 (teaser) = 93
    expect(score.score).toBe(93)
  })

  it("scores 0 for unwanted content when filmography detected", () => {
    const data = makeBiographyData({
      narrativeTeaser: "A compelling personal story",
      narrative:
        "Nixon grew up in Whittier, worked at the family store, earned a Harvard scholarship. His filmography includes several notable appearances.",
      lifeNotableFactors: ["scholar", "political_figure", "military_service"],
      hasSubstantiveContent: true,
    })

    const score = scoreResult(nixonCase, data)

    expect(score.unwantedContentFound).toEqual(["filmography"])
    // 60 (facts) + 20 (factors) + 0 (unwanted detected) + 10 (teaser) = 90
    expect(score.score).toBe(90)
  })

  it("classifies career-focused teaser as career_focused with 0 points", () => {
    const data = makeBiographyData({
      narrativeTeaser: "Was an American actor who appeared in many films throughout his career.",
      narrative:
        "Nixon grew up in Whittier, worked at the family store, earned a Harvard scholarship.",
      lifeNotableFactors: ["scholar", "political_figure", "military_service"],
      hasSubstantiveContent: true,
    })

    const score = scoreResult(nixonCase, data)

    expect(score.teaserQuality).toBe("career_focused")
    // 60 (facts) + 20 (factors) + 10 (no unwanted) + 0 (career teaser) = 90
    expect(score.score).toBe(90)
  })

  it("classifies null teaser as generic with 0 points", () => {
    const data = makeBiographyData({
      narrativeTeaser: null,
      narrative:
        "Nixon grew up in Whittier, worked at the family store, earned a Harvard scholarship.",
      lifeNotableFactors: ["scholar", "political_figure", "military_service"],
      hasSubstantiveContent: true,
    })

    const score = scoreResult(nixonCase, data)

    expect(score.teaserQuality).toBe("generic")
    // 60 + 20 + 10 + 0 = 90
    expect(score.score).toBe(90)
  })

  it("scores 0 for BiographyData with all null/empty fields", () => {
    const data = makeBiographyData()

    const score = scoreResult(nixonCase, data)

    expect(score.factsFound).toBe(0)
    expect(score.factsMissed).toEqual(["Harvard", "scholarship", "family store", "Whittier"])
    expect(score.factorsCorrect).toBe(0)
    expect(score.factorsMissed).toEqual(["scholar", "political_figure", "military_service"])
    expect(score.unwantedContentFound).toEqual([])
    expect(score.teaserQuality).toBe("generic")
    expect(score.narrativeLength).toBe(0)
    expect(score.score).toBe(10) // only 10 for no unwanted content (vacuously true)
  })

  it("searches across all text fields including lesserKnownFacts", () => {
    const data = makeBiographyData({
      narrativeTeaser: "A compelling personal story",
      education: "Attended Harvard on a scholarship",
      preFameLife: "Worked at the family store",
      lesserKnownFacts: ["Grew up in Whittier, California"],
      lifeNotableFactors: ["scholar", "political_figure", "military_service"],
      hasSubstantiveContent: true,
    })

    const score = scoreResult(nixonCase, data)

    expect(score.factsFound).toBe(4)
    expect(score.factsMissed).toEqual([])
    expect(score.score).toBe(100)
  })

  it("performs case-insensitive fact matching", () => {
    const data = makeBiographyData({
      narrativeTeaser: "A compelling story",
      narrative: "nixon attended HARVARD on a SCHOLARSHIP at the FAMILY STORE in WHITTIER",
      lifeNotableFactors: ["scholar", "political_figure", "military_service"],
      hasSubstantiveContent: true,
    })

    const score = scoreResult(nixonCase, data)

    expect(score.factsFound).toBe(4)
  })

  it("reports narrative length from the narrative field", () => {
    const narrative = "A short narrative about Nixon."
    const data = makeBiographyData({
      narrative,
    })

    const score = scoreResult(nixonCase, data)

    expect(score.narrativeLength).toBe(narrative.length)
  })

  it("detects multiple career teaser phrases", () => {
    const careerPhrases = [
      "Was a British actor known for horror films",
      "Born on May 27, 1922, in London",
      "Was born in Belgravia, London",
      "Starred in over 200 films",
      "Appeared in many horror classics",
      "Known for his portrayal of Dracula",
    ]

    for (const phrase of careerPhrases) {
      const data = makeBiographyData({ narrativeTeaser: phrase })
      const score = scoreResult(nixonCase, data)
      expect(score.teaserQuality).toBe("career_focused")
    }
  })
})

describe("scoreAllResults", () => {
  it("processes multiple results and calculates correct average", () => {
    const results = new Map<string, BiographyData>()

    // Nixon: perfect score
    results.set(
      "Richard Nixon",
      makeBiographyData({
        narrativeTeaser: "A Quaker farm boy who turned down Harvard",
        narrative:
          "Nixon grew up in Whittier, worked at the family store, earned a Harvard scholarship.",
        lifeNotableFactors: ["scholar", "political_figure", "military_service"],
        hasSubstantiveContent: true,
      })
    )

    // James Earl Jones: partial score
    results.set(
      "James Earl Jones",
      makeBiographyData({
        narrativeTeaser: "The voice behind Darth Vader overcame a stutter",
        narrative: "Jones was nearly mute as a child due to a severe stutter.",
        lifeNotableFactors: ["disability"],
        hasSubstantiveContent: true,
      })
    )

    const { scores, averageScore, summary } = scoreAllResults(results)

    // Should have 7 scores (all golden test cases)
    expect(scores).toHaveLength(7)

    // Nixon should be 100
    const nixonScore = scores.find((s) => s.actorName === "Richard Nixon")
    expect(nixonScore?.score).toBe(100)

    // Jones should be 100 (all facts, factors, no unwanted, compelling teaser)
    const jonesScore = scores.find((s) => s.actorName === "James Earl Jones")
    expect(jonesScore?.score).toBe(100)

    // Missing actors should be 0
    const stewartScore = scores.find((s) => s.actorName === "Jimmy Stewart")
    expect(stewartScore?.score).toBe(0)

    // Average should account for all 7 cases
    // Nixon=100, Jones=100, others=0 -> (200) / 7 ~ 28.57
    expect(averageScore).toBeCloseTo(200 / 7, 1)

    // Summary should contain formatted output
    expect(summary).toContain("Golden Test Case Results")
    expect(summary).toContain("Richard Nixon: 100/100")
    expect(summary).toContain("James Earl Jones: 100/100")
    expect(summary).toContain("Jimmy Stewart: 0/100")
    expect(summary).toContain("Average Score:")
  })

  it("returns empty scores with 0 average when no results provided", () => {
    const results = new Map<string, BiographyData>()
    const { scores, averageScore } = scoreAllResults(results)

    expect(scores).toHaveLength(7)
    expect(scores.every((s) => s.score === 0)).toBe(true)
    expect(averageScore).toBe(0)
  })

  it("handles missing actor data by scoring 0", () => {
    const results = new Map<string, BiographyData>()
    // Only provide data for one actor
    results.set(
      "Audrey Hepburn",
      makeBiographyData({
        narrativeTeaser: "A wartime survivor who danced through famine",
        narrative:
          "Hepburn survived starvation during WWII thanks to the Dutch Resistance. She trained in ballet from a young age.",
        lifeNotableFactors: ["survivor"],
        hasSubstantiveContent: true,
      })
    )

    const { scores } = scoreAllResults(results)

    const hepburnScore = scores.find((s) => s.actorName === "Audrey Hepburn")
    expect(hepburnScore?.score).toBe(100)

    // All others should be 0
    const otherScores = scores.filter((s) => s.actorName !== "Audrey Hepburn")
    expect(otherScores.every((s) => s.score === 0)).toBe(true)
  })

  it("summary includes missed facts and factors for failing cases", () => {
    const results = new Map<string, BiographyData>()
    const { summary } = scoreAllResults(results)

    // Nixon has no data, so all facts should be listed as missed
    expect(summary).toContain("Harvard")
    expect(summary).toContain("scholarship")
    expect(summary).toContain("Whittier")
  })
})
