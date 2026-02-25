/**
 * Enrichment Database Writer
 *
 * Abstracts writing enrichment results to either production or staging tables.
 * Used by enrich-death-details.ts script to support review workflow.
 */

import type { Pool } from "pg"
import type { StoredEntityLinks } from "./entity-linker/index.js"
import { invalidateActorCache } from "./cache.js"

export interface EnrichmentData {
  actorId: number
  deathday?: string | null
  causeOfDeath?: string | null
  causeOfDeathSource?: string | null
  causeOfDeathDetails?: string | null
  causeOfDeathDetailsSource?: string | null
  wikipediaUrl?: string | null
  ageAtDeath?: number | null
  expectedLifespan?: number | null
  yearsLost?: number | null
  violentDeath?: boolean | null
  hasDetailedDeathInfo?: boolean
  deathManner?: string | null
  deathCategories?: string[] | null
}

export interface DeathCircumstancesData {
  actorId: number
  circumstances?: string | null
  circumstancesConfidence?: string | null
  rumoredCircumstances?: string | null
  causeConfidence?: string | null
  detailsConfidence?: string | null
  birthdayConfidence?: string | null
  deathdayConfidence?: string | null
  locationOfDeath?: string | null
  lastProject?: object | null
  careerStatusAtDeath?: string | null
  posthumousReleases?: object[] | null
  relatedCelebrityIds?: number[] | null
  relatedCelebrities?: object[] | null
  notableFactors?: string[] | null
  additionalContext?: string | null
  relatedDeaths?: string | null
  sources?: object
  rawResponse?: object | null
  enrichmentSource?: string
  enrichmentVersion?: string
  /** Auto-detected entity links in narrative fields */
  entityLinks?: StoredEntityLinks | null
}

/**
 * Writes enrichment data to production tables (current behavior)
 */
