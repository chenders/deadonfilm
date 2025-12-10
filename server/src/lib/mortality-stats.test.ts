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

  describe("edge cases for cursed movie calculations", () => {
    it("excludes actor who died more than 1 year BEFORE movie was released (archived footage)", async () => {
      // Herb Jeffries case: born 1913, died 2014, in a 2016 movie
      // Died 2 years before movie, so should be excluded as archived footage
      const actors: ActorForMortality[] = [
        { tmdbId: 1, name: "Archived Actor", birthday: "1913-09-24", deathday: "2014-05-25" },
      ]

      const result = await calculateMovieMortality(2016, actors, 2025)

      // This actor died more than 1 year BEFORE the movie was released
      // They should NOT be counted in mortality calculations (archived footage)
      expect(result.actualDeaths).toBe(0) // Excluded from actual deaths
      expect(result.actorResults[0].deathProbability).toBe(0) // No probability calculated
    })

    it("includes actor who died within 1 year before movie release", async () => {
      // Actor died 1 year before movie - still should be counted (not archived footage)
      const actors: ActorForMortality[] = [
        { tmdbId: 1, name: "Recent Death", birthday: "1934-11-13", deathday: "2015-07-19" },
      ]

      const result = await calculateMovieMortality(2016, actors, 2025)

      // Actor died within 1 year of movie release - should be included
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

      console.log(
        "Very old actor (103):",
        result.actorResults[0].ageAtFilming,
        "deathProb:",
        result.actorResults[0].deathProbability
      )

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
        // Herb Jeffries - born 1913, died 2014 (BEFORE the movie!) - archived footage
        { tmdbId: 3, name: "Herb Jeffries", birthday: "1913-09-24", deathday: "2014-05-25" },
        // Danielle - born 1975, still alive
        { tmdbId: 4, name: "Danielle", birthday: "1975-12-03", deathday: null },
        // Dita - born 1972, still alive
        { tmdbId: 5, name: "Dita", birthday: "1972-09-28", deathday: null },
        // Fiona - born 1983, still alive
        { tmdbId: 6, name: "Fiona", birthday: "1983-06-14", deathday: null },
      ]

      const result = await calculateMovieMortality(2016, actors, 2025)

      // Herb Jeffries died 2 years before movie release - excluded as archived footage
      // So only 2 actual deaths should be counted (Tempest Storm and Garry Marshall)
      expect(result.actualDeaths).toBe(2)

      // Expected deaths should now be higher:
      // - Tempest Storm was 88 at filming, 5 years until death - ~61% prob
      // - Garry Marshall was 82 at filming, same year death - ~7% prob for 1 year
      // - Herb Jeffries: excluded (archived footage)
      // - Living actors: small probabilities
      // Total expected should be around 0.7-0.8
      expect(result.expectedDeaths).toBeGreaterThan(0.6)

      // Garry Marshall (same-year death) should now have non-zero probability
      const garryResult = result.actorResults.find((a) => a.name === "Garry Marshall")
      expect(garryResult?.deathProbability).toBeGreaterThan(0)

      // Herb Jeffries (archived footage) should have 0 probability
      const herbResult = result.actorResults.find((a) => a.name === "Herb Jeffries")
      expect(herbResult?.deathProbability).toBe(0)
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
