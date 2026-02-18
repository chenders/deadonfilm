/**
 * Golden test case framework for biography quality scoring.
 *
 * Defines actors with known personal life facts and provides scoring
 * to measure how well biography enrichment recalls expected facts,
 * tags correct life_notable_factors, and avoids career content.
 */

import type { BiographyData } from "../biography-sources/types.js"

// ============================================================================
// Types
// ============================================================================

export interface GoldenTestCase {
  actorName: string
  tmdbId: number
  expectedFacts: string[] // Keywords/phrases that SHOULD appear in narrative
  expectedFactors: string[] // life_notable_factors that SHOULD be tagged
  unexpectedContent: string[] // Things that should NOT appear (career/filmography)
}

export interface TestCaseScore {
  actorName: string
  factsFound: number // Count of expectedFacts found in narrative
  factsMissed: string[] // expectedFacts NOT found
  factorsCorrect: number // Count of correct factors
  factorsMissed: string[] // expectedFactors NOT found
  unwantedContentFound: string[] // unexpectedContent that WAS found
  teaserQuality: "compelling" | "generic" | "career_focused"
  narrativeLength: number // Character count of narrative
  score: number // 0-100 composite score
}

// ============================================================================
// Golden Test Cases Dataset
// ============================================================================

export const GOLDEN_TEST_CASES: GoldenTestCase[] = [
  {
    actorName: "Richard Nixon",
    tmdbId: 59832,
    expectedFacts: ["Harvard", "scholarship", "family store", "Whittier"],
    expectedFactors: ["scholar", "political_figure", "military_service"],
    unexpectedContent: ["filmography", "box office", "Academy Award"],
  },
  {
    actorName: "Jimmy Stewart",
    tmdbId: 1930,
    expectedFacts: ["Princeton", "architecture", "bomber pilot", "model airplane"],
    expectedFactors: ["military_service", "war_veteran", "scholar"],
    unexpectedContent: ["filmography", "box office"],
  },
  {
    actorName: "Audrey Hepburn",
    tmdbId: 4694,
    expectedFacts: ["Dutch Resistance", "starvation", "ballet"],
    expectedFactors: ["survivor"],
    unexpectedContent: ["filmography", "Academy Award nominations"],
  },
  {
    actorName: "Christopher Lee",
    tmdbId: 2295,
    expectedFacts: ["SAS", "SOE", "guillotine"],
    expectedFactors: ["military_service", "espionage"],
    unexpectedContent: ["filmography", "box office"],
  },
  {
    actorName: "Steve McQueen",
    tmdbId: 5679,
    expectedFacts: ["reform school", "Marines"],
    expectedFactors: ["incarcerated", "military_service"],
    unexpectedContent: ["filmography", "box office"],
  },
  {
    actorName: "Hedy Lamarr",
    tmdbId: 19967,
    expectedFacts: ["frequency-hopping", "WiFi", "Bluetooth", "inventor"],
    expectedFactors: ["prodigy", "multiple_careers"],
    unexpectedContent: ["filmography", "box office"],
  },
  {
    actorName: "James Earl Jones",
    tmdbId: 15152,
    expectedFacts: ["stutter", "mute"],
    expectedFactors: ["disability"],
    unexpectedContent: ["filmography", "box office"],
  },
]

// ============================================================================
// Career-focused teaser phrases
// ============================================================================

const CAREER_TEASER_PHRASES = [
  "was an american actor",
  "was a british actor",
  "born on",
  "was born",
  "starred in",
  "appeared in",
  "known for",
]

// ============================================================================
// Scoring Functions
// ============================================================================

/**
 * Combine all text fields from BiographyData into a single searchable string.
 */
function combineTextFields(data: BiographyData): string {
  const fields: (string | null | undefined)[] = [
    data.narrative,
    data.birthplaceDetails,
    data.familyBackground,
    data.education,
    data.preFameLife,
    data.fameCatalyst,
    data.personalStruggles,
    data.relationships,
  ]

  const parts = fields.filter((f): f is string => f != null)

  if (data.lesserKnownFacts.length > 0) {
    parts.push(data.lesserKnownFacts.join(" "))
  }

  return parts.join(" ")
}

/**
 * Determine the quality classification of a narrative teaser.
 */
