import { describe, it, expect } from "vitest"
import { ClaudeResponseSchema, CheckpointSchema, createEmptyCheckpoint } from "./schemas.js"

describe("ClaudeResponseSchema", () => {
  it("validates a complete response", () => {
    const response = {
      cause: "heart failure",
      cause_confidence: "high",
      details: "Had been battling heart disease for several years.",
      details_confidence: "medium",
      manner: "natural",
      categories: ["heart_disease"],
      covid_related: false,
      strange_death: false,
      circumstances: "The actor passed away peacefully at home.",
      circumstances_confidence: "high",
      rumored_circumstances: null,
      notable_factors: null,
      birthday_confidence: "high",
      deathday_confidence: "high",
      location_of_death: "Los Angeles, CA",
      last_project: {
        title: "Final Movie",
        year: 2022,
        tmdb_id: 12345,
        imdb_id: "tt1234567",
        type: "movie" as const,
      },
      career_status_at_death: "active",
      posthumous_releases: null,
      related_celebrities: null,
      sources: null,
      additional_context: null,
      corrections: null,
    }

    const result = ClaudeResponseSchema.parse(response)
    expect(result.cause).toBe("heart failure")
    expect(result.manner).toBe("natural")
  })

  it("validates a minimal response", () => {
    const response = {
      cause: "cancer",
    }

    const result = ClaudeResponseSchema.parse(response)
    expect(result.cause).toBe("cancer")
    expect(result.details).toBeUndefined()
  })

  it("validates response with null values", () => {
    const response = {
      cause: null,
      details: null,
      manner: null,
    }

    const result = ClaudeResponseSchema.parse(response)
    expect(result.cause).toBeNull()
    expect(result.details).toBeNull()
    expect(result.manner).toBeNull()
  })

  it("validates all confidence levels", () => {
    const levels = ["high", "medium", "low", "disputed"]
    for (const level of levels) {
      const response = { cause_confidence: level }
      const result = ClaudeResponseSchema.parse(response)
      expect(result.cause_confidence).toBe(level)
    }
  })

  it("validates all death manners", () => {
    const manners = ["natural", "accident", "suicide", "homicide", "undetermined", "pending"]
    for (const manner of manners) {
      const response = { manner }
      const result = ClaudeResponseSchema.parse(response)
      expect(result.manner).toBe(manner)
    }
  })

  it("validates all career statuses", () => {
    const statuses = ["active", "semi-retired", "retired", "hiatus", "unknown"]
    for (const status of statuses) {
      const response = { career_status_at_death: status }
      const result = ClaudeResponseSchema.parse(response)
      expect(result.career_status_at_death).toBe(status)
    }
  })

  it("rejects invalid confidence level", () => {
    const response = { cause_confidence: "invalid" }
    expect(() => ClaudeResponseSchema.parse(response)).toThrow()
  })
})

describe("CheckpointSchema", () => {
  it("validates a complete checkpoint", () => {
    const checkpoint = {
      batchId: "msgbatch_123",
      processedActorIds: [1, 2, 3],
      startedAt: "2024-01-01T00:00:00.000Z",
      lastUpdated: "2024-01-01T01:00:00.000Z",
      stats: {
        submitted: 10,
        succeeded: 8,
        errored: 1,
        expired: 1,
        updatedCause: 5,
        updatedDetails: 3,
        updatedBirthday: 1,
        updatedDeathday: 0,
        updatedManner: 2,
        updatedCategories: 1,
        updatedCircumstances: 3,
        createdCircumstancesRecord: 4,
      },
    }

    const result = CheckpointSchema.parse(checkpoint)
    expect(result.batchId).toBe("msgbatch_123")
    expect(result.stats.succeeded).toBe(8)
  })

  it("validates checkpoint with null batchId", () => {
    const checkpoint = {
      batchId: null,
      processedActorIds: [],
      startedAt: "2024-01-01T00:00:00.000Z",
      lastUpdated: "2024-01-01T00:00:00.000Z",
      stats: {
        submitted: 0,
        succeeded: 0,
        errored: 0,
        expired: 0,
        updatedCause: 0,
        updatedDetails: 0,
        updatedBirthday: 0,
        updatedDeathday: 0,
        updatedManner: 0,
        updatedCategories: 0,
        updatedCircumstances: 0,
        createdCircumstancesRecord: 0,
      },
    }

    const result = CheckpointSchema.parse(checkpoint)
    expect(result.batchId).toBeNull()
  })
})

describe("createEmptyCheckpoint", () => {
  it("creates a checkpoint with null batchId", () => {
    const checkpoint = createEmptyCheckpoint()
    expect(checkpoint.batchId).toBeNull()
  })

  it("creates a checkpoint with empty processedActorIds array", () => {
    const checkpoint = createEmptyCheckpoint()
    expect(checkpoint.processedActorIds).toEqual([])
  })

  it("creates a checkpoint with all stats at zero", () => {
    const checkpoint = createEmptyCheckpoint()
    expect(checkpoint.stats.submitted).toBe(0)
    expect(checkpoint.stats.succeeded).toBe(0)
    expect(checkpoint.stats.errored).toBe(0)
    expect(checkpoint.stats.expired).toBe(0)
    expect(checkpoint.stats.updatedCause).toBe(0)
    expect(checkpoint.stats.updatedDetails).toBe(0)
    expect(checkpoint.stats.updatedBirthday).toBe(0)
    expect(checkpoint.stats.updatedDeathday).toBe(0)
    expect(checkpoint.stats.updatedManner).toBe(0)
    expect(checkpoint.stats.updatedCategories).toBe(0)
    expect(checkpoint.stats.updatedCircumstances).toBe(0)
    expect(checkpoint.stats.createdCircumstancesRecord).toBe(0)
  })

  it("creates a checkpoint with valid ISO date strings", () => {
    const checkpoint = createEmptyCheckpoint()
    expect(() => new Date(checkpoint.startedAt)).not.toThrow()
    expect(() => new Date(checkpoint.lastUpdated)).not.toThrow()
  })

  it("creates a checkpoint that passes schema validation", () => {
    const checkpoint = createEmptyCheckpoint()
    expect(() => CheckpointSchema.parse(checkpoint)).not.toThrow()
  })
})
