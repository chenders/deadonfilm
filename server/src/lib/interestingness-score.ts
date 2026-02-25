/**
 * Actor interestingness score calculator.
 *
 * Computes a 0-100 composite score predicting how compelling an actor's
 * life/death story will be, using only free data (Wikidata demographics
 * + existing DB fields). Used to prioritize which actors get expensive
 * AI enrichment.
 *
 * Seven weighted factors informed by perspectives from film historians,
 * biographers, and data analysts:
 *
 * | Factor                    | Max | Signal                                    |
 * |---------------------------|-----|-------------------------------------------|
 * | Era & Historical Context  |  20 | Birth year → historical period             |
 * | Demographic Barriers      |  20 | Ethnicity + gender + era                   |
 * | Death Drama               |  15 | Manner, years lost, age at death           |
 * | Cultural Crossover        |  10 | Non-Western birthplace in English media     |
 * | Wikipedia Interest Ratio  |  15 | Pageviews / popularity                     |
 * | International Recognition |  10 | Sitelinks / popularity                     |
 * | Life Complexity           |  10 | Military service, non-acting occupations   |
 */

// ============================================================================
// Types
// ============================================================================

export interface InterestingnessInput {
  birthday: string | null
  deathday: string | null

  // Wikidata demographics
  wikidataGender: string | null
  wikidataEthnicity: string | null
  wikidataBirthplaceCountry: string | null
  wikidataCitizenship: string | null
  wikidataMilitaryService: string | null
  wikidataOccupations: string | null

  // Existing DB fields
  deathManner: string | null
  yearsLost: number | null
  violentDeath: boolean | null
  ageAtDeath: number | null

  // Popularity / recognition
  dofPopularity: number | null
  wikipediaAnnualPageviews: number | null
  wikidataSitelinks: number | null
}

export interface InterestingnessResult {
  score: number
  breakdown: InterestingnessBreakdown
}

export interface InterestingnessBreakdown {
  eraScore: number
  demographicScore: number
  deathDramaScore: number
  culturalCrossoverScore: number
  wikiInterestRatioScore: number
  internationalRecognitionScore: number
  lifeComplexityScore: number
}

// ============================================================================
// Constants
// ============================================================================

/** English-speaking countries (not counted as "cultural crossover") */
const ENGLISH_SPEAKING_COUNTRIES = new Set([
  "united states of america",
  "united states",
  "united kingdom",
  "canada",
  "australia",
  "new zealand",
  "ireland",
])

/** Non-English-speaking European countries get a partial crossover score */
const EUROPEAN_COUNTRIES = new Set([
  "france",
  "germany",
  "italy",
  "spain",
  "sweden",
  "norway",
  "denmark",
  "netherlands",
  "belgium",
  "austria",
  "switzerland",
  "portugal",
  "greece",
  "poland",
  "czech republic",
  "czechia",
  "hungary",
  "romania",
  "finland",
  "iceland",
  "croatia",
  "serbia",
  "bulgaria",
])

/** Ethnicities indicating non-white background in US/UK context */
const NON_WHITE_ETHNICITY_PATTERNS = [
  /african american/i,
  /black/i,
  /hispanic/i,
  /latino/i,
  /latina/i,
  /chinese/i,
  /japanese/i,
  /korean/i,
  /indian/i,
  /native american/i,
  /indigenous/i,
  /filipino/i,
  /vietnamese/i,
  /thai/i,
  /arab/i,
  /persian/i,
  /mexican/i,
  /puerto rican/i,
  /cuban/i,
  /asian/i,
  /pacific islander/i,
  /maori/i,
  /aboriginal/i,
  /jewish/i, // faced significant barriers in early Hollywood
]

// ============================================================================
// Factor Calculations
// ============================================================================

/**
 * Era & Historical Context (0-20).
 * Actors born in earlier eras lived through more dramatic historical events
 * and navigated more constrained social systems.
 */
