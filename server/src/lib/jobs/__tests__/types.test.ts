/**
 * Tests for job queue type system
 *
 * Validates:
 * - Zod schema validation
 * - Type inference
 * - Job type to queue mapping
 * - Queue configurations
 */

import { describe, it, expect } from "vitest"
import {
  JobType,
  QueueName,
  JobPriority,
  JobStatus,
  fetchOMDbRatingsPayloadSchema,
  fetchTraktRatingsPayloadSchema,
  fetchTheTVDBScoresPayloadSchema,
  enrichDeathDetailsPayloadSchema,
  warmActorCachePayloadSchema,
  jobPayloadSchemas,
  jobTypeToQueue,
  queueConfigs,
} from "../types.js"

describe("Job Types", () => {
  it("should have all job types defined", () => {
    expect(JobType.FETCH_OMDB_RATINGS).toBe("fetch-omdb-ratings")
    expect(JobType.FETCH_TRAKT_RATINGS).toBe("fetch-trakt-ratings")
    expect(JobType.FETCH_THETVDB_SCORES).toBe("fetch-thetvdb-scores")
    expect(JobType.ENRICH_DEATH_DETAILS).toBe("enrich-death-details")
    expect(JobType.WARM_ACTOR_CACHE).toBe("warm-actor-cache")
  })

  it("should have all queue names defined", () => {
    expect(QueueName.RATINGS).toBe("ratings")
    expect(QueueName.ENRICHMENT).toBe("enrichment")
    expect(QueueName.CACHE).toBe("cache")
    expect(QueueName.IMAGES).toBe("images")
    expect(QueueName.MAINTENANCE).toBe("maintenance")
  })

  it("should have all priority levels defined", () => {
    expect(JobPriority.LOW).toBe(1)
    expect(JobPriority.NORMAL).toBe(5)
    expect(JobPriority.HIGH).toBe(10)
    expect(JobPriority.CRITICAL).toBe(20)
  })

  it("should have all status values defined", () => {
    expect(JobStatus.PENDING).toBe("pending")
    expect(JobStatus.ACTIVE).toBe("active")
    expect(JobStatus.COMPLETED).toBe("completed")
    expect(JobStatus.FAILED).toBe("failed")
    expect(JobStatus.DELAYED).toBe("delayed")
    expect(JobStatus.CANCELLED).toBe("cancelled")
  })
})

describe("Payload Schemas", () => {
  describe("fetchOMDbRatingsPayloadSchema", () => {
    it("should validate correct movie payload", () => {
      const payload = {
        entityType: "movie" as const,
        entityId: 550,
        imdbId: "tt0137523",
      }

      const result = fetchOMDbRatingsPayloadSchema.safeParse(payload)
      expect(result.success).toBe(true)
    })

    it("should validate correct show payload", () => {
      const payload = {
        entityType: "show" as const,
        entityId: 1234,
        imdbId: "tt5555555",
      }

      const result = fetchOMDbRatingsPayloadSchema.safeParse(payload)
      expect(result.success).toBe(true)
    })

    it("should reject invalid entityType", () => {
      const payload = {
        entityType: "invalid",
        entityId: 550,
        imdbId: "tt0137523",
      }

      const result = fetchOMDbRatingsPayloadSchema.safeParse(payload)
      expect(result.success).toBe(false)
    })

    it("should reject invalid IMDb ID format", () => {
      const payload = {
        entityType: "movie" as const,
        entityId: 550,
        imdbId: "123456", // Missing 'tt' prefix
      }

      const result = fetchOMDbRatingsPayloadSchema.safeParse(payload)
      expect(result.success).toBe(false)
    })

    it("should reject negative entityId", () => {
      const payload = {
        entityType: "movie" as const,
        entityId: -1,
        imdbId: "tt0137523",
      }

      const result = fetchOMDbRatingsPayloadSchema.safeParse(payload)
      expect(result.success).toBe(false)
    })

    it("should reject zero entityId", () => {
      const payload = {
        entityType: "movie" as const,
        entityId: 0,
        imdbId: "tt0137523",
      }

      const result = fetchOMDbRatingsPayloadSchema.safeParse(payload)
      expect(result.success).toBe(false)
    })
  })

  describe("fetchTraktRatingsPayloadSchema", () => {
    it("should validate correct payload", () => {
      const payload = {
        entityType: "movie" as const,
        entityId: 550,
        imdbId: "tt0137523",
      }

      const result = fetchTraktRatingsPayloadSchema.safeParse(payload)
      expect(result.success).toBe(true)
    })
  })

  describe("fetchTheTVDBScoresPayloadSchema", () => {
    it("should validate correct payload", () => {
      const payload = {
        entityType: "show" as const,
        entityId: 1234,
        thetvdbId: 5678,
      }

      const result = fetchTheTVDBScoresPayloadSchema.safeParse(payload)
      expect(result.success).toBe(true)
    })

    it("should reject movie entityType", () => {
      const payload = {
        entityType: "movie" as const,
        entityId: 1234,
        thetvdbId: 5678,
      }

      const result = fetchTheTVDBScoresPayloadSchema.safeParse(payload)
      expect(result.success).toBe(false)
    })
  })

  describe("enrichDeathDetailsPayloadSchema", () => {
    it("should validate correct payload", () => {
      const payload = {
        actorId: 2157,
        actorName: "Brad Pitt",
        forceRefresh: false,
      }

      const result = enrichDeathDetailsPayloadSchema.safeParse(payload)
      expect(result.success).toBe(true)
    })

    it("should use default forceRefresh value", () => {
      const payload = {
        actorId: 2157,
        actorName: "Brad Pitt",
      }

      const result = enrichDeathDetailsPayloadSchema.safeParse(payload)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.forceRefresh).toBe(false)
      }
    })

    it("should reject empty actorName", () => {
      const payload = {
        actorId: 2157,
        actorName: "",
        forceRefresh: false,
      }

      const result = enrichDeathDetailsPayloadSchema.safeParse(payload)
      expect(result.success).toBe(false)
    })
  })

  describe("warmActorCachePayloadSchema", () => {
    it("should validate correct payload", () => {
      const payload = {
        actorId: 2157,
      }

      const result = warmActorCachePayloadSchema.safeParse(payload)
      expect(result.success).toBe(true)
    })
  })
})

