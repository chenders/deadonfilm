/**
 * Claude Batch API module.
 * Provides utilities for batch processing actor death information using Claude Opus 4.5.
 */

// Constants
export {
  MODEL_ID,
  SOURCE_NAME,
  MIN_CIRCUMSTANCES_LENGTH,
  MIN_RUMORED_CIRCUMSTANCES_LENGTH,
  DEFAULT_CHECKPOINT_FILE,
} from "./constants.js"

// Schemas and types
export {
  ConfidenceLevelSchema,
  DeathMannerSchema,
  CareerStatusSchema,
  SourceEntrySchema,
  ProjectInfoSchema,
  RelatedCelebritySchema,
  CorrectionsSchema,
  SourcesSchema,
  ClaudeResponseSchema,
  CheckpointStatsSchema,
  CheckpointSchema,
  ActorToProcessSchema,
  createEmptyCheckpoint,
  type ConfidenceLevel,
  type DeathManner,
  type CareerStatus,
  type SourceEntry,
  type ProjectInfo,
  type RelatedCelebrity,
  type Corrections,
  type Sources,
  type ClaudeResponse,
  type CheckpointStats,
  type Checkpoint,
  type ActorToProcess,
} from "./schemas.js"

// Response parsing
export {
  stripMarkdownCodeFences,
  parseClaudeResponse,
  safeParseClaudeResponse,
} from "./response-parser.js"

// Date utilities
export {
  normalizeDateToString,
  getYearFromDate,
  getMonthDayFromDate,
  getBirthYear,
  getDeathYear,
} from "./date-utils.js"

// Prompt building
export { buildPrompt, createBatchRequest } from "./prompt-builder.js"

// Actor updates
export { applyUpdate } from "./actor-updater.js"

// Failure recovery
export { storeFailure, reprocessFailures, type FailureErrorType } from "./failure-recovery.js"

// Batch operations
export {
  loadCheckpoint,
  saveCheckpoint,
  deleteCheckpoint,
  buildActorQuery,
  submitBatch,
  checkBatchStatus,
  processResults,
  type SubmitBatchOptions,
} from "./batch-operations.js"
