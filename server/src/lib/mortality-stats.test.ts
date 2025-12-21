import { describe, it, expect, beforeEach, vi } from "vitest"

// Mock the database module before importing mortality-stats
vi.mock("./db.js", () => ({
  getPool: vi.fn(() => ({
    query: vi.fn(),
  })),
}))

import {
  calculateCumulativeDeathProbability,
  calculateMovieMortality,
  calculateYearsLost,
  clearActuarialCache,
  type ActorForMortality,
} from "./mortality-stats.js"
import { getPool } from "./db.js"

// Generate realistic actuarial data for testing
// Death probability increases with age (roughly exponential)
function generateActuarialData() {
  const rows: Array<{
    age: number
    gender: string
    death_probability: string
    life_expectancy: string
  }> = []

  for (let age = 0; age <= 119; age++) {
    // Simplified death probability formula that increases with age
    // Roughly matches real actuarial data patterns
    let deathProb: number
    if (age < 1) {
      deathProb = 0.006 // Infant mortality
    } else if (age < 20) {
      deathProb = 0.0003 + age * 0.00002
    } else if (age < 50) {
      deathProb = 0.001 + (age - 20) * 0.0002
    } else if (age < 80) {
      deathProb = 0.007 + (age - 50) * 0.003
    } else if (age < 100) {
      deathProb = 0.1 + (age - 80) * 0.015
    } else {
      deathProb = 0.4 + (age - 100) * 0.03 // Very high for 100+
    }

    // Life expectancy decreases with age
    const lifeExpectancy = Math.max(0, 80 - age * 0.7)

    rows.push({
      age,
      gender: "combined",
      death_probability: deathProb.toFixed(8),
      life_expectancy: lifeExpectancy.toFixed(2),
    })
  }

  return rows
}

// Generate cohort life expectancy data
function generateCohortLifeExpectancy() {
  const rows: Array<{
    birth_year: number
    male: string
    female: string
    combined: string
  }> = []

  // Generate data from 1900 to 2020
  for (let year = 1900; year <= 2020; year += 10) {
    // Life expectancy increased over time
    const baseExpectancy = 50 + (year - 1900) * 0.25
    rows.push({
      birth_year: year,
      male: (baseExpectancy - 3).toFixed(1),
      female: (baseExpectancy + 3).toFixed(1),
      combined: baseExpectancy.toFixed(1),
    })
  }

  return rows
}

const mockActuarialData = generateActuarialData()
const mockCohortData = generateCohortLifeExpectancy()

