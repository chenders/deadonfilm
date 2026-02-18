/**
 * Biography Enrichment Database Writer
 *
 * Writes biography enrichment results to the actor_biography_details table.
 * Follows the same pattern as enrichment-db-writer.ts (death enrichment) but
 * targets biography-specific tables and fields.
 */

import type { Pool } from "pg"
import type { BiographyData, BiographySourceEntry } from "./biography-sources/types.js"
import { invalidateActorCache } from "./cache.js"

/**
 * Writes biography enrichment data directly to production tables.
 *
 * Steps:
 * 1. Archive old biography to biography_legacy (one-time, only if not already archived)
 * 2. Upsert actor_biography_details with COALESCE strategy
 * 3. Update actors table (biography = narrativeTeaser, increment biography_version)
 * 4. Invalidate actor cache
 */
export async function writeBiographyToProduction(
  db: Pool,
  actorId: number,
  data: BiographyData,
  sources: BiographySourceEntry[]
): Promise<void> {
  // Step 1: Archive old biography if needed (one-time migration)
  const actorResult = await db.query(
    `SELECT biography, biography_legacy FROM actors WHERE id = $1`,
    [actorId]
  )

  if (actorResult.rows.length > 0) {
    const { biography, biography_legacy } = actorResult.rows[0]
    if (biography && biography_legacy === null) {
      await db.query(`UPDATE actors SET biography_legacy = $1 WHERE id = $2`, [biography, actorId])
    }
  }

  // Step 2: Upsert actor_biography_details
  await db.query(
    `INSERT INTO actor_biography_details (
      actor_id, narrative_teaser, narrative, narrative_confidence,
      life_notable_factors, birthplace_details, family_background,
      education, pre_fame_life, fame_catalyst,
      personal_struggles, relationships, lesser_known_facts,
      sources, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
    ON CONFLICT (actor_id) DO UPDATE SET
      narrative_teaser = COALESCE(EXCLUDED.narrative_teaser, actor_biography_details.narrative_teaser),
      narrative = COALESCE(EXCLUDED.narrative, actor_biography_details.narrative),
      narrative_confidence = COALESCE(EXCLUDED.narrative_confidence, actor_biography_details.narrative_confidence),
      life_notable_factors = COALESCE(EXCLUDED.life_notable_factors, actor_biography_details.life_notable_factors),
      birthplace_details = COALESCE(EXCLUDED.birthplace_details, actor_biography_details.birthplace_details),
      family_background = COALESCE(EXCLUDED.family_background, actor_biography_details.family_background),
      education = COALESCE(EXCLUDED.education, actor_biography_details.education),
      pre_fame_life = COALESCE(EXCLUDED.pre_fame_life, actor_biography_details.pre_fame_life),
      fame_catalyst = COALESCE(EXCLUDED.fame_catalyst, actor_biography_details.fame_catalyst),
      personal_struggles = COALESCE(EXCLUDED.personal_struggles, actor_biography_details.personal_struggles),
      relationships = COALESCE(EXCLUDED.relationships, actor_biography_details.relationships),
      lesser_known_facts = COALESCE(EXCLUDED.lesser_known_facts, actor_biography_details.lesser_known_facts),
      sources = COALESCE(EXCLUDED.sources, actor_biography_details.sources),
      updated_at = NOW()`,
    [
      actorId,
      data.narrativeTeaser,
      data.narrative,
      data.narrativeConfidence,
      data.lifeNotableFactors.length > 0 ? data.lifeNotableFactors : null,
      data.birthplaceDetails,
      data.familyBackground,
      data.education,
      data.preFameLife,
      data.fameCatalyst,
      data.personalStruggles,
      data.relationships,
      data.lesserKnownFacts.length > 0 ? data.lesserKnownFacts : null,
      JSON.stringify(sources),
    ]
  )

  // Step 3: Update actors table for backwards compatibility
  await db.query(
    `UPDATE actors SET
      biography = $1,
      biography_version = COALESCE(biography_version, 0) + 1,
      updated_at = NOW()
    WHERE id = $2`,
    [data.narrativeTeaser, actorId]
  )

  // Step 4: Invalidate cache
  await invalidateActorCache(actorId)
}

/**
 * Writes biography enrichment data to staging tables for admin review.
 *
 * TODO: Implement staging table workflow when admin biography review is built.
 * For now, delegates directly to production writes.
 */
export async function writeBiographyToStaging(
  db: Pool,
  actorId: number,
  data: BiographyData,
  sources: BiographySourceEntry[]
): Promise<void> {
  // TODO: Write to biography staging tables when admin review workflow is built.
  // For now, write directly to production.
  await writeBiographyToProduction(db, actorId, data, sources)
}
