/**
 * Tests for DOF Popularity Score Calculation
 */

import { describe, it, expect } from "vitest"
import {
  ALGORITHM_VERSION,
  logPercentile,
  adjustBoxOfficeForEra,
  calculateLongevityScore,
  calculateRepeatViewership,
  calculateVoteGrowthRate,
  calculateAwardsScore,
  getBillingWeight,
  getEpisodeWeight,
  getLanguageMultiplier,
  calculateMoviePopularity,
  calculateShowPopularity,
  calculateActorPopularity,
  weightedPositionalAverage,
  isUSUKProduction,
  isEnglishLanguage,
  isSoleLead,
  calculateSoleLeadBonus,
  calculateConsistentStarMultiplier,
  calculateMultiFactorConfidence,
  applyActorBayesianAdjustment,
  type ContentPopularityInput,
  type ShowPopularityInput,
  type ActorPopularityInput,
  type ActorAppearance,
} from "./popularity-score.js"

// Helper to create an appearance with default star power fields
function makeAppearance(overrides: Partial<ActorAppearance> = {}): ActorAppearance {
  return {
    contentDofPopularity: 70,
    contentDofWeight: 60,
    billingOrder: 0,
    episodeCount: null,
    isMovie: true,
    castSize: null,
    nextBillingOrder: null,
    ...overrides,
  }
}

describe("ALGORITHM_VERSION", () => {
  it("follows major.minor format", () => {
    expect(ALGORITHM_VERSION).toMatch(/^\d+\.\d+$/)
  })

  it("is version 4.0", () => {
    expect(ALGORITHM_VERSION).toBe("4.0")
  })
})

describe("weightedPositionalAverage", () => {
  it("returns 0 for empty array", () => {
    expect(weightedPositionalAverage([])).toBe(0)
  })

  it("returns the single value for one-element array", () => {
    expect(weightedPositionalAverage([42])).toBe(42)
  })

  it("uniform contributions produce same result as simple average", () => {
    const contributions = [50, 50, 50, 50, 50]
    const simpleAvg = 50
    expect(weightedPositionalAverage(contributions)).toBeCloseTo(simpleAvg, 10)
  })

  it("peaked career beats flat career with same simple average", () => {
    // Actor A: peaked career (sorted descending)
    const peaked = [90, 85, 80, 40, 30, 25, 20, 15, 10, 5]
    // Actor B: flat career (sorted descending)
    const flat = [42, 41, 41, 40, 40, 40, 39, 39, 39, 39]

    // Simple averages are close: peaked = 40, flat = 40
    const peakedSimpleAvg = peaked.reduce((a, b) => a + b, 0) / peaked.length
    const flatSimpleAvg = flat.reduce((a, b) => a + b, 0) / flat.length
    expect(peakedSimpleAvg).toBe(40)
    expect(flatSimpleAvg).toBe(40)

    // But weighted positional average should favor the peaked career
    const peakedScore = weightedPositionalAverage(peaked)
    const flatScore = weightedPositionalAverage(flat)
    expect(peakedScore).toBeGreaterThan(flatScore)
  })

  it("weights decrease for later positions", () => {
    // First element should have more influence
    const highFirst = [100, 0, 0, 0, 0]
    const highLast = [0, 0, 0, 0, 100]

    expect(weightedPositionalAverage(highFirst)).toBeGreaterThan(
      weightedPositionalAverage(highLast)
    )
  })
})

describe("logPercentile", () => {
  const thresholds = { p25: 1000, p50: 10000, p75: 50000, p90: 200000, p99: 1000000 }

  it("returns null for null or zero values", () => {
    expect(logPercentile(null, thresholds)).toBeNull()
    expect(logPercentile(0, thresholds)).toBeNull()
    expect(logPercentile(-100, thresholds)).toBeNull()
  })

  it("returns low score for values below p25", () => {
    const score = logPercentile(500, thresholds)
    expect(score).not.toBeNull()
    expect(score!).toBeLessThan(25)
    expect(score!).toBeGreaterThan(0)
  })

  it("returns ~25 for p25 threshold", () => {
    const score = logPercentile(1000, thresholds)
    expect(score).toBeCloseTo(25, 0)
  })

  it("returns ~50 for p50 threshold", () => {
    const score = logPercentile(10000, thresholds)
    expect(score).toBeCloseTo(50, 0)
  })

  it("returns ~75 for p75 threshold", () => {
    const score = logPercentile(50000, thresholds)
    expect(score).toBeCloseTo(75, 0)
  })

  it("returns ~90 for p90 threshold", () => {
    const score = logPercentile(200000, thresholds)
    expect(score).toBeCloseTo(90, 0)
  })

  it("returns ~99 for p99 threshold", () => {
    const score = logPercentile(1000000, thresholds)
    expect(score).toBeCloseTo(99, 0)
  })

  it("caps at 100 for very high values", () => {
    const score = logPercentile(100000000, thresholds)
    expect(score).toBeLessThanOrEqual(100)
  })
})

