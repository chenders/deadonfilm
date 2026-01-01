/* eslint-disable security/detect-non-literal-fs-filename -- Checkpoint file paths are provided by caller */
/**
 * Shared checkpoint utilities for backfill scripts.
 *
 * Provides generic load/save/delete functionality for checkpoint files
 * that track progress in long-running scripts.
 */

import fs from "fs"

/**
 * Load a checkpoint from a JSON file.
 *
 * @param filePath - Path to the checkpoint file
 * @returns The parsed checkpoint data, or null if file doesn't exist
 * @throws If the file exists but cannot be read or parsed (permission errors, corrupted JSON)
 */
export function loadCheckpoint<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null
  }

  try {
    const data = fs.readFileSync(filePath, "utf-8")
    return JSON.parse(data) as T
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    // Treat "file not found" as "no checkpoint" even if it occurs due to a race
    if (err.code === "ENOENT") {
      return null
    }
    console.error("Error loading checkpoint file:", error)
    throw error
  }
}

/**
 * Save a checkpoint to a JSON file.
 *
 * @param filePath - Path to the checkpoint file
 * @param checkpoint - The checkpoint data to save
 * @param updateTimestamp - Optional callback to update the lastUpdated field
 */
export function saveCheckpoint<T>(
  filePath: string,
  checkpoint: T,
  updateTimestamp?: (cp: T) => void
): void {
  try {
    if (updateTimestamp) {
      updateTimestamp(checkpoint)
    }
    fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2))
  } catch (error) {
    console.error("Warning: Could not save checkpoint:", error)
  }
}

/**
 * Delete a checkpoint file.
 *
 * @param filePath - Path to the checkpoint file
 */
export function deleteCheckpoint(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch (error) {
    console.error("Warning: Could not delete checkpoint:", error)
  }
}