describe("Job Payload Schemas Map", () => {
  it("should have schema for each job type", () => {
    const jobTypes = Object.values(JobType)

    jobTypes.forEach((jobType) => {
      expect(jobPayloadSchemas[jobType]).toBeDefined()
    })
  })

  it("should validate payloads through schema map", () => {
    const payload = {
      entityType: "movie" as const,
      entityId: 550,
      imdbId: "tt0137523",
    }

    const schema = jobPayloadSchemas[JobType.FETCH_OMDB_RATINGS]
    const result = schema.safeParse(payload)

    expect(result.success).toBe(true)
  })
})

describe("Job Type to Queue Mapping", () => {
  it("should map ratings job types to ratings queue", () => {
    expect(jobTypeToQueue[JobType.FETCH_OMDB_RATINGS]).toBe(QueueName.RATINGS)
    expect(jobTypeToQueue[JobType.FETCH_TRAKT_RATINGS]).toBe(QueueName.RATINGS)
    expect(jobTypeToQueue[JobType.FETCH_THETVDB_SCORES]).toBe(QueueName.RATINGS)
  })

  it("should map enrichment job types to enrichment queue", () => {
    expect(jobTypeToQueue[JobType.ENRICH_DEATH_DETAILS]).toBe(QueueName.ENRICHMENT)
    expect(jobTypeToQueue[JobType.ENRICH_CAUSE_OF_DEATH]).toBe(QueueName.ENRICHMENT)
  })

  it("should map cache job types to cache queue", () => {
    expect(jobTypeToQueue[JobType.WARM_ACTOR_CACHE]).toBe(QueueName.CACHE)
    expect(jobTypeToQueue[JobType.WARM_CONTENT_CACHE]).toBe(QueueName.CACHE)
  })

  it("should map image job types to images queue", () => {
    expect(jobTypeToQueue[JobType.PROCESS_ACTOR_IMAGE]).toBe(QueueName.IMAGES)
    expect(jobTypeToQueue[JobType.PROCESS_POSTER_IMAGE]).toBe(QueueName.IMAGES)
  })

  it("should map maintenance job types to maintenance queue", () => {
    expect(jobTypeToQueue[JobType.GENERATE_SITEMAP]).toBe(QueueName.MAINTENANCE)
    expect(jobTypeToQueue[JobType.CLEANUP_OLD_JOBS]).toBe(QueueName.MAINTENANCE)
    expect(jobTypeToQueue[JobType.SYNC_TMDB_CHANGES]).toBe(QueueName.MAINTENANCE)
  })

  it("should have mapping for all job types", () => {
    const jobTypes = Object.values(JobType)

    jobTypes.forEach((jobType) => {
      expect(jobTypeToQueue[jobType]).toBeDefined()
    })
  })
})

describe("Queue Configurations", () => {
  it("should have configuration for all queues", () => {
    const queueNames = Object.values(QueueName)

    queueNames.forEach((queueName) => {
      expect(queueConfigs[queueName]).toBeDefined()
    })
  })

  it("should have valid ratings queue config", () => {
    const config = queueConfigs[QueueName.RATINGS]

    expect(config.name).toBe(QueueName.RATINGS)
    expect(config.concurrency).toBe(5)
    expect(config.rateLimit).toBeDefined()
    expect(config.rateLimit?.max).toBe(5)
    expect(config.rateLimit?.duration).toBe(1000)
  })

  it("should have valid enrichment queue config", () => {
    const config = queueConfigs[QueueName.ENRICHMENT]

    expect(config.name).toBe(QueueName.ENRICHMENT)
    expect(config.concurrency).toBe(2)
    expect(config.rateLimit).toBeDefined()
  })

  it("should have valid cache queue config", () => {
    const config = queueConfigs[QueueName.CACHE]

    expect(config.name).toBe(QueueName.CACHE)
    expect(config.concurrency).toBe(10)
    expect(config.rateLimit).toBeUndefined() // No rate limit for cache
  })

  it("should have valid images queue config", () => {
    const config = queueConfigs[QueueName.IMAGES]

    expect(config.name).toBe(QueueName.IMAGES)
    expect(config.concurrency).toBe(3)
  })

  it("should have valid maintenance queue config", () => {
    const config = queueConfigs[QueueName.MAINTENANCE]

    expect(config.name).toBe(QueueName.MAINTENANCE)
    expect(config.concurrency).toBe(1) // Serial processing
    expect(config.rateLimit).toBeUndefined()
  })
})