describe("adjustBoxOfficeForEra", () => {
  it("returns null for null inputs", () => {
    expect(adjustBoxOfficeForEra(null, 2000, null)).toBeNull()
    expect(adjustBoxOfficeForEra(100000000, null, null)).toBeNull()
  })

  it("uses era stats inflation factor when available", () => {
    const eraStats = {
      year: 2000,
      inflation_factor: 2.0,
      median_box_office_cents: null,
      avg_box_office_cents: null,
      top_10_avg_box_office_cents: null,
      total_movies_released: null,
      avg_imdb_votes: null,
      avg_trakt_watchers: null,
    }
    const result = adjustBoxOfficeForEra(100000000, 2000, eraStats)
    expect(result).toBe(200000000)
  })

  it("uses fallback inflation when era stats not available", () => {
    const result = adjustBoxOfficeForEra(100000000, 2000, null)
    expect(result).not.toBeNull()
    // 24 years at 3% = ~2x inflation
    expect(result!).toBeGreaterThan(100000000)
  })
})

describe("calculateLongevityScore", () => {
  it("returns null for null inputs", () => {
    expect(calculateLongevityScore(null, 2020)).toBeNull()
    expect(calculateLongevityScore(10000, null)).toBeNull()
  })

  it("returns null for current year content", () => {
    expect(calculateLongevityScore(10000, 2024)).toBeNull()
  })

  it("returns higher score for older content with high engagement", () => {
    // Use moderate engagement to avoid hitting the 100 cap
    const oldWithModerateEngagement = calculateLongevityScore(20000, 1990)
    const recentWithModerateEngagement = calculateLongevityScore(20000, 2020)
    expect(oldWithModerateEngagement).not.toBeNull()
    expect(recentWithModerateEngagement).not.toBeNull()
    // Old content with same engagement demonstrates more longevity
    expect(oldWithModerateEngagement!).toBeGreaterThan(recentWithModerateEngagement!)
  })
})

describe("calculateRepeatViewership", () => {
  it("returns null for null or zero inputs", () => {
    expect(calculateRepeatViewership(null, 1000)).toBeNull()
    expect(calculateRepeatViewership(1000, null)).toBeNull()
    expect(calculateRepeatViewership(1000, 0)).toBeNull()
  })

  it("returns ~20 for 1:1 play/watch ratio", () => {
    const score = calculateRepeatViewership(10000, 10000)
    expect(score).toBeCloseTo(20, 0)
  })

  it("returns higher score for higher repeat viewership", () => {
    const lowRepeat = calculateRepeatViewership(15000, 10000)
    const highRepeat = calculateRepeatViewership(30000, 10000)
    expect(lowRepeat).not.toBeNull()
    expect(highRepeat).not.toBeNull()
    expect(highRepeat!).toBeGreaterThan(lowRepeat!)
  })
})

describe("calculateVoteGrowthRate", () => {
  it("returns null for null or invalid inputs", () => {
    expect(calculateVoteGrowthRate(null, 2020)).toBeNull()
    expect(calculateVoteGrowthRate(10000, null)).toBeNull()
    expect(calculateVoteGrowthRate(10000, 2025)).toBeNull() // Future year
  })

  it("returns higher score for faster vote accumulation", () => {
    const slow = calculateVoteGrowthRate(10000, 2000) // 10k over 24 years = ~417/yr
    const fast = calculateVoteGrowthRate(10000, 2022) // 10k over 2 years = 5000/yr
    expect(slow).not.toBeNull()
    expect(fast).not.toBeNull()
    expect(fast!).toBeGreaterThan(slow!)
  })
})

describe("calculateAwardsScore", () => {
  it("returns 0 for no awards", () => {
    expect(calculateAwardsScore(null, null)).toBe(0)
    expect(calculateAwardsScore(0, 0)).toBe(0)
  })

  it("counts wins higher than nominations", () => {
    const winsOnly = calculateAwardsScore(2, 0)
    const nomsOnly = calculateAwardsScore(0, 4) // 4 noms = 2 equivalent
    expect(winsOnly).toBeCloseTo(nomsOnly, 0)
  })

  it("returns higher score for more awards", () => {
    const few = calculateAwardsScore(1, 2)
    const many = calculateAwardsScore(10, 20)
    expect(many).toBeGreaterThan(few)
  })
})

describe("getBillingWeight", () => {
  it("returns exactly 1.0 for position 0 (lead, 0-based)", () => {
    expect(getBillingWeight(0)).toBeCloseTo(1.0, 5)
  })

  it("never exceeds 1.0 for any position", () => {
    // billing_order is 0-based; position 0 should be the maximum (1.0)
    expect(getBillingWeight(0)).toBeLessThanOrEqual(1.0)
    expect(getBillingWeight(1)).toBeLessThan(1.0)
  })

  it("returns smooth decay for increasing positions (0-based)", () => {
    const pos0 = getBillingWeight(0)
    const pos1 = getBillingWeight(1)
    const pos2 = getBillingWeight(2)
    const pos4 = getBillingWeight(4)
    const pos9 = getBillingWeight(9)
    const pos14 = getBillingWeight(14)
    const pos19 = getBillingWeight(19)

    // Values decrease monotonically
    expect(pos0).toBeGreaterThan(pos1)
    expect(pos1).toBeGreaterThan(pos2)
    expect(pos2).toBeGreaterThan(pos4)
    expect(pos4).toBeGreaterThan(pos9)
    expect(pos9).toBeGreaterThan(pos14)
    expect(pos14).toBeGreaterThan(pos19)

    // Verify specific hyperbolic decay values: 1/(1 + 0.15*n) where n is 0-based
    expect(pos1).toBeCloseTo(1.0 / (1 + 0.15 * 1), 5) // ~0.87
    expect(pos2).toBeCloseTo(1.0 / (1 + 0.15 * 2), 5) // ~0.77
    expect(pos4).toBeCloseTo(1.0 / (1 + 0.15 * 4), 5) // ~0.625
    expect(pos9).toBeCloseTo(1.0 / (1 + 0.15 * 9), 5) // ~0.426
  })

  it("returns 0.3 for null billing order", () => {
    expect(getBillingWeight(null)).toBe(0.3)
  })

  it("never reaches zero for any reasonable position", () => {
    // Even billing position 100 should produce a positive weight
    expect(getBillingWeight(100)).toBeGreaterThan(0)
    expect(getBillingWeight(100)).toBeCloseTo(1.0 / (1 + 0.15 * 100), 5)
  })
})

