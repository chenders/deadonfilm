/**
 * Aggregate Score Calculation
 *
 * Calculates a unified "Dead on Film Score" from multiple rating sources
 * (IMDb, Rotten Tomatoes, Metacritic, Trakt, TMDB, TheTVDB) using
 * intelligent weighting based on source authority and vote counts.
 */

// Rating scale types
export type RatingScale = "decimal" | "percent"

// Source-specific weight configuration
export interface SourceWeight {
  source: RatingSource
  weight: number
}

// Available rating sources
export type RatingSource = "imdb" | "rottenTomatoes" | "metacritic" | "trakt" | "tmdb" | "thetvdb"

// Individual rating from a source
export interface RatingInput {
  source: RatingSource
  rating: number // Raw rating value
  scale: RatingScale // 'decimal' for 0-10, 'percent' for 0-100
  votes: number | null // Number of votes/reviews (null if unknown)
}

// Result of aggregate calculation
export interface AggregateResult {
  score: number | null // Weighted average score (0-10 scale)
  confidence: number // Confidence in the score (0-1 scale)
  sourcesUsed: number // Number of sources with valid ratings
  controversy: number | null // Standard deviation indicating disagreement
}

// Base weights for each source (must sum to ~1.0 for normalization)
// IMDb weighted highest due to large user base and reliability
// TheTVDB weighted lowest as it's primarily for TV metadata, not ratings
const BASE_WEIGHTS: Record<RatingSource, number> = {
  imdb: 0.3,
  rottenTomatoes: 0.25,
  metacritic: 0.2,
  trakt: 0.15,
  tmdb: 0.1,
  thetvdb: 0.05, // Only applies to shows
}

// Threshold for full confidence (votes at or above this get weight of 1.0)
const FULL_CONFIDENCE_VOTES = 10000

// Minimum sources required for a reliable aggregate
const MIN_SOURCES_FOR_AGGREGATE = 1

/**
 * Normalize a rating to a 0-10 scale
 *
 * @param rating - The raw rating value
 * @param scale - The scale of the rating ('decimal' for 0-10, 'percent' for 0-100)
 * @returns The normalized rating on a 0-10 scale
 */
export function normalizeRating(rating: number, scale: RatingScale): number {
  if (scale === "decimal") {
    // Already on 0-10 scale, just clamp
    return Math.max(0, Math.min(10, rating))
  }
  // Percent scale (0-100) -> convert to 0-10
  return Math.max(0, Math.min(10, rating / 10))
}

/**
 * Calculate a confidence factor based on vote count
 *
 * Uses a simple linear approach that reaches full confidence at FULL_CONFIDENCE_VOTES.
 * This penalizes ratings with few votes, as they're less statistically reliable.
 *
 * @param votes - Number of votes/reviews
 * @returns Confidence factor between 0 and 1
 */
export function confidenceFactor(votes: number | null): number {
  if (votes === null || votes <= 0) {
    // Unknown or zero votes get minimal confidence
    return 0.1
  }

  // Linear scale up to full confidence threshold
  return Math.min(1.0, votes / FULL_CONFIDENCE_VOTES)
}

/**
 * Calculate the aggregate score from multiple rating sources
 *
 * Uses a weighted average where each source's contribution is:
 * - Normalized to a 0-10 scale
 * - Weighted by its base authority weight
 * - Adjusted by a confidence factor based on vote count
 *
 * @param ratings - Array of ratings from different sources
 * @returns Aggregate result with score, confidence, and metadata
 */
export function calculateAggregateScore(ratings: RatingInput[]): AggregateResult {
  // Filter out ratings with null/undefined values
  const validRatings = ratings.filter(
    (r) => r.rating !== null && r.rating !== undefined && !isNaN(r.rating)
  )

  if (validRatings.length < MIN_SOURCES_FOR_AGGREGATE) {
    return {
      score: null,
      confidence: 0,
      sourcesUsed: 0,
      controversy: null,
    }
  }

  let weightedSum = 0
  let totalWeight = 0
  const normalizedRatings: number[] = []

  for (const rating of validRatings) {
    const normalized = normalizeRating(rating.rating, rating.scale)
    normalizedRatings.push(normalized)

    const confidence = confidenceFactor(rating.votes)
    const baseWeight = BASE_WEIGHTS[rating.source]
    const adjustedWeight = baseWeight * confidence

    weightedSum += normalized * adjustedWeight
    totalWeight += adjustedWeight
  }

  // Calculate final score
  const score = totalWeight > 0 ? weightedSum / totalWeight : null

  // Calculate overall confidence based on sources and their weights
  const maxPossibleWeight = validRatings.reduce((sum, r) => sum + BASE_WEIGHTS[r.source], 0)
  const confidence = maxPossibleWeight > 0 ? totalWeight / maxPossibleWeight : 0

  // Calculate controversy (standard deviation of normalized ratings)
  const controversy = calculateControversy(normalizedRatings)

  return {
    score: score !== null ? Math.round(score * 100) / 100 : null, // Round to 2 decimal places
    confidence: Math.round(confidence * 100) / 100,
    sourcesUsed: validRatings.length,
    controversy,
  }
}

