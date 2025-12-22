/**
 * Shared constants and utilities for TV show import scripts.
 * Used by import-shows.ts, verify-shows.ts, and show-import-stats.ts.
 */

import { InvalidArgumentError } from "commander"

/**
 * Popularity thresholds for import phases.
 * Shows are categorized by their TMDB popularity score:
 * - popular: >= 50 (well-known shows)
 * - standard: 10-50 (moderately popular)
 * - obscure: < 10 (lesser-known shows)
 */
export const PHASE_THRESHOLDS = {
  popular: { min: 50, max: Infinity },
  standard: { min: 10, max: 50 },
  obscure: { min: 0, max: 10 },
} as const

export type ImportPhase = keyof typeof PHASE_THRESHOLDS

/**
 * Parse and validate a positive integer from a string.
 * Used for CLI argument parsing.
 *
 * @throws InvalidArgumentError if the value is not a positive integer
 */
export function parsePositiveInt(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

/**
 * Parse and validate an import phase from a string.
 * Used for CLI argument parsing.
 *
 * @throws InvalidArgumentError if the value is not a valid phase
 */
export function parsePhase(value: string): ImportPhase {
  if (!["popular", "standard", "obscure"].includes(value)) {
    throw new InvalidArgumentError("Phase must be: popular, standard, or obscure")
  }
  return value as ImportPhase
}
