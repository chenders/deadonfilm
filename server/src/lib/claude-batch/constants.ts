/**
 * Constants for Claude Batch API operations.
 */

import path from "path"
import { CLAUDE_MODELS } from "../claude-models.js"

/** Claude model ID for batch processing */
export const MODEL_ID = CLAUDE_MODELS.opus.id

/** Source name for database records */
export const SOURCE_NAME = "claude-opus-4.5-batch"

/**
 * Minimum content length thresholds for determining if actor has detailed death info.
 * Content must be substantive (not just "natural causes" or similar brief text).
 */
export const MIN_CIRCUMSTANCES_LENGTH = 200
export const MIN_RUMORED_CIRCUMSTANCES_LENGTH = 100

/** Default checkpoint file path */
export const DEFAULT_CHECKPOINT_FILE = path.join(
  process.cwd(),
  ".backfill-cause-of-death-batch-checkpoint.json"
)
