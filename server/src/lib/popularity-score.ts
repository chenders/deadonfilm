/**
 * DOF Popularity Score Calculation
 *
 * Calculates "Dead on Film" popularity scores for movies, shows, and actors
 * by combining multiple engagement signals into a unified 0-100 scale.
 *
 * Movies/Shows get two scores:
 * - dof_popularity: How well-known/popular the content is (audience size)
 * - dof_weight: Cultural staying power (how much it should count for actors)
 *
 * Actors get their popularity derived from their filmography.
 */

/**
 * Bump this version whenever the score calculation logic changes.
 * - Major: structural changes (new signals, removed signals, changed blending)
 * - Minor: tuning changes (weight adjustments, threshold tweaks)
 *
 * Version history:
 * 1.0 - Initial algorithm baseline
 * 1.1 - Fix scheduled job bugs (×100 TMDB, sum-all vs top-10, normalization)
 * 2.0 - Weighted positional scoring, reduce TMDB weight 30%→15%, add Wikipedia pageviews 15%
 * 3.0 - Smooth billing weights, Wikidata sitelinks signal, graduated language penalty, peak-performance blend
 * 4.0 - Enhanced awards signal (5%), star power filmography modifiers, multi-factor Bayesian confidence
 */
export const ALGORITHM_VERSION = "4.0"

// ============================================================================
// Types
// ============================================================================

export interface EraReferenceStats {
  year: number
  median_box_office_cents: number | null
  avg_box_office_cents: number | null
  top_10_avg_box_office_cents: number | null
  inflation_factor: number | null
  total_movies_released: number | null
  avg_imdb_votes: number | null
  avg_trakt_watchers: number | null
}

export interface ContentPopularityInput {
  // Identifiers
  releaseYear: number | null

  // Box office (movies only)
  boxOfficeCents: number | null

  // Engagement metrics
  traktWatchers: number | null
  traktPlays: number | null
  imdbVotes: number | null
  tmdbPopularity: number | null

  // Production info
  isUSUKProduction: boolean
  originalLanguage: string | null // ISO 639-1 code (e.g., 'en', 'es', 'fr')

  // Awards
  awardsWins: number | null
  awardsNominations: number | null

  // Aggregate score (optional - used for dof_weight if available)
  aggregateScore: number | null // 0-10 scale from our aggregate scoring system

  // Era reference for normalization
  eraStats: EraReferenceStats | null
}

export interface ContentPopularityResult {
  dofPopularity: number | null // 0-100 score
  dofWeight: number | null // 0-100 score
  confidence: number // 0-1 confidence
  sourcesUsed: number
}

export interface ShowPopularityInput extends ContentPopularityInput {
  // Shows don't have box office, but have additional metrics
  numberOfSeasons: number | null
  numberOfEpisodes: number | null
}

export interface ActorPopularityInput {
  // Filmography appearances with their scores
  appearances: ActorAppearance[]
  // Actor's TMDB popularity for recency signal
  tmdbPopularity: number | null
  // Wikipedia annual pageviews as a fame signal
  wikipediaAnnualPageviews: number | null
  // Wikidata sitelinks count (number of Wikipedia language editions)
  wikidataSitelinks: number | null
  // Actor-level awards score from Wikidata (0-100)
  actorAwardsScore: number | null
}

export interface ActorAppearance {
  contentDofPopularity: number | null
  contentDofWeight: number | null
  billingOrder: number | null
  episodeCount: number | null // For TV shows
  isMovie: boolean
  // Star power fields (Proposal 11)
  castSize: number | null // Total cast count for this content
  nextBillingOrder: number | null // Billing order of the next-billed actor
}

export interface ActorPopularityResult {
  dofPopularity: number | null // 0-100 score
  confidence: number // 0-1 confidence
}

// ============================================================================
// Constants
// ============================================================================

// Signal weights for movie/show popularity score
// Total = 1.0 when all sources available
const POPULARITY_WEIGHTS = {
  boxOffice: 0.25, // Era-adjusted box office (movies only)
  traktWatchers: 0.2, // Log-scaled percentile
  traktPlays: 0.1, // Repeat engagement signal
  imdbVotes: 0.2, // Log-scaled percentile
  tmdbPopularity: 0.15, // Recent trending signal
  usUkProduction: 0.05, // Binary bonus for English-language market
  awards: 0.05, // Wins + nominations/2
} as const

// Signal weights for content weight score (cultural staying power)
const WEIGHT_WEIGHTS = {
  longevity: 0.3, // Engagement relative to age
  repeatViewership: 0.25, // plays/watchers ratio
  voteGrowthRate: 0.2, // IMDb votes / years since release
  aggregateScore: 0.15, // Critical recognition
  awards: 0.1, // Cultural recognition
} as const