describe("getEpisodeWeight", () => {
  it("returns partial weight for null", () => {
    expect(getEpisodeWeight(null)).toBe(0.5)
  })

  it("returns proportional weight for low episode counts", () => {
    expect(getEpisodeWeight(5)).toBe(0.25)
    expect(getEpisodeWeight(10)).toBe(0.5)
  })

  it("returns full weight at threshold", () => {
    expect(getEpisodeWeight(20)).toBe(1.0)
  })

  it("caps at 1.0 for high episode counts", () => {
    expect(getEpisodeWeight(100)).toBe(1.0)
  })
})

describe("getLanguageMultiplier", () => {
  it("returns 1.0 for English", () => {
    expect(getLanguageMultiplier("en", false)).toBe(1.0)
  })

  it("returns specific multipliers for known languages", () => {
    expect(getLanguageMultiplier("es", false)).toBe(0.75)
    expect(getLanguageMultiplier("fr", false)).toBe(0.65)
    expect(getLanguageMultiplier("ja", false)).toBe(0.65)
    expect(getLanguageMultiplier("ko", false)).toBe(0.65)
    expect(getLanguageMultiplier("de", false)).toBe(0.55)
    expect(getLanguageMultiplier("it", false)).toBe(0.55)
    expect(getLanguageMultiplier("zh", false)).toBe(0.55)
    expect(getLanguageMultiplier("hi", false)).toBe(0.5)
    expect(getLanguageMultiplier("pt", false)).toBe(0.5)
    expect(getLanguageMultiplier("ru", false)).toBe(0.45)
  })

  it("returns default multiplier for unknown languages", () => {
    expect(getLanguageMultiplier("tl", false)).toBe(0.35)
    expect(getLanguageMultiplier("sw", false)).toBe(0.35)
  })

  it("returns default multiplier for null language", () => {
    expect(getLanguageMultiplier(null, false)).toBe(0.35)
  })

  it("is case insensitive", () => {
    expect(getLanguageMultiplier("EN", false)).toBe(1.0)
    expect(getLanguageMultiplier("Es", false)).toBe(0.75)
  })

  it("boosts US/UK production in non-English language", () => {
    // Spanish US/UK production: 0.75 + 0.20 = 0.95 → capped at 0.85
    expect(getLanguageMultiplier("es", true)).toBe(0.85)

    // Japanese US/UK production: 0.65 + 0.20 = 0.85
    expect(getLanguageMultiplier("ja", true)).toBe(0.85)

    // Russian US/UK production: 0.45 + 0.20 = 0.65
    expect(getLanguageMultiplier("ru", true)).toBe(0.65)
  })

  it("does not boost English US/UK productions (already 1.0)", () => {
    expect(getLanguageMultiplier("en", true)).toBe(1.0)
  })

  it("does not boost languages already above 0.8", () => {
    // English is at 1.0 which is >= 0.8, so no boost applied
    expect(getLanguageMultiplier("en", true)).toBe(1.0)
  })
})

describe("isSoleLead", () => {
  it("returns true for billing #0 with gap >= 2", () => {
    expect(isSoleLead(0, 2, 10)).toBe(true)
    expect(isSoleLead(0, 5, 10)).toBe(true)
  })

  it("returns false when nextBillingOrder is null (unknown, not sole)", () => {
    expect(isSoleLead(0, null, 10)).toBe(false)
  })

  it("returns false for co-leads (gap of 1)", () => {
    expect(isSoleLead(0, 1, 10)).toBe(false)
  })

  it("returns false for non-lead billing", () => {
    expect(isSoleLead(1, 3, 10)).toBe(false)
    expect(isSoleLead(2, null, 10)).toBe(false)
  })

  it("returns false for small cast", () => {
    expect(isSoleLead(0, 3, 4)).toBe(false)
    expect(isSoleLead(0, 3, null)).toBe(false)
  })

  it("returns false for null billing order", () => {
    expect(isSoleLead(null, 2, 10)).toBe(false)
  })
})

