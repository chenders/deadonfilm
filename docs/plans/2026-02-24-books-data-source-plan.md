# Books Data Source Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Google Books, Open Library, and Internet Archive Books as data sources for both death enrichment and biography enrichment systems.

**Architecture:** Three shared API clients (`server/src/lib/shared/`) provide HTTP access to each book API. Six enrichment source classes (3 death + 3 biography) extend the existing `BaseDataSource`/`BaseBiographySource` base classes and implement `performLookup()`. A new `books` source category with `--disable-books` CLI flag controls the feature. TDD throughout — tests first.

**Tech Stack:** TypeScript, Google Books API v1, Open Library API, Internet Archive Advanced Search + Search Inside APIs, Playwright (preview scraping), Redis (daily budget tracking), Vitest (testing)

**Design doc:** `docs/plans/2026-02-24-books-data-source-design.md`

---

## Task 1: Type Changes — Death Enrichment

**Files:**
- Modify: `server/src/lib/death-sources/types.ts`

**Step 1: Add `IA_BOOKS` to `DataSourceType` enum**

In `server/src/lib/death-sources/types.ts`, at line 161 (after `INTERNET_ARCHIVE = "internet_archive"`), the enum already has `GOOGLE_BOOKS`, `OPEN_LIBRARY`, `WORLDCAT`, and `INTERNET_ARCHIVE` under the `// Books/Publications` section. Add `IA_BOOKS`:

```typescript
  // Books/Publications
  GOOGLE_BOOKS = "google_books",
  OPEN_LIBRARY = "open_library",
  WORLDCAT = "worldcat",
  INTERNET_ARCHIVE = "internet_archive",
  IA_BOOKS = "ia_books",
```

**Step 2: Add `books` to `SourceCategoryFlags`**

At line ~510-514, modify:

```typescript
export interface SourceCategoryFlags {
  free: boolean
  paid: boolean
  ai: boolean
  books?: boolean
}
```

**Step 3: Verify no compile errors**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add server/src/lib/death-sources/types.ts
git commit -m "feat: add IA_BOOKS enum and books category flag to death enrichment types"
```

---

## Task 2: Type Changes — Biography Enrichment

**Files:**
- Modify: `server/src/lib/biography-sources/types.ts`

**Step 1: Add book source types to `BiographySourceType` enum**

In `server/src/lib/biography-sources/types.ts`, after the `// Historical Archives` section (line ~50), add a new Books section before `// AI Models`:

```typescript
  // Historical Archives
  INTERNET_ARCHIVE_BIO = "internet-archive-bio",
  CHRONICLING_AMERICA_BIO = "chronicling-america-bio",
  TROVE_BIO = "trove-bio",
  EUROPEANA_BIO = "europeana-bio",

  // Books/Publications
  GOOGLE_BOOKS_BIO = "google-books-bio",
  OPEN_LIBRARY_BIO = "open-library-bio",
  IA_BOOKS_BIO = "ia-books-bio",

  // AI Models
```

**Step 2: Add `books` to `sourceCategories` in `BiographyEnrichmentConfig`**

At line ~260-268, add `books: boolean` after `archives`:

```typescript
  sourceCategories: {
    free: boolean
    reference: boolean
    webSearch: boolean
    news: boolean
    obituary: boolean
    archives: boolean
    books: boolean
    ai: boolean
  }
```

**Step 3: Add `books: true` to `DEFAULT_BIOGRAPHY_CONFIG`**

At line ~289-296, add `books: true`:

```typescript
  sourceCategories: {
    free: true,
    reference: true,
    webSearch: true,
    news: true,
    obituary: true,
    archives: true,
    books: true,
    ai: false,
  },
```

**Step 4: Verify no compile errors**

Run: `cd server && npx tsc --noEmit`
Expected: No errors (the orchestrator now has a type error because it doesn't spread `books` — that's expected, we fix it in Task 8)

**Step 5: Commit**

```bash
git add server/src/lib/biography-sources/types.ts
git commit -m "feat: add book source types and books category to biography enrichment types"
```

---

## Task 3: Google Books API Client — Tests

**Files:**
- Create: `server/src/lib/shared/google-books-api.test.ts`

**Step 1: Write tests for the Google Books API client**

