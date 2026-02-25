/**
 * Type definitions for the job queue system
 *
 * This file defines:
 * - Job types (all available job categories)
 * - Queue names (job routing)
 * - Priority levels
 * - Payload schemas (type-safe job data with Zod validation)
 * - Job options and results
 */

import { z } from "zod"

// ============================================================
// JOB TYPES
// ============================================================

/**
 * All available job types in the system
 *
 * Job types are organized by functional area:
 * - FETCH_*: External API data fetching
 * - ENRICH_*: Data enrichment/enhancement
 * - WARM_*: Cache warming
 * - GENERATE_*: Content generation
 * - PROCESS_*: Data processing
 */
export enum JobType {
  // Rating data fetching
  FETCH_OMDB_RATINGS = "fetch-omdb-ratings",
  FETCH_TRAKT_RATINGS = "fetch-trakt-ratings",
  FETCH_THETVDB_SCORES = "fetch-thetvdb-scores",

  // Death information enrichment
  ENRICH_DEATH_DETAILS = "enrich-death-details",
  ENRICH_DEATH_DETAILS_BATCH = "enrich-death-details-batch",
  ENRICH_CAUSE_OF_DEATH = "enrich-cause-of-death",

  // Cache operations
  WARM_ACTOR_CACHE = "warm-actor-cache",
  WARM_CONTENT_CACHE = "warm-content-cache",

  // Image processing
  PROCESS_ACTOR_IMAGE = "process-actor-image",
  PROCESS_POSTER_IMAGE = "process-poster-image",

  // Maintenance operations
  GENERATE_SITEMAP = "generate-sitemap",
  CLEANUP_OLD_JOBS = "cleanup-old-jobs",
  SYNC_TMDB_CHANGES = "sync-tmdb-changes",
  SYNC_TMDB_PEOPLE = "sync-tmdb-people",
  SYNC_TMDB_MOVIES = "sync-tmdb-movies",
  SYNC_TMDB_SHOWS = "sync-tmdb-shows",

  // Actor obscurity calculation
  CALCULATE_ACTOR_OBSCURITY = "calculate-actor-obscurity",

  // Popularity scoring
  CALCULATE_CONTENT_POPULARITY = "calculate-content-popularity",
  CALCULATE_ACTOR_POPULARITY = "calculate-actor-popularity",

  // Cache operations
  REBUILD_DEATH_CACHES = "rebuild-death-caches",

  // Biography generation
  GENERATE_BIOGRAPHIES_BATCH = "generate-biographies-batch",

  // Biography enrichment
  ENRICH_BIOGRAPHIES_BATCH = "enrich-biographies-batch",
}

// ============================================================
// QUEUE NAMES
// ============================================================

/**
 * Queue categories for job routing
 *
 * Each queue has different:
 * - Concurrency settings
 * - Rate limits
 * - Priority handling
 */
export enum QueueName {
  RATINGS = "ratings", // External rating API calls (OMDb, Trakt, TheTVDB)
  ENRICHMENT = "enrichment", // AI-powered enrichment (Claude, GPT)
  CACHE = "cache", // Cache warming operations
  IMAGES = "images", // Image processing
  MAINTENANCE = "maintenance", // Periodic maintenance tasks
}

// ============================================================
// JOB PRIORITY LEVELS
// ============================================================

/**
 * Priority levels for job processing
 *
 * Higher numbers = higher priority
 * Jobs with higher priority are processed first within a queue
 */
export enum JobPriority {
  LOW = 1, // Backfill operations, non-urgent tasks
  NORMAL = 5, // Default priority for most jobs
  HIGH = 10, // User-triggered operations
  CRITICAL = 20, // Time-sensitive operations (e.g., during user request)
}

// ============================================================
// JOB STATUS
// ============================================================

/**
 * Possible job states in the system
 */
export enum JobStatus {
  PENDING = "pending", // Waiting in queue
  ACTIVE = "active", // Currently being processed
  COMPLETED = "completed", // Successfully finished
  FAILED = "failed", // Failed after all retries
  DELAYED = "delayed", // Scheduled for future execution
  CANCELLED = "cancelled", // Manually cancelled
}