/**
 * Calculate controversy score (standard deviation of ratings)
 *
 * A high controversy score indicates significant disagreement between sources.
 * For example, a film that critics hate but audiences love will have high controversy.
 *
 * @param normalizedRatings - Array of ratings already normalized to 0-10 scale
 * @returns Standard deviation, or null if fewer than 2 ratings
 */
export function calculateControversy(normalizedRatings: number[]): number | null {
  if (normalizedRatings.length < 2) {
    return null
  }

  // Calculate mean
  const mean = normalizedRatings.reduce((sum, r) => sum + r, 0) / normalizedRatings.length

  // Calculate variance
  const variance =
    normalizedRatings.reduce((sum, r) => {
      const diff = r - mean
      return sum + diff * diff
    }, 0) / normalizedRatings.length

  // Standard deviation
  const stdDev = Math.sqrt(variance)

  return Math.round(stdDev * 100) / 100
}

/**
 * Build rating inputs from a movie database record
 *
 * @param record - Database record with rating columns
 * @returns Array of RatingInput objects for aggregate calculation
 */
export function buildMovieRatingInputs(record: {
  vote_average?: number | null
  omdb_imdb_rating?: number | null
  omdb_imdb_votes?: number | null
  omdb_rotten_tomatoes_score?: number | null
  omdb_metacritic_score?: number | null
  trakt_rating?: number | null
  trakt_votes?: number | null
}): RatingInput[] {
  const inputs: RatingInput[] = []

  // TMDB rating (0-10 scale)
  if (record.vote_average !== null && record.vote_average !== undefined) {
    inputs.push({
      source: "tmdb",
      rating: record.vote_average,
      scale: "decimal",
      votes: null, // TMDB vote count not stored
    })
  }

  // IMDb rating via OMDb (0-10 scale)
  if (record.omdb_imdb_rating !== null && record.omdb_imdb_rating !== undefined) {
    inputs.push({
      source: "imdb",
      rating: record.omdb_imdb_rating,
      scale: "decimal",
      votes: record.omdb_imdb_votes ?? null,
    })
  }

  // Rotten Tomatoes score via OMDb (0-100 scale)
  if (
    record.omdb_rotten_tomatoes_score !== null &&
    record.omdb_rotten_tomatoes_score !== undefined
  ) {
    inputs.push({
      source: "rottenTomatoes",
      rating: record.omdb_rotten_tomatoes_score,
      scale: "percent",
      votes: null, // RT doesn't provide vote counts
    })
  }

  // Metacritic score via OMDb (0-100 scale)
  if (record.omdb_metacritic_score !== null && record.omdb_metacritic_score !== undefined) {
    inputs.push({
      source: "metacritic",
      rating: record.omdb_metacritic_score,
      scale: "percent",
      votes: null, // Metacritic doesn't provide vote counts
    })
  }

  // Trakt rating (0-10 scale)
  if (record.trakt_rating !== null && record.trakt_rating !== undefined) {
    inputs.push({
      source: "trakt",
      rating: record.trakt_rating,
      scale: "decimal",
      votes: record.trakt_votes ?? null,
    })
  }

  return inputs
}

/**
 * Build rating inputs from a TV show database record
 *
 * @param record - Database record with rating columns
 * @returns Array of RatingInput objects for aggregate calculation
 */
export function buildShowRatingInputs(record: {
  vote_average?: number | null
  omdb_imdb_rating?: number | null
  omdb_imdb_votes?: number | null
  omdb_rotten_tomatoes_score?: number | null
  omdb_metacritic_score?: number | null
  trakt_rating?: number | null
  trakt_votes?: number | null
  thetvdb_score?: number | null
}): RatingInput[] {
  // Start with movie-compatible ratings
  const inputs = buildMovieRatingInputs(record)

  // Add TheTVDB score (0-10 scale, TV shows only)
  if (record.thetvdb_score !== null && record.thetvdb_score !== undefined) {
    inputs.push({
      source: "thetvdb",
      rating: record.thetvdb_score,
      scale: "decimal",
      votes: null, // TheTVDB doesn't provide vote counts
    })
  }

  return inputs
}

/**
 * Determine if a score indicates the content is "controversial"
 * (significant disagreement between rating sources)
 *
 * @param controversy - The standard deviation of ratings
 * @returns True if the content is considered controversial
 */
export function isControversial(controversy: number | null): boolean {
  // A standard deviation >= 1.5 on a 10-point scale indicates significant disagreement
  return controversy !== null && controversy >= 1.5
}