describe("mortality-stats", () => {
  beforeEach(() => {
    // Clear cache and reset mocks before each test
    clearActuarialCache()
    vi.clearAllMocks()

    // Setup mock database responses
    const mockQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("actuarial_life_tables")) {
        return Promise.resolve({ rows: mockActuarialData })
      }
      if (sql.includes("cohort_life_expectancy")) {
        return Promise.resolve({ rows: mockCohortData })
      }
      return Promise.resolve({ rows: [] })
    })

    vi.mocked(getPool).mockReturnValue({
      query: mockQuery,
    } as unknown as ReturnType<typeof getPool>)
  })

  describe("calculateCumulativeDeathProbability", () => {
    it("returns 0 for same start and end age", async () => {
      const prob = await calculateCumulativeDeathProbability(50, 50)
      expect(prob).toBe(0)
    })

    it("returns higher probability for longer time spans", async () => {
      const prob10Years = await calculateCumulativeDeathProbability(50, 60)
      const prob20Years = await calculateCumulativeDeathProbability(50, 70)

      expect(prob20Years).toBeGreaterThan(prob10Years)
    })

    it("returns higher probability for older starting ages", async () => {
      const probYoung = await calculateCumulativeDeathProbability(30, 40)
      const probOld = await calculateCumulativeDeathProbability(70, 80)

      expect(probOld).toBeGreaterThan(probYoung)
    })

    it("approaches 1.0 for very old ages", async () => {
      const prob = await calculateCumulativeDeathProbability(0, 110)
      expect(prob).toBeGreaterThan(0.95)
    })
  })

  describe("calculateMovieMortality", () => {
    it("calculates mortality for a simple case", async () => {
      const actors: ActorForMortality[] = [
        { tmdbId: 1, name: "Living Actor", birthday: "1980-01-01", deathday: null },
        { tmdbId: 2, name: "Deceased Actor", birthday: "1950-01-01", deathday: "2020-01-01" },
      ]

      const result = await calculateMovieMortality(2000, actors, 2024)

      expect(result.actualDeaths).toBe(1)
      expect(result.expectedDeaths).toBeGreaterThan(0)
      expect(result.actorResults).toHaveLength(2)
    })

    it("calculates age at filming correctly", async () => {
      const actors: ActorForMortality[] = [
        { tmdbId: 1, name: "Test Actor", birthday: "1970-06-15", deathday: null },
      ]

      const result = await calculateMovieMortality(2000, actors, 2024)

      expect(result.actorResults[0].ageAtFilming).toBe(30)
      expect(result.actorResults[0].currentAge).toBe(54)
    })

    it("handles actors with missing birthdays", async () => {
      const actors: ActorForMortality[] = [
        { tmdbId: 1, name: "Unknown Birthday", birthday: null, deathday: null },
      ]

      const result = await calculateMovieMortality(2000, actors, 2024)

      expect(result.actorResults[0].ageAtFilming).toBeNull()
      expect(result.actorResults[0].deathProbability).toBe(0)
    })

    it("calculates positive surprise score for more deaths than expected", async () => {
      // Old movie with young cast - most should still be alive
      const actors: ActorForMortality[] = [
        { tmdbId: 1, name: "Actor 1", birthday: "1980-01-01", deathday: "2010-01-01" },
        { tmdbId: 2, name: "Actor 2", birthday: "1980-01-01", deathday: "2015-01-01" },
        { tmdbId: 3, name: "Actor 3", birthday: "1980-01-01", deathday: null },
      ]

      const result = await calculateMovieMortality(2000, actors, 2024)

      // 2 deaths out of 3 young actors is unexpected
      expect(result.mortalitySurpriseScore).toBeGreaterThan(0)
    })
  })

  describe("edge cases for cursed movie calculations", () => {
    it("excludes actor who died more than 3 years BEFORE movie was released (archived footage)", async () => {
      // Actor died 4 years before movie, so should be excluded as archived footage
      const actors: ActorForMortality[] = [
        { tmdbId: 1, name: "Archived Actor", birthday: "1913-09-24", deathday: "2012-05-25" },
      ]

      const result = await calculateMovieMortality(2016, actors, 2025)

      // This actor died more than 3 years BEFORE the movie was released
      // They should NOT be counted in mortality calculations (archived footage)
      expect(result.actualDeaths).toBe(0) // Excluded from actual deaths
      expect(result.actorResults[0].deathProbability).toBe(0) // No probability calculated
    })

    it("includes actor who died within 3 years before movie release", async () => {
      // Actor died 2 years before movie - still should be counted (not archived footage)
      const actors: ActorForMortality[] = [
        { tmdbId: 1, name: "Recent Death", birthday: "1934-11-13", deathday: "2014-07-19" },
      ]

      const result = await calculateMovieMortality(2016, actors, 2025)

      // Actor died within 3 years of movie release - should be included
      expect(result.actualDeaths).toBe(1)
      expect(result.actorResults[0].deathProbability).toBeGreaterThan(0)
    })

    it("handles actor who died SAME YEAR as movie release", async () => {
      // Garry Marshall case: born 1934, died 2016, in 2016 movie
      const actors: ActorForMortality[] = [
        { tmdbId: 1, name: "Same Year Death", birthday: "1934-11-13", deathday: "2016-07-19" },
      ]

      const result = await calculateMovieMortality(2016, actors, 2025)

      // ageAtFilming = 2016 - 1934 = 82
      // ageAtDeath = 2016 - 1934 = 82
      // With the fix: uses at least 1 year span, so calculates probability for age 82-83
      expect(result.actualDeaths).toBe(1)
      // Now properly calculates death probability > 0 for same-year deaths
      expect(result.actorResults[0].deathProbability).toBeGreaterThan(0)
    })

    it("handles very old actor at filming (103+ years old)", async () => {
      // Herb Jeffries case if he were still alive at filming
      const actors: ActorForMortality[] = [
        { tmdbId: 1, name: "Very Old Actor", birthday: "1913-01-01", deathday: null },
      ]

      const result = await calculateMovieMortality(2016, actors, 2025)

      // At 103, the cumulative death probability over 9 years should be very high (>99%)
      expect(result.actorResults[0].deathProbability).toBeGreaterThan(0.99)
    })

    it("calculates Tempest Storm documentary correctly", async () => {
      // Real case: Tempest Storm (2016 documentary)
      const actors: ActorForMortality[] = [
        // Tempest Storm - born 1928, died 2021 (5 years after movie)
        { tmdbId: 1, name: "Tempest Storm", birthday: "1928-02-29", deathday: "2021-04-20" },
        // Garry Marshall - born 1934, died 2016 (same year as movie)
        { tmdbId: 2, name: "Garry Marshall", birthday: "1934-11-13", deathday: "2016-07-19" },
        // Herb Jeffries - born 1913, died 2014 (2 years BEFORE the movie - within 3 year window)
        { tmdbId: 3, name: "Herb Jeffries", birthday: "1913-09-24", deathday: "2014-05-25" },
        // Old Timer - born 1910, died 2010 (6 years BEFORE the movie!) - archived footage
        { tmdbId: 7, name: "Old Timer", birthday: "1910-01-01", deathday: "2010-01-01" },
        // Danielle - born 1975, still alive
        { tmdbId: 4, name: "Danielle", birthday: "1975-12-03", deathday: null },
        // Dita - born 1972, still alive
        { tmdbId: 5, name: "Dita", birthday: "1972-09-28", deathday: null },
        // Fiona - born 1983, still alive
        { tmdbId: 6, name: "Fiona", birthday: "1983-06-14", deathday: null },
      ]

      const result = await calculateMovieMortality(2016, actors, 2025)

      // Old Timer died 6 years before movie release - excluded as archived footage
      // Herb Jeffries died 2 years before - included (within 3 year window)
      // So 3 actual deaths: Tempest Storm, Garry Marshall, Herb Jeffries
      expect(result.actualDeaths).toBe(3)

      // Expected deaths should be greater than 0
      expect(result.expectedDeaths).toBeGreaterThan(0.6)

      // Garry Marshall (same-year death) should now have non-zero probability
      const garryResult = result.actorResults.find((a) => a.name === "Garry Marshall")
      expect(garryResult?.deathProbability).toBeGreaterThan(0)

      // Herb Jeffries (died 2 years before, within 3 year window) should have non-zero probability
      const herbResult = result.actorResults.find((a) => a.name === "Herb Jeffries")
      expect(herbResult?.deathProbability).toBeGreaterThan(0)

      // Old Timer (archived footage - died 6 years before) should have 0 probability
      const oldTimerResult = result.actorResults.find((a) => a.name === "Old Timer")
      expect(oldTimerResult?.deathProbability).toBe(0)
    })
  })

  describe("calculateYearsLost", () => {
    it("calculates years lost for young death", async () => {
      // Someone born in 1970 who died at 40 (in 2010)
      const result = await calculateYearsLost("1970-01-01", "2010-01-01")

      expect(result).not.toBeNull()
      expect(result!.ageAtDeath).toBe(40)
      // Life expectancy for 1970 birth cohort is ~67.5 in our mock data
      // So years lost = 67.5 - 40 = 27.5
      expect(result!.yearsLost).toBeGreaterThan(20)
    })

    it("returns null for missing birthday", async () => {
      const result = await calculateYearsLost(null, "2010-01-01")
      expect(result).toBeNull()
    })

    it("returns lower years lost for older deaths", async () => {
      const youngDeath = await calculateYearsLost("1940-01-01", "1980-01-01") // died at 40
      const oldDeath = await calculateYearsLost("1940-01-01", "2020-01-01") // died at 80

      expect(youngDeath!.yearsLost).toBeGreaterThan(oldDeath!.yearsLost)
    })
  })
})