// ============================================================
// PAYLOAD SCHEMAS
// ============================================================

/**
 * Zod schemas for type-safe job payloads
 */

// Entity type for ratings
const entityTypeSchema = z.enum(["movie", "show"])

// OMDb ratings fetch payload
export const fetchOMDbRatingsPayloadSchema = z.object({
  entityType: entityTypeSchema,
  entityId: z.number().int().positive(), // TMDB ID
  imdbId: z.string().regex(/^tt\d+$/), // IMDb ID format: tt1234567
})

// Trakt ratings fetch payload
export const fetchTraktRatingsPayloadSchema = z.object({
  entityType: entityTypeSchema,
  entityId: z.number().int().positive(), // TMDB ID
  imdbId: z.string().regex(/^tt\d+$/), // IMDb ID format: tt1234567
})

// TheTVDB scores fetch payload
export const fetchTheTVDBScoresPayloadSchema = z.object({
  entityType: z.literal("show"), // TheTVDB is TV-only
  entityId: z.number().int().positive(), // TMDB ID
  thetvdbId: z.number().int().positive(), // TheTVDB ID
})

// Death details enrichment payload
export const enrichDeathDetailsPayloadSchema = z.object({
  actorId: z.number().int().positive(), // Internal actor.id
  actorName: z.string().min(1),
  forceRefresh: z.boolean().default(false),
})

// Cause of death enrichment payload
export const enrichCauseOfDeathPayloadSchema = z.object({
  actorId: z.number().int().positive(),
  actorName: z.string().min(1),
  deathDate: z.string().optional(), // Date string (e.g., "YYYY-MM-DD")
})

// Batch death details enrichment payload (for admin UI)
export const enrichDeathDetailsBatchPayloadSchema = z.object({
  runId: z.number().int().positive(),
  limit: z.number().int().positive().optional(),
  minPopularity: z.number().optional(),
  actorIds: z.array(z.number().int().positive()).min(1).optional(),
  tmdbIds: z.array(z.number().int().positive()).min(1).optional(),
  recentOnly: z.boolean().optional(),
  free: z.boolean().default(true),
  paid: z.boolean().default(true),
  ai: z.boolean().default(false),
  confidence: z.number().min(0).max(1).default(0.5),
  maxCostPerActor: z.number().optional(),
  maxTotalCost: z.number().optional(),
  claudeCleanup: z.boolean().default(true),
  gatherAllSources: z.boolean().default(true),
  followLinks: z.boolean().default(true),
  aiLinkSelection: z.boolean().default(true),
  aiContentExtraction: z.boolean().default(true),
  aiModel: z.string().optional(),
  maxLinks: z.number().int().positive().optional(),
  maxLinkCost: z.number().optional(),
  topBilledYear: z.number().int().positive().optional(),
  maxBilling: z.number().int().positive().optional(),
  topMovies: z.number().int().positive().optional(),
  usActorsOnly: z.boolean().default(false),
  ignoreCache: z.boolean().default(false),
  staging: z.boolean().default(false),
  // Wikipedia-specific options
  wikipediaUseAISectionSelection: z.boolean().default(false),
  wikipediaFollowLinkedArticles: z.boolean().default(false),
  wikipediaMaxLinkedArticles: z.number().int().positive().default(2),
  wikipediaMaxSections: z.number().int().positive().default(10),
})

// Actor cache warming payload
export const warmActorCachePayloadSchema = z.object({
  actorId: z.number().int().positive(),
})

// Content cache warming payload
export const warmContentCachePayloadSchema = z.object({
  entityType: entityTypeSchema,
  entityId: z.number().int().positive(),
})

// Image processing payloads - type-safe per job type
export const processActorImagePayloadSchema = z.object({
  imageUrl: z.string().url(),
  entityType: z.literal("actor"),
  entityId: z.number().int().positive(),
  imageType: z.literal("profile"),
})

export const processPosterImagePayloadSchema = z.object({
  imageUrl: z.string().url(),
  entityType: z.enum(["movie", "show"]),
  entityId: z.number().int().positive(),
  imageType: z.enum(["poster", "backdrop"]),
})