function classifyTeaser(teaser: string | null): "compelling" | "generic" | "career_focused" {
  if (!teaser || teaser.trim() === "") {
    return "generic"
  }

  const lowerTeaser = teaser.toLowerCase()
  for (const phrase of CAREER_TEASER_PHRASES) {
    if (lowerTeaser.startsWith(phrase)) {
      return "career_focused"
    }
  }

  return "compelling"
}

/**
 * Score a single biography result against a golden test case.
 */
export function scoreResult(testCase: GoldenTestCase, data: BiographyData): TestCaseScore {
  const combinedText = combineTextFields(data)
  const lowerCombined = combinedText.toLowerCase()

  // 1. Fact recall (max 60 points)
  const factsMissed: string[] = []
  let factsFound = 0
  for (const fact of testCase.expectedFacts) {
    if (lowerCombined.includes(fact.toLowerCase())) {
      factsFound++
    } else {
      factsMissed.push(fact)
    }
  }
  const factScore =
    testCase.expectedFacts.length > 0
      ? Math.min(60, Math.round(factsFound * (60 / testCase.expectedFacts.length)))
      : 60

  // 2. Factor accuracy (max 20 points)
  const factorsMissed: string[] = []
  let factorsCorrect = 0
  for (const factor of testCase.expectedFactors) {
    if (data.lifeNotableFactors.includes(factor)) {
      factorsCorrect++
    } else {
      factorsMissed.push(factor)
    }
  }
  const factorScore =
    testCase.expectedFactors.length > 0
      ? Math.min(20, Math.round(factorsCorrect * (20 / testCase.expectedFactors.length)))
      : 20

  // 3. No unwanted content (max 10 points)
  const unwantedContentFound: string[] = []
  for (const content of testCase.unexpectedContent) {
    if (lowerCombined.includes(content.toLowerCase())) {
      unwantedContentFound.push(content)
    }
  }
  const unwantedScore = unwantedContentFound.length === 0 ? 10 : 0

  // 4. Teaser quality (max 10 points)
  const teaserQuality = classifyTeaser(data.narrativeTeaser)
  const teaserScore = teaserQuality === "compelling" ? 10 : 0

  // Narrative length
  const narrativeLength = (data.narrative ?? "").length

  return {
    actorName: testCase.actorName,
    factsFound,
    factsMissed,
    factorsCorrect,
    factorsMissed,
    unwantedContentFound,
    teaserQuality,
    narrativeLength,
    score: factScore + factorScore + unwantedScore + teaserScore,
  }
}

/**
 * Score all golden test cases against a map of biography results.
 */
export function scoreAllResults(results: Map<string, BiographyData>): {
  scores: TestCaseScore[]
  averageScore: number
  summary: string
} {
  const scores: TestCaseScore[] = []

  for (const testCase of GOLDEN_TEST_CASES) {
    const data = results.get(testCase.actorName)
    if (data) {
      scores.push(scoreResult(testCase, data))
    } else {
      // No data for this actor — score 0
      scores.push({
        actorName: testCase.actorName,
        factsFound: 0,
        factsMissed: [...testCase.expectedFacts],
        factorsCorrect: 0,
        factorsMissed: [...testCase.expectedFactors],
        unwantedContentFound: [],
        teaserQuality: "generic",
        narrativeLength: 0,
        score: 0,
      })
    }
  }

  const totalScore = scores.reduce((sum, s) => sum + s.score, 0)
  const averageScore = scores.length > 0 ? totalScore / scores.length : 0

  const lines: string[] = ["Golden Test Case Results", "========================", ""]

  for (const s of scores) {
    lines.push(`${s.actorName}: ${s.score}/100`)
    lines.push(
      `  Facts: ${s.factsFound} found, ${s.factsMissed.length} missed${s.factsMissed.length > 0 ? ` (${s.factsMissed.join(", ")})` : ""}`
    )
    lines.push(
      `  Factors: ${s.factorsCorrect} correct, ${s.factorsMissed.length} missed${s.factorsMissed.length > 0 ? ` (${s.factorsMissed.join(", ")})` : ""}`
    )
    if (s.unwantedContentFound.length > 0) {
      lines.push(`  Unwanted content: ${s.unwantedContentFound.join(", ")}`)
    }
    lines.push(`  Teaser: ${s.teaserQuality}`)
    lines.push(`  Narrative length: ${s.narrativeLength} chars`)
    lines.push("")
  }

  lines.push(`Average Score: ${Math.round(averageScore * 10) / 10}/100`)

  return {
    scores,
    averageScore,
    summary: lines.join("\n"),
  }
}
