/**
 * Fuzzy entity matching using Fuse.js for Levenshtein distance.
 *
 * Extracts potential entity mentions using heuristics (proper nouns,
 * quoted titles) and matches them against the entity database.
 * Confidence is based on similarity score (0.8-0.99).
 */

import Fuse from "fuse.js"
import type { Pool } from "pg"
import type { EntityLink, LinkedRange, EntityCandidate } from "./types.js"
import { getLinkableEntities, overlapsExisting } from "./exact-matcher.js"

// ============================================================================
// Candidate Extraction
// ============================================================================

/**
 * Extract potential entity mentions from text using heuristics.
 *
 * Patterns detected:
 * 1. Capitalized word sequences (proper nouns): "Marlon Brando"
 * 2. Quoted titles: "The Godfather"
 * 3. "The X" patterns (common for movies/shows): "The Matrix"
 */
export function extractPotentialEntities(text: string): EntityCandidate[] {
  const candidates: EntityCandidate[] = []
  const seenRanges: LinkedRange[] = []

  // Pattern 1: Capitalized word sequences (proper nouns)
  // Matches: "John Wayne", "Mary Jane Watson", "Los Angeles"
  const properNounPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g
  for (const match of text.matchAll(properNounPattern)) {
    const start = match.index!
    const end = start + match[0].length
    // Skip short matches (likely common words like "The")
    if (match[0].length >= 5 && !overlapsExisting(start, end, seenRanges)) {
      candidates.push({ text: match[0], start, end })
      seenRanges.push({ start, end })
    }
  }

  // Pattern 2: Quoted titles
  // Matches: "The Godfather", 'Breaking Bad'
  const quotedPattern = /["']([^"']{3,50})["']/g
  for (const match of text.matchAll(quotedPattern)) {
    const start = match.index! + 1 // Skip opening quote
    const end = match.index! + match[0].length - 1 // Skip closing quote
    if (!overlapsExisting(start, end, seenRanges)) {
      candidates.push({ text: match[1], start, end })
      seenRanges.push({ start, end })
    }
  }

  // Pattern 3: "The X" patterns (common for movies/shows)
  // Matches: "The Godfather", "The Shining", "The Wire"
  const thePattern = /\bThe\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g
  for (const match of text.matchAll(thePattern)) {
    const start = match.index!
    const end = start + match[0].length
    if (!overlapsExisting(start, end, seenRanges)) {
      candidates.push({ text: match[0], start, end })
      seenRanges.push({ start, end })
    }
  }

  return candidates
}

// ============================================================================
// Main Fuzzy Matcher
// ============================================================================

/**
 * Find fuzzy matches using Fuse.js Levenshtein distance.
 *
 * Strategy:
 * 1. Get all linkable entities from database
 * 2. Configure Fuse.js for fuzzy matching
 * 3. Extract potential entity mentions using heuristics
 * 4. Skip candidates that overlap with already-linked ranges
 * 5. Fuzzy match each candidate against entity database
 * 6. Require 80% confidence minimum
 *
 * @param db - Database pool
 * @param text - Text to search for entities
 * @param alreadyLinked - Ranges already linked by exact matcher
 * @param excludeActorId - Actor ID to exclude (prevent self-linking)
 * @returns Array of fuzzy match EntityLinks with confidence 0.8-0.99
 */
export async function findFuzzyMatches(
  db: Pool,
  text: string,
  alreadyLinked: LinkedRange[],
  excludeActorId?: number
): Promise<EntityLink[]> {
  const entities = await getLinkableEntities(db, excludeActorId)

  // Configure Fuse.js for fuzzy string matching
  const fuse = new Fuse(entities, {
    keys: ["name"],
    threshold: 0.2, // 80% similarity minimum (1 - threshold = similarity)
    includeScore: true,
    minMatchCharLength: 3,
    ignoreLocation: true, // Match anywhere in string
  })

  // Extract potential entity mentions using heuristics
  const candidates = extractPotentialEntities(text)

  const links: EntityLink[] = []
  const linkedRanges: LinkedRange[] = [...alreadyLinked]

  for (const candidate of candidates) {
    // Skip if already linked by exact matcher
    if (overlapsExisting(candidate.start, candidate.end, linkedRanges)) {
      continue
    }

    // Fuzzy search against entity database
    const results = fuse.search(candidate.text)

    if (results.length === 0) continue

    const topMatch = results[0]
    const entity = topMatch.item
    // Fuse score is 0 (perfect) to 1 (no match), convert to confidence
    const confidence = 1 - (topMatch.score || 0)

    // Require 80% confidence minimum
    if (confidence < 0.8) continue

    // Skip self-references (extra check for edge cases)
    if (entity.type === "actor" && entity.id === excludeActorId) {
      continue
    }

    links.push({
      start: candidate.start,
      end: candidate.end,
      text: candidate.text,
      entityType: entity.type,
      entityId: entity.tmdbId,
      entitySlug: entity.slug,
      matchMethod: "fuzzy",
      confidence,
      // Store alternate matches for review (top 3)
      alternateMatches: results.slice(1, 4).map((r) => ({
        entityId: r.item.tmdbId,
        entitySlug: r.item.slug,
        confidence: 1 - (r.score || 0),
      })),
    })

    linkedRanges.push({ start: candidate.start, end: candidate.end })
  }

  // Sort by position in text
  links.sort((a, b) => a.start - b.start)

  return links
}