```typescript
/**
 * Tests for Google Books API client.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Import after mocking
import {
  searchGoogleBooks,
  getGoogleBooksVolume,
  type GoogleBooksVolume,
} from "./google-books-api.js"

describe("Google Books API Client", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_BOOKS_API_KEY", "test-api-key")
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe("searchGoogleBooks", () => {
    it("returns volumes matching the search query", async () => {
      const mockResponse = {
        totalItems: 2,
        items: [
          {
            id: "vol1",
            volumeInfo: {
              title: "John Wayne: The Life and Legend",
              authors: ["Scott Eyman"],
              description: "A biography covering Wayne's life from birth to his death from stomach cancer in 1979.",
            },
            searchInfo: {
              textSnippet: "Wayne died of stomach cancer on June 11, 1979, at UCLA Medical Center.",
            },
            accessInfo: {
              viewability: "PARTIAL",
              publicDomain: false,
            },
          },
          {
            id: "vol2",
            volumeInfo: {
              title: "Duke: The Life and Image of John Wayne",
              authors: ["Ronald L. Davis"],
              description: "An intimate portrait of the iconic actor.",
            },
            searchInfo: {
              textSnippet: "His battle with cancer began in 1964 when he had a cancerous lung removed.",
            },
            accessInfo: {
              viewability: "NO_PAGES",
              publicDomain: false,
            },
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await searchGoogleBooks('"John Wayne" death cause', 5)

      expect(result.totalItems).toBe(2)
      expect(result.items).toHaveLength(2)
      expect(result.items[0].volumeInfo.title).toBe("John Wayne: The Life and Legend")
      expect(result.items[0].searchInfo?.textSnippet).toContain("stomach cancer")

      // Verify API key is included in request
      const fetchUrl = mockFetch.mock.calls[0][0] as string
      expect(fetchUrl).toContain("key=test-api-key")
      expect(fetchUrl).toContain("maxResults=5")
    })

    it("returns empty result when no books found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ totalItems: 0 }),
      })

      const result = await searchGoogleBooks('"Unknown Actor" biography')

      expect(result.totalItems).toBe(0)
      expect(result.items).toEqual([])
    })

    it("throws on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      })

      await expect(searchGoogleBooks("test query")).rejects.toThrow(/429/)
    })

    it("throws when API key is missing", async () => {
      vi.stubEnv("GOOGLE_BOOKS_API_KEY", "")

      await expect(searchGoogleBooks("test query")).rejects.toThrow(/API key/)
    })
  })

  describe("getGoogleBooksVolume", () => {
    it("returns volume details by ID", async () => {
      const mockVolume: GoogleBooksVolume = {
        id: "vol1",
        volumeInfo: {
          title: "John Wayne: The Life and Legend",
          authors: ["Scott Eyman"],
          description: "A comprehensive biography.",
        },
        accessInfo: {
          viewability: "PARTIAL",
          publicDomain: false,
        },
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockVolume,
      })

      const result = await getGoogleBooksVolume("vol1")

      expect(result.id).toBe("vol1")
      expect(result.volumeInfo.title).toBe("John Wayne: The Life and Legend")
    })
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/lib/shared/google-books-api.test.ts`
Expected: FAIL — module `./google-books-api.js` not found

---

## Task 4: Google Books API Client — Implementation

**Files:**
- Create: `server/src/lib/shared/google-books-api.ts`

**Step 1: Implement the Google Books API client**

```typescript
/**
 * Shared Google Books API client.
 *
 * Provides search and volume lookup functionality for the Google Books API v1.
 * Used by both death enrichment and biography enrichment source classes.
 *
 * Requires GOOGLE_BOOKS_API_KEY environment variable.
 * Free tier: 1,000 requests/day.
 *
 * @see https://developers.google.com/books/docs/v1/using
 */

const GOOGLE_BOOKS_API_BASE = "https://www.googleapis.com/books/v1"

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// API Functions
// ============================================================================

/**
 * Search Google Books by query string.
 *
 * @param query - Search query (e.g., '"John Wayne" death cause')
 * @param maxResults - Maximum results to return (1-40, default 5)
 * @param signal - Optional AbortSignal for timeout
 * @returns Search results with volume metadata and text snippets
 */
export async function searchGoogleBooks(
  query: string,
  maxResults = 5,
  signal?: AbortSignal
): Promise<GoogleBooksSearchResult> {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY
  if (!apiKey) {
    throw new Error("Google Books API key not configured (GOOGLE_BOOKS_API_KEY)")
  }

  const params = new URLSearchParams({
    q: query,
    maxResults: String(Math.min(maxResults, 40)),
    key: apiKey,
    printType: "books",
  })

  const url = `${GOOGLE_BOOKS_API_BASE}/volumes?${params}`
  const response = await fetch(url, { signal })

  if (!response.ok) {
    throw new Error(`Google Books API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return {
    totalItems: data.totalItems ?? 0,
    items: data.items ?? [],
  }
}

/**
 * Get a specific Google Books volume by ID.
 *
 * @param volumeId - Google Books volume ID
 * @param signal - Optional AbortSignal for timeout
 * @returns Volume details including access info
 */