describe("calculateSoleLeadBonus", () => {
  it("returns 0 when not sole lead", () => {
    expect(calculateSoleLeadBonus(50, 1, 3, 10)).toBe(0) // Not billing #0
    expect(calculateSoleLeadBonus(50, 0, 1, 10)).toBe(0) // Co-lead
    expect(calculateSoleLeadBonus(50, 0, 3, 3)).toBe(0) // Small cast
  })

  it("returns 10% of contribution for sole lead", () => {
    const bonus = calculateSoleLeadBonus(50, 0, 3, 10)
    expect(bonus).toBeCloseTo(5, 5) // 10% of 50 = 5
  })

  it("scales with contribution size", () => {
    const smallBonus = calculateSoleLeadBonus(20, 0, 3, 10)
    const largeBonus = calculateSoleLeadBonus(80, 0, 3, 10)
    expect(largeBonus).toBeGreaterThan(smallBonus)
    expect(smallBonus).toBeCloseTo(2, 5)
    expect(largeBonus).toBeCloseTo(8, 5)
  })
})

describe("calculateConsistentStarMultiplier", () => {
  it("returns 1.0 when below threshold", () => {
    const appearances = [
      makeAppearance({ billingOrder: 0, contentDofPopularity: 80 }),
      makeAppearance({ billingOrder: 0, contentDofPopularity: 70 }),
    ]
    expect(calculateConsistentStarMultiplier(appearances)).toBe(1.0)
  })

  it("returns 1.0 for non-lead roles", () => {
    const appearances = Array(5).fill(makeAppearance({ billingOrder: 3, contentDofPopularity: 80 }))
    expect(calculateConsistentStarMultiplier(appearances)).toBe(1.0)
  })

  it("returns 1.0 for leads in unpopular content", () => {
    const appearances = Array(5).fill(makeAppearance({ billingOrder: 0, contentDofPopularity: 30 }))
    expect(calculateConsistentStarMultiplier(appearances)).toBe(1.0)
  })

  it("returns 1.05 at threshold (3 qualifying movies)", () => {
    const appearances = [
      makeAppearance({ billingOrder: 0, contentDofPopularity: 80 }),
      makeAppearance({ billingOrder: 0, contentDofPopularity: 70 }),
      makeAppearance({ billingOrder: 0, contentDofPopularity: 65 }),
    ]
    expect(calculateConsistentStarMultiplier(appearances)).toBeCloseTo(1.05, 5)
  })

  it("returns 1.10 at 8+ qualifying movies", () => {
    const appearances = Array(8).fill(makeAppearance({ billingOrder: 0, contentDofPopularity: 80 }))
    expect(calculateConsistentStarMultiplier(appearances)).toBeCloseTo(1.1, 5)
  })

  it("scales linearly between 3 and 8 qualifying movies", () => {
    const make = (n: number) =>
      Array(n).fill(makeAppearance({ billingOrder: 0, contentDofPopularity: 80 }))

    const at3 = calculateConsistentStarMultiplier(make(3))
    const at5 = calculateConsistentStarMultiplier(make(5))
    const at8 = calculateConsistentStarMultiplier(make(8))

    expect(at5).toBeGreaterThan(at3)
    expect(at8).toBeGreaterThan(at5)
  })

  it("ignores TV shows (only counts movies)", () => {
    const appearances = Array(5).fill(
      makeAppearance({ billingOrder: 0, contentDofPopularity: 80, isMovie: false })
    )
    expect(calculateConsistentStarMultiplier(appearances)).toBe(1.0)
  })
})

describe("calculateMultiFactorConfidence", () => {
  it("returns low confidence for minimal input", () => {
    const confidence = calculateMultiFactorConfidence({
      appearanceCount: 1,
      signalCount: 1,
      contributions: [30],
    })
    expect(confidence).toBeLessThan(0.5)
  })

  it("returns high confidence for rich input", () => {
    const confidence = calculateMultiFactorConfidence({
      appearanceCount: 15,
      signalCount: 5,
      contributions: [80, 75, 70, 65, 60, 55, 50, 45, 40, 35],
    })
    expect(confidence).toBeGreaterThan(0.7)
  })

  it("signal coverage affects confidence", () => {
    const lowSignals = calculateMultiFactorConfidence({
      appearanceCount: 10,
      signalCount: 1,
      contributions: [70, 65, 60, 55, 50, 45, 40, 35, 30, 25],
    })
    const highSignals = calculateMultiFactorConfidence({
      appearanceCount: 10,
      signalCount: 5,
      contributions: [70, 65, 60, 55, 50, 45, 40, 35, 30, 25],
    })
    expect(highSignals).toBeGreaterThan(lowSignals)
  })

  it("high variance reduces confidence", () => {
    const uniform = calculateMultiFactorConfidence({
      appearanceCount: 5,
      signalCount: 3,
      contributions: [50, 50, 50, 50, 50],
    })
    const varied = calculateMultiFactorConfidence({
      appearanceCount: 5,
      signalCount: 3,
      contributions: [90, 70, 30, 10, 5],
    })
    expect(uniform).toBeGreaterThan(varied)
  })

  it("top contribution strength affects confidence", () => {
    const weak = calculateMultiFactorConfidence({
      appearanceCount: 5,
      signalCount: 3,
      contributions: [20, 15, 10, 8, 5],
    })
    const strong = calculateMultiFactorConfidence({
      appearanceCount: 5,
      signalCount: 3,
      contributions: [80, 75, 70, 65, 60],
    })
    expect(strong).toBeGreaterThan(weak)
  })

  it("is clamped to [0, 1]", () => {
    const confidence = calculateMultiFactorConfidence({
      appearanceCount: 100,
      signalCount: 5,
      contributions: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
    })
    expect(confidence).toBeLessThanOrEqual(1.0)
    expect(confidence).toBeGreaterThanOrEqual(0)
  })
})