// Thresholds for percentile calculations (approximate)
const PERCENTILE_THRESHOLDS = {
  // Log-scaled thresholds for different engagement levels
  imdbVotes: {
    p25: 1000,
    p50: 10000,
    p75: 50000,
    p90: 200000,
    p99: 1000000,
  },
  traktWatchers: {
    p25: 500,
    p50: 5000,
    p75: 25000,
    p90: 100000,
    p99: 500000,
  },
  traktPlays: {
    p25: 1000,
    p50: 10000,
    p75: 50000,
    p90: 200000,
    p99: 1000000,
  },
  tmdbPopularity: {
    p25: 5,
    p50: 15,
    p75: 40,
    p90: 100,
    p99: 500,
  },
  wikipediaAnnualPageviews: {
    p25: 10_000,
    p50: 50_000,
    p75: 200_000,
    p90: 1_000_000,
    p99: 10_000_000,
  },
  boxOfficeCents: {
    // In 2024 dollars
    p25: 1_000_000_00, // $1M
    p50: 10_000_000_00, // $10M
    p75: 50_000_000_00, // $50M
    p90: 200_000_000_00, // $200M
    p99: 1_000_000_000_00, // $1B
  },
  wikidataSitelinks: {
    p25: 10,
    p50: 25,
    p75: 50,
    p90: 75,
    p99: 100,
  },
} as const

// Hyperbolic decay rate for billing order (Proposal 04)
// 0-based: position 0→1.0, 1→0.87, 2→0.77, 4→0.63, 9→0.43, 14→0.32, 19→0.26
const BILLING_DECAY_RATE = 0.15

// Default billing weight when billing order is unknown
const BILLING_NULL_WEIGHT = 0.3

// Episode count threshold for full TV weight
const FULL_TV_WEIGHT_EPISODES = 20

// Minimum appearances for full actor confidence
const MIN_APPEARANCES_FULL_CONFIDENCE = 10

// Maximum appearances to consider for actor score (use top N)
// This prevents prolific actors from being penalized for having many minor roles
const MAX_APPEARANCES_FOR_SCORE = 10

// Actor score composition (must sum to 1.0 for clarity; normalization
// still handles missing signals gracefully)
const ACTOR_FILMOGRAPHY_WEIGHT = 0.6
const ACTOR_TMDB_RECENCY_WEIGHT = 0.15
const ACTOR_WIKIPEDIA_WEIGHT = 0.15
const ACTOR_SITELINKS_WEIGHT = 0.05
const ACTOR_AWARDS_WEIGHT = 0.05

// Total signal count for confidence calculation
const TOTAL_ACTOR_SIGNAL_COUNT = 5 // filmography, TMDB, Wikipedia, sitelinks, awards

// Peak-performance blend weights (Proposal 08)
const PEAK_WEIGHT = 0.4
const BREADTH_WEIGHT = 0.6
const PEAK_TOP_N = 3

// Exponential decay factor for weighted positional scoring (Proposal 02)
// Each successive top-N contribution is worth 85% of the previous one,
// emphasizing peak career over consistent-but-flat careers.
const POSITIONAL_DECAY = 0.85

// Star power constants (Proposal 11)
/** Minimum cast size for sole-lead detection */
const SOLE_LEAD_MIN_CAST_SIZE = 5
/** Sole-lead bonus as fraction of contribution */
const SOLE_LEAD_BONUS_FRACTION = 0.1
/** Minimum billing gap to qualify as sole lead (nextBillingOrder >= this) */
const SOLE_LEAD_MIN_BILLING_GAP = 2
/** Minimum popular movies (#0 billing + popularity >= 60) for consistent-star */
const CONSISTENT_STAR_MIN_MOVIES = 3
/** Content popularity threshold for consistent-star qualifying movies */
const CONSISTENT_STAR_POPULARITY_THRESHOLD = 60
/** Maximum consistent-star multiplier (at 8+ qualifying movies) */
const CONSISTENT_STAR_MAX_MULTIPLIER = 1.1
/** Minimum consistent-star multiplier (at threshold qualifying movies) */
const CONSISTENT_STAR_MIN_MULTIPLIER = 1.05

// Bayesian confidence regression constants (Proposal 09)
/** Prior mean for Bayesian regression — regress toward this score */
const ACTOR_PRIOR_MEAN = 30
/** Regression strength (lower = less regression than aggregate-score's 0.4) */
const ACTOR_REGRESSION_STRENGTH = 0.15

// Multi-factor confidence weights (Proposal 09)
const CONFIDENCE_APPEARANCE_WEIGHT = 0.3
const CONFIDENCE_SIGNAL_COVERAGE_WEIGHT = 0.3
const CONFIDENCE_VARIANCE_WEIGHT = 0.2
const CONFIDENCE_TOP_STRENGTH_WEIGHT = 0.2