// Legacy schema for backward compatibility
export const processImagePayloadSchema = z.object({
  imageUrl: z.string().url(),
  entityType: z.enum(["actor", "movie", "show"]),
  entityId: z.number().int().positive(),
  imageType: z.enum(["profile", "poster", "backdrop"]),
})

// Sitemap generation payload (no parameters needed)
export const generateSitemapPayloadSchema = z.object({})

// Old job cleanup payload
export const cleanupOldJobsPayloadSchema = z.object({
  olderThanDays: z.number().int().positive().default(30),
})

// TMDB sync payload (orchestrator)
export const syncTMDBChangesPayloadSchema = z.object({
  startDate: z.string().optional(), // Date string (e.g., "YYYY-MM-DD")
  endDate: z.string().optional(), // Date string (e.g., "YYYY-MM-DD")
})

// TMDB people sync payload
export const syncTMDBPeoplePayloadSchema = z.object({
  startDate: z.string(), // Required - passed from orchestrator
  endDate: z.string(),
})

// TMDB movies sync payload
export const syncTMDBMoviesPayloadSchema = z.object({
  startDate: z.string(), // Required - passed from orchestrator
  endDate: z.string(),
})

// TMDB shows sync payload
export const syncTMDBShowsPayloadSchema = z.object({
  // No date range needed - queries active shows from database
})

// Actor obscurity calculation payload
export const calculateActorObscurityPayloadSchema = z.object({
  actorIds: z.array(z.number().int().positive()).min(1), // Internal actor.id values
  rebuildCachesOnComplete: z.boolean().default(true), // Whether to rebuild death caches after
})

// Death caches rebuild payload
export const rebuildDeathCachesPayloadSchema = z.object({
  // No parameters needed - rebuilds all death-related caches
})

// Biography batch generation payload
export const generateBiographiesBatchPayloadSchema = z.object({
  actorIds: z.array(z.number().int().positive()).optional(),
  limit: z.number().int().positive().max(500).optional(),
  minPopularity: z.number().min(0).finite().optional(),
  allowRegeneration: z.boolean().default(false),
})

// Biography enrichment batch payload
export const enrichBiographiesBatchPayloadSchema = z.object({
  runId: z.number().int().positive().optional(),
  actorIds: z.array(z.number().int().positive()).optional(),
  limit: z.number().int().positive().max(500).optional(),
  minPopularity: z.number().min(0).finite().optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  maxCostPerActor: z.number().optional(),
  maxTotalCost: z.number().optional(),
  earlyStopSourceCount: z.number().int().min(0).optional(), // 0 = disable early stopping (try all sources)
  allowRegeneration: z.boolean().default(false),
  useStaging: z.boolean().default(false),
  sourceCategories: z
    .object({
      free: z.boolean().default(true),
      reference: z.boolean().default(true),
      webSearch: z.boolean().default(true),
      news: z.boolean().default(true),
      obituary: z.boolean().default(true),
      archives: z.boolean().default(true),
      books: z.boolean().default(true),
    })
    .optional(),
})

// Content popularity calculation payload
export const calculateContentPopularityPayloadSchema = z.object({
  entityType: z.enum(["movie", "show"]),
  entityIds: z.array(z.number().int().positive()).min(1).optional(), // Specific IDs to process
  batchSize: z.number().int().positive().default(100),
  recalculateAll: z.boolean().default(false), // If true, recalculate even if already set
})

// Actor popularity calculation payload
export const calculateActorPopularityPayloadSchema = z.object({
  actorIds: z.array(z.number().int().positive()).min(1).optional(), // Specific IDs to process
  batchSize: z.number().int().positive().default(100),
  recalculateAll: z.boolean().default(false), // If true, recalculate even if already set
})

/**
 * Map of job types to their payload schemas
 */
