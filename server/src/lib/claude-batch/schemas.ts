/**
 * Zod schemas for Claude Batch API response validation.
 * These provide runtime validation and type inference for Claude responses.
 */

import { z } from "zod"

// Enum schemas
export const ConfidenceLevelSchema = z.enum(["high", "medium", "low", "disputed"])
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>

export const DeathMannerSchema = z.enum([
  "natural",
  "accident",
  "suicide",
  "homicide",
  "undetermined",
  "pending",
])
export type DeathManner = z.infer<typeof DeathMannerSchema>

export const CareerStatusSchema = z.enum(["active", "semi-retired", "retired", "hiatus", "unknown"])
export type CareerStatus = z.infer<typeof CareerStatusSchema>

// Source entry schema
export const SourceEntrySchema = z.object({
  url: z.string().nullable(),
  archive_url: z.string().nullable(),
  description: z.string(),
})
export type SourceEntry = z.infer<typeof SourceEntrySchema>

// Project info schema
export const ProjectInfoSchema = z.object({
  title: z.string(),
  year: z.number().nullable(),
  tmdb_id: z.number().nullable(),
  imdb_id: z.string().nullable(),
  type: z.enum(["movie", "show", "documentary", "unknown"]),
})
export type ProjectInfo = z.infer<typeof ProjectInfoSchema>

// Related celebrity schema
export const RelatedCelebritySchema = z.object({
  name: z.string(),
  tmdb_id: z.number().nullable().optional(),
  relationship: z.string().optional(),
})
export type RelatedCelebrity = z.infer<typeof RelatedCelebritySchema>

// Corrections schema
export const CorrectionsSchema = z.object({
  birthYear: z.number().optional(),
  deathYear: z.number().optional(),
  deathDate: z.string().optional(),
})
export type Corrections = z.infer<typeof CorrectionsSchema>

// Sources object schema
export const SourcesSchema = z.object({
  cause: z.array(SourceEntrySchema).optional(),
  birthday: z.array(SourceEntrySchema).optional(),
  deathday: z.array(SourceEntrySchema).optional(),
  circumstances: z.array(SourceEntrySchema).optional(),
  rumored: z.array(SourceEntrySchema).optional(),
})
export type Sources = z.infer<typeof SourcesSchema>

// Main Claude response schema
export const ClaudeResponseSchema = z
  .object({
    // Core death info
    cause: z.string().nullable(),
    cause_confidence: ConfidenceLevelSchema.nullable(),
    details: z.string().nullable(),
    details_confidence: ConfidenceLevelSchema.nullable(),

    // Categorization
    manner: DeathMannerSchema.nullable(),
    categories: z.array(z.string()).nullable(),
    covid_related: z.boolean().nullable(),
    strange_death: z.boolean().nullable(),

    // Circumstances
    circumstances: z.string().nullable(),
    circumstances_confidence: ConfidenceLevelSchema.nullable(),
    rumored_circumstances: z.string().nullable(),
    notable_factors: z.array(z.string()).nullable(),

    // Date confidence
    birthday_confidence: ConfidenceLevelSchema.nullable(),
    deathday_confidence: ConfidenceLevelSchema.nullable(),

    // Career context
    location_of_death: z.string().nullable(),
    last_project: ProjectInfoSchema.nullable(),
    career_status_at_death: CareerStatusSchema.nullable(),
    posthumous_releases: z.array(ProjectInfoSchema).nullable(),

    // Related celebrities
    related_celebrities: z.array(RelatedCelebritySchema).nullable(),

    // Sources (per-field)
    sources: SourcesSchema.nullable(),

    // Additional context
    additional_context: z.string().nullable(),

    // Date corrections (legacy support)
    corrections: CorrectionsSchema.nullable(),
  })
  .partial() // Allow missing fields for graceful handling

export type ClaudeResponse = z.infer<typeof ClaudeResponseSchema>

// Checkpoint stats schema
export const CheckpointStatsSchema = z.object({
  submitted: z.number(),
  succeeded: z.number(),
  errored: z.number(),
  expired: z.number(),
  updatedCause: z.number(),
  updatedDetails: z.number(),
  updatedBirthday: z.number(),
  updatedDeathday: z.number(),
  updatedManner: z.number(),
  updatedCategories: z.number(),
  updatedCircumstances: z.number(),
  createdCircumstancesRecord: z.number(),
})
export type CheckpointStats = z.infer<typeof CheckpointStatsSchema>

// Checkpoint schema
export const CheckpointSchema = z.object({
  batchId: z.string().nullable(),
  processedActorIds: z.array(z.number()),
  startedAt: z.string(),
  lastUpdated: z.string(),
  stats: CheckpointStatsSchema,
})
export type Checkpoint = z.infer<typeof CheckpointSchema>

// Actor to process schema (from database)
export const ActorToProcessSchema = z.object({
  id: z.number(),
  tmdb_id: z.number(),
  name: z.string(),
  // PostgreSQL returns Date objects for date columns, but they might also be strings
  birthday: z.union([z.date(), z.string(), z.null()]),
  deathday: z.union([z.date(), z.string()]), // Deceased actors always have a deathday
  cause_of_death: z.string().nullable(),
  cause_of_death_details: z.string().nullable(),
})
export type ActorToProcess = z.infer<typeof ActorToProcessSchema>

/**
 * Create an empty checkpoint with zero stats.
 */
export function createEmptyCheckpoint(): Checkpoint {
  return {
    batchId: null,
    processedActorIds: [],
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
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
}
