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
}

export interface ActorAppearance {
  contentDofPopularity: number | null
  contentDofWeight: number | null
  billingOrder: number | null
  episodeCount: number | null // For TV shows
  isMovie: boolean
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
  boxOfficeCents: {
    // In 2024 dollars
    p25: 1_000_000_00, // $1M
    p50: 10_000_000_00, // $10M
    p75: 50_000_000_00, // $50M
    p90: 200_000_000_00, // $200M
    p99: 1_000_000_000_00, // $1B
  },
} as const

// Billing order weight mapping
const BILLING_WEIGHTS = {
  lead: 1.0, // Billing 1-3
  supporting: 0.7, // Billing 4-10
  minor: 0.4, // Billing 11+
} as const

// Episode count threshold for full TV weight
const FULL_TV_WEIGHT_EPISODES = 20

// Minimum appearances for full actor confidence
const MIN_APPEARANCES_FULL_CONFIDENCE = 10

// Maximum appearances to consider for actor score (use top N)
// This prevents prolific actors from being penalized for having many minor roles
const MAX_APPEARANCES_FOR_SCORE = 10

// Actor score composition
const ACTOR_FILMOGRAPHY_WEIGHT = 0.7
const ACTOR_TMDB_RECENCY_WEIGHT = 0.3

// Current reference year for era adjustments
const REFERENCE_YEAR = 2024

// Minimum sources for a valid score
const MIN_SOURCES_FOR_SCORE = 2

// Non-English language penalty multiplier
// This is a dead-on-film focused site, primarily serving English-speaking audiences.
// Non-English content gets a severe penalty since our users are less likely to recognize it.
const NON_ENGLISH_PENALTY_MULTIPLIER = 0.4

// ============================================================================
// Helper Functions
// ============================================================================

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
 * Get billing weight based on order
 */
export function getBillingWeight(billingOrder: number | null): number {
  if (billingOrder === null) return BILLING_WEIGHTS.minor

  if (billingOrder <= 3) return BILLING_WEIGHTS.lead
  if (billingOrder <= 10) return BILLING_WEIGHTS.supporting
  return BILLING_WEIGHTS.minor
}

/**
 * Get episode weight for TV appearances
 */
export function getEpisodeWeight(episodeCount: number | null): number {
  if (episodeCount === null) return 0.5 // Unknown episode count = partial weight
  return Math.min(1.0, episodeCount / FULL_TV_WEIGHT_EPISODES)
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

  // Apply severe penalty for non-English content
  if (!isEnglishLanguage(input.originalLanguage)) {
    dofPopularity *= NON_ENGLISH_PENALTY_MULTIPLIER
  }

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

  // Apply severe penalty for non-English content
  if (!isEnglishLanguage(input.originalLanguage)) {
    dofPopularity *= NON_ENGLISH_PENALTY_MULTIPLIER
  }

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
  const { appearances, tmdbPopularity } = input

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

    // Apply billing weight
    const billingWeight = getBillingWeight(appearance.billingOrder)

    // Apply episode weight for TV
    const episodeWeight = appearance.isMovie ? 1.0 : getEpisodeWeight(appearance.episodeCount)

    const contribution = contentScore * billingWeight * episodeWeight
    contributions.push(contribution)
  }

  if (contributions.length === 0) {
    return { dofPopularity: null, confidence: 0 }
  }

  // Sort contributions descending and take top N
  // This measures "peak career" - what an actor is best known for
  contributions.sort((a, b) => b - a)
  const topContributions = contributions.slice(0, MAX_APPEARANCES_FOR_SCORE)

  // Average the top contributions
  const filmographySum = topContributions.reduce((sum, c) => sum + c, 0)
  const filmographyScore = filmographySum / topContributions.length

  // Add TMDB popularity for recency
  let finalScore: number
  if (tmdbPopularity !== null) {
    const tmdbScore = logPercentile(tmdbPopularity, PERCENTILE_THRESHOLDS.tmdbPopularity) ?? 0
    finalScore = filmographyScore * ACTOR_FILMOGRAPHY_WEIGHT + tmdbScore * ACTOR_TMDB_RECENCY_WEIGHT
  } else {
    finalScore = filmographyScore
  }

  // Calculate confidence based on appearance count
  const confidence = Math.min(1.0, contributions.length / MIN_APPEARANCES_FULL_CONFIDENCE)

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