// Current reference year for era adjustments
const REFERENCE_YEAR = 2024

// Minimum sources for a valid score
const MIN_SOURCES_FOR_SCORE = 2

// Graduated language multipliers (Proposal 07)
// Different languages get different multipliers based on US audience familiarity.
const LANGUAGE_MULTIPLIERS: Record<string, number> = {
  en: 1.0,
  es: 0.75,
  fr: 0.65,
  ja: 0.65,
  ko: 0.65,
  de: 0.55,
  it: 0.55,
  zh: 0.55,
  hi: 0.5,
  pt: 0.5,
  ru: 0.45,
  sv: 0.45,
  da: 0.45,
}
const DEFAULT_LANGUAGE_MULTIPLIER = 0.35

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Weighted positional average with exponential decay.
 *
 * Given a sorted (descending) array of contributions, applies exponential
 * decay so that the top contribution matters most and each subsequent one
 * matters 85% as much as the previous. This rewards peaked careers over
 * flat ones (the "Tom Cruise Problem").
 *
 * For uniform contributions, this produces the same result as a simple average.
 */
export function weightedPositionalAverage(contributions: number[]): number {
  if (contributions.length === 0) return 0

  let weightedSum = 0
  let totalWeight = 0
  for (let i = 0; i < contributions.length; i++) {
    const weight = Math.pow(POSITIONAL_DECAY, i)
    weightedSum += contributions[i] * weight
    totalWeight += weight
  }
  return weightedSum / totalWeight
}

/**
 * Calculate log-percentile position for a value
 *
 * Uses logarithmic scaling because engagement metrics follow power-law distributions.
 * Returns 0-100 score based on approximate percentile position.
 */
export function logPercentile(
  value: number | null,
  thresholds: { p25: number; p50: number; p75: number; p90: number; p99: number }
): number | null {
  if (value === null || value <= 0) return null

  const logValue = Math.log10(value)

  // Calculate log thresholds
  const log25 = Math.log10(thresholds.p25)
  const log50 = Math.log10(thresholds.p50)
  const log75 = Math.log10(thresholds.p75)
  const log90 = Math.log10(thresholds.p90)
  const log99 = Math.log10(thresholds.p99)

  // Linear interpolation between log thresholds
  if (logValue <= log25) {
    return 25 * (logValue / log25)
  } else if (logValue <= log50) {
    return 25 + 25 * ((logValue - log25) / (log50 - log25))
  } else if (logValue <= log75) {
    return 50 + 25 * ((logValue - log50) / (log75 - log50))
  } else if (logValue <= log90) {
    return 75 + 15 * ((logValue - log75) / (log90 - log75))
  } else if (logValue <= log99) {
    return 90 + 9 * ((logValue - log90) / (log99 - log90))
  } else {
    // Cap at 100
    return Math.min(100, 99 + ((logValue - log99) / log99) * 1)
  }
}

/**
 * Adjust box office for inflation/era
 *
 * Uses era reference stats if available, otherwise uses rough inflation estimates.
 */
export function adjustBoxOfficeForEra(
  boxOfficeCents: number | null,
  releaseYear: number | null,
  eraStats: EraReferenceStats | null
): number | null {
  if (boxOfficeCents === null || releaseYear === null) return null

  // Use era stats inflation factor if available
  if (eraStats?.inflation_factor) {
    return boxOfficeCents * Number(eraStats.inflation_factor)
  }

  // Fallback: rough 3% annual inflation estimate
  const yearsDiff = REFERENCE_YEAR - releaseYear
  const inflationFactor = Math.pow(1.03, yearsDiff)

  return boxOfficeCents * inflationFactor
}

/**
 * Calculate longevity score - engagement relative to age
 *
 * Recent content naturally has less engagement; older content with high
 * engagement demonstrates lasting appeal.
 */
export function calculateLongevityScore(
  traktWatchers: number | null,
  releaseYear: number | null
): number | null {
  if (traktWatchers === null || releaseYear === null) return null

  const age = REFERENCE_YEAR - releaseYear
  if (age <= 0) return null

  // Expected decay: engagement halves every 5 years
  const expectedDecayFactor = Math.pow(0.5, age / 5)

  // If current engagement exceeds expected decay, it has longevity
  const baselineEngagement = 10000 // Median-ish watchers for a typical release
  const expectedWatchers = baselineEngagement * expectedDecayFactor
  const longevityRatio = traktWatchers / Math.max(expectedWatchers, 1)

  // Convert ratio to 0-100 score
  // 1.0 = expected, 2.0 = double expected (good), 5.0 = excellent
  return Math.min(100, Math.max(0, Math.log10(longevityRatio + 0.1) * 50 + 50))
}

