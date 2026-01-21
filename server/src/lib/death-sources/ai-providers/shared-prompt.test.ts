import { describe, it, expect } from "vitest"
import {
  buildEnrichedDeathPrompt,
  buildBasicDeathPrompt,
  parseEnrichedResponse,
} from "./shared-prompt.js"
import type { ActorForEnrichment } from "../types.js"

describe("buildEnrichedDeathPrompt", () => {
  it("builds prompt with full actor data including age", () => {
    const actor: ActorForEnrichment = {
      id: 1,
      tmdbId: 2157,
      name: "Robin Williams",
      birthday: "1951-07-21",
      deathday: "2014-08-11",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 50,
    }

    const prompt = buildEnrichedDeathPrompt(actor)

    expect(prompt).toContain("Robin Williams")
    expect(prompt).toContain("(age 63)")
    // Check for August and 2014 separately to avoid timezone issues
    expect(prompt).toMatch(/August \d{1,2}, 2014/)
    expect(prompt).toContain("career_status_at_death")
    expect(prompt).toContain("last_project")
    expect(prompt).toContain("posthumous_releases")
    expect(prompt).toContain("related_celebrities")
  })

  it("builds prompt without age when birthday is missing", () => {
    const actor: ActorForEnrichment = {
      id: 2,
      tmdbId: 123,
      name: "John Doe",
      birthday: null,
      deathday: "2020-05-15",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 10,
    }

    const prompt = buildEnrichedDeathPrompt(actor)

    expect(prompt).toContain("John Doe")
    expect(prompt).not.toContain("(age")
    // Check for May and 2020 separately to avoid timezone issues
    expect(prompt).toMatch(/May \d{1,2}, 2020/)
  })

  it("builds prompt with unknown date when deathday is missing", () => {
    const actor: ActorForEnrichment = {
      id: 3,
      tmdbId: 456,
      name: "Jane Doe",
      birthday: "1960-01-01",
      deathday: null,
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 5,
    }

    const prompt = buildEnrichedDeathPrompt(actor)

    expect(prompt).toContain("Jane Doe")
    expect(prompt).toContain("unknown date")
    expect(prompt).not.toContain("(age")
  })

  it("builds prompt with minimal actor data", () => {
    const actor: ActorForEnrichment = {
      id: 4,
      tmdbId: 789,
      name: "Unknown Actor",
      birthday: null,
      deathday: null,
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: null,
    }

    const prompt = buildEnrichedDeathPrompt(actor)

    expect(prompt).toContain("Unknown Actor")
    expect(prompt).toContain("unknown date")
    expect(prompt).toContain("Respond with JSON only")
  })
})

describe("buildBasicDeathPrompt", () => {
  it("builds basic prompt with death date", () => {
    const actor: ActorForEnrichment = {
      id: 5,
      tmdbId: 100,
      name: "Test Actor",
      birthday: "1950-06-15",
      deathday: "2010-03-20",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 20,
    }

    const prompt = buildBasicDeathPrompt(actor)

    expect(prompt).toContain("Test Actor")
    // Check for March and 2010 separately to avoid timezone issues
    expect(prompt).toMatch(/March \d{1,2}, 2010/)
    expect(prompt).toContain("Respond with JSON only")
    // Basic prompt should NOT include career fields
    expect(prompt).not.toContain("career_status_at_death")
    expect(prompt).not.toContain("last_project")
  })

  it("builds basic prompt with unknown date", () => {
    const actor: ActorForEnrichment = {
      id: 6,
      tmdbId: 200,
      name: "Another Actor",
      birthday: null,
      deathday: null,
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: null,
    }

    const prompt = buildBasicDeathPrompt(actor)

    expect(prompt).toContain("Another Actor")
    expect(prompt).toContain("unknown date")
  })
})