export const jobPayloadSchemas = {
  [JobType.FETCH_OMDB_RATINGS]: fetchOMDbRatingsPayloadSchema,
  [JobType.FETCH_TRAKT_RATINGS]: fetchTraktRatingsPayloadSchema,
  [JobType.FETCH_THETVDB_SCORES]: fetchTheTVDBScoresPayloadSchema,
  [JobType.ENRICH_DEATH_DETAILS]: enrichDeathDetailsPayloadSchema,
  [JobType.ENRICH_DEATH_DETAILS_BATCH]: enrichDeathDetailsBatchPayloadSchema,
  [JobType.ENRICH_CAUSE_OF_DEATH]: enrichCauseOfDeathPayloadSchema,
  [JobType.WARM_ACTOR_CACHE]: warmActorCachePayloadSchema,
  [JobType.WARM_CONTENT_CACHE]: warmContentCachePayloadSchema,
  [JobType.PROCESS_ACTOR_IMAGE]: processActorImagePayloadSchema,
  [JobType.PROCESS_POSTER_IMAGE]: processPosterImagePayloadSchema,
  [JobType.GENERATE_SITEMAP]: generateSitemapPayloadSchema,
  [JobType.CLEANUP_OLD_JOBS]: cleanupOldJobsPayloadSchema,
  [JobType.SYNC_TMDB_CHANGES]: syncTMDBChangesPayloadSchema,
  [JobType.SYNC_TMDB_PEOPLE]: syncTMDBPeoplePayloadSchema,
  [JobType.SYNC_TMDB_MOVIES]: syncTMDBMoviesPayloadSchema,
  [JobType.SYNC_TMDB_SHOWS]: syncTMDBShowsPayloadSchema,
  [JobType.CALCULATE_ACTOR_OBSCURITY]: calculateActorObscurityPayloadSchema,
  [JobType.CALCULATE_CONTENT_POPULARITY]: calculateContentPopularityPayloadSchema,
  [JobType.CALCULATE_ACTOR_POPULARITY]: calculateActorPopularityPayloadSchema,
  [JobType.REBUILD_DEATH_CACHES]: rebuildDeathCachesPayloadSchema,
  [JobType.GENERATE_BIOGRAPHIES_BATCH]: generateBiographiesBatchPayloadSchema,
  [JobType.ENRICH_BIOGRAPHIES_BATCH]: enrichBiographiesBatchPayloadSchema,
} as const

// ============================================================
// PAYLOAD TYPE INFERENCE
// ============================================================

/**
 * Infer TypeScript types from Zod schemas
 */
export type FetchOMDbRatingsPayload = z.infer<typeof fetchOMDbRatingsPayloadSchema>
export type FetchTraktRatingsPayload = z.infer<typeof fetchTraktRatingsPayloadSchema>
export type FetchTheTVDBScoresPayload = z.infer<typeof fetchTheTVDBScoresPayloadSchema>
export type EnrichDeathDetailsPayload = z.infer<typeof enrichDeathDetailsPayloadSchema>
export type EnrichDeathDetailsBatchPayload = z.infer<typeof enrichDeathDetailsBatchPayloadSchema>
export type EnrichCauseOfDeathPayload = z.infer<typeof enrichCauseOfDeathPayloadSchema>
export type WarmActorCachePayload = z.infer<typeof warmActorCachePayloadSchema>
export type WarmContentCachePayload = z.infer<typeof warmContentCachePayloadSchema>
export type ProcessActorImagePayload = z.infer<typeof processActorImagePayloadSchema>
export type ProcessPosterImagePayload = z.infer<typeof processPosterImagePayloadSchema>
export type ProcessImagePayload = z.infer<typeof processImagePayloadSchema>
export type GenerateSitemapPayload = z.infer<typeof generateSitemapPayloadSchema>
export type CleanupOldJobsPayload = z.infer<typeof cleanupOldJobsPayloadSchema>
export type SyncTMDBChangesPayload = z.infer<typeof syncTMDBChangesPayloadSchema>
export type SyncTMDBPeoplePayload = z.infer<typeof syncTMDBPeoplePayloadSchema>
export type SyncTMDBMoviesPayload = z.infer<typeof syncTMDBMoviesPayloadSchema>
export type SyncTMDBShowsPayload = z.infer<typeof syncTMDBShowsPayloadSchema>
export type CalculateActorObscurityPayload = z.infer<typeof calculateActorObscurityPayloadSchema>
export type CalculateContentPopularityPayload = z.infer<
  typeof calculateContentPopularityPayloadSchema