export async function writeToProduction(
  db: Pool,
  enrichment: EnrichmentData,
  circumstances: DeathCircumstancesData
): Promise<void> {
  // Write to actor_death_circumstances
  await db.query(
    `INSERT INTO actor_death_circumstances (
      actor_id,
      circumstances,
      circumstances_confidence,
      rumored_circumstances,
      cause_confidence,
      details_confidence,
      birthday_confidence,
      deathday_confidence,
      location_of_death,
      last_project,
      career_status_at_death,
      posthumous_releases,
      related_celebrity_ids,
      related_celebrities,
      notable_factors,
      additional_context,
      related_deaths,
      sources,
      raw_response,
      entity_links,
      enriched_at,
      enrichment_source,
      enrichment_version,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW(), $21, $22, NOW(), NOW())
    ON CONFLICT (actor_id) DO UPDATE SET
      circumstances = COALESCE(EXCLUDED.circumstances, actor_death_circumstances.circumstances),
      circumstances_confidence = COALESCE(EXCLUDED.circumstances_confidence, actor_death_circumstances.circumstances_confidence),
      rumored_circumstances = COALESCE(EXCLUDED.rumored_circumstances, actor_death_circumstances.rumored_circumstances),
      cause_confidence = COALESCE(EXCLUDED.cause_confidence, actor_death_circumstances.cause_confidence),
      details_confidence = COALESCE(EXCLUDED.details_confidence, actor_death_circumstances.details_confidence),
      birthday_confidence = COALESCE(EXCLUDED.birthday_confidence, actor_death_circumstances.birthday_confidence),
      deathday_confidence = COALESCE(EXCLUDED.deathday_confidence, actor_death_circumstances.deathday_confidence),
      location_of_death = COALESCE(EXCLUDED.location_of_death, actor_death_circumstances.location_of_death),
      last_project = COALESCE(EXCLUDED.last_project, actor_death_circumstances.last_project),
      career_status_at_death = COALESCE(EXCLUDED.career_status_at_death, actor_death_circumstances.career_status_at_death),
      posthumous_releases = COALESCE(EXCLUDED.posthumous_releases, actor_death_circumstances.posthumous_releases),
      related_celebrity_ids = COALESCE(EXCLUDED.related_celebrity_ids, actor_death_circumstances.related_celebrity_ids),
      related_celebrities = COALESCE(EXCLUDED.related_celebrities, actor_death_circumstances.related_celebrities),
      notable_factors = COALESCE(EXCLUDED.notable_factors, actor_death_circumstances.notable_factors),
      additional_context = COALESCE(EXCLUDED.additional_context, actor_death_circumstances.additional_context),
      related_deaths = COALESCE(EXCLUDED.related_deaths, actor_death_circumstances.related_deaths),
      sources = COALESCE(EXCLUDED.sources, actor_death_circumstances.sources),
      raw_response = COALESCE(EXCLUDED.raw_response, actor_death_circumstances.raw_response),
      entity_links = COALESCE(EXCLUDED.entity_links, actor_death_circumstances.entity_links),
      enriched_at = NOW(),
      enrichment_source = EXCLUDED.enrichment_source,
      enrichment_version = EXCLUDED.enrichment_version,
      updated_at = NOW()`,
    [
      circumstances.actorId,
      circumstances.circumstances,
      circumstances.circumstancesConfidence,
      circumstances.rumoredCircumstances,
      circumstances.causeConfidence,
      circumstances.detailsConfidence,
      circumstances.birthdayConfidence,
      circumstances.deathdayConfidence,
      circumstances.locationOfDeath,
      circumstances.lastProject ? JSON.stringify(circumstances.lastProject) : null,
      circumstances.careerStatusAtDeath,
      circumstances.posthumousReleases && circumstances.posthumousReleases.length > 0
        ? JSON.stringify(circumstances.posthumousReleases)
        : null,
      circumstances.relatedCelebrityIds,
      circumstances.relatedCelebrities && circumstances.relatedCelebrities.length > 0
        ? JSON.stringify(circumstances.relatedCelebrities)
        : null,
      circumstances.notableFactors && circumstances.notableFactors.length > 0
        ? circumstances.notableFactors
        : null,
      circumstances.additionalContext,
      circumstances.relatedDeaths,
      JSON.stringify(circumstances.sources || {}),
      circumstances.rawResponse ? JSON.stringify(circumstances.rawResponse) : null,
      circumstances.entityLinks ? JSON.stringify(circumstances.entityLinks) : null,
      circumstances.enrichmentSource || "multi-source-enrichment",
      circumstances.enrichmentVersion || "4.0.0",
    ]
  )

  // Update actors table with enrichment data
  // Build dynamic UPDATE based on which fields have values
  const actorUpdates: string[] = []
  const actorParams: unknown[] = []
  let actorParamIndex = 1

  if (enrichment.hasDetailedDeathInfo) {
    actorUpdates.push(`has_detailed_death_info = $${actorParamIndex++}`)
    actorParams.push(true)
  }

  if (enrichment.causeOfDeath) {
    actorUpdates.push(`cause_of_death = $${actorParamIndex++}`)
    actorParams.push(enrichment.causeOfDeath)
  }

  if (enrichment.causeOfDeathSource) {
    actorUpdates.push(`cause_of_death_source = $${actorParamIndex++}`)
    actorParams.push(enrichment.causeOfDeathSource)
  }

  if (enrichment.causeOfDeathDetails) {
    actorUpdates.push(`cause_of_death_details = $${actorParamIndex++}`)
    actorParams.push(enrichment.causeOfDeathDetails)
  }

  if (enrichment.causeOfDeathDetailsSource) {
    actorUpdates.push(`cause_of_death_details_source = $${actorParamIndex++}`)
    actorParams.push(enrichment.causeOfDeathDetailsSource)
  }

  // Ensure manner is consistent with categories: if categories contain a
  // manner-like slug but manner is null or 'undetermined', infer from categories
  if (enrichment.deathCategories?.length) {
    const mannerFromCategories = (["homicide", "suicide", "accident", "natural"] as const).find(
      (m) => enrichment.deathCategories!.includes(m)
    )
    if (
      mannerFromCategories &&
      (!enrichment.deathManner || enrichment.deathManner === "undetermined")
    ) {
      enrichment.deathManner = mannerFromCategories
    }
  }

  if (enrichment.deathManner) {
    actorUpdates.push(`death_manner = $${actorParamIndex++}`)
    actorParams.push(enrichment.deathManner)
  }

  if (enrichment.deathCategories && enrichment.deathCategories.length > 0) {
    actorUpdates.push(`death_categories = $${actorParamIndex++}`)
    actorParams.push(enrichment.deathCategories)
  }

  if (enrichment.violentDeath !== undefined && enrichment.violentDeath !== null) {
    actorUpdates.push(`violent_death = $${actorParamIndex++}`)
    actorParams.push(enrichment.violentDeath)
  }

  // Always update enriched_at, enrichment metadata, and updated_at when we have updates
  if (actorUpdates.length > 0) {
    actorUpdates.push(`enriched_at = NOW()`)
    actorUpdates.push(`updated_at = NOW()`)
    if (circumstances.enrichmentSource) {
      actorUpdates.push(`enrichment_source = $${actorParamIndex++}`)
      actorParams.push(circumstances.enrichmentSource)
    }
    if (circumstances.enrichmentVersion) {
      actorUpdates.push(`enrichment_version = $${actorParamIndex++}`)
      actorParams.push(circumstances.enrichmentVersion)
    }
    actorParams.push(enrichment.actorId)

    await db.query(
      `UPDATE actors SET ${actorUpdates.join(", ")} WHERE id = $${actorParamIndex}`,
      actorParams
    )
  }

  // Invalidate actor cache so stale data isn't served
  await invalidateActorCache(enrichment.actorId)
}

