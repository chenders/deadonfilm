import { describe, it, expect } from "vitest"
import { buildPrompt, createBatchRequest } from "./prompt-builder.js"
import { MODEL_ID } from "./constants.js"
import type { ActorToProcess } from "./schemas.js"

describe("buildPrompt", () => {
  it("builds prompt with full actor data", () => {
    const actor: ActorToProcess = {
      id: 123,
      tmdb_id: 456,
      name: "John Smith",
      birthday: "1950-03-15",
      deathday: "2020-07-20",
      cause_of_death: null,
      cause_of_death_details: null,
    }

    const prompt = buildPrompt(actor)

    expect(prompt).toContain("John Smith")
    expect(prompt).toContain("born 1950")
    expect(prompt).toContain("died 2020")
    expect(prompt).toContain("actor/entertainer")
    expect(prompt).toContain("Return a JSON object")
  })

  it("builds prompt without birth year when birthday is null", () => {
    const actor: ActorToProcess = {
      id: 123,
      tmdb_id: 456,
      name: "Jane Doe",
      birthday: null,
      deathday: "2020-07-20",
      cause_of_death: null,
      cause_of_death_details: null,
    }

    const prompt = buildPrompt(actor)

    expect(prompt).toContain("Jane Doe")
    expect(prompt).not.toContain("born")
    expect(prompt).toContain("died 2020")
  })

  it("handles actor with null tmdb_id", () => {
    const actor: ActorToProcess = {
      id: 123,
      tmdb_id: null,
      name: "Unknown Actor",
      birthday: "1960-01-01",
      deathday: "2015-12-31",
      cause_of_death: null,
      cause_of_death_details: null,
    }

    const prompt = buildPrompt(actor)

    expect(prompt).toContain("Unknown Actor")
    expect(prompt).toContain("born 1960")
    expect(prompt).toContain("died 2015")
  })

  it("includes all required JSON fields in prompt", () => {
    const actor: ActorToProcess = {
      id: 1,
      tmdb_id: 1,
      name: "Test Actor",
      birthday: "1950-01-01",
      deathday: "2020-01-01",
      cause_of_death: null,
      cause_of_death_details: null,
    }

    const prompt = buildPrompt(actor)

    // Core death info
    expect(prompt).toContain("cause:")
    expect(prompt).toContain("cause_confidence:")
    expect(prompt).toContain("details:")

    // Categorization
    expect(prompt).toContain("manner:")
    expect(prompt).toContain("categories:")
    expect(prompt).toContain("covid_related:")
    expect(prompt).toContain("strange_death:")

    // Circumstances
    expect(prompt).toContain("circumstances:")
    expect(prompt).toContain("rumored_circumstances:")
    expect(prompt).toContain("notable_factors:")

    // Career context
    expect(prompt).toContain("location_of_death:")
    expect(prompt).toContain("last_project:")
    expect(prompt).toContain("career_status_at_death:")

    // Related celebrities
    expect(prompt).toContain("related_celebrities:")

    // Sources
    expect(prompt).toContain("sources:")

    // Additional
    expect(prompt).toContain("additional_context:")
    expect(prompt).toContain("corrections:")
  })

  it("includes confidence level definitions", () => {
    const actor: ActorToProcess = {
      id: 1,
      tmdb_id: 1,
      name: "Test",
      birthday: null,
      deathday: "2020-01-01",
      cause_of_death: null,
      cause_of_death_details: null,
    }

    const prompt = buildPrompt(actor)

    expect(prompt).toContain('"high"')
    expect(prompt).toContain('"medium"')
    expect(prompt).toContain('"low"')
    expect(prompt).toContain('"disputed"')
  })
})

describe("createBatchRequest", () => {
  it("creates request with correct structure", () => {
    const actor: ActorToProcess = {
      id: 789,
      tmdb_id: 101112,
      name: "Test Actor",
      birthday: "1940-05-20",
      deathday: "2010-11-15",
      cause_of_death: null,
      cause_of_death_details: null,
    }

    const request = createBatchRequest(actor)

    expect(request.custom_id).toBe("actor-789")
    expect(request.params.model).toBe(MODEL_ID)
    expect(request.params.max_tokens).toBe(2000)
    expect(request.params.messages).toHaveLength(1)
    expect(request.params.messages[0].role).toBe("user")
    expect(request.params.messages[0].content).toContain("Test Actor")
  })

  it("uses actor id in custom_id", () => {
    const actor: ActorToProcess = {
      id: 42,
      tmdb_id: 100,
      name: "Another Actor",
      birthday: null,
      deathday: "2000-01-01",
      cause_of_death: null,
      cause_of_death_details: null,
    }

    const request = createBatchRequest(actor)

    expect(request.custom_id).toBe("actor-42")
  })

  it("includes prompt in message content", () => {
    const actor: ActorToProcess = {
      id: 1,
      tmdb_id: 1,
      name: "Specific Name Here",
      birthday: "1970-06-15",
      deathday: "2020-03-20",
      cause_of_death: null,
      cause_of_death_details: null,
    }

    const request = createBatchRequest(actor)
    const content = request.params.messages[0].content as string

    expect(content).toContain("Specific Name Here")
    expect(content).toContain("born 1970")
    expect(content).toContain("died 2020")
  })
})
