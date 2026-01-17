/**
 * Shared utilities for news-based death sources.
 *
 * Extracts common functionality used by Variety, Deadline, NewsAPI, and similar
 * news sources to avoid code duplication.
 */

import { DEATH_KEYWORDS, CIRCUMSTANCE_KEYWORDS, NOTABLE_FACTOR_KEYWORDS } from "../base-source.js"
import type { ActorForEnrichment } from "../types.js"

/**
 * Extract location of death from article text.
 */
export function extractLocation(text: string): string | null {
  const locationPatterns = [
    /died\s+(?:in|at)\s+([A-Z][a-zA-Z\s,]+?)(?:\s+(?:on|at\s+age|from)|[.,]|$)/i,
    /passed\s+away\s+(?:in|at)\s+([A-Z][a-zA-Z\s,]+?)(?:\s+(?:on|at\s+age|from)|[.,]|$)/i,
    /death\s+(?:in|at)\s+([A-Z][a-zA-Z\s,]+?)(?:\s+(?:on|from)|[.,]|$)/i,
  ]

  for (const pattern of locationPatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const location = match[1].trim()
      if (
        location.length >= 3 &&
        location.length <= 60 &&
        !location.match(/^\d/) &&
        !location.match(
          /january|february|march|april|may|june|july|august|september|october|november|december/i
        )
      ) {
        return location
      }
    }
  }

  return null
}

/**
 * Extract notable factors about a death from article text.
 */
export function extractNotableFactors(text: string): string[] {
  const factors: string[] = []
  const lowerText = text.toLowerCase()

  for (const keyword of NOTABLE_FACTOR_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase())) {
      factors.push(keyword)
    }
  }

  // Add circumstance keywords as factors
  for (const keyword of CIRCUMSTANCE_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase()) && !factors.includes(keyword)) {
      factors.push(keyword)
    }
  }

  return [...new Set(factors)].slice(0, 5)
}

/**
 * Extract death-related sentences from article text.
 *
 * @param text - The article text to extract from
 * @param actor - The actor to look for references to
 * @param maxSentences - Maximum number of sentences to return (default: 4)
 * @returns Array of death-related sentences about the actor
 */
export function extractDeathSentences(
  text: string,
  actor: ActorForEnrichment,
  maxSentences: number = 4
): string[] {
  const lowerText = text.toLowerCase()

  // Check if article mentions death
  const hasDeathMention = DEATH_KEYWORDS.some((keyword) =>
    lowerText.includes(keyword.toLowerCase())
  )

  if (!hasDeathMention) {
    return []
  }

  const sentences = text.split(/[.!?]+/)
  const deathSentences: string[] = []

  for (const sentence of sentences) {
    const trimmed = sentence.trim()
    const lowerSentence = trimmed.toLowerCase()

    // Check for death keywords
    const hasDeathKeyword = DEATH_KEYWORDS.some((kw) => lowerSentence.includes(kw.toLowerCase()))

    if (hasDeathKeyword && trimmed.length > 20 && trimmed.length < 500) {
      // Verify this is about the right person
      if (isAboutActor(lowerSentence, actor)) {
        deathSentences.push(trimmed)
      }
    }
  }

  return deathSentences.slice(0, maxSentences)
}

/**
 * Check if a sentence is about a specific actor.
 *
 * Looks for the actor's name parts, pronouns, or generic actor references.
 */
export function isAboutActor(lowerSentence: string, actor: ActorForEnrichment): boolean {
  const nameParts = actor.name.split(" ")
  const lastName = nameParts[nameParts.length - 1].toLowerCase()
  const firstName = nameParts[0].toLowerCase()

  return (
    lowerSentence.includes(lastName) ||
    lowerSentence.includes(firstName) ||
    lowerSentence.includes(" he ") ||
    lowerSentence.includes(" she ") ||
    lowerSentence.includes(" his ") ||
    lowerSentence.includes(" her ") ||
    lowerSentence.startsWith("he ") ||
    lowerSentence.startsWith("she ") ||
    lowerSentence.includes(" the actor") ||
    lowerSentence.includes(" the actress") ||
    lowerSentence.includes(" the star")
  )
}

/**
 * Extract a URL from search results HTML based on domain pattern.
 *
 * @param html - The search results HTML
 * @param urlPattern - Regex pattern for matching URLs (e.g., /https?:\/\/(?:www\.)?variety\.com\/\d{4}\/[^"'\s<>]+/gi)
 * @param actor - The actor to prioritize URLs for
 * @returns The best matching URL or null
 */
export function extractUrlFromSearchResults(
  html: string,
  urlPattern: RegExp,
  actor: ActorForEnrichment
): string | null {
  const matches = html.match(urlPattern) || []

  if (matches.length === 0) {
    return null
  }

  // Prefer URLs that contain obituary-related terms (highest priority)
  const obituaryTerms = ["obituary", "obit", "dies", "dead", "death", "rip", "passes"]

  // First pass: look for obituary-related URLs
  for (const url of matches) {
    const lowerUrl = url.toLowerCase()
    const hasObituaryTerm = obituaryTerms.some((term) => lowerUrl.includes(term))
    if (hasObituaryTerm) {
      return url
    }
  }

  // Second pass: look for URLs with actor name parts
  const nameParts = actor.name.toLowerCase().split(" ")
  for (const url of matches) {
    const lowerUrl = url.toLowerCase()
    const hasNamePart = nameParts.some((part) => part.length > 2 && lowerUrl.includes(part))
    if (hasNamePart) {
      return url
    }
  }

  // Return first result if no better match
  return matches[0] ?? null
}