/**
 * Calculate repeat viewership ratio
 */
export function calculateRepeatViewership(
  traktPlays: number | null,
  traktWatchers: number | null
): number | null {
  if (traktPlays === null || traktWatchers === null || traktWatchers === 0) return null

  const ratio = traktPlays / traktWatchers

  // ratio of 1.0 = everyone watched once
  // ratio of 2.0 = average of 2 watches per person
  // ratio of 5.0+ = high repeat viewership

  // Convert to 0-100 score
  // 1.0 -> 20, 2.0 -> 50, 5.0 -> 90
  return Math.min(100, Math.max(0, 20 + (ratio - 1) * 20))
}

/**
 * Calculate vote growth rate
 */
export function calculateVoteGrowthRate(
  imdbVotes: number | null,
  releaseYear: number | null
): number | null {
  if (imdbVotes === null || releaseYear === null) return null

  const age = REFERENCE_YEAR - releaseYear
  if (age <= 0) return null

  const votesPerYear = imdbVotes / age

  // Convert to 0-100 score based on percentile-like thresholds
  // 1000 votes/year = decent, 10000 = great, 50000 = exceptional
  if (votesPerYear <= 500) {
    return 25 * (votesPerYear / 500)
  } else if (votesPerYear <= 2000) {
    return 25 + 25 * ((votesPerYear - 500) / 1500)
  } else if (votesPerYear <= 10000) {
    return 50 + 25 * ((votesPerYear - 2000) / 8000)
  } else if (votesPerYear <= 50000) {
    return 75 + 20 * ((votesPerYear - 10000) / 40000)
  } else {
    return Math.min(100, 95 + 5 * ((votesPerYear - 50000) / 50000))
  }
}

/**
 * Calculate awards score
 */
export function calculateAwardsScore(wins: number | null, nominations: number | null): number {
  const w = wins ?? 0
  const n = nominations ?? 0

  const score = w + n * 0.5

  // Convert to 0-100: 1 win = 20, 5 wins = 50, 10+ wins = 80+
  if (score === 0) return 0
  if (score <= 2) return 20 * (score / 2)
  if (score <= 10) return 20 + 30 * ((score - 2) / 8)
  if (score <= 30) return 50 + 30 * ((score - 10) / 20)
  return Math.min(100, 80 + 20 * ((score - 30) / 50))
}

/**
 * Get billing weight using hyperbolic decay (Proposal 04).
 *
 * billing_order is 0-based (0 = lead, stored from array index during ingestion).
 * Produces smooth decay: position 0→1.0, 1→0.87, 2→0.77, 4→0.63, etc.
 * Unknown billing order (null) returns BILLING_NULL_WEIGHT (0.3).
 */
export function getBillingWeight(billingOrder: number | null): number {
  if (billingOrder === null) return BILLING_NULL_WEIGHT
  return 1.0 / (1 + BILLING_DECAY_RATE * Math.max(0, billingOrder))
}

/**
 * Get language multiplier for content scoring (Proposal 07).
 *
 * US/UK productions in non-English languages get a boost (e.g. a Hollywood
 * film shot in Spanish is more familiar to US audiences than a domestic
 * Spanish production).
 */
export function getLanguageMultiplier(language: string | null, isUSUKProd: boolean): number {
  if (!language) return DEFAULT_LANGUAGE_MULTIPLIER
  const mult = LANGUAGE_MULTIPLIERS[language.toLowerCase()] ?? DEFAULT_LANGUAGE_MULTIPLIER
  if (isUSUKProd && mult < 0.8) {
    return Math.min(0.85, mult + 0.2)
  }
  return mult
}

/**
 * Get episode weight for TV appearances
 */
export function getEpisodeWeight(episodeCount: number | null): number {
  if (episodeCount === null) return 0.5 // Unknown episode count = partial weight
  return Math.min(1.0, episodeCount / FULL_TV_WEIGHT_EPISODES)
}

// ============================================================================
// Star Power Functions (Proposal 11)
// ============================================================================

/**
 * Determine if an actor is the sole lead for a given content.
 *
 * Sole lead means: billing #0, cast size >= 5, and a billing gap of 2+
 * positions to the next actor. This distinguishes true "their movie" leads
 * from co-leads in ensemble films.
 */
export function isSoleLead(
  billingOrder: number | null,
  nextBillingOrder: number | null,
  castSize: number | null
): boolean {
  if (billingOrder !== 0) return false
  if (castSize === null || castSize < SOLE_LEAD_MIN_CAST_SIZE) return false
  if (nextBillingOrder === null) return true // Only person billed = sole lead
  return nextBillingOrder >= SOLE_LEAD_MIN_BILLING_GAP
}