/**
 * Writes enrichment data to staging tables for review
 */
export async function writeToStaging(
  db: Pool,
  enrichmentRunActorId: number,
  enrichment: EnrichmentData,
  circumstances: DeathCircumstancesData
): Promise<void> {
  // Insert into actor_enrichment_staging
  const stagingResult = await db.query(
    `INSERT INTO actor_enrichment_staging (
      enrichment_run_actor_id,
      actor_id,
      deathday,
      cause_of_death,
      cause_of_death_source,
      cause_of_death_details,
      cause_of_death_details_source,
      wikipedia_url,
      age_at_death,
      expected_lifespan,
      years_lost,
      violent_death,
      has_detailed_death_info,
      review_status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
    RETURNING id`,
    [
      enrichmentRunActorId,
      enrichment.actorId,
      enrichment.deathday,
      enrichment.causeOfDeath,
      enrichment.causeOfDeathSource,
      enrichment.causeOfDeathDetails,
      enrichment.causeOfDeathDetailsSource,
      enrichment.wikipediaUrl,
      enrichment.ageAtDeath,
      enrichment.expectedLifespan,
      enrichment.yearsLost,
      enrichment.violentDeath,
      enrichment.hasDetailedDeathInfo || false,
    ]
  )

  const stagingId = stagingResult.rows[0].id

  // Insert into actor_death_circumstances_staging
  await db.query(
    `INSERT INTO actor_death_circumstances_staging (
      actor_enrichment_staging_id,
      actor_id,
      circumstances,
      circumstances_confidence,
      rumored_circumstances,
      cause_confidence,
      details_confidence,
      birthday_confidence,
      deathday_confidence,
      location_of_death,
      last_project,
      career_status_at_death,
      posthumous_releases,
      related_celebrity_ids,
      related_celebrities,
      notable_factors,
      additional_context,
      sources,
      raw_response
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
    [
      stagingId,
      circumstances.actorId,
      circumstances.circumstances,
      circumstances.circumstancesConfidence,
      circumstances.rumoredCircumstances,
      circumstances.causeConfidence,
      circumstances.detailsConfidence,
      circumstances.birthdayConfidence,
      circumstances.deathdayConfidence,
      circumstances.locationOfDeath,
      circumstances.lastProject ? JSON.stringify(circumstances.lastProject) : null,
      circumstances.careerStatusAtDeath,
      circumstances.posthumousReleases && circumstances.posthumousReleases.length > 0
        ? JSON.stringify(circumstances.posthumousReleases)
        : null,
      circumstances.relatedCelebrityIds,
      circumstances.relatedCelebrities && circumstances.relatedCelebrities.length > 0
        ? JSON.stringify(circumstances.relatedCelebrities)
        : null,
      circumstances.notableFactors && circumstances.notableFactors.length > 0
        ? circumstances.notableFactors
        : null,
      circumstances.additionalContext,
      JSON.stringify(circumstances.sources || {}),
      circumstances.rawResponse ? JSON.stringify(circumstances.rawResponse) : null,
    ]
  )
}
