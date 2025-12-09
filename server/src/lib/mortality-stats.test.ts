import { describe, it, expect, beforeAll, afterAll } from "vitest"
import {
  calculateCumulativeDeathProbability,
  calculateMovieMortality,
  calculateYearsLost,
  clearActuarialCache,
  type ActorForMortality,
} from "./mortality-stats.js"

// Note: These tests require a database connection with actuarial data seeded

describe("mortality-stats", () => {
  beforeAll(() => {
    // Clear cache before tests
    clearActuarialCache()
  })

  afterAll(() => {
    clearActuarialCache()
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

  describe("calculateYearsLost", () => {
    it("calculates years lost for young death", async () => {
      // Someone born in 1970 who died at 40 (in 2010)
      const result = await calculateYearsLost("1970-01-01", "2010-01-01")

      expect(result).not.toBeNull()
      expect(result!.ageAtDeath).toBe(40)
      expect(result!.yearsLost).toBeGreaterThan(25) // Life expectancy ~77, so lost ~37 years
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
