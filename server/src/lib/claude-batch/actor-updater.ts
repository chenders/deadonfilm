/**
 * Actor update logic for applying Claude Batch API results to the database.
 */

import type { Pool } from "pg"
import { toSentenceCase } from "../text-utils.js"
import {
  SOURCE_NAME,
  MIN_CIRCUMSTANCES_LENGTH,
  MIN_RUMORED_CIRCUMSTANCES_LENGTH,
} from "./constants.js"
import { normalizeDateToString, getYearFromDate, getMonthDayFromDate } from "./date-utils.js"
import type { Checkpoint, ClaudeResponse, ActorToProcess } from "./schemas.js"

interface HistoryEntry {
  field: string
  oldValue: string | null
  newValue: string | null
}

/**
 * Apply Claude response updates to an actor in the database.
 * Handles conditional updates (only fill null fields), date corrections,
 * history recording, and circumstances upsert.
 */
export async function applyUpdate(
  db: Pool,
  actorId: number,
  parsed: ClaudeResponse,
  batchId: string,
  checkpoint: Checkpoint,
  rawResponse?: string
): Promise<void> {
  // Get current actor data
  const actorResult = await db.query<ActorToProcess>(
    "SELECT id, name, birthday, deathday, cause_of_death, cause_of_death_details FROM actors WHERE id = $1",
    [actorId]
  )

  if (actorResult.rows.length === 0) {
    console.error(`Actor ${actorId} not found in database`)
    return
  }

  const actor = actorResult.rows[0]
  const updates: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const values: any[] = []
  const historyEntries: HistoryEntry[] = []

  let paramIndex = 1

  // Update cause_of_death if we have a new one and actor doesn't have one
  if (parsed.cause && !actor.cause_of_death) {
    const normalizedCause = toSentenceCase(parsed.cause)
    updates.push(`cause_of_death = $${paramIndex++}`)
    values.push(normalizedCause)
    updates.push(`cause_of_death_source = $${paramIndex++}`)
    values.push(SOURCE_NAME)
    historyEntries.push({
      field: "cause_of_death",
      oldValue: actor.cause_of_death,
      newValue: normalizedCause,
    })
    checkpoint.stats.updatedCause++
  }

  // Update details if we have new ones and actor doesn't have them
  if (parsed.details && !actor.cause_of_death_details) {
    updates.push(`cause_of_death_details = $${paramIndex++}`)
    values.push(parsed.details)
    updates.push(`cause_of_death_details_source = $${paramIndex++}`)
    values.push(SOURCE_NAME)
    historyEntries.push({
      field: "cause_of_death_details",
      oldValue: actor.cause_of_death_details,
      newValue: parsed.details,
    })
    checkpoint.stats.updatedDetails++
  }

  // Update death_manner if provided
  if (parsed.manner) {
    updates.push(`death_manner = $${paramIndex++}`)
    values.push(parsed.manner)
    checkpoint.stats.updatedManner++
  }

  // Update death_categories if provided
  if (parsed.categories && parsed.categories.length > 0) {
    updates.push(`death_categories = $${paramIndex++}`)
    values.push(parsed.categories)
    checkpoint.stats.updatedCategories++
  }

  // Update covid_related if provided
  if (parsed.covid_related !== null && parsed.covid_related !== undefined) {
    updates.push(`covid_related = $${paramIndex++}`)
    values.push(parsed.covid_related)
  }

  // Update strange_death if provided
  if (parsed.strange_death !== null && parsed.strange_death !== undefined) {
    updates.push(`strange_death = $${paramIndex++}`)
    values.push(parsed.strange_death)
  }

  // Determine if actor has detailed death info (for dedicated death page)
  // Criteria: substantive circumstances or rumored_circumstances
  // Note: strange_death, notable_factors, related_celebrities are shown on actor's main page
  const hasDetailedDeathInfo =
    (parsed.circumstances && parsed.circumstances.length > MIN_CIRCUMSTANCES_LENGTH) ||
    (parsed.rumored_circumstances &&
      parsed.rumored_circumstances.length > MIN_RUMORED_CIRCUMSTANCES_LENGTH)

  if (hasDetailedDeathInfo) {
    updates.push(`has_detailed_death_info = $${paramIndex++}`)
    values.push(true)
  }

  // Handle date corrections
  if (parsed.corrections) {
    // Birthday correction
    if (parsed.corrections.birthYear) {
      const currentBirthYear = getYearFromDate(actor.birthday)
      if (currentBirthYear !== parsed.corrections.birthYear) {
        // Create a new birthday with corrected year, keeping month/day if available
        let newBirthday: string
        const monthDay = getMonthDayFromDate(actor.birthday)
        if (monthDay && monthDay.month && monthDay.day) {
          newBirthday = `${parsed.corrections.birthYear}-${monthDay.month}-${monthDay.day}`
        } else if (monthDay && monthDay.month) {
          // Year+month only - preserve month, default day to 01
          newBirthday = `${parsed.corrections.birthYear}-${monthDay.month}-01`
        } else {
          // Year only or no existing date - default to 01-01
          newBirthday = `${parsed.corrections.birthYear}-01-01`
        }
        updates.push(`birthday = $${paramIndex++}`)
        values.push(newBirthday)
        historyEntries.push({
          field: "birthday",
          oldValue: normalizeDateToString(actor.birthday),
          newValue: newBirthday,
        })
        checkpoint.stats.updatedBirthday++
      }
    }

    // Deathday correction
    if (parsed.corrections.deathDate || parsed.corrections.deathYear) {
      const normalizedOldDeathday = normalizeDateToString(actor.deathday)
      let newDeathday: string
      if (parsed.corrections.deathDate) {
        newDeathday = parsed.corrections.deathDate
      } else if (parsed.corrections.deathYear) {
        const currentDeathYear = getYearFromDate(actor.deathday)
        if (currentDeathYear !== parsed.corrections.deathYear) {
          // Create new deathday with corrected year, keeping month/day if available
          const monthDay = getMonthDayFromDate(actor.deathday)
          if (monthDay && monthDay.month && monthDay.day) {
            newDeathday = `${parsed.corrections.deathYear}-${monthDay.month}-${monthDay.day}`
          } else if (monthDay && monthDay.month) {
            newDeathday = `${parsed.corrections.deathYear}-${monthDay.month}-01`
          } else {
            newDeathday = `${parsed.corrections.deathYear}-01-01`
          }
        } else {
          newDeathday = normalizedOldDeathday || `${parsed.corrections.deathYear}-01-01`
        }
      } else {
        newDeathday = normalizedOldDeathday || ""
      }

      if (newDeathday && newDeathday !== normalizedOldDeathday) {
        updates.push(`deathday = $${paramIndex++}`)
        values.push(newDeathday)
        historyEntries.push({
          field: "deathday",
          oldValue: normalizedOldDeathday,
          newValue: newDeathday,
        })
        checkpoint.stats.updatedDeathday++
      }
    }
  }

  // Apply actor table updates if any
  if (updates.length > 0) {
    updates.push(`updated_at = NOW()`)
    values.push(actorId)

    await db.query(`UPDATE actors SET ${updates.join(", ")} WHERE id = $${paramIndex}`, values)

    // Record history
    for (const entry of historyEntries) {
      await db.query(
        `INSERT INTO actor_death_info_history
         (actor_id, field_name, old_value, new_value, source, batch_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [actorId, entry.field, entry.oldValue, entry.newValue, SOURCE_NAME, batchId]
      )
    }
  }

  // Create/update actor_death_circumstances record if we have detailed info
  const hasCircumstancesData =
    parsed.circumstances ||
    parsed.rumored_circumstances ||
    parsed.location_of_death ||
    parsed.last_project ||
    parsed.posthumous_releases ||
    parsed.related_celebrities ||
    parsed.notable_factors ||
    parsed.sources ||
    parsed.additional_context ||
    rawResponse

  if (hasCircumstancesData) {
    // Extract tmdb_ids from related_celebrities for the indexed array column
    const relatedCelebrityIds = parsed.related_celebrities
      ?.map((c) => c.tmdb_id)
      .filter((id): id is number => id !== undefined && id !== null)

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
        additional_context,
        notable_factors,
        sources,
        raw_response,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
      ON CONFLICT (actor_id) DO UPDATE SET
        circumstances = EXCLUDED.circumstances,
        circumstances_confidence = EXCLUDED.circumstances_confidence,
        rumored_circumstances = EXCLUDED.rumored_circumstances,
        cause_confidence = EXCLUDED.cause_confidence,
        details_confidence = EXCLUDED.details_confidence,
        birthday_confidence = EXCLUDED.birthday_confidence,
        deathday_confidence = EXCLUDED.deathday_confidence,
        location_of_death = EXCLUDED.location_of_death,
        last_project = EXCLUDED.last_project,
        career_status_at_death = EXCLUDED.career_status_at_death,
        posthumous_releases = EXCLUDED.posthumous_releases,
        related_celebrity_ids = EXCLUDED.related_celebrity_ids,
        related_celebrities = EXCLUDED.related_celebrities,
        additional_context = EXCLUDED.additional_context,
        notable_factors = EXCLUDED.notable_factors,
        sources = EXCLUDED.sources,
        raw_response = COALESCE(EXCLUDED.raw_response, actor_death_circumstances.raw_response),
        updated_at = NOW()`,
      [
        actorId,
        parsed.circumstances,
        parsed.circumstances_confidence,
        parsed.rumored_circumstances,
        parsed.cause_confidence,
        parsed.details_confidence,
        parsed.birthday_confidence,
        parsed.deathday_confidence,
        parsed.location_of_death,
        parsed.last_project ? JSON.stringify(parsed.last_project) : null,
        parsed.career_status_at_death,
        parsed.posthumous_releases ? JSON.stringify(parsed.posthumous_releases) : null,
        relatedCelebrityIds && relatedCelebrityIds.length > 0 ? relatedCelebrityIds : null,
        parsed.related_celebrities ? JSON.stringify(parsed.related_celebrities) : null,
        parsed.additional_context,
        parsed.notable_factors,
        parsed.sources ? JSON.stringify(parsed.sources) : null,
        rawResponse
          ? JSON.stringify({ response: rawResponse, parsed_at: new Date().toISOString() })
          : null,
      ]
    )

    if (parsed.circumstances) {
      checkpoint.stats.updatedCircumstances++
    }
    checkpoint.stats.createdCircumstancesRecord++
  }
}
