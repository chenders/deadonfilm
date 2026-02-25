/**
 * Google Books API client.
 *
 * Provides search and volume lookup against the Google Books API v1.
 * Used by book-based enrichment sources to find biographical and death-related
 * references about actors in published books.
 *
 * Requires GOOGLE_BOOKS_API_KEY environment variable.
 */

import { decodeHtmlEntities } from "../death-sources/html-utils.js"

const GOOGLE_BOOKS_API_BASE = "https://www.googleapis.com/books/v1"

export interface GoogleBooksSearchResult {
  totalItems: number
  items: GoogleBooksVolume[]
}

export interface GoogleBooksVolume {
  id: string
  volumeInfo: {
    title: string
    authors?: string[]
    publisher?: string
    publishedDate?: string
    description?: string
    categories?: string[]
    pageCount?: number
    language?: string
  }
  searchInfo?: {
    textSnippet?: string
  }
  accessInfo: {
    viewability: "NO_PAGES" | "PARTIAL" | "ALL_PAGES"
    publicDomain: boolean
    epub?: { isAvailable?: boolean; downloadLink?: string }
    pdf?: { isAvailable?: boolean; downloadLink?: string }
  }
}

/**
 * Search Google Books API v1 for volumes matching a query.
 *
 * @param query - Search query string
 * @param maxResults - Maximum number of results to return (default: 10, max: 40)
 * @param signal - Optional AbortSignal for timeout/cancellation
 * @returns Search result with total count and matching volumes
 * @throws Error if GOOGLE_BOOKS_API_KEY is not set or API returns non-OK response
 */
export async function searchGoogleBooks(
  query: string,
  maxResults: number = 10,
  signal?: AbortSignal
): Promise<GoogleBooksSearchResult> {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY
  if (!apiKey) {
    throw new Error("GOOGLE_BOOKS_API_KEY environment variable is not set")
  }

  const url = new URL(`${GOOGLE_BOOKS_API_BASE}/volumes`)
  url.searchParams.set("q", query)
  url.searchParams.set("key", apiKey)
  url.searchParams.set("maxResults", String(maxResults))

  const response = await fetch(url.toString(), { signal })

  if (!response.ok) {
    throw new Error(`Google Books API error: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as { totalItems?: number; items?: GoogleBooksVolume[] }

  return {
    totalItems: data.totalItems ?? 0,
    items: data.items ?? [],
  }
}

/**
 * Get a specific Google Books volume by its ID.
 *
 * @param volumeId - The Google Books volume ID
 * @param signal - Optional AbortSignal for timeout/cancellation
 * @returns The volume details
 * @throws Error if GOOGLE_BOOKS_API_KEY is not set or API returns non-OK response
 */
export async function getGoogleBooksVolume(
  volumeId: string,
  signal?: AbortSignal
): Promise<GoogleBooksVolume> {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY
  if (!apiKey) {
    throw new Error("GOOGLE_BOOKS_API_KEY environment variable is not set")
  }

  const url = new URL(`${GOOGLE_BOOKS_API_BASE}/volumes/${volumeId}`)
  url.searchParams.set("key", apiKey)

  const response = await fetch(url.toString(), { signal })

  if (!response.ok) {
    throw new Error(`Google Books API error: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as GoogleBooksVolume
}

/**
 * Extract readable text from a Google Books volume.
 *
 * Combines the textSnippet (search highlight) and description fields,
 * stripping HTML tags from the snippet.
 *
 * @param volume - A Google Books volume object
 * @returns Combined text content, or null if neither snippet nor description exists
 */
export function extractVolumeText(volume: GoogleBooksVolume): string | null {
  // Google Books API adds simple <b> highlight tags and HTML entities to snippets.
  // Strip tags then decode entities for clean plaintext.
  const rawSnippet = volume.searchInfo?.textSnippet
  const snippet = rawSnippet ? decodeHtmlEntities(rawSnippet.replace(/<[^>]+>/g, "")) : null
  const description = volume.volumeInfo.description ?? null

  if (!snippet && !description) {
    return null
  }

  const parts = [snippet, description].filter(Boolean)
  return parts.join("\n\n")
}

/**
 * Format a volume attribution string for source tracking.
 *
 * Produces "Title by Author (Year)" format, omitting missing fields.
 *
 * @param volume - A Google Books volume object
 * @returns Formatted attribution string (e.g. "Hollywood Babylon by Kenneth Anger (1975)")
 */
export function formatVolumeAttribution(volume: GoogleBooksVolume): string {
  const { title, authors, publishedDate } = volume.volumeInfo

  let attribution = title

  if (authors && authors.length > 0) {
    attribution += ` by ${authors.join(", ")}`
  }

  if (publishedDate) {
    // Extract just the year from dates like "1975", "1975-01-01", "2020-01"
    const year = publishedDate.substring(0, 4)
    attribution += ` (${year})`
  }

  return attribution
}