describe("applyActorBayesianAdjustment", () => {
  it("pulls low-confidence scores toward prior mean (30)", () => {
    const adjusted = applyActorBayesianAdjustment(80, 0.1)
    // With low confidence, score should be pulled toward 30
    expect(adjusted).toBeLessThan(80)
    expect(adjusted).toBeGreaterThan(30)
  })

  it("barely changes high-confidence scores", () => {
    const adjusted = applyActorBayesianAdjustment(80, 0.9)
    // With high confidence (0.9), formula: 0.9/(0.9+0.15)*80 + 0.15/(0.9+0.15)*30 ≈ 72.9
    // Still pulled somewhat toward prior, but much less than low confidence
    expect(adjusted).toBeGreaterThan(70)
    expect(adjusted).toBeLessThanOrEqual(80)
  })

  it("low scores below prior mean get pulled up", () => {
    const adjusted = applyActorBayesianAdjustment(10, 0.2)
    expect(adjusted).toBeGreaterThan(10)
    expect(adjusted).toBeLessThan(30)
  })

  it("scores at prior mean are unchanged regardless of confidence", () => {
    const adjusted = applyActorBayesianAdjustment(30, 0.3)
    expect(adjusted).toBeCloseTo(30, 5)
  })
})

describe("calculateMoviePopularity", () => {
  const baseInput: ContentPopularityInput = {
    releaseYear: 2020,
    boxOfficeCents: null,
    traktWatchers: null,
    traktPlays: null,
    imdbVotes: null,
    tmdbPopularity: null,
    isUSUKProduction: false,
    originalLanguage: "en",
    awardsWins: null,
    awardsNominations: null,
    aggregateScore: null,
    eraStats: null,
  }

  it("returns null scores when insufficient data", () => {
    const result = calculateMoviePopularity(baseInput)
    expect(result.dofPopularity).toBeNull()
    expect(result.dofWeight).toBeNull()
    expect(result.confidence).toBe(0)
  })

  it("calculates score with sufficient data", () => {
    const input: ContentPopularityInput = {
      ...baseInput,
      traktWatchers: 50000,
      imdbVotes: 100000,
      tmdbPopularity: 50,
    }
    const result = calculateMoviePopularity(input)
    expect(result.dofPopularity).not.toBeNull()
    expect(result.dofPopularity!).toBeGreaterThan(0)
    expect(result.dofPopularity!).toBeLessThanOrEqual(100)
    expect(result.confidence).toBeGreaterThan(0)
  })

  it("gives higher score to more popular movies", () => {
    const lowPop: ContentPopularityInput = {
      ...baseInput,
      traktWatchers: 5000,
      imdbVotes: 10000,
      tmdbPopularity: 10,
    }
    const highPop: ContentPopularityInput = {
      ...baseInput,
      traktWatchers: 500000,
      imdbVotes: 1000000,
      tmdbPopularity: 200,
    }
    const lowResult = calculateMoviePopularity(lowPop)
    const highResult = calculateMoviePopularity(highPop)
    expect(highResult.dofPopularity!).toBeGreaterThan(lowResult.dofPopularity!)
  })

  it("gives US/UK production bonus", () => {
    const nonUsUk: ContentPopularityInput = {
      ...baseInput,
      traktWatchers: 50000,
      imdbVotes: 100000,
      isUSUKProduction: false,
    }
    const usUk: ContentPopularityInput = {
      ...nonUsUk,
      isUSUKProduction: true,
    }
    const nonUsUkResult = calculateMoviePopularity(nonUsUk)
    const usUkResult = calculateMoviePopularity(usUk)
    expect(usUkResult.dofPopularity!).toBeGreaterThan(nonUsUkResult.dofPopularity!)
  })

  it("applies graduated penalty for non-English content", () => {
    const englishMovie: ContentPopularityInput = {
      ...baseInput,
      traktWatchers: 50000,
      imdbVotes: 100000,
      tmdbPopularity: 50,
      originalLanguage: "en",
    }
    const spanishMovie: ContentPopularityInput = {
      ...englishMovie,
      originalLanguage: "es",
    }
    const russianMovie: ContentPopularityInput = {
      ...englishMovie,
      originalLanguage: "ru",
    }
    const englishResult = calculateMoviePopularity(englishMovie)
    const spanishResult = calculateMoviePopularity(spanishMovie)
    const russianResult = calculateMoviePopularity(russianMovie)

    // Spanish (0.75) should be less than English (1.0) but more than Russian (0.45)
    expect(spanishResult.dofPopularity!).toBeLessThan(englishResult.dofPopularity!)
    expect(spanishResult.dofPopularity!).toBeGreaterThan(russianResult.dofPopularity!)

    // Spanish should be roughly 75% of English
    const ratio = spanishResult.dofPopularity! / englishResult.dofPopularity!
    expect(ratio).toBeCloseTo(0.75, 1)
  })

  it("applies penalty for null language (treated as unknown)", () => {
    const englishMovie: ContentPopularityInput = {
      ...baseInput,
      traktWatchers: 50000,
      imdbVotes: 100000,
      originalLanguage: "en",
    }
    const unknownLangMovie: ContentPopularityInput = {
      ...englishMovie,
      originalLanguage: null,
    }
    const englishResult = calculateMoviePopularity(englishMovie)
    const unknownResult = calculateMoviePopularity(unknownLangMovie)

    expect(unknownResult.dofPopularity!).toBeLessThan(englishResult.dofPopularity!)
  })

  it("boosts US/UK production in non-English language", () => {
    const foreignProd: ContentPopularityInput = {
      ...baseInput,
      traktWatchers: 50000,
      imdbVotes: 100000,
      tmdbPopularity: 50,
      originalLanguage: "ja",
      isUSUKProduction: false,
    }
    const usukProd: ContentPopularityInput = {
      ...foreignProd,
      isUSUKProduction: true,
    }
    const foreignResult = calculateMoviePopularity(foreignProd)
    const usukResult = calculateMoviePopularity(usukProd)

    // US/UK production gets both the production bonus and the language boost
    expect(usukResult.dofPopularity!).toBeGreaterThan(foreignResult.dofPopularity!)
  })
})