/**
 * Calculate sole-lead bonus for a contribution.
 * Returns 10% of the contribution when the actor is the sole lead.
 */
export function calculateSoleLeadBonus(
  contribution: number,
  billingOrder: number | null,
  nextBillingOrder: number | null,
  castSize: number | null
): number {
  if (!isSoleLead(billingOrder, nextBillingOrder, castSize)) return 0
  return contribution * SOLE_LEAD_BONUS_FRACTION
}

/**
 * Calculate the consistent-star multiplier based on an actor's filmography.
 *
 * Counts movies where the actor has billing #0 AND the content has
 * dof_popularity >= 60. Returns a multiplier:
 * - <3 qualifying movies: 1.0 (no boost)
 * - 3 qualifying: 1.05 (5% boost)
 * - 8+ qualifying: 1.10 (10% boost, maximum)
 * - Linear interpolation between 3 and 8
 */
export function calculateConsistentStarMultiplier(appearances: ActorAppearance[]): number {
  const qualifyingCount = appearances.filter(
    (a) =>
      a.isMovie &&
      a.billingOrder === 0 &&
      a.contentDofPopularity !== null &&
      a.contentDofPopularity >= CONSISTENT_STAR_POPULARITY_THRESHOLD
  ).length

  if (qualifyingCount < CONSISTENT_STAR_MIN_MOVIES) return 1.0

  // Linear interpolation from 1.05 at 3 movies to 1.10 at 8+ movies
  const range = 8 - CONSISTENT_STAR_MIN_MOVIES
  const progress = Math.min(1.0, (qualifyingCount - CONSISTENT_STAR_MIN_MOVIES) / range)
  return (
    CONSISTENT_STAR_MIN_MULTIPLIER +
    progress * (CONSISTENT_STAR_MAX_MULTIPLIER - CONSISTENT_STAR_MIN_MULTIPLIER)
  )
}

// ============================================================================
// Multi-Factor Confidence (Proposal 09)
// ============================================================================

export interface ConfidenceInput {
  /** Number of valid contributions */
  appearanceCount: number
  /** Number of non-null signals (out of 5: filmography, TMDB, Wiki, sitelinks, awards) */
  signalCount: number
  /** Sorted contributions array (descending) */
  contributions: number[]
}

/**
 * Calculate multi-factor confidence replacing simple appearance-count confidence.
 *
 * Factors (weighted sum):
 * - Appearance count (30%): Math.min(1.0, count / 10)
 * - Signal coverage (30%): signalCount / totalSignals
 * - Variance penalty (20%): 1.0 - CV * 0.5 (coefficient of variation, clamped)
 * - Top contribution strength (20%): Math.min(1.0, topStrength / 70)
 */
export function calculateMultiFactorConfidence(input: ConfidenceInput): number {
  const { appearanceCount, signalCount, contributions } = input

  // Factor 1: Appearance count
  const appearanceFactor = Math.min(1.0, appearanceCount / MIN_APPEARANCES_FULL_CONFIDENCE)

  // Factor 2: Signal coverage
  const coverageFactor = signalCount / TOTAL_ACTOR_SIGNAL_COUNT

  // Factor 3: Variance penalty (coefficient of variation)
  let varianceFactor = 1.0
  if (contributions.length >= 2) {
    const mean = contributions.reduce((s, c) => s + c, 0) / contributions.length
    if (mean > 0) {
      const variance =
        contributions.reduce((s, c) => s + Math.pow(c - mean, 2), 0) / contributions.length
      const cv = Math.sqrt(variance) / mean
      varianceFactor = Math.max(0.3, Math.min(1.0, 1.0 - cv * 0.5))
    }
  }

  // Factor 4: Top contribution strength
  const topStrength = contributions.length > 0 ? contributions[0] : 0
  const strengthFactor = Math.min(1.0, topStrength / 70)

  const confidence =
    appearanceFactor * CONFIDENCE_APPEARANCE_WEIGHT +
    coverageFactor * CONFIDENCE_SIGNAL_COVERAGE_WEIGHT +
    varianceFactor * CONFIDENCE_VARIANCE_WEIGHT +
    strengthFactor * CONFIDENCE_TOP_STRENGTH_WEIGHT

  return Math.round(Math.min(1.0, Math.max(0, confidence)) * 100) / 100
}

/**
 * Apply Bayesian regression to an actor's final score.
 *
 * Pulls low-confidence scores toward the prior mean (30).
 * High-confidence scores are barely affected.
 */
export function applyActorBayesianAdjustment(rawScore: number, confidence: number): number {
  return (
    (confidence / (confidence + ACTOR_REGRESSION_STRENGTH)) * rawScore +
    (ACTOR_REGRESSION_STRENGTH / (confidence + ACTOR_REGRESSION_STRENGTH)) * ACTOR_PRIOR_MEAN
  )
}

