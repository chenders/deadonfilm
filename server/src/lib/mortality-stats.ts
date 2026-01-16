/**
 * Mortality Statistics Utilities
 *
 * Provides functions to calculate expected mortality for movie casts based on
 * actuarial life tables. Uses US Social Security Administration Period Life Tables
 * and Cohort Life Tables.
 *
 * Key concepts:
 * - qx: Probability of dying within one year at age x
 * - ex: Life expectancy at age x (remaining years expected to live)
 * - Cumulative survival: Probability of surviving from age A to age B
 * - Cohort life expectancy: Expected lifespan based on year of birth
 */

import { getPool } from "./db.js"

interface ActuarialEntry {
  age: number
  death_probability: number // qx
  life_expectancy: number // ex
}

// Cache for actuarial data (loaded once from DB)
let actuarialCache: Map<string, ActuarialEntry[]> | null = null

// Cache for cohort life expectancy data (loaded once from database)
interface CohortLifeExpectancyEntry {
  birthYear: number
  male: number
  female: number
  combined: number
}
let cohortLifeExpectancyCache: CohortLifeExpectancyEntry[] | null = null

/**
 * Load cohort life expectancy data from database
 * Data source: US SSA Actuarial Study No. 120
 */
async function loadCohortLifeExpectancy(): Promise<CohortLifeExpectancyEntry[]> {
  if (cohortLifeExpectancyCache) return cohortLifeExpectancyCache

  const db = getPool()
  const result = await db.query<{
    birth_year: number
    male: string
    female: string
    combined: string
  }>(`
    SELECT birth_year, male, female, combined
    FROM cohort_life_expectancy
    ORDER BY birth_year
  `)

  if (result.rows.length === 0) {
    throw new Error(
      "No cohort life expectancy data found in database. Run 'npm run seed:cohort' to populate the data."
    )
  }

  cohortLifeExpectancyCache = result.rows.map((row) => ({
    birthYear: row.birth_year,
    male: parseFloat(row.male),
    female: parseFloat(row.female),
    combined: parseFloat(row.combined),
  }))
  return cohortLifeExpectancyCache
}

/**
 * Get cohort life expectancy at birth for a given birth year
 * Uses linear interpolation between data points
 *
 * @param birthYear Year of birth
 * @param gender Gender for lookup (defaults to combined)
 * @returns Expected lifespan at birth for that birth cohort
 */
export async function getCohortLifeExpectancy(
  birthYear: number,
  gender: "male" | "female" | "combined" = "combined"
): Promise<number> {
  const data = await loadCohortLifeExpectancy()

  // Clamp to available data range
  const minYear = data[0].birthYear
  const maxYear = data[data.length - 1].birthYear

  if (birthYear <= minYear) {
    return data[0][gender]
  }
  if (birthYear >= maxYear) {
    return data[data.length - 1][gender]
  }

  // Find surrounding data points and interpolate
  for (let i = 0; i < data.length - 1; i++) {
    if (birthYear >= data[i].birthYear && birthYear < data[i + 1].birthYear) {
      const ratio = (birthYear - data[i].birthYear) / (data[i + 1].birthYear - data[i].birthYear)
      const lowerValue = data[i][gender]
      const upperValue = data[i + 1][gender]
      return lowerValue + ratio * (upperValue - lowerValue)
    }
  }

  // Fallback (shouldn't reach here)
  return data[data.length - 1][gender]
}

/**
 * Load actuarial data from the database into cache
 */
async function loadActuarialData(): Promise<Map<string, ActuarialEntry[]>> {
  if (actuarialCache) return actuarialCache

  const db = getPool()
  const result = await db.query<{
    age: number
    gender: string
    death_probability: string
    life_expectancy: string
  }>(`
    SELECT age, gender, death_probability, life_expectancy
    FROM actuarial_life_tables
    ORDER BY gender, age
  `)

  if (result.rows.length === 0) {
    throw new Error(
      "No actuarial data found in database. Run 'npm run seed:actuarial' to populate the data."
    )
  }

  actuarialCache = new Map()

  for (const row of result.rows) {
    const gender = row.gender
    if (!actuarialCache.has(gender)) {
      actuarialCache.set(gender, [])
    }
    actuarialCache.get(gender)!.push({
      age: row.age,
      death_probability: parseFloat(row.death_probability),
      life_expectancy: parseFloat(row.life_expectancy),
    })
  }

  return actuarialCache
}