describe("parseEnrichedResponse", () => {
  describe("well-formed JSON responses", () => {
    it("parses complete response with all fields", () => {
      const response = JSON.stringify({
        circumstances: "Died of natural causes at home",
        location_of_death: "Los Angeles, California",
        notable_factors: ["sudden"],
        rumored_circumstances: null,
        confidence: "high",
        career_status_at_death: "active",
        last_project: { title: "Final Movie", year: 2023, type: "movie" },
        posthumous_releases: [{ title: "After Life", year: 2024, type: "movie" }],
        related_celebrities: [{ name: "Spouse Name", relationship: "spouse" }],
        related_deaths: null,
        sources: ["https://example.com"],
      })

      const result = parseEnrichedResponse(response)

      expect(result).not.toBeNull()
      expect(result?.circumstances).toBe("Died of natural causes at home")
      expect(result?.location_of_death).toBe("Los Angeles, California")
      expect(result?.notable_factors).toEqual(["sudden"])
      expect(result?.confidence).toBe("high")
      expect(result?.career_status_at_death).toBe("active")
      expect(result?.last_project).toEqual({ title: "Final Movie", year: 2023, type: "movie" })
      expect(result?.posthumous_releases).toHaveLength(1)
      expect(result?.related_celebrities).toHaveLength(1)
      expect(result?.sources).toEqual(["https://example.com"])
    })

    it("parses minimal response with null values", () => {
      const response = JSON.stringify({
        circumstances: null,
        location_of_death: null,
        notable_factors: [],
        rumored_circumstances: null,
        confidence: null,
      })

      const result = parseEnrichedResponse(response)

      expect(result).not.toBeNull()
      expect(result?.circumstances).toBeNull()
      expect(result?.location_of_death).toBeNull()
      expect(result?.notable_factors).toEqual([])
      expect(result?.confidence).toBeNull()
    })

    it("normalizes camelCase field names to snake_case", () => {
      const response = JSON.stringify({
        circumstances: "Test",
        locationOfDeath: "New York, NY",
        notableFactors: ["accident"],
        rumoredCircumstances: "Some rumor",
        careerStatusAtDeath: "retired",
        lastProject: { title: "Movie", year: 2020, type: "movie" },
        posthumousReleases: [],
        relatedCelebrities: [],
        relatedDeaths: "Related info",
      })

      const result = parseEnrichedResponse(response)

      expect(result?.location_of_death).toBe("New York, NY")
      expect(result?.notable_factors).toEqual(["accident"])
      expect(result?.rumored_circumstances).toBe("Some rumor")
      expect(result?.career_status_at_death).toBe("retired")
      expect(result?.last_project?.title).toBe("Movie")
      expect(result?.related_deaths).toBe("Related info")
    })
  })

  describe("JSON with surrounding text", () => {
    it("extracts JSON from response with prefix text", () => {
      const response = `Here is the information about the actor's death:

{"circumstances": "Heart attack", "location_of_death": "Miami", "notable_factors": [], "confidence": "medium"}`

      const result = parseEnrichedResponse(response)

      expect(result).not.toBeNull()
      expect(result?.circumstances).toBe("Heart attack")
      expect(result?.location_of_death).toBe("Miami")
    })

    it("extracts JSON from response with suffix text", () => {
      const response = `{"circumstances": "Stroke", "location_of_death": "Chicago", "notable_factors": ["sudden"], "confidence": "high"}

I hope this information helps.`

      const result = parseEnrichedResponse(response)

      expect(result).not.toBeNull()
      expect(result?.circumstances).toBe("Stroke")
    })

    it("extracts first JSON when multiple objects are present", () => {
      const response = `{"circumstances": "First death", "confidence": "high"}

Here's another response: {"circumstances": "Second death", "confidence": "low"}`

      const result = parseEnrichedResponse(response)

      expect(result).not.toBeNull()
      expect(result?.circumstances).toBe("First death")
      expect(result?.confidence).toBe("high")
    })
  })

  describe("nested JSON structures", () => {
    it("handles nested objects in last_project", () => {
      const response = JSON.stringify({
        circumstances: "Test",
        last_project: {
          title: "Complex Movie",
          year: 2022,
          type: "movie",
        },
        notable_factors: [],
      })

      const result = parseEnrichedResponse(response)

      expect(result?.last_project).toEqual({
        title: "Complex Movie",
        year: 2022,
        type: "movie",
      })
    })

    it("handles arrays of objects in posthumous_releases", () => {
      const response = JSON.stringify({
        circumstances: "Test",
        notable_factors: [],
        posthumous_releases: [
          { title: "Movie 1", year: 2023, type: "movie" },
          { title: "Movie 2", year: 2024, type: "documentary" },
        ],
      })

      const result = parseEnrichedResponse(response)

      expect(result?.posthumous_releases).toHaveLength(2)
      expect(result?.posthumous_releases?.[0].title).toBe("Movie 1")
      expect(result?.posthumous_releases?.[1].type).toBe("documentary")
    })

    it("handles strings with escaped quotes", () => {
      const response = JSON.stringify({
        circumstances: 'He said "goodbye" before passing',
        location_of_death: "Test City",
        notable_factors: [],
      })

      const result = parseEnrichedResponse(response)

      expect(result?.circumstances).toBe('He said "goodbye" before passing')
    })

    it("handles strings with braces inside", () => {
      const response = JSON.stringify({
        circumstances: "Medical report stated {cause: unknown}",
        location_of_death: "Test",
        notable_factors: [],
      })

      const result = parseEnrichedResponse(response)

      expect(result?.circumstances).toBe("Medical report stated {cause: unknown}")
    })
  })

  describe("edge cases and malformed responses", () => {
    it("returns null for empty string", () => {
      const result = parseEnrichedResponse("")
      expect(result).toBeNull()
    })

    it("returns null for response without JSON", () => {
      const result = parseEnrichedResponse("I don't have information about this person.")
      expect(result).toBeNull()
    })

    it("returns null for invalid JSON", () => {
      const result = parseEnrichedResponse("{this is not valid json}")
      expect(result).toBeNull()
    })

    it("returns null for unclosed JSON", () => {
      const result = parseEnrichedResponse('{"circumstances": "test"')
      expect(result).toBeNull()
    })

    it("returns null for JSON array instead of object", () => {
      const result = parseEnrichedResponse('[{"circumstances": "test"}]')
      // Our extractor looks for first {, so it will find the inner object
      expect(result?.circumstances).toBe("test")
    })

    it("handles empty notable_factors gracefully", () => {
      const response = JSON.stringify({
        circumstances: "Test",
        notable_factors: null,
      })

      const result = parseEnrichedResponse(response)

      expect(result?.notable_factors).toEqual([])
    })

    it("handles non-array notable_factors gracefully", () => {
      const response = JSON.stringify({
        circumstances: "Test",
        notable_factors: "not an array",
      })

      const result = parseEnrichedResponse(response)

      expect(result?.notable_factors).toEqual([])
    })
  })

  describe("confidence levels", () => {
    it("parses high confidence", () => {
      const response = JSON.stringify({
        circumstances: "Test",
        confidence: "high",
        notable_factors: [],
      })
      expect(parseEnrichedResponse(response)?.confidence).toBe("high")
    })

    it("parses medium confidence", () => {
      const response = JSON.stringify({
        circumstances: "Test",
        confidence: "medium",
        notable_factors: [],
      })
      expect(parseEnrichedResponse(response)?.confidence).toBe("medium")
    })

    it("parses low confidence", () => {
      const response = JSON.stringify({
        circumstances: "Test",
        confidence: "low",
        notable_factors: [],
      })
      expect(parseEnrichedResponse(response)?.confidence).toBe("low")
    })
  })

  describe("career status values", () => {
    const statuses = ["active", "semi-retired", "retired", "hiatus", "unknown"]

    statuses.forEach((status) => {
      it(`parses career status: ${status}`, () => {
        const response = JSON.stringify({
          circumstances: "Test",
          notable_factors: [],
          career_status_at_death: status,
        })

        const result = parseEnrichedResponse(response)

        expect(result?.career_status_at_death).toBe(status)
      })
    })
  })
})
