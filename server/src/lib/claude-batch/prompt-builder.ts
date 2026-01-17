/**
 * Prompt construction utilities for Claude Batch API.
 */

import type Anthropic from "@anthropic-ai/sdk"
import { MODEL_ID } from "./constants.js"
import { getBirthYear, getDeathYear } from "./date-utils.js"
import type { ActorToProcess } from "./schemas.js"

/**
 * Build the research prompt for a specific actor.
 */
export function buildPrompt(actor: ActorToProcess): string {
  const birthYear = getBirthYear(actor.birthday)
  const deathYear = getDeathYear(actor.deathday)
  const birthInfo = birthYear ? `born ${birthYear}, ` : ""

  return `Research the death of ${actor.name} (${birthInfo}died ${deathYear}), an actor/entertainer.

Return a JSON object with these fields:

**Core Death Info:**
- cause: specific medical cause (e.g., "pancreatic cancer", "heart failure", "drowning") or null if unknown
- cause_confidence: "high" | "medium" | "low" | "disputed" - how well-documented is the cause
- details: 2-4 sentences of medical/circumstantial context about their death, or null
- details_confidence: confidence level for details

**Categorization:**
- manner: "natural" | "accident" | "suicide" | "homicide" | "undetermined" | "pending" - medical examiner classification
- categories: array of contributing factors, e.g. ["cancer"], ["heart_disease", "diabetes"], ["vehicle_accident", "fire"], ["overdose"]
- covid_related: true/false if COVID was a factor
- strange_death: true if death was unusual/notable beyond cause (dramatic circumstances, suspicious, controversial)

**Circumstances:**
- circumstances: Detailed narrative of how death occurred (official account). Be thorough - location, timeline, who was present, how discovered, hospital/hospice care, etc.
- circumstances_confidence: confidence level for circumstances
- rumored_circumstances: Any alternative accounts, rumors, disputed information, or theories that differ from official account. Include industry cover-up allegations if any. Null if none.
- notable_factors: array of tags like ["vehicle_crash", "fire", "drowning", "public_incident", "substance_involvement", "celebrity_involvement", "controversial", "possible_coverup", "reopened_investigation", "on_set", "workplace"]

**Date Confidence:**
- birthday_confidence: how confident is the birth date
- deathday_confidence: how confident is the death date

**Career Context:**
- location_of_death: city/state/country where they died
- last_project: {"title": "...", "year": 2022, "tmdb_id": 123, "imdb_id": "tt123", "type": "movie|show"} - their last released work (prefer tmdb_id, include imdb_id as fallback)
- career_status_at_death: "active" | "semi-retired" | "retired" | "hiatus" | "unknown"
- posthumous_releases: array of projects released after death, same format as last_project

**Related Celebrities:**
- related_celebrities: array of celebrities involved in or connected to their death. Format: [{"name": "...", "tmdb_id": 123, "relationship": "description of connection to death"}]. Include ex-partners who spoke publicly, people present at death, co-stars from fatal incidents, etc.

**Sources:**
- sources: object with arrays of sources per field. Format: {"cause": [{"url": "...", "archive_url": "web.archive.org/...", "description": "..."}], "birthday": [...], "deathday": [...], "circumstances": [...], "rumored": [...]}
  - Include archive.org URLs when available
  - Include official sources (medical examiner, coroner, death certificate)
  - Include news sources with dates

**Additional:**
- additional_context: Any notable background that provides context (career significance, historical importance, impact of death). Null if standard death.
- corrections: {"birthYear": 1945, "deathYear": 2020, "deathDate": "2020-03-15"} if our dates are wrong, else null

**Confidence Levels:**
- high: Official records, medical examiner, multiple reliable sources
- medium: Reliable news sources, family statements, consistent reports
- low: Single source, tabloid, unverified
- disputed: Conflicting official accounts, contested, ongoing investigation

Respond with valid JSON only. Be thorough in circumstances and details - capture as much information as possible.`
}

/**
 * Create a batch request for a specific actor.
 */
export function createBatchRequest(
  actor: ActorToProcess
): Anthropic.Messages.Batches.BatchCreateParams.Request {
  return {
    custom_id: `actor-${actor.id}`,
    params: {
      model: MODEL_ID,
      max_tokens: 2000, // Increased for comprehensive death info response
      messages: [
        {
          role: "user",
          content: buildPrompt(actor),
        },
      ],
    },
  }
}