// ============================================================================
// Main Calculation Functions
// ============================================================================

/**
 * Calculate DOF popularity and weight scores for movies
 */
export function calculateMoviePopularity(input: ContentPopularityInput): ContentPopularityResult {
  const signals: { value: number; weight: number }[] = []

  // Box office (era-adjusted)
  const adjustedBoxOffice = adjustBoxOfficeForEra(
    input.boxOfficeCents,
    input.releaseYear,
    input.eraStats
  )
  const boxOfficeScore = logPercentile(adjustedBoxOffice, PERCENTILE_THRESHOLDS.boxOfficeCents)
  if (boxOfficeScore !== null) {
    signals.push({ value: boxOfficeScore, weight: POPULARITY_WEIGHTS.boxOffice })
  }

  // Trakt watchers
  const traktWatchersScore = logPercentile(input.traktWatchers, PERCENTILE_THRESHOLDS.traktWatchers)
  if (traktWatchersScore !== null) {
    signals.push({ value: traktWatchersScore, weight: POPULARITY_WEIGHTS.traktWatchers })
  }

  // Trakt plays
  const traktPlaysScore = logPercentile(input.traktPlays, PERCENTILE_THRESHOLDS.traktPlays)
  if (traktPlaysScore !== null) {
    signals.push({ value: traktPlaysScore, weight: POPULARITY_WEIGHTS.traktPlays })
  }

  // IMDb votes
  const imdbVotesScore = logPercentile(input.imdbVotes, PERCENTILE_THRESHOLDS.imdbVotes)
  if (imdbVotesScore !== null) {
    signals.push({ value: imdbVotesScore, weight: POPULARITY_WEIGHTS.imdbVotes })
  }

  // TMDB popularity
  const tmdbScore = logPercentile(input.tmdbPopularity, PERCENTILE_THRESHOLDS.tmdbPopularity)
  if (tmdbScore !== null) {
    signals.push({ value: tmdbScore, weight: POPULARITY_WEIGHTS.tmdbPopularity })
  }

  // US/UK production bonus
  if (input.isUSUKProduction) {
    signals.push({ value: 100, weight: POPULARITY_WEIGHTS.usUkProduction })
  }

  // Awards
  const awardsScore = calculateAwardsScore(input.awardsWins, input.awardsNominations)
  if (awardsScore > 0) {
    signals.push({ value: awardsScore, weight: POPULARITY_WEIGHTS.awards })
  }

  // Calculate dof_popularity
  if (signals.length < MIN_SOURCES_FOR_SCORE) {
    return { dofPopularity: null, dofWeight: null, confidence: 0, sourcesUsed: signals.length }
  }

  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0)
  const weightedSum = signals.reduce((sum, s) => sum + s.value * s.weight, 0)
  let dofPopularity = weightedSum / totalWeight

  // Apply graduated language penalty (Proposal 07)
  const langMultiplier = getLanguageMultiplier(input.originalLanguage, input.isUSUKProduction)
  dofPopularity *= langMultiplier

  dofPopularity = Math.round(dofPopularity * 100) / 100

  // Calculate confidence
  const maxPossibleWeight = Object.values(POPULARITY_WEIGHTS).reduce((a, b) => a + b, 0)
  const confidence = Math.round((totalWeight / maxPossibleWeight) * 100) / 100

  // Calculate dof_weight (cultural staying power)
  const dofWeight = calculateContentWeight(input)

  return {
    dofPopularity,
    dofWeight,
    confidence,
    sourcesUsed: signals.length,
  }
}

/**
 * Calculate DOF popularity and weight scores for TV shows
 */