export function calculateEraScore(birthday: string | null): number {
  if (!birthday) return 0
  const birthYear = new Date(birthday).getFullYear()

  if (birthYear < 1900) return 20 // Silent film pioneers
  if (birthYear < 1920) return 18 // Depression + WWII
  if (birthYear < 1940) return 15 // Golden age of Hollywood
  if (birthYear < 1960) return 10 // Post-war, civil rights era
  if (birthYear < 1980) return 5
  return 2
}

/**
 * Demographic Barriers (0-20).
 * Non-white actors and women in earlier eras faced systemic barriers,
 * producing inherently dramatic stories of perseverance.
 * Factors can stack (capped at 20).
 */
export function calculateDemographicScore(
  birthday: string | null,
  wikidataGender: string | null,
  wikidataEthnicity: string | null,
  wikidataBirthplaceCountry: string | null
): number {
  if (!birthday) return 0
  const birthYear = new Date(birthday).getFullYear()
  let score = 0

  const isNonWhite = wikidataEthnicity
    ? NON_WHITE_ETHNICITY_PATTERNS.some((p) => p.test(wikidataEthnicity))
    : false

  // Non-white ethnicity scoring (from P172)
  if (isNonWhite) {
    if (birthYear < 1950) score += 20
    else if (birthYear < 1970) score += 15
    else score += 8
  } else if (!wikidataEthnicity && wikidataBirthplaceCountry) {
    // Ethnicity unknown — use non-US/UK birthplace as weaker proxy (half scores)
    const country = wikidataBirthplaceCountry.toLowerCase()
    const isWesternEnglish = ENGLISH_SPEAKING_COUNTRIES.has(country)
    const isEuropean = EUROPEAN_COUNTRIES.has(country)

    if (!isWesternEnglish && !isEuropean) {
      if (birthYear < 1950) score += 10
      else if (birthYear < 1970) score += 7
      else score += 4
    }
  }

  // Female gender scoring (stacks with ethnicity)
  const isFemale = wikidataGender?.toLowerCase() === "female"
  if (isFemale) {
    if (birthYear < 1940) score += 12
    else if (birthYear < 1960) score += 8
    else score += 3
  }

  return Math.min(score, 20)
}

/**
 * Death Drama (0-15).
 * Violent, unusual, or premature deaths are inherently more compelling narratives.
 */
export function calculateDeathDramaScore(
  deathManner: string | null,
  yearsLost: number | null,
  violentDeath: boolean | null,
  ageAtDeath: number | null
): number {
  let score = 0

  if (violentDeath) score += 8
  if (deathManner === "homicide" || deathManner === "suicide") score += 5

  if (yearsLost != null) {
    if (yearsLost > 20) score += 7
    else if (yearsLost > 10) score += 4
  }

  if (ageAtDeath != null) {
    if (ageAtDeath < 40) score += 5
    else if (ageAtDeath < 50) score += 3
  }

  return Math.min(score, 15)
}

/**
 * Cultural Crossover (0-10).
 * Actors born outside English-speaking countries who worked in
 * English-language entertainment navigated cultural/language barriers.
 */
export function calculateCulturalCrossoverScore(
  wikidataBirthplaceCountry: string | null,
  wikidataCitizenship: string | null
): number {
  if (!wikidataBirthplaceCountry) return 0

  let score = 0
  const birthCountry = wikidataBirthplaceCountry.toLowerCase()

  const isEnglishSpeaking = ENGLISH_SPEAKING_COUNTRIES.has(birthCountry)
  const isEuropean = EUROPEAN_COUNTRIES.has(birthCountry)

  if (!isEnglishSpeaking && !isEuropean) {
    // Non-Western, non-European birthplace
    score = 10
  } else if (isEuropean) {
    // Non-English European
    score = 7
  }

  // Bonus for different citizenship than birthplace (emigrant)
  if (wikidataCitizenship && wikidataBirthplaceCountry) {
    const citizenCountry = wikidataCitizenship.toLowerCase()
    if (citizenCountry !== birthCountry) {
      score += 3
    }
  }

  return Math.min(score, 10)
}