>
export type CalculateActorPopularityPayload = z.infer<typeof calculateActorPopularityPayloadSchema>
export type RebuildDeathCachesPayload = z.infer<typeof rebuildDeathCachesPayloadSchema>
export type GenerateBiographiesBatchPayload = z.infer<typeof generateBiographiesBatchPayloadSchema>
export type EnrichBiographiesBatchPayload = z.infer<typeof enrichBiographiesBatchPayloadSchema>

/**
 * Union type of all possible payloads
 * Derived from JobPayloadMap to ensure type safety
 */
export type JobPayload = JobPayloadMap[keyof JobPayloadMap]

/**
 * Type-safe payload lookup by job type
 */
export type JobPayloadMap = {
  [JobType.FETCH_OMDB_RATINGS]: FetchOMDbRatingsPayload
  [JobType.FETCH_TRAKT_RATINGS]: FetchTraktRatingsPayload
  [JobType.FETCH_THETVDB_SCORES]: FetchTheTVDBScoresPayload
  [JobType.ENRICH_DEATH_DETAILS]: EnrichDeathDetailsPayload
  [JobType.ENRICH_DEATH_DETAILS_BATCH]: EnrichDeathDetailsBatchPayload
  [JobType.ENRICH_CAUSE_OF_DEATH]: EnrichCauseOfDeathPayload
  [JobType.WARM_ACTOR_CACHE]: WarmActorCachePayload
  [JobType.WARM_CONTENT_CACHE]: WarmContentCachePayload
  [JobType.PROCESS_ACTOR_IMAGE]: ProcessActorImagePayload
  [JobType.PROCESS_POSTER_IMAGE]: ProcessPosterImagePayload
  [JobType.GENERATE_SITEMAP]: GenerateSitemapPayload
  [JobType.CLEANUP_OLD_JOBS]: CleanupOldJobsPayload
  [JobType.SYNC_TMDB_CHANGES]: SyncTMDBChangesPayload
  [JobType.SYNC_TMDB_PEOPLE]: SyncTMDBPeoplePayload
  [JobType.SYNC_TMDB_MOVIES]: SyncTMDBMoviesPayload
  [JobType.SYNC_TMDB_SHOWS]: SyncTMDBShowsPayload
  [JobType.CALCULATE_ACTOR_OBSCURITY]: CalculateActorObscurityPayload
  [JobType.CALCULATE_CONTENT_POPULARITY]: CalculateContentPopularityPayload
  [JobType.CALCULATE_ACTOR_POPULARITY]: CalculateActorPopularityPayload
  [JobType.REBUILD_DEATH_CACHES]: RebuildDeathCachesPayload
  [JobType.GENERATE_BIOGRAPHIES_BATCH]: GenerateBiographiesBatchPayload
  [JobType.ENRICH_BIOGRAPHIES_BATCH]: EnrichBiographiesBatchPayload
}

// ============================================================
// JOB OPTIONS
// ============================================================

/**
 * Options when creating a job
 */
export interface JobOptions {
  jobId?: string // Override the job ID (default: auto-generated). Must be unique.
  priority?: JobPriority
  delay?: number // Delay in milliseconds before job is processed
  attempts?: number // Maximum number of retry attempts (default: 3)
  backoff?: {
    type: "exponential" | "fixed"
    delay: number // Base delay in milliseconds
  }
  removeOnComplete?: boolean | number // Remove job after completion (true/false or max number of completed jobs to keep)
  removeOnFail?: boolean | number // Remove job after failure (true/false or max number of failed jobs to keep)
  timeout?: number // Job timeout in milliseconds
  createdBy?: string // Who/what created this job (script name, route, etc.)
}

// ============================================================
// JOB RESULT
// ============================================================

/**
 * Result returned by job handlers
 */
export interface JobResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
  metadata?: Record<string, unknown>
}

// ============================================================
// JOB QUEUE CONFIGURATION
// ============================================================

/**
 * Configuration for each queue
 */