export function calculateShowPopularity(input: ShowPopularityInput): ContentPopularityResult {
  // Shows don't have box office - redistribute that weight
  const signals: { value: number; weight: number }[] = []

  // Adjusted weights for shows (no box office)
  const showWeights = {
    traktWatchers: 0.3, // Increased from 0.2
    traktPlays: 0.15, // Increased from 0.1
    imdbVotes: 0.25, // Increased from 0.2
    tmdbPopularity: 0.2, // Increased from 0.15
    usUkProduction: 0.05,
    awards: 0.05,
  }

  // Trakt watchers
  const traktWatchersScore = logPercentile(input.traktWatchers, PERCENTILE_THRESHOLDS.traktWatchers)
  if (traktWatchersScore !== null) {
    signals.push({ value: traktWatchersScore, weight: showWeights.traktWatchers })
  }

  // Trakt plays
  const traktPlaysScore = logPercentile(input.traktPlays, PERCENTILE_THRESHOLDS.traktPlays)
  if (traktPlaysScore !== null) {
    signals.push({ value: traktPlaysScore, weight: showWeights.traktPlays })
  }

  // IMDb votes
  const imdbVotesScore = logPercentile(input.imdbVotes, PERCENTILE_THRESHOLDS.imdbVotes)
  if (imdbVotesScore !== null) {
    signals.push({ value: imdbVotesScore, weight: showWeights.imdbVotes })
  }

  // TMDB popularity
  const tmdbScore = logPercentile(input.tmdbPopularity, PERCENTILE_THRESHOLDS.tmdbPopularity)
  if (tmdbScore !== null) {
    signals.push({ value: tmdbScore, weight: showWeights.tmdbPopularity })
  }

  // US/UK production bonus
  if (input.isUSUKProduction) {
    signals.push({ value: 100, weight: showWeights.usUkProduction })
  }

  // Awards
  const awardsScore = calculateAwardsScore(input.awardsWins, input.awardsNominations)
  if (awardsScore > 0) {
    signals.push({ value: awardsScore, weight: showWeights.awards })
  }

  // Calculate dof_popularity
  if (signals.length < MIN_SOURCES_FOR_SCORE) {
    return { dofPopularity: null, dofWeight: null, confidence: 0, sourcesUsed: signals.length }
  }

  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0)
  const weightedSum = signals.reduce((sum, s) => sum + s.value * s.weight, 0)
  let dofPopularity = weightedSum / totalWeight

  // Apply graduated language penalty (Proposal 07)
  const langMultiplier = getLanguageMultiplier(input.originalLanguage, input.isUSUKProduction)
  dofPopularity *= langMultiplier

  dofPopularity = Math.round(dofPopularity * 100) / 100

  // Calculate confidence
  const maxPossibleWeight = Object.values(showWeights).reduce((a, b) => a + b, 0)
  const confidence = Math.round((totalWeight / maxPossibleWeight) * 100) / 100

  // Calculate dof_weight (cultural staying power)
  const dofWeight = calculateContentWeight(input)

  return {
    dofPopularity,
    dofWeight,
    confidence,
    sourcesUsed: signals.length,
  }
}

/**
 * Calculate content weight score (cultural staying power)
 *
 * This measures how much a movie/show should count toward an actor's popularity.
 */
function calculateContentWeight(
  input: ContentPopularityInput | ShowPopularityInput
): number | null {
  const signals: { value: number; weight: number }[] = []

  // Longevity score
  const longevityScore = calculateLongevityScore(input.traktWatchers, input.releaseYear)
  if (longevityScore !== null) {
    signals.push({ value: longevityScore, weight: WEIGHT_WEIGHTS.longevity })
  }

  // Repeat viewership
  const repeatScore = calculateRepeatViewership(input.traktPlays, input.traktWatchers)
  if (repeatScore !== null) {
    signals.push({ value: repeatScore, weight: WEIGHT_WEIGHTS.repeatViewership })
  }

  // Vote growth rate
  const voteGrowthScore = calculateVoteGrowthRate(input.imdbVotes, input.releaseYear)
  if (voteGrowthScore !== null) {
    signals.push({ value: voteGrowthScore, weight: WEIGHT_WEIGHTS.voteGrowthRate })
  }

  // Aggregate score (critical recognition) - convert from 0-10 to 0-100 scale
  if (input.aggregateScore !== null && input.aggregateScore > 0) {
    const aggregateScoreNormalized = input.aggregateScore * 10 // Convert 0-10 to 0-100
    signals.push({ value: aggregateScoreNormalized, weight: WEIGHT_WEIGHTS.aggregateScore })
  }

  // Awards score
  const awardsScore = calculateAwardsScore(input.awardsWins, input.awardsNominations)
  if (awardsScore > 0) {
    signals.push({ value: awardsScore, weight: WEIGHT_WEIGHTS.awards })
  }

  if (signals.length < 1) return null

  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0)
  const weightedSum = signals.reduce((sum, s) => sum + s.value * s.weight, 0)

  return Math.round((weightedSum / totalWeight) * 100) / 100
}

/**
 * Calculate actor DOF popularity from filmography
 *
 * Uses TOP N appearances to prevent prolific actors from being penalized
 * for having many minor roles alongside their major work.
 */
