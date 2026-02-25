/**
 * Internet Archive Books API client.
 *
 * Provides advanced book search, OCR page retrieval, and search-inside
 * capabilities against the Internet Archive and Archive Labs APIs.
 * Used by book-based enrichment sources to find biographical and death-related
 * references about actors in digitized books.
 *
 * No API key required — Internet Archive is a free, open API.
 */

const IA_SEARCH_BASE = "https://archive.org/advancedsearch.php"
const IA_DOWNLOAD_BASE = "https://archive.org/download"
const ARCHIVELAB_BASE = "https://api.archivelab.org/books"
const USER_AGENT = "DeadOnFilm/1.0 (https://deadonfilm.com; enrichment bot)"

export interface IABookResult {
  identifier: string
  title: string
  creator?: string
  date?: string
  mediatype: string
  publicdate?: string
}

export interface IASearchInsideHit {
  text: string
  pageNum: number
}

/**
 * Search Internet Archive for books mentioning a person.
 *
 * Uses the advanced search endpoint with a query combining creator, subject,
 * and title fields, filtered to text media type, sorted by downloads descending.
 *
 * @param personName - Full name of the person to search for
 * @param maxResults - Maximum number of results to return (default: 20)
 * @param signal - Optional AbortSignal for timeout/cancellation
 * @returns Array of matching book results
 * @throws Error on non-OK HTTP responses
 */
export async function searchIABooks(
  personName: string,
  maxResults: number = 20,
  signal?: AbortSignal
): Promise<IABookResult[]> {
  const safeName = personName.replace(/"/g, '\\"')
  const query = `(creator:"${safeName}" OR subject:"${safeName}" OR title:"${safeName}") AND mediatype:texts`

  const url = new URL(IA_SEARCH_BASE)
  url.searchParams.set("q", query)
  url.searchParams.set("fl[]", "identifier,title,creator,date,mediatype,publicdate")
  url.searchParams.set("sort[]", "downloads desc")
  url.searchParams.set("rows", String(maxResults))
  url.searchParams.set("output", "json")

  const response = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT },
    signal,
  })

  if (!response.ok) {
    throw new Error(`Internet Archive search error: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as {
    response?: {
      numFound?: number
      docs?: IABookResult[]
    }
  }

  return data.response?.docs ?? []
}

/**
 * Get OCR text for a specific page of a digitized book.
 *
 * Fetches the plain text OCR output for a single page from an Internet Archive
 * item. Returns null on 404 (page not found) rather than throwing.
 *
 * @param identifier - Internet Archive item identifier
 * @param pageNum - Page number to retrieve (0-indexed in IA, but we accept the logical page number)
 * @param signal - Optional AbortSignal for timeout/cancellation
 * @returns OCR text content for the page, or null if page not found
 * @throws Error on non-404 HTTP errors
 */
export async function getPageOCR(
  identifier: string,
  pageNum: number,
  signal?: AbortSignal
): Promise<string | null> {
  const url = `${IA_DOWNLOAD_BASE}/${identifier}/${identifier}_djvu_txt/${identifier}_${String(pageNum).padStart(4, "0")}.txt`

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal,
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(`Internet Archive OCR error: ${response.status} ${response.statusText}`)
  }

  return response.text()
}

/**
 * Search inside a specific Internet Archive book for text matches.
 *
 * Uses the Archive Labs search-inside API to find text passages within
 * a digitized book matching the query.
 *
 * @param identifier - Internet Archive item identifier
 * @param query - Text to search for within the book
 * @param signal - Optional AbortSignal for timeout/cancellation
 * @returns Array of hits with extracted text and page numbers
 * @throws Error on non-OK HTTP responses
 */
export async function searchInsideIA(
  identifier: string,
  query: string,
  signal?: AbortSignal
): Promise<IASearchInsideHit[]> {
  const url = `${ARCHIVELAB_BASE}/${identifier}/searchinside?q=${encodeURIComponent(query).replace(/%20/g, "+")}`

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal,
  })

  if (!response.ok) {
    throw new Error(
      `Internet Archive search inside error: ${response.status} ${response.statusText}`
    )
  }

  const data = (await response.json()) as {
    matches?: Array<{
      text?: { content?: string }
      par?: Array<{ page?: number }>
    }>
  }

  const matches = data.matches ?? []

  return matches.map((match) => ({
    text: match.text?.content ?? "",
    pageNum: match.par?.[0]?.page ?? 0,
  }))
}