export interface QueueConfig {
  name: QueueName
  concurrency: number // Number of jobs processed concurrently
  rateLimit?: {
    max: number // Maximum number of jobs
    duration: number // Per duration in milliseconds
  }
}

/**
 * Default queue configurations
 */
export const queueConfigs: Record<QueueName, QueueConfig> = {
  [QueueName.RATINGS]: {
    name: QueueName.RATINGS,
    concurrency: 5, // 5 concurrent workers
    rateLimit: {
      max: 5, // 5 jobs
      duration: 1000, // per second (respects API limits)
    },
  },
  [QueueName.ENRICHMENT]: {
    name: QueueName.ENRICHMENT,
    concurrency: 2, // 2 concurrent workers (AI API calls are slow)
    rateLimit: {
      max: 2, // 2 jobs
      duration: 1000, // per second
    },
  },
  [QueueName.CACHE]: {
    name: QueueName.CACHE,
    concurrency: 10, // 10 concurrent workers (fast operations)
    rateLimit: undefined, // No rate limit for cache operations
  },
  [QueueName.IMAGES]: {
    name: QueueName.IMAGES,
    concurrency: 3, // 3 concurrent workers
    rateLimit: undefined, // No rate limit
  },
  [QueueName.MAINTENANCE]: {
    name: QueueName.MAINTENANCE,
    concurrency: 1, // 1 worker (maintenance tasks run serially)
    rateLimit: undefined, // No rate limit
  },
}

// ============================================================
// ADMIN API CONSTANTS
// ============================================================

/**
 * Maximum number of recent jobs to return in admin API
 */
export const MAX_RECENT_JOBS = 10

/**
 * Maximum number of jobs to clean in a single operation
 */
export const MAX_JOBS_TO_CLEAN = 1000

// ============================================================
// JOB TYPE TO QUEUE MAPPING
// ============================================================

/**
 * Map job types to their queues
 */
export const jobTypeToQueue: Record<JobType, QueueName> = {
  [JobType.FETCH_OMDB_RATINGS]: QueueName.RATINGS,
  [JobType.FETCH_TRAKT_RATINGS]: QueueName.RATINGS,
  [JobType.FETCH_THETVDB_SCORES]: QueueName.RATINGS,
  [JobType.ENRICH_DEATH_DETAILS]: QueueName.ENRICHMENT,
  [JobType.ENRICH_DEATH_DETAILS_BATCH]: QueueName.ENRICHMENT,
  [JobType.ENRICH_CAUSE_OF_DEATH]: QueueName.ENRICHMENT,
  [JobType.WARM_ACTOR_CACHE]: QueueName.CACHE,
  [JobType.WARM_CONTENT_CACHE]: QueueName.CACHE,
  [JobType.PROCESS_ACTOR_IMAGE]: QueueName.IMAGES,
  [JobType.PROCESS_POSTER_IMAGE]: QueueName.IMAGES,
  [JobType.GENERATE_SITEMAP]: QueueName.MAINTENANCE,
  [JobType.CLEANUP_OLD_JOBS]: QueueName.MAINTENANCE,
  [JobType.SYNC_TMDB_CHANGES]: QueueName.MAINTENANCE,
  [JobType.SYNC_TMDB_PEOPLE]: QueueName.MAINTENANCE,
  [JobType.SYNC_TMDB_MOVIES]: QueueName.MAINTENANCE,
  [JobType.SYNC_TMDB_SHOWS]: QueueName.MAINTENANCE,
  [JobType.CALCULATE_ACTOR_OBSCURITY]: QueueName.MAINTENANCE,
  [JobType.CALCULATE_CONTENT_POPULARITY]: QueueName.MAINTENANCE,
  [JobType.CALCULATE_ACTOR_POPULARITY]: QueueName.MAINTENANCE,
  [JobType.REBUILD_DEATH_CACHES]: QueueName.CACHE,
  [JobType.GENERATE_BIOGRAPHIES_BATCH]: QueueName.ENRICHMENT,
  [JobType.ENRICH_BIOGRAPHIES_BATCH]: QueueName.ENRICHMENT,
}