export function calculateActorPopularity(input: ActorPopularityInput): ActorPopularityResult {
  const {
    appearances,
    tmdbPopularity,
    wikipediaAnnualPageviews,
    wikidataSitelinks,
    actorAwardsScore,
  } = input

  if (appearances.length === 0) {
    return { dofPopularity: null, confidence: 0 }
  }

  // Calculate contribution for each appearance
  const contributions: number[] = []

  for (const appearance of appearances) {
    if (appearance.contentDofPopularity === null && appearance.contentDofWeight === null) {
      continue
    }

    // Calculate content score (60% popularity, 40% weight)
    const contentScore =
      (appearance.contentDofPopularity ?? 0) * 0.6 + (appearance.contentDofWeight ?? 0) * 0.4

    // Apply billing weight (hyperbolic decay — Proposal 04)
    const billingWeight = getBillingWeight(appearance.billingOrder)

    // Apply episode weight for TV
    const episodeWeight = appearance.isMovie ? 1.0 : getEpisodeWeight(appearance.episodeCount)

    let contribution = contentScore * billingWeight * episodeWeight

    // Apply sole-lead bonus (Proposal 11): +10% for sole leads
    contribution += calculateSoleLeadBonus(
      contribution,
      appearance.billingOrder,
      appearance.nextBillingOrder ?? null,
      appearance.castSize ?? null
    )

    contributions.push(contribution)
  }

  if (contributions.length === 0) {
    return { dofPopularity: null, confidence: 0 }
  }

  // Sort contributions descending and take top N
  // This measures "peak career" - what an actor is best known for
  contributions.sort((a, b) => b - a)
  const topContributions = contributions.slice(0, MAX_APPEARANCES_FOR_SCORE)

  // Peak-performance blend (Proposal 08):
  // Blend top-3 peak average (40%) with top-10 breadth via weighted positional (60%)
  const peakSlice = topContributions.slice(0, PEAK_TOP_N)
  const peakScore = peakSlice.reduce((s, c) => s + c, 0) / Math.max(peakSlice.length, 1)
  const breadthScore = weightedPositionalAverage(topContributions)
  let filmographyScore = peakScore * PEAK_WEIGHT + breadthScore * BREADTH_WEIGHT

  // Apply consistent-star multiplier (Proposal 11): 5-10% boost for prolific leads
  const starMultiplier = calculateConsistentStarMultiplier(appearances)
  filmographyScore *= starMultiplier

  // Blend filmography with supplementary signals using weight normalization.
  // When a signal is missing (null), its weight is excluded and remaining
  // weights are normalized so the score isn't penalized for missing data.
  let totalWeight = ACTOR_FILMOGRAPHY_WEIGHT
  let finalScore = filmographyScore * ACTOR_FILMOGRAPHY_WEIGHT
  let signalCount = 1 // filmography always present

  if (tmdbPopularity !== null) {
    const tmdbScore = logPercentile(tmdbPopularity, PERCENTILE_THRESHOLDS.tmdbPopularity) ?? 0
    finalScore += tmdbScore * ACTOR_TMDB_RECENCY_WEIGHT
    totalWeight += ACTOR_TMDB_RECENCY_WEIGHT
    signalCount++
  }

  if (wikipediaAnnualPageviews !== null) {
    const wikiScore =
      logPercentile(wikipediaAnnualPageviews, PERCENTILE_THRESHOLDS.wikipediaAnnualPageviews) ?? 0
    finalScore += wikiScore * ACTOR_WIKIPEDIA_WEIGHT
    totalWeight += ACTOR_WIKIPEDIA_WEIGHT
    signalCount++
  }

  if (wikidataSitelinks !== null) {
    const sitelinksScore =
      logPercentile(wikidataSitelinks, PERCENTILE_THRESHOLDS.wikidataSitelinks) ?? 0
    finalScore += sitelinksScore * ACTOR_SITELINKS_WEIGHT
    totalWeight += ACTOR_SITELINKS_WEIGHT
    signalCount++
  }

  if (actorAwardsScore !== null && actorAwardsScore > 0) {
    finalScore += actorAwardsScore * ACTOR_AWARDS_WEIGHT
    totalWeight += ACTOR_AWARDS_WEIGHT
    signalCount++
  }

  // Normalize to account for missing signals
  finalScore = finalScore / totalWeight

  // Multi-factor confidence (Proposal 09)
  const confidence = calculateMultiFactorConfidence({
    appearanceCount: contributions.length,
    signalCount,
    contributions: topContributions,
  })

  // Apply Bayesian regression (Proposal 09): pull low-confidence scores toward prior mean
  finalScore = applyActorBayesianAdjustment(finalScore, confidence)

  return {
    dofPopularity: Math.round(Math.min(100, Math.max(0, finalScore)) * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
  }
}

/**
 * Check if production countries include US or UK
 */
export function isUSUKProduction(countries: string[] | null): boolean {
  if (!countries || countries.length === 0) return false

  const usUkCodes = ["US", "USA", "GB", "UK"]
  return countries.some((c) => usUkCodes.includes(c.toUpperCase()))
}

/**
 * Check if content is English language
 */
export function isEnglishLanguage(originalLanguage: string | null): boolean {
  if (!originalLanguage) return false
  return originalLanguage.toLowerCase() === "en"
}
