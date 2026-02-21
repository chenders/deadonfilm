/**
 * Shared helper for saving rejected notable factors to the database.
 * Used by both biography and death enrichment pipelines to track
 * factor suggestions from Claude that aren't in the valid sets.
 */

import type { Pool } from "pg"
import { logger } from "./logger.js"

/**
 * Save rejected factors to the database (fire-and-forget).
 * Builds a multi-row INSERT with parameterized values.
 * Errors are caught and logged internally so callers don't need to handle them.
 */
export async function saveRejectedFactors(
  pool: Pool,
  factors: string[],
  type: "life" | "death",
  actorId: number,
  actorName: string
): Promise<void> {
  if (factors.length === 0) return

  try {
    const source = type === "life" ? "biography-enrichment" : "death-enrichment"

    // Build multi-row INSERT: ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10), ...
    const values: (string | number)[] = []
    const placeholders: string[] = []

    for (let i = 0; i < factors.length; i++) {
      const offset = i * 5
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`
      )
      values.push(factors[i], type, actorId, actorName, source)
    }

    await pool.query(
      `INSERT INTO rejected_notable_factors (factor_name, factor_type, actor_id, actor_name, source)
       VALUES ${placeholders.join(", ")}`,
      values
    )
  } catch (error) {
    logger.error({ error, actorId, actorName, type, factors }, "Failed to save rejected factors")
  }
}