/**
 * Calculate the probability that someone has died between two ages.
 *
 * Uses the cumulative death probability formula:
 * P(death between age A and B) = 1 - (product of (1 - qx) for each year from A to B-1)
 *
 * @param startAge Age at the start time (e.g., when movie was released)
 * @param endAge Current age (or age at death)
 * @param gender Gender for actuarial lookup
 * @returns Probability between 0 and 1
 */
export async function calculateCumulativeDeathProbability(
  startAge: number,
  endAge: number,
  gender: "male" | "female" | "combined" = "combined"
): Promise<number> {
  if (startAge >= endAge) return 0
  if (startAge < 0) startAge = 0
  if (endAge > 120) endAge = 120

  const data = await loadActuarialData()
  const entries = data.get(gender)

  if (!entries || entries.length === 0) {
    throw new Error(`No actuarial data found for gender: ${gender}`)
  }

  // Calculate probability of surviving each year
  let survivalProbability = 1.0

  for (let age = Math.floor(startAge); age < Math.floor(endAge); age++) {
    const entry = entries.find((e) => e.age === age)
    if (entry) {
      survivalProbability *= 1 - entry.death_probability
    }
  }

  // Death probability = 1 - survival probability
  return 1 - survivalProbability
}

/**
 * Actor data needed for mortality calculation
 */
export interface ActorForMortality {
  tmdbId: number
  name: string
  birthday: string | null // YYYY-MM-DD format
  deathday: string | null // YYYY-MM-DD format
}

/**
 * Result of expected mortality calculation for a single actor
 */
export interface ActorMortalityResult {
  tmdbId: number
  name: string
  ageAtFilming: number | null
  currentAge: number | null
  isDeceased: boolean
  deathProbability: number // Expected probability they would have died by now
  ageAtDeath: number | null
  expectedLifespan: number | null
  yearsLost: number | null
}

/**
 * Calculate expected mortality statistics for a movie's cast
 *
 * @param releaseYear Year the movie was released
 * @param actors List of actors with their birth/death dates
 * @param currentYear Current year (defaults to now)
 * @returns Statistics including expected deaths and per-actor breakdowns
 */
