/**
 * Shared discovery persistence logic.
 *
 * Runs surprise discovery for a single actor and writes results to the database.
 * Used by both the single-actor admin route and the batch job handler.
 */

import type { Pool } from "pg"
import { logger } from "../../logger.js"
import type { DiscoveryConfig, DiscoveryResult } from "./types.js"
import type { DiscoveryActor } from "./orchestrator.js"

export interface DiscoveryOverrides {
  integrationStrategy?: string
  incongruityThreshold?: number
  maxCostPerActorUsd?: number
}

/**
 * Runs surprise discovery and persists results to the database.
 *
 * Writes discovery_results, prepends new lesser-known facts, updates narrative
 * if changed, syncs actors.biography, and re-invalidates the actor cache.
 *
 * @returns The discovery result, or null if discovery was skipped or failed
 */
export async function runDiscoveryAndPersist(
  db: Pool,
  actor: DiscoveryActor,
  narrative: string,
  existingFacts: Array<{ text: string; sourceUrl: string | null; sourceName: string | null }>,
  overrides: DiscoveryOverrides
): Promise<DiscoveryResult | null> {
  const { runSurpriseDiscovery } = await import("./orchestrator.js")
  const { DEFAULT_DISCOVERY_CONFIG } = await import("./types.js")

  const discoveryConfig: DiscoveryConfig = {
    ...DEFAULT_DISCOVERY_CONFIG,
    ...(overrides.integrationStrategy !== undefined && {
      integrationStrategy: overrides.integrationStrategy as DiscoveryConfig["integrationStrategy"],
    }),
    ...(overrides.incongruityThreshold !== undefined && {
      incongruityThreshold: overrides.incongruityThreshold,
    }),
    ...(overrides.maxCostPerActorUsd !== undefined && {
      maxCostPerActorUsd: overrides.maxCostPerActorUsd,
    }),
  }

  const discoveryResult = await runSurpriseDiscovery(
    db,
    actor,
    narrative,
    existingFacts,
    discoveryConfig
  )

  // Write discovery results to DB
  if (discoveryResult.hasFindings || discoveryResult.discoveryResults.autocomplete.queriesRun > 0) {
    const updateFields: string[] = ["discovery_results = $2", "updated_at = NOW()"]
    const updateParams: unknown[] = [actor.id, JSON.stringify(discoveryResult.discoveryResults)]
    let paramIdx = 3

    if (discoveryResult.newLesserKnownFacts.length > 0) {
      // Prepend discovery facts (most surprising) before enrichment facts
      updateFields.push(
        `lesser_known_facts = $${paramIdx}::jsonb || COALESCE(lesser_known_facts, '[]'::jsonb)`
      )
      updateParams.push(JSON.stringify(discoveryResult.newLesserKnownFacts))
      paramIdx++
    }

    if (discoveryResult.updatedNarrative) {
      updateFields.push(`narrative = $${paramIdx}`)
      updateParams.push(discoveryResult.updatedNarrative)
      paramIdx++
    }

    await db.query(
      `UPDATE actor_biography_details SET ${updateFields.join(", ")} WHERE actor_id = $1`,
      updateParams
    )

    // Sync actors.biography if narrative was updated
    if (discoveryResult.updatedNarrative) {
      await db.query(`UPDATE actors SET biography = $1, updated_at = NOW() WHERE id = $2`, [
        discoveryResult.updatedNarrative,
        actor.id,
      ])
    }

    // Re-invalidate cache after discovery write (the earlier invalidation
    // from writeBiographyToProduction ran before this UPDATE)
    const { invalidateActorCache } = await import("../../cache.js")
    await invalidateActorCache(actor.id)
  }

  return discoveryResult
}
