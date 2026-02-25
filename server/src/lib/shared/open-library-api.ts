/**
 * Open Library API client.
 *
 * Provides person-subject search and search-inside-book capabilities against
 * Open Library's public API. Used by book-based enrichment sources to find
 * biographical references about actors in digitized books.
 *
 * No API key required — Open Library is a free, open API.
 */

const OPEN_LIBRARY_BASE = "https://openlibrary.org"
const SEARCH_INSIDE_BASE = "https://openlibrary.org/search/inside.json"
const USER_AGENT = "DeadOnFilm/1.0 (https://deadonfilm.com; enrichment bot)"

export interface OpenLibrarySubjectResult {
  name: string
  subject_count: number
  works: OpenLibraryWork[]
}

export interface OpenLibraryWork {
  key: string
  title: string
  authors: { name: string }[]
  has_fulltext: boolean
  ia?: string[]
  cover_id?: number
  first_publish_year?: number
}

export interface SearchInsideHit {
  pageNum: number
  highlight: string
}

/**
 * Slugify a person name for Open Library subject queries.
 * Converts to lowercase, replaces spaces with underscores, removes non-alphanumeric chars.
 */
function slugifyPersonName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

/**
 * Search Open Library for books about a specific person.
 *
 * Queries the `/subjects/person:{slug}.json` endpoint. Returns an empty result
 * on 404 (person not found in Open Library) rather than throwing.
 *
 * @param personName - Full name of the person (e.g. "John Wayne")
 * @param limit - Maximum number of works to return (default: 20)
 * @param signal - Optional AbortSignal for timeout/cancellation
 * @returns Subject result with matching works
 * @throws Error on non-404 HTTP errors
 */
export async function searchOpenLibraryByPerson(
  personName: string,
  limit: number = 20,
  signal?: AbortSignal
): Promise<OpenLibrarySubjectResult> {
  const slug = slugifyPersonName(personName)
  const url = `${OPEN_LIBRARY_BASE}/subjects/person:${slug}.json?limit=${limit}`

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal,
  })

  if (response.status === 404) {
    return { name: "", subject_count: 0, works: [] }
  }

  if (!response.ok) {
    throw new Error(`Open Library API error: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as OpenLibrarySubjectResult

  return {
    name: data.name ?? "",
    subject_count: data.subject_count ?? 0,
    works: data.works ?? [],
  }
}

/**
 * Search inside a digitized book on Open Library.
 *
 * Uses the `/search/inside.json` endpoint to find text matches within a
 * specific Internet Archive item. Returns page numbers and cleaned highlight
 * text (HTML `<em>` tags stripped).
 *
 * @param iaIdentifier - Internet Archive identifier for the book
 * @param query - Text to search for within the book
 * @param signal - Optional AbortSignal for timeout/cancellation
 * @returns Array of hits with page numbers and cleaned highlight text
 * @throws Error on non-OK HTTP responses
 */
export async function searchInsideBook(
  iaIdentifier: string,
  query: string,
  signal?: AbortSignal
): Promise<SearchInsideHit[]> {
  const url = `${SEARCH_INSIDE_BASE}?item_id=${encodeURIComponent(iaIdentifier)}&q=${encodeURIComponent(query).replace(/%20/g, "+")}`

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal,
  })

  if (!response.ok) {
    throw new Error(`Open Library search inside error: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as {
    hits?: {
      hits?: Array<{
        fields?: { page_num?: number }
        highlight?: { text?: string[] }
      }>
      total?: number
    }
  }

  const rawHits = data.hits?.hits ?? []

  return rawHits.map((hit) => ({
    pageNum: hit.fields?.page_num ?? 0,
    highlight: stripEmTags(hit.highlight?.text?.[0] ?? ""),
  }))
}

/**
 * Strip `<em>` and `</em>` HTML tags from search highlight text.
 */
function stripEmTags(text: string): string {
  return text.replace(/<\/?em>/g, "")
}