export async function calculateMovieMortality(
  releaseYear: number,
  actors: ActorForMortality[],
  currentYear: number = new Date().getFullYear()
): Promise<{
  expectedDeaths: number
  actualDeaths: number
  mortalitySurpriseScore: number
  actorResults: ActorMortalityResult[]
}> {
  const yearsSinceRelease = currentYear - releaseYear
  const actorResults: ActorMortalityResult[] = []
  let expectedDeaths = 0
  let actualDeaths = 0

  for (const actor of actors) {
    const isDeceased = actor.deathday !== null

    // Parse dates
    const birthYear = actor.birthday ? parseInt(actor.birthday.split("-")[0]) : null
    const deathYear = actor.deathday ? parseInt(actor.deathday.split("-")[0]) : null

    // Calculate ages
    const ageAtFilming = birthYear ? releaseYear - birthYear : null
    const currentAge = birthYear && !isDeceased ? currentYear - birthYear : null
    const ageAtDeath = birthYear && deathYear ? deathYear - birthYear : null

    // Check if actor died more than 3 years before movie release (archived footage)
    // These actors should be excluded from mortality calculations
    const isArchivedFootage = deathYear !== null && deathYear < releaseYear - 3

    // Calculate death probability (expected chance they would have died by now)
    let deathProbability = 0
    if (ageAtFilming !== null && ageAtFilming >= 0 && !isArchivedFootage) {
      // For actors who died same year as movie or within 1 year after:
      // Calculate probability from age at filming to at least 1 year later
      // This ensures actors who died same year don't get 0% probability
      const minEndAge = ageAtFilming + 1

      if (isDeceased && ageAtDeath !== null) {
        // Actor died: calculate probability up to their death age
        // Use at least 1 year span to handle same-year deaths
        const effectiveEndAge = Math.max(ageAtDeath, minEndAge)
        deathProbability = await calculateCumulativeDeathProbability(
          ageAtFilming,
          Math.min(effectiveEndAge, ageAtFilming + yearsSinceRelease),
          "combined"
        )
      } else {
        // Actor still alive: calculate probability over full time span
        deathProbability = await calculateCumulativeDeathProbability(
          ageAtFilming,
          ageAtFilming + yearsSinceRelease,
          "combined"
        )
      }
    }

    // Calculate expected lifespan and years lost for deceased actors
    // Using birth-year-specific cohort life expectancy
    let expectedLifespan: number | null = null
    let yearsLost: number | null = null
    if (birthYear && isDeceased && ageAtDeath !== null) {
      // Life expectancy at birth for their specific birth cohort
      expectedLifespan = await getCohortLifeExpectancy(birthYear, "combined")
      yearsLost = expectedLifespan - ageAtDeath
    }

    // Only count actors who weren't archived footage
    if (!isArchivedFootage) {
      expectedDeaths += deathProbability
      if (isDeceased) actualDeaths++
    }

    actorResults.push({
      tmdbId: actor.tmdbId,
      name: actor.name,
      ageAtFilming,
      currentAge,
      isDeceased,
      deathProbability,
      ageAtDeath,
      expectedLifespan: expectedLifespan !== null ? Math.round(expectedLifespan * 10) / 10 : null,
      yearsLost: yearsLost !== null ? Math.round(yearsLost * 10) / 10 : null,
    })
  }

  // Calculate surprise score: how much higher/lower actual deaths are vs expected
  // Positive = more deaths than expected ("cursed" movie)
  // Negative = fewer deaths than expected ("blessed" movie)
  const mortalitySurpriseScore =
    expectedDeaths > 0 ? (actualDeaths - expectedDeaths) / expectedDeaths : 0

  return {
    expectedDeaths: Math.round(expectedDeaths * 100) / 100,
    actualDeaths,
    mortalitySurpriseScore: Math.round(mortalitySurpriseScore * 1000) / 1000,
    actorResults,
  }
}

/**
 * Calculate years lost for a deceased person
 *
 * Uses birth-year-specific cohort life expectancy from US SSA data.
 * Someone born in 1920 had a different life expectancy than someone born in 1980.
 *
 * @param birthday Date of birth (YYYY-MM-DD)
 * @param deathday Date of death (YYYY-MM-DD)
 * @returns Years lost compared to life expectancy, or null if can't calculate
 */
export async function calculateYearsLost(
  birthday: string | null,
  deathday: string
): Promise<{ ageAtDeath: number; expectedLifespan: number; yearsLost: number } | null> {
  if (!birthday) return null

  const birthYear = parseInt(birthday.split("-")[0])
  const deathYear = parseInt(deathday.split("-")[0])
  const ageAtDeath = deathYear - birthYear

  if (isNaN(birthYear) || isNaN(deathYear) || ageAtDeath < 0) return null

  try {
    // Get life expectancy at birth for their specific birth cohort
    // This uses US SSA cohort life tables which vary by birth year
    const expectedLifespan = await getCohortLifeExpectancy(birthYear, "combined")
    const yearsLost = expectedLifespan - ageAtDeath

    return {
      ageAtDeath,
      expectedLifespan: Math.round(expectedLifespan * 10) / 10,
      yearsLost: Math.round(yearsLost * 10) / 10,
    }
  } catch {
    // Database not available - return null for years lost calculations
    // This allows E2E tests to run without database access
    return null
  }
}

/**
 * Clear all caches (useful for testing)
 */
export function clearActuarialCache(): void {
  actuarialCache = null
  cohortLifeExpectancyCache = null
}