describe("calculateShowPopularity", () => {
  const baseInput: ShowPopularityInput = {
    releaseYear: 2020,
    boxOfficeCents: null,
    traktWatchers: null,
    traktPlays: null,
    imdbVotes: null,
    tmdbPopularity: null,
    isUSUKProduction: false,
    originalLanguage: "en",
    awardsWins: null,
    awardsNominations: null,
    aggregateScore: null,
    eraStats: null,
    numberOfSeasons: null,
    numberOfEpisodes: null,
  }

  it("returns null scores when insufficient data", () => {
    const result = calculateShowPopularity(baseInput)
    expect(result.dofPopularity).toBeNull()
    expect(result.confidence).toBe(0)
  })

  it("calculates score with sufficient data", () => {
    const input: ShowPopularityInput = {
      ...baseInput,
      traktWatchers: 100000,
      imdbVotes: 200000,
      tmdbPopularity: 80,
    }
    const result = calculateShowPopularity(input)
    expect(result.dofPopularity).not.toBeNull()
    expect(result.dofPopularity!).toBeGreaterThan(0)
  })
})

describe("calculateActorPopularity", () => {
  // Helper to create base input with all signals
  const makeInput = (overrides: Partial<ActorPopularityInput> = {}): ActorPopularityInput => ({
    appearances: [],
    tmdbPopularity: null,
    wikipediaAnnualPageviews: null,
    wikidataSitelinks: null,
    actorAwardsScore: null,
    ...overrides,
  })

  it("returns null for empty filmography", () => {
    const result = calculateActorPopularity(makeInput())
    expect(result.dofPopularity).toBeNull()
    expect(result.confidence).toBe(0)
  })

  it("calculates score from filmography", () => {
    const result = calculateActorPopularity(
      makeInput({
        appearances: [
          makeAppearance({ contentDofPopularity: 80, contentDofWeight: 70, billingOrder: 0 }),
          makeAppearance({ contentDofPopularity: 60, contentDofWeight: 50, billingOrder: 2 }),
        ],
        tmdbPopularity: 50,
      })
    )
    expect(result.dofPopularity).not.toBeNull()
    expect(result.dofPopularity!).toBeGreaterThan(0)
  })

  it("weights lead roles higher than supporting", () => {
    const leadResult = calculateActorPopularity(
      makeInput({
        appearances: [makeAppearance({ billingOrder: 0 })],
      })
    )
    const supportingResult = calculateActorPopularity(
      makeInput({
        appearances: [makeAppearance({ billingOrder: 10 })],
      })
    )
    expect(leadResult.dofPopularity!).toBeGreaterThan(supportingResult.dofPopularity!)
  })

  it("weights TV by episode count", () => {
    const fewResult = calculateActorPopularity(
      makeInput({
        appearances: [makeAppearance({ episodeCount: 5, isMovie: false })],
      })
    )
    const manyResult = calculateActorPopularity(
      makeInput({
        appearances: [makeAppearance({ episodeCount: 50, isMovie: false })],
      })
    )
    expect(manyResult.dofPopularity!).toBeGreaterThan(fewResult.dofPopularity!)
  })

  it("has higher confidence with more appearances", () => {
    const fewResult = calculateActorPopularity(
      makeInput({
        appearances: [makeAppearance()],
      })
    )
    const manyResult = calculateActorPopularity(
      makeInput({
        appearances: Array(15).fill(makeAppearance()),
      })
    )
    expect(manyResult.confidence).toBeGreaterThan(fewResult.confidence)
  })

  it("uses top N appearances so prolific actors aren't penalized", () => {
    const smallResult = calculateActorPopularity(
      makeInput({
        appearances: [
          makeAppearance({ contentDofPopularity: 80, contentDofWeight: 70, billingOrder: 5 }),
          makeAppearance({ contentDofPopularity: 75, contentDofWeight: 65, billingOrder: 9 }),
        ],
      })
    )

    const largeResult = calculateActorPopularity(
      makeInput({
        appearances: [
          ...Array(10).fill(
            makeAppearance({ contentDofPopularity: 85, contentDofWeight: 75, billingOrder: 0 })
          ),
          ...Array(5).fill(
            makeAppearance({ contentDofPopularity: 40, contentDofWeight: 35, billingOrder: 8 })
          ),
        ],
      })
    )

    expect(largeResult.dofPopularity!).toBeGreaterThan(smallResult.dofPopularity!)
  })

  it("minor roles beyond top 10 don't affect score", () => {
    const baseResult = calculateActorPopularity(
      makeInput({
        appearances: Array(10).fill(makeAppearance()),
      })
    )

    const extendedResult = calculateActorPopularity(
      makeInput({
        appearances: [
          ...Array(10).fill(makeAppearance()),
          ...Array(20).fill(
            makeAppearance({ contentDofPopularity: 20, contentDofWeight: 15, billingOrder: 20 })
          ),
        ],
      })
    )

    // Scores should be identical - minor roles beyond top 10 don't count
    expect(extendedResult.dofPopularity!).toBe(baseResult.dofPopularity!)
  })

  it("TMDB contributes ~15% not 30%", () => {
    const noTmdbResult = calculateActorPopularity(
      makeInput({
        appearances: Array(5).fill(
          makeAppearance({ contentDofPopularity: 80, contentDofWeight: 70 })
        ),
        tmdbPopularity: null,
      })
    )

    const highTmdbResult = calculateActorPopularity(
      makeInput({
        appearances: Array(5).fill(
          makeAppearance({ contentDofPopularity: 80, contentDofWeight: 70 })
        ),
        tmdbPopularity: 500, // p99 level
      })
    )

    // TMDB should increase score, but not by more than ~30%
    const percentIncrease =
      ((highTmdbResult.dofPopularity! - noTmdbResult.dofPopularity!) /
        noTmdbResult.dofPopularity!) *
      100
    expect(percentIncrease).toBeGreaterThan(0)
    expect(percentIncrease).toBeLessThan(35)
  })

  it("Wikipedia pageviews contribute to scoring", () => {
    const noWikiResult = calculateActorPopularity(
      makeInput({
        appearances: Array(5).fill(makeAppearance()),
        tmdbPopularity: 50,
      })
    )

    const highWikiResult = calculateActorPopularity(
      makeInput({
        appearances: Array(5).fill(makeAppearance()),
        tmdbPopularity: 50,
        wikipediaAnnualPageviews: 1_000_000, // p90 level
      })
    )

    expect(highWikiResult.dofPopularity!).toBeGreaterThan(noWikiResult.dofPopularity!)
  })

  it("falls back gracefully when Wikipedia data is missing", () => {
    const withWikiResult = calculateActorPopularity(
      makeInput({
        appearances: Array(5).fill(makeAppearance()),
        tmdbPopularity: 50,
        wikipediaAnnualPageviews: 50000,
      })
    )

    const withoutWikiResult = calculateActorPopularity(
      makeInput({
        appearances: Array(5).fill(makeAppearance()),
        tmdbPopularity: 50,
      })
    )

    // Both should produce valid scores
    expect(withWikiResult.dofPopularity).not.toBeNull()
    expect(withoutWikiResult.dofPopularity).not.toBeNull()

    // Scores should be in reasonable range
    expect(withoutWikiResult.dofPopularity!).toBeGreaterThan(0)
    expect(withoutWikiResult.dofPopularity!).toBeLessThanOrEqual(100)
  })

  it("Wikidata sitelinks contribute to scoring", () => {
    const noSitelinksResult = calculateActorPopularity(
      makeInput({
        appearances: Array(5).fill(makeAppearance()),
        tmdbPopularity: 50,
      })
    )

    const highSitelinksResult = calculateActorPopularity(
      makeInput({
        appearances: Array(5).fill(makeAppearance()),
        tmdbPopularity: 50,
        wikidataSitelinks: 75, // p90 level
      })
    )

    expect(highSitelinksResult.dofPopularity!).toBeGreaterThan(noSitelinksResult.dofPopularity!)
  })

  it("sitelinks weight is small (~5%)", () => {
    const baseResult = calculateActorPopularity(
      makeInput({
        appearances: Array(5).fill(makeAppearance()),
        tmdbPopularity: 50,
        wikipediaAnnualPageviews: 100_000,
      })
    )

    const withSitelinksResult = calculateActorPopularity(
      makeInput({
        appearances: Array(5).fill(makeAppearance()),
        tmdbPopularity: 50,
        wikipediaAnnualPageviews: 100_000,
        wikidataSitelinks: 100, // p99 level
      })
    )

    const percentIncrease =
      ((withSitelinksResult.dofPopularity! - baseResult.dofPopularity!) /
        baseResult.dofPopularity!) *
      100
    expect(percentIncrease).toBeGreaterThan(0)
    expect(percentIncrease).toBeLessThan(10) // 5% weight shouldn't shift more than ~10%
  })

  it("combines all five signals correctly", () => {
    const result = calculateActorPopularity(
      makeInput({
        appearances: Array(5).fill(
          makeAppearance({ contentDofPopularity: 80, contentDofWeight: 70 })
        ),
        tmdbPopularity: 100, // p90
        wikipediaAnnualPageviews: 1_000_000, // p90
        wikidataSitelinks: 75, // p90
        actorAwardsScore: 60, // Strong awards
      })
    )

    // All signals present: filmography 60% + TMDB 15% + Wikipedia 15% + Sitelinks 5% + Awards 5%
    expect(result.dofPopularity).not.toBeNull()
    expect(result.dofPopularity!).toBeGreaterThan(50)
    expect(result.dofPopularity!).toBeLessThanOrEqual(100)
  })

  it("normalizes weights when signals are missing", () => {
    const result = calculateActorPopularity(
      makeInput({
        appearances: Array(5).fill(makeAppearance()),
      })
    )

    // When only filmography is available, score is normalized then Bayesian-adjusted
    expect(result.dofPopularity).not.toBeNull()
    expect(result.dofPopularity!).toBeGreaterThan(0)
  })

  it("peak-performance blend rewards peaked careers", () => {
    // Two actors with same billing orders but different contribution profiles.
    // Actor A: one blockbuster + minor roles (peaked)
    const peaked = calculateActorPopularity(
      makeInput({
        appearances: [
          makeAppearance({ contentDofPopularity: 95, contentDofWeight: 90 }),
          ...Array(9).fill(makeAppearance({ contentDofPopularity: 30, contentDofWeight: 25 })),
        ],
      })
    )

    // Actor B: all mediocre roles (flat)
    const flat = calculateActorPopularity(
      makeInput({
        appearances: Array(10).fill(
          makeAppearance({ contentDofPopularity: 40, contentDofWeight: 35 })
        ),
      })
    )

    // The peaked career should score higher due to the peak blend
    expect(peaked.dofPopularity!).toBeGreaterThan(flat.dofPopularity!)
  })

  it("awards signal boosts score", () => {
    const noAwardsResult = calculateActorPopularity(
      makeInput({
        appearances: Array(5).fill(makeAppearance()),
        tmdbPopularity: 50,
      })
    )

    const withAwardsResult = calculateActorPopularity(
      makeInput({
        appearances: Array(5).fill(makeAppearance()),
        tmdbPopularity: 50,
        actorAwardsScore: 80,
      })
    )

    expect(withAwardsResult.dofPopularity!).toBeGreaterThan(noAwardsResult.dofPopularity!)
  })

  it("sole-lead bonus boosts contributions", () => {
    const noBonus = calculateActorPopularity(
      makeInput({
        appearances: Array(5).fill(
          makeAppearance({
            contentDofPopularity: 80,
            contentDofWeight: 70,
            billingOrder: 0,
            castSize: 10,
            nextBillingOrder: 1, // Co-lead, no bonus
          })
        ),
      })
    )

    const withBonus = calculateActorPopularity(
      makeInput({
        appearances: Array(5).fill(
          makeAppearance({
            contentDofPopularity: 80,
            contentDofWeight: 70,
            billingOrder: 0,
            castSize: 10,
            nextBillingOrder: 3, // Sole lead, gets bonus
          })
        ),
      })
    )

    expect(withBonus.dofPopularity!).toBeGreaterThan(noBonus.dofPopularity!)
  })

  it("Bayesian regression pulls low-confidence scores toward 30", () => {
    // Actor with very few appearances and only filmography signal
    const lowConfidence = calculateActorPopularity(
      makeInput({
        appearances: [
          makeAppearance({ contentDofPopularity: 90, contentDofWeight: 85, billingOrder: 0 }),
        ],
      })
    )

    // The raw filmography score would be high (~88), but Bayesian should pull toward 30
    // With low confidence, score is regressed
    expect(lowConfidence.dofPopularity!).toBeLessThan(88)
  })

  it("high-confidence scores barely change from Bayesian regression", () => {
    // Actor with many appearances and all signals
    const highConfidence = calculateActorPopularity(
      makeInput({
        appearances: Array(15).fill(
          makeAppearance({ contentDofPopularity: 80, contentDofWeight: 70 })
        ),
        tmdbPopularity: 100,
        wikipediaAnnualPageviews: 500_000,
        wikidataSitelinks: 50,
        actorAwardsScore: 40,
      })
    )

    // Should be close to what raw score would be
    expect(highConfidence.dofPopularity!).toBeGreaterThan(55)
  })
})