/**
 * Wikipedia Interest Ratio (0-15).
 * High pageviews relative to career popularity signals an actor
 * famous for their life story, not just their roles.
 */
export function calculateWikiInterestRatioScore(
  wikipediaAnnualPageviews: number | null,
  dofPopularity: number | null
): number {
  if (!wikipediaAnnualPageviews || !dofPopularity || dofPopularity <= 0) return 0

  const ratio = wikipediaAnnualPageviews / (dofPopularity * 10000)

  if (ratio > 5.0) return 15
  if (ratio > 2.0) return 12
  if (ratio > 1.0) return 8
  if (ratio > 0.5) return 4
  return 0
}

/**
 * International Recognition (0-10).
 * High Wikidata sitelinks relative to popularity means the person
 * is notable across many cultures and languages.
 */
export function calculateInternationalRecognitionScore(
  wikidataSitelinks: number | null,
  dofPopularity: number | null
): number {
  if (!wikidataSitelinks || !dofPopularity || dofPopularity <= 0) return 0

  const ratio = wikidataSitelinks / Math.max(dofPopularity, 1)

  if (ratio > 2.0) return 10
  if (ratio > 1.0) return 7
  if (ratio > 0.5) return 4
  return 0
}

/**
 * Life Complexity (0-10).
 * Military service and multiple non-acting careers suggest a rich,
 * multi-dimensional life story.
 */
export function calculateLifeComplexityScore(
  wikidataMilitaryService: string | null,
  wikidataOccupations: string | null
): number {
  let score = 0

  if (wikidataMilitaryService) score += 5

  if (wikidataOccupations) {
    const occupationCount = wikidataOccupations.split(", ").length
    if (occupationCount >= 2) score += 5
    else score += 3
  }

  return Math.min(score, 10)
}

// ============================================================================
// Main Calculator
// ============================================================================

/**
 * Calculate the interestingness score (0-100) for an actor.
 *
 * Pure function — takes all required data as input, returns score + breakdown.
 * No database or network calls.
 */
export function calculateInterestingnessScore(input: InterestingnessInput): InterestingnessResult {
  const eraScore = calculateEraScore(input.birthday)

  const demographicScore = calculateDemographicScore(
    input.birthday,
    input.wikidataGender,
    input.wikidataEthnicity,
    input.wikidataBirthplaceCountry
  )

  const deathDramaScore = calculateDeathDramaScore(
    input.deathManner,
    input.yearsLost,
    input.violentDeath,
    input.ageAtDeath
  )

  const culturalCrossoverScore = calculateCulturalCrossoverScore(
    input.wikidataBirthplaceCountry,
    input.wikidataCitizenship
  )

  const wikiInterestRatioScore = calculateWikiInterestRatioScore(
    input.wikipediaAnnualPageviews,
    input.dofPopularity
  )

  const internationalRecognitionScore = calculateInternationalRecognitionScore(
    input.wikidataSitelinks,
    input.dofPopularity
  )

  const lifeComplexityScore = calculateLifeComplexityScore(
    input.wikidataMilitaryService,
    input.wikidataOccupations
  )

  const breakdown: InterestingnessBreakdown = {
    eraScore,
    demographicScore,
    deathDramaScore,
    culturalCrossoverScore,
    wikiInterestRatioScore,
    internationalRecognitionScore,
    lifeComplexityScore,
  }

  const score =
    eraScore +
    demographicScore +
    deathDramaScore +
    culturalCrossoverScore +
    wikiInterestRatioScore +
    internationalRecognitionScore +
    lifeComplexityScore

  return {
    score: Math.min(score, 100),
    breakdown,
  }
}