export async function getGoogleBooksVolume(
  volumeId: string,
  signal?: AbortSignal
): Promise<GoogleBooksVolume> {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY
  if (!apiKey) {
    throw new Error("Google Books API key not configured (GOOGLE_BOOKS_API_KEY)")
  }

  const url = `${GOOGLE_BOOKS_API_BASE}/volumes/${encodeURIComponent(volumeId)}?key=${apiKey}`
  const response = await fetch(url, { signal })

  if (!response.ok) {
    throw new Error(`Google Books API error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

/**
 * Extract useful text content from a Google Books volume.
 * Combines text snippet and description, deduplicating content.
 *
 * @param volume - Google Books volume
 * @returns Combined text content or null if no useful text
 */
export function extractVolumeText(volume: GoogleBooksVolume): string | null {
  const parts: string[] = []

  if (volume.searchInfo?.textSnippet) {
    parts.push(volume.searchInfo.textSnippet)
  }

  if (volume.volumeInfo.description) {
    parts.push(volume.volumeInfo.description)
  }

  if (parts.length === 0) return null
  return parts.join("\n\n")
}

/**
 * Format volume attribution for source tracking.
 *
 * @param volume - Google Books volume
 * @returns Formatted attribution string
 */
export function formatVolumeAttribution(volume: GoogleBooksVolume): string {
  const title = volume.volumeInfo.title
  const authors = volume.volumeInfo.authors?.join(", ") ?? "Unknown author"
  const year = volume.volumeInfo.publishedDate?.slice(0, 4) ?? ""
  return year ? `${title} by ${authors} (${year})` : `${title} by ${authors}`
}
```

**Step 2: Run tests to verify they pass**

Run: `cd server && npx vitest run src/lib/shared/google-books-api.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add server/src/lib/shared/google-books-api.ts server/src/lib/shared/google-books-api.test.ts
git commit -m "feat: add Google Books API client with tests"
```

---

## Task 5: Open Library API Client — Tests + Implementation

**Files:**
- Create: `server/src/lib/shared/open-library-api.ts`
- Create: `server/src/lib/shared/open-library-api.test.ts`

**Step 1: Write tests**

```typescript
/**
 * Tests for Open Library API client.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

import {
  searchOpenLibraryByPerson,
  searchInsideBook,
  type OpenLibraryWork,
} from "./open-library-api.js"

describe("Open Library API Client", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe("searchOpenLibraryByPerson", () => {
    it("returns works about a person", async () => {
      const mockResponse = {
        name: "John Wayne",
        subject_count: 83,
        works: [
          {
            key: "/works/OL123W",
            title: "John Wayne: The Life and Legend",
            authors: [{ name: "Scott Eyman" }],
            has_fulltext: true,
            ia: ["johnwaynetheli0000eyma"],
            first_publish_year: 2014,
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await searchOpenLibraryByPerson("John Wayne")

      expect(result.subject_count).toBe(83)
      expect(result.works).toHaveLength(1)
      expect(result.works[0].has_fulltext).toBe(true)
      expect(result.works[0].ia).toContain("johnwaynetheli0000eyma")
    })

    it("returns empty result for unknown person", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: "Unknown Actor", subject_count: 0, works: [] }),
      })

      const result = await searchOpenLibraryByPerson("Unknown Actor")

      expect(result.subject_count).toBe(0)
      expect(result.works).toEqual([])
    })

    it("handles 404 gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      const result = await searchOpenLibraryByPerson("Nonexistent Person")

      expect(result.subject_count).toBe(0)
      expect(result.works).toEqual([])
    })
  })

  describe("searchInsideBook", () => {
    it("returns search hits within a book", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hits: {
            hits: [
              { fields: { page_num: 234 }, highlight: { text: ["...died of stomach <em>cancer</em>..."] } },
            ],
            total: 1,
          },
        }),
      })

      const result = await searchInsideBook("johnwaynetheli0000eyma", "death cancer")

      expect(result).toHaveLength(1)
      expect(result[0].pageNum).toBe(234)
      expect(result[0].highlight).toContain("cancer")
    })

    it("returns empty array when no matches", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hits: { hits: [], total: 0 } }),
      })

      const result = await searchInsideBook("some-book-id", "nonexistent term")

      expect(result).toEqual([])
    })
  })
})
```

**Step 2: Implement the Open Library API client**

```typescript
/**
 * Shared Open Library API client.
 *
 * Provides person-subject search and search-inside functionality.
 * No API key required. Rate limit: 3 req/sec with User-Agent header.
 *
 * @see https://openlibrary.org/dev/docs/api/subjects
 * @see https://openlibrary.org/dev/docs/api/search_inside
 */

const OPEN_LIBRARY_BASE = "https://openlibrary.org"
const USER_AGENT = "DeadOnFilm/1.0 (https://deadonfilm.com; enrichment bot)"

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// API Functions
// ============================================================================

/**
 * Search Open Library for books about a specific person.
 * Uses the Subjects API with person: prefix.
 *
 * @param personName - Full name of the person (e.g., "John Wayne")
 * @param limit - Maximum works to return (default 20)
 * @param signal - Optional AbortSignal for timeout
 * @returns Subject result with works about this person
 */
export async function searchOpenLibraryByPerson(
  personName: string,
  limit = 20,
  signal?: AbortSignal
): Promise<OpenLibrarySubjectResult> {
  // Open Library expects lowercase, underscore-separated names for subject URLs
  const slug = personName.toLowerCase().replace(/\s+/g, "_")
  const url = `${OPEN_LIBRARY_BASE}/subjects/person:${encodeURIComponent(slug)}.json?limit=${limit}`

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal,
  })

  if (!response.ok) {
    // 404 = no books about this person, not an error
    if (response.status === 404) {
      return { name: personName, subject_count: 0, works: [] }
    }
    throw new Error(`Open Library API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return {
    name: data.name ?? personName,
    subject_count: data.subject_count ?? 0,
    works: data.works ?? [],
  }
}

/**
 * Search inside a specific book on Internet Archive via Open Library.
 *
 * @param iaIdentifier - Internet Archive item identifier
 * @param query - Search query
 * @param signal - Optional AbortSignal for timeout
 * @returns Array of search hits with page numbers and highlights
 */
export async function searchInsideBook(
  iaIdentifier: string,
  query: string,
  signal?: AbortSignal
): Promise<SearchInsideHit[]> {
  const url = `${OPEN_LIBRARY_BASE}/search/inside.json?${new URLSearchParams({
    q: query,
    item_id: iaIdentifier,
  })}`

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal,
  })

  if (!response.ok) {
    throw new Error(`Open Library Search Inside API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const hits = data.hits?.hits ?? []

  return hits.map((hit: { fields?: { page_num?: number }; highlight?: { text?: string[] } }) => ({
    pageNum: hit.fields?.page_num ?? 0,
    highlight: (hit.highlight?.text ?? []).join(" ").replace(/<\/?em>/g, ""),
  }))
}
```

**Step 3: Run tests**

Run: `cd server && npx vitest run src/lib/shared/open-library-api.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add server/src/lib/shared/open-library-api.ts server/src/lib/shared/open-library-api.test.ts
git commit -m "feat: add Open Library API client with tests"
```

---

## Task 6: Internet Archive Books API Client — Tests + Implementation

**Files:**
- Create: `server/src/lib/shared/ia-books-api.ts`
- Create: `server/src/lib/shared/ia-books-api.test.ts`

**Step 1: Write tests**

```typescript
/**
 * Tests for Internet Archive Books API client.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

import { searchIABooks, getPageOCR, searchInsideIA } from "./ia-books-api.js"

describe("Internet Archive Books API Client", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe("searchIABooks", () => {
    it("returns book results for an actor", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: {
            numFound: 1,
            docs: [
              {
                identifier: "johnwaynetheli0000eyma",
                title: "John Wayne: The Life and Legend",
                creator: "Scott Eyman",
                date: "2014",
                mediatype: "texts",
              },
            ],
          },
        }),
      })

      const result = await searchIABooks("John Wayne")

      expect(result).toHaveLength(1)
      expect(result[0].identifier).toBe("johnwaynetheli0000eyma")
      expect(result[0].title).toContain("John Wayne")
    })

    it("returns empty array when no books found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: { numFound: 0, docs: [] },
        }),
      })

      const result = await searchIABooks("Completely Unknown Person")

      expect(result).toEqual([])
    })
  })

  describe("getPageOCR", () => {
    it("returns OCR text for a page", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          "Wayne died of stomach cancer on June 11, 1979, at the UCLA Medical Center in Los Angeles.",
      })

      const text = await getPageOCR("johnwaynetheli0000eyma", 234)

      expect(text).toContain("stomach cancer")
      expect(text).toContain("1979")
    })

    it("returns null for missing pages", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      const text = await getPageOCR("some-book", 9999)

      expect(text).toBeNull()
    })
  })

  describe("searchInsideIA", () => {
    it("returns matching page results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          matches: [
            { text: "...died of stomach cancer...", par: [{ page: 234 }] },
          ],
        }),
      })

      const result = await searchInsideIA("johnwaynetheli0000eyma", "death cancer")

      expect(result).toHaveLength(1)
      expect(result[0].text).toContain("cancer")
      expect(result[0].pageNum).toBe(234)
    })
  })
})
```

**Step 2: Implement the IA Books API client**

```typescript
/**
 * Shared Internet Archive Books API client.
 *
 * Provides book search, OCR text retrieval, and search-inside functionality.
 * No API key required. Be respectful with rate limiting.
 *
 * @see https://archive.org/developers/index-apis.html
 */

const IA_SEARCH_BASE = "https://archive.org"
const IA_BOOK_API_BASE = "https://api.archivelab.org"

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// API Functions
// ============================================================================

/**
 * Search Internet Archive for books about/by a person.
 *
 * @param personName - Name of the person to search for
 * @param maxResults - Maximum results (default 10)
 * @param signal - Optional AbortSignal for timeout
 * @returns Array of matching book items
 */
export async function searchIABooks(
  personName: string,
  maxResults = 10,
  signal?: AbortSignal
): Promise<IABookResult[]> {
  const query = `(creator:"${personName}" OR subject:"${personName}" OR title:"${personName}") AND mediatype:texts`
  const params = new URLSearchParams({
    q: query,
    output: "json",
    rows: String(maxResults),
    fl: "identifier,title,creator,date,mediatype,publicdate",
    sort: "downloads desc",
  })

  const url = `${IA_SEARCH_BASE}/advancedsearch.php?${params}`
  const response = await fetch(url, { signal })

  if (!response.ok) {
    throw new Error(`Internet Archive search error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return (data.response?.docs ?? []) as IABookResult[]
}

/**
 * Get OCR text for a specific page of a digitized book.
 *
 * @param identifier - Internet Archive item identifier
 * @param pageNum - Page number (1-based)
 * @param signal - Optional AbortSignal for timeout
 * @returns OCR text content or null if unavailable
 */
export async function getPageOCR(
  identifier: string,
  pageNum: number,
  signal?: AbortSignal
): Promise<string | null> {
  const url = `${IA_BOOK_API_BASE}/books/${encodeURIComponent(identifier)}/pages/${pageNum}/ocr`
  const response = await fetch(url, { signal })

  if (!response.ok) {
    if (response.status === 404) return null
    throw new Error(`Internet Archive OCR error: ${response.status} ${response.statusText}`)
  }

  return response.text()
}

/**
 * Search inside a specific book on Internet Archive.
 *
 * @param identifier - Internet Archive item identifier
 * @param query - Search query
 * @param signal - Optional AbortSignal for timeout
 * @returns Array of matching text with page numbers
 */
export async function searchInsideIA(
  identifier: string,
  query: string,
  signal?: AbortSignal
): Promise<IASearchInsideHit[]> {
  const url = `${IA_BOOK_API_BASE}/books/${encodeURIComponent(identifier)}/searchinside?${new URLSearchParams({ q: query })}`
  const response = await fetch(url, { signal })

  if (!response.ok) {
    throw new Error(`Internet Archive Search Inside error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const matches = data.matches ?? []

  return matches.map((match: { text?: string; par?: Array<{ page?: number }> }) => ({
    text: match.text ?? "",
    pageNum: match.par?.[0]?.page ?? 0,
  }))
}
```

**Step 3: Run tests**

Run: `cd server && npx vitest run src/lib/shared/ia-books-api.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add server/src/lib/shared/ia-books-api.ts server/src/lib/shared/ia-books-api.test.ts
git commit -m "feat: add Internet Archive Books API client with tests"
```

---

## Task 7: Death Enrichment — Google Books Source (Tests + Implementation)

**Files:**
- Create: `server/src/lib/death-sources/sources/google-books.ts`
- Create: `server/src/lib/death-sources/sources/google-books.test.ts`

**Step 1: Write tests**

```typescript
/**
 * Tests for Google Books death enrichment source.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("../../shared/google-books-api.js", () => ({
  searchGoogleBooks: vi.fn(),
  extractVolumeText: vi.fn(),
  formatVolumeAttribution: vi.fn(),
}))

import { GoogleBooksDeathSource } from "./google-books.js"
import { searchGoogleBooks, extractVolumeText, formatVolumeAttribution } from "../../shared/google-books-api.js"
import type { ActorForEnrichment } from "../types.js"

const mockActor: ActorForEnrichment = {
  id: 1,
  tmdb_id: 4724,
  name: "John Wayne",
  birthday: "1907-05-26",
  deathday: "1979-06-11",
  imdb_person_id: "nm0000078",
}

describe("GoogleBooksDeathSource", () => {
  let source: GoogleBooksDeathSource

  beforeEach(() => {
    vi.stubEnv("GOOGLE_BOOKS_API_KEY", "test-key")
    source = new GoogleBooksDeathSource()
    vi.mocked(searchGoogleBooks).mockReset()
    vi.mocked(extractVolumeText).mockReset()
    vi.mocked(formatVolumeAttribution).mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("has correct source properties", () => {
    expect(source.name).toBe("Google Books")
    expect(source.isFree).toBe(true)
    expect(source.estimatedCostPerQuery).toBe(0)
  })

  it("is available when API key is set", () => {
    expect(source.isAvailable()).toBe(true)
  })

  it("is unavailable when API key is missing", () => {
    vi.stubEnv("GOOGLE_BOOKS_API_KEY", "")
    const s = new GoogleBooksDeathSource()
    expect(s.isAvailable()).toBe(false)
  })

  it("returns death info from book snippets", async () => {
    vi.mocked(searchGoogleBooks).mockResolvedValueOnce({
      totalItems: 1,
      items: [
        {
          id: "vol1",
          volumeInfo: {
            title: "John Wayne: The Life and Legend",
            authors: ["Scott Eyman"],
          },
          searchInfo: {
            textSnippet: "Wayne died of stomach cancer on June 11, 1979.",
          },
          accessInfo: { viewability: "PARTIAL" as const, publicDomain: false },
        },
      ],
    })
    vi.mocked(extractVolumeText).mockReturnValue(
      "Wayne died of stomach cancer on June 11, 1979."
    )
    vi.mocked(formatVolumeAttribution).mockReturnValue(
      "John Wayne: The Life and Legend by Scott Eyman (2014)"
    )

    const result = await source.lookup(mockActor)

    expect(result.success).toBe(true)
    expect(result.data?.circumstances).toContain("stomach cancer")
    expect(result.source.confidence).toBeGreaterThan(0)
  })

  it("returns unsuccessful when no books found", async () => {
    vi.mocked(searchGoogleBooks).mockResolvedValueOnce({
      totalItems: 0,
      items: [],
    })

    const result = await source.lookup(mockActor)

    expect(result.success).toBe(false)
    expect(result.data).toBeNull()
  })

  it("handles API errors gracefully", async () => {
    vi.mocked(searchGoogleBooks).mockRejectedValueOnce(new Error("API error: 429"))

    const result = await source.lookup(mockActor)

    expect(result.success).toBe(false)
    expect(result.error).toContain("429")
  })
})
```

**Step 2: Implement the source**

```typescript
/**
 * Google Books source for death enrichment.
 *
 * Searches Google Books API for biographies and reference books about actors,
 * extracting death-related information from text snippets and descriptions.
 *
 * Requires GOOGLE_BOOKS_API_KEY environment variable.
 * Free tier: 1,000 requests/day.
 */

import {
  BaseDataSource,
  DEATH_KEYWORDS,
  CIRCUMSTANCE_KEYWORDS,
} from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, ReliabilityTier } from "../types.js"
import {
  searchGoogleBooks,
  extractVolumeText,
  formatVolumeAttribution,
} from "../../shared/google-books-api.js"
import { sanitizeSourceText } from "../../shared/sanitize-source-text.js"

export class GoogleBooksDeathSource extends BaseDataSource {
  readonly name = "Google Books"
  readonly type = DataSourceType.GOOGLE_BOOKS
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.SECONDARY_COMPILATION

  protected minDelayMs = 1000

  isAvailable(): boolean {
    return !!process.env.GOOGLE_BOOKS_API_KEY
  }

  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()
    const deathYear = actor.deathday?.slice(0, 4) ?? ""
    const query = `"${actor.name}" death cause ${deathYear}`

    const searchResult = await searchGoogleBooks(query, 5, this.createTimeoutSignal())

    if (!searchResult.items?.length) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
      }
    }

    // Extract and combine text from top results
    const textParts: string[] = []
    const attributions: string[] = []

    for (const volume of searchResult.items.slice(0, 5)) {
      const text = extractVolumeText(volume)
      if (text) {
        textParts.push(sanitizeSourceText(text))
        attributions.push(formatVolumeAttribution(volume))
      }
    }

    if (textParts.length === 0) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
      }
    }

    const combinedText = textParts.join("\n\n")
    const confidence = this.calculateConfidence(
      combinedText,
      DEATH_KEYWORDS,
      CIRCUMSTANCE_KEYWORDS
    )

    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}`

    return {
      success: true,
      source: this.createSourceEntry(startTime, confidence, url),
      data: {
        circumstances: combinedText,
        additionalContext: `Sources: ${attributions.join("; ")}`,
        rumoredCircumstances: null,
        notableFactors: [],
        relatedCelebrities: [],
        locationOfDeath: null,
        lastProject: null,
        careerStatusAtDeath: null,
        posthumousReleases: null,
        relatedDeaths: null,
      },
    }
  }
}
```

**Step 3: Run tests**

Run: `cd server && npx vitest run src/lib/death-sources/sources/google-books.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add server/src/lib/death-sources/sources/google-books.ts server/src/lib/death-sources/sources/google-books.test.ts
git commit -m "feat: add Google Books death enrichment source with tests"
```

---

## Task 8: Death Enrichment — Open Library + IA Books Sources

**Files:**
- Create: `server/src/lib/death-sources/sources/open-library.ts`
- Create: `server/src/lib/death-sources/sources/open-library.test.ts`
- Create: `server/src/lib/death-sources/sources/ia-books.ts`
- Create: `server/src/lib/death-sources/sources/ia-books.test.ts`

Follow the same patterns as Task 7. Key differences:

**Open Library source:**
- `type = DataSourceType.OPEN_LIBRARY`
- `reliabilityTier = ReliabilityTier.SECONDARY_COMPILATION`
- `minDelayMs = 350` (3 req/sec with User-Agent)
- `isAvailable()` returns `true` (no API key needed)
- `performLookup()` calls `searchOpenLibraryByPerson()`, then for books with `has_fulltext: true` and `ia` identifiers, calls `searchInsideBook()` with death-related query
- Confidence: 0.2 base for metadata-only, up to 0.6 with search-inside text containing death keywords

**IA Books source:**
- `type = DataSourceType.IA_BOOKS`
- `reliabilityTier = ReliabilityTier.ARCHIVAL`
- `minDelayMs = 1000`
- `isAvailable()` returns `true`
- `performLookup()` calls `searchIABooks()`, then `searchInsideIA()` on top results, then `getPageOCR()` for matching pages
- Run OCR text through `sanitizeSourceText()` before returning
- Confidence: calculated via `calculateConfidence()` on OCR text

Write tests following the same pattern as Task 7: happy path, empty results, API errors.

**Commit:**

```bash
git add server/src/lib/death-sources/sources/open-library.ts server/src/lib/death-sources/sources/open-library.test.ts \
       server/src/lib/death-sources/sources/ia-books.ts server/src/lib/death-sources/sources/ia-books.test.ts
git commit -m "feat: add Open Library and IA Books death enrichment sources with tests"
```

---

## Task 9: Register Death Enrichment Sources in Orchestrator

**Files:**
- Modify: `server/src/lib/death-sources/orchestrator.ts`

**Step 1: Add imports**

Near the top of the file, alongside the other source imports (around line 35-70), add:

```typescript
import { GoogleBooksDeathSource } from "./sources/google-books.js"
import { OpenLibraryDeathSource } from "./sources/open-library.js"
import { IABooksDeathSource } from "./sources/ia-books.js"
```

**Step 2: Add books phase to `initializeSources()`**

In `initializeSources()`, between Phase 4 (Obituary sites, line ~255) and Phase 6 (Historical archives, line ~257), insert:

```typescript
      // Phase 5: Books/Publications
      ...(this.config.sourceCategories.books !== false
        ? [
            new GoogleBooksDeathSource(),
            new OpenLibraryDeathSource(),
            new IABooksDeathSource(),
          ]
        : []),

      // Phase 6: Historical archives (for pre-internet deaths)
```

Note: Using `!== false` so that existing configs without the `books` field default to enabled.

**Step 3: Verify compile**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add server/src/lib/death-sources/orchestrator.ts
git commit -m "feat: register book sources in death enrichment orchestrator"
```

---

## Task 10: Biography Enrichment — Google Books Source (Tests + Implementation)

**Files:**
- Create: `server/src/lib/biography-sources/sources/google-books.ts`
- Create: `server/src/lib/biography-sources/sources/google-books.test.ts`

Follow the same test-first pattern as Task 7, but for biography enrichment:

**Key differences from the death source:**
- Extends `BaseBiographySource` (not `BaseDataSource`)
- `type = BiographySourceType.GOOGLE_BOOKS_BIO`
- Search query: `"Actor Name" biography personal life` (not death-focused)
- Returns `BiographyLookupResult` with `RawBiographySourceData` (not `EnrichmentData`)
- Uses `calculateBiographicalConfidence()` (not `calculateConfidence()`)
- Returns `contentType: "book_summary"` in the source entry

**Source class pattern:**

```typescript
import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import { BiographySourceType, type ActorForBiography } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { searchGoogleBooks, extractVolumeText, formatVolumeAttribution } from "../../shared/google-books-api.js"
import { sanitizeSourceText } from "../../shared/sanitize-source-text.js"

export class GoogleBooksBiographySource extends BaseBiographySource {
  readonly name = "Google Books"
  readonly type = BiographySourceType.GOOGLE_BOOKS_BIO
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.SECONDARY_COMPILATION

  protected minDelayMs = 1000

  isAvailable(): boolean {
    return !!process.env.GOOGLE_BOOKS_API_KEY
  }

  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
    const startTime = Date.now()
    const query = `"${actor.name}" biography personal life`

    const searchResult = await searchGoogleBooks(query, 5, this.createTimeoutSignal())

    if (!searchResult.items?.length) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
      }
    }

    const textParts: string[] = []
    const attributions: string[] = []

    for (const volume of searchResult.items.slice(0, 5)) {
      const text = extractVolumeText(volume)
      if (text) {
        textParts.push(sanitizeSourceText(text))
        attributions.push(formatVolumeAttribution(volume))
      }
    }

    if (textParts.length === 0) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
      }
    }

    const combinedText = textParts.join("\n\n")
    const confidence = this.calculateBiographicalConfidence(combinedText)

    return {
      success: true,
      source: this.createSourceEntry(startTime, confidence, {
        publication: attributions[0],
        contentType: "book_summary",
      }),
      data: {
        sourceName: this.name,
        sourceType: this.type,
        text: combinedText,
        confidence,
        reliabilityTier: this.reliabilityTier,
        reliabilityScore: this.reliabilityScore,
        contentType: "book_summary",
      },
    }
  }
}
```

**Commit:**

```bash
git add server/src/lib/biography-sources/sources/google-books.ts server/src/lib/biography-sources/sources/google-books.test.ts
git commit -m "feat: add Google Books biography enrichment source with tests"
```

---

## Task 11: Biography Enrichment — Open Library + IA Books Sources

**Files:**
- Create: `server/src/lib/biography-sources/sources/open-library.ts`
- Create: `server/src/lib/biography-sources/sources/open-library.test.ts`
- Create: `server/src/lib/biography-sources/sources/ia-books.ts`
- Create: `server/src/lib/biography-sources/sources/ia-books.test.ts`

Follow same patterns as Task 8 but for biography enrichment:
- Extend `BaseBiographySource`
- Use `BiographySourceType.OPEN_LIBRARY_BIO` and `BiographySourceType.IA_BOOKS_BIO`
- Search queries focus on biography/personal life, not death
- Return `RawBiographySourceData` instead of `EnrichmentData`
- Use `calculateBiographicalConfidence()` instead of `calculateConfidence()`

**Commit:**

```bash
git add server/src/lib/biography-sources/sources/open-library.ts server/src/lib/biography-sources/sources/open-library.test.ts \
       server/src/lib/biography-sources/sources/ia-books.ts server/src/lib/biography-sources/sources/ia-books.test.ts
git commit -m "feat: add Open Library and IA Books biography enrichment sources with tests"
```

---

## Task 12: Register Biography Sources in Orchestrator

**Files:**
- Modify: `server/src/lib/biography-sources/orchestrator.ts`

**Step 1: Add imports**

```typescript
import { GoogleBooksBiographySource } from "./sources/google-books.js"
import { OpenLibraryBiographySource } from "./sources/open-library.js"
import { IABooksBiographySource } from "./sources/ia-books.js"
```

**Step 2: Add SOURCE_FAMILIES entry**

At line ~66-68, update the `SOURCE_FAMILIES` constant:

```typescript
const SOURCE_FAMILIES: Record<string, BiographySourceType[]> = {
  wikimedia: [BiographySourceType.WIKIDATA_BIO, BiographySourceType.WIKIPEDIA_BIO],
  books: [BiographySourceType.GOOGLE_BOOKS_BIO, BiographySourceType.OPEN_LIBRARY_BIO, BiographySourceType.IA_BOOKS_BIO],
}
```

**Step 3: Add books phase in `initializeSources()`**

Between Phase 2 (Reference sites, line ~153) and Phase 3 (Web search, line ~155), add:

```typescript
    // Phase 2.5: Books/Publications
    if (this.config.sourceCategories.books) {
      const bookSources: BaseBiographySource[] = [
        new GoogleBooksBiographySource(),
        new OpenLibraryBiographySource(),
        new IABooksBiographySource(),
      ]
      for (const source of bookSources) {
        if (source.isAvailable()) {
          sources.push(source)
        }
      }
    }
```

**Step 4: Verify compile**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add server/src/lib/biography-sources/orchestrator.ts
git commit -m "feat: register book sources in biography enrichment orchestrator"
```

---

## Task 13: CLI Flag Updates

**Files:**
- Modify: `server/scripts/enrich-death-details.ts`
- Modify: `server/scripts/enrich-biographies.ts`

**Step 1: Add `--disable-books` to death enrichment CLI**

In `server/scripts/enrich-death-details.ts`, after line 1226 (`.option("--disable-paid", ...)`), add:

```typescript
  .option("--disable-books", "Disable book sources (Google Books, Open Library, IA Books)")
```

In the `.action()` handler (around line 1318), add the mapping. Find where `sourceCategories` is constructed and add `books`:

```typescript
free: !options.disableFree,
paid: !options.disablePaid,
ai: options.ai || false,
```

The death enrichment script passes options differently — it calls `enrichMissingDetails()` with individual args. Add `disableBooks: options.disableBooks || false` to the options object, and in the `enrichMissingDetails()` function, map it to `sourceCategories.books`.

**Step 2: Add `--disable-books` to biography enrichment CLI**

In `server/scripts/enrich-biographies.ts`, after line 181 (`.option("--disable-archives", ...)`), add:

```typescript
  .option("--disable-books", "Disable book sources (Google Books, Open Library, IA Books)")
```

In the `CliOptions` interface (line ~189-206), add:

```typescript
  disableBooks?: boolean
```

In the config building (line ~227-235), add to `sourceCategories`:

```typescript
  sourceCategories: {
    free: true,
    reference: true,
    webSearch: !options.disableWebSearch,
    news: !options.disableNews,
    obituary: true,
    archives: !options.disableArchives,
    books: !options.disableBooks,
    ai: false,
  },
```

**Step 3: Verify scripts parse correctly**

Run: `cd server && npx tsx scripts/enrich-biographies.ts --help`
Expected: Shows `--disable-books` in help output

Run: `cd server && npx tsx scripts/enrich-death-details.ts --help`
Expected: Shows `--disable-books` in help output

**Step 4: Commit**

```bash
git add server/scripts/enrich-death-details.ts server/scripts/enrich-biographies.ts
git commit -m "feat: add --disable-books CLI flag to enrichment scripts"
```

---

## Task 14: Environment Configuration

**Files:**
- Modify: `server/.env.example`

**Step 1: Add `GOOGLE_BOOKS_API_KEY` to env example**

Find the optional API keys section and add:

```bash
# Google Books API (for book-based enrichment)
# Free tier: 1,000 requests/day. Get key from Google Cloud Console.
GOOGLE_BOOKS_API_KEY=
```

**Step 2: Commit**

```bash
git add server/.env.example
git commit -m "chore: add GOOGLE_BOOKS_API_KEY to env example"
```

---

## Task 15: Run Full Test Suite

**Step 1: Run all unit tests**

Run: `cd server && npm test`
Expected: All tests pass, including the 9 new test files

**Step 2: Run type checking**

Run: `npm run type-check`
Expected: No type errors

**Step 3: Run lint**

Run: `npm run lint`
Expected: No lint errors

**Step 4: Fix any issues found, commit if needed**

---

## Task 16: Documentation Updates

**Files:**
- Modify: `.claude/rules/death-enrichment.md`
- Modify: `.claude/rules/biography-enrichment.md`
- Modify: `CLAUDE.md`

**Step 1: Update death enrichment docs**

In `.claude/rules/death-enrichment.md`, update the "Source Priority Order" section to add a new Phase 5 for Books between Phase 4 (Obituary Sites) and current Phase 6 (Historical Archives):

```markdown
### Phase 5: Books/Publications
| Source | Method | Notes |
|--------|--------|-------|
| Google Books | Google Books API v1 snippets + descriptions | Requires `GOOGLE_BOOKS_API_KEY`, 1,000 req/day |
| Open Library | Person-subject search + Search Inside API | Free, no API key |
| IA Books | Internet Archive advanced search + OCR | Free, public domain full text |
```

**Step 2: Update biography enrichment docs**

In `.claude/rules/biography-enrichment.md`, add a new Phase 2.5 for Books between Phase 2 (Reference Sites) and Phase 3 (Web Search):

```markdown
### Phase 2.5: Books/Publications
| Source | Method | Notes |
|--------|--------|-------|
| Google Books | Google Books API v1 snippets + descriptions | Requires `GOOGLE_BOOKS_API_KEY` |
| Open Library | Person-subject search + Search Inside API | Free |
| IA Books | Internet Archive advanced search + OCR | Free, best for pre-1929 actors |
```

**Step 3: Update CLAUDE.md**

Add `GOOGLE_BOOKS_API_KEY` to the Environment Variables section under "Optional".

**Step 4: Commit**

```bash
git add .claude/rules/death-enrichment.md .claude/rules/biography-enrichment.md CLAUDE.md
git commit -m "docs: add books data source to enrichment documentation"
```

---

## Summary

| Task | What | Files | Tests |
|------|------|-------|-------|
| 1 | Death enrichment type changes | 1 modified | - |
| 2 | Biography enrichment type changes | 1 modified | - |
| 3 | Google Books API client tests | 1 created | Yes |
| 4 | Google Books API client impl | 1 created | - |
| 5 | Open Library API client | 2 created | Yes |
| 6 | IA Books API client | 2 created | Yes |
| 7 | Death: Google Books source | 2 created | Yes |
| 8 | Death: Open Library + IA Books sources | 4 created | Yes |
| 9 | Death: Register in orchestrator | 1 modified | - |
| 10 | Bio: Google Books source | 2 created | Yes |
| 11 | Bio: Open Library + IA Books sources | 4 created | Yes |
| 12 | Bio: Register in orchestrator | 1 modified | - |
| 13 | CLI flag updates | 2 modified | - |
| 14 | Environment config | 1 modified | - |
| 15 | Full test suite validation | - | Yes |
| 16 | Documentation updates | 3 modified | - |

**Total: ~22 new files, ~7 modified files, 16 tasks, 9 test files**