describe("isUSUKProduction", () => {
  it("returns false for null or empty", () => {
    expect(isUSUKProduction(null)).toBe(false)
    expect(isUSUKProduction([])).toBe(false)
  })

  it("recognizes US codes", () => {
    expect(isUSUKProduction(["US"])).toBe(true)
    expect(isUSUKProduction(["USA"])).toBe(true)
  })

  it("recognizes UK codes", () => {
    expect(isUSUKProduction(["GB"])).toBe(true)
    expect(isUSUKProduction(["UK"])).toBe(true)
  })

  it("returns true when US/UK in array", () => {
    expect(isUSUKProduction(["FR", "DE", "US"])).toBe(true)
  })

  it("returns false for non-US/UK only", () => {
    expect(isUSUKProduction(["FR", "DE", "JP"])).toBe(false)
  })
})

describe("isEnglishLanguage", () => {
  it("returns false for null", () => {
    expect(isEnglishLanguage(null)).toBe(false)
  })

  it("returns true for 'en'", () => {
    expect(isEnglishLanguage("en")).toBe(true)
  })

  it("is case insensitive", () => {
    expect(isEnglishLanguage("EN")).toBe(true)
    expect(isEnglishLanguage("En")).toBe(true)
  })

  it("returns false for other languages", () => {
    expect(isEnglishLanguage("es")).toBe(false) // Spanish
    expect(isEnglishLanguage("fr")).toBe(false) // French
    expect(isEnglishLanguage("ja")).toBe(false) // Japanese
    expect(isEnglishLanguage("ko")).toBe(false) // Korean
  })
})
