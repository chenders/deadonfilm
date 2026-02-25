# Books as Enrichment Data Source — Design Document

**Date**: 2026-02-24
**Status**: Approved
**Scope**: Add published books as a data source for both death enrichment and biography enrichment systems

## Overview

Add three book-related data sources — Google Books, Open Library, and Internet Archive Books — to both the death and biography enrichment pipelines. Books (biographies, memoirs, Hollywood history) contain rich personal life details and death circumstances that complement existing web-based sources.

## Goals

1. Extract death circumstances from published biographies and reference books
2. Extract personal life narratives from published biographies for biography enrichment
3. Discover which actors have published biographies (metadata layer)
4. Improve coverage for older/obscure actors where web sources are sparse

## Source Architecture

### Three Independent Source Classes

Each book API gets its own source class per enrichment system, plus shared API clients:

```
server/src/lib/shared/
├── google-books-api.ts        # Shared Google Books API client
├── open-library-api.ts        # Shared Open Library API client
└── ia-books-api.ts            # Shared Internet Archive books API client

server/src/lib/death-sources/sources/
├── google-books.ts            # Death enrichment: Google Books source
├── open-library.ts            # Death enrichment: Open Library source
└── ia-books.ts                # Death enrichment: IA Books source

server/src/lib/biography-sources/sources/
├── google-books.ts            # Biography enrichment: Google Books source
├── open-library.ts            # Biography enrichment: Open Library source
└── ia-books.ts                # Biography enrichment: IA Books source
```

### Source Properties

| Source | `isFree` | Cost/Query | Reliability Tier | Reliability Score | Rate Limit |
|--------|----------|------------|-----------------|-------------------|------------|
| Google Books | Yes (API key required) | $0 | `SECONDARY_COMPILATION` | 0.85 | 1,000/day (~700ms if batch) |
| Open Library | Yes | $0 | `SECONDARY_COMPILATION` | 0.85 | 333ms (3 req/sec w/ User-Agent) |
| IA Books | Yes | $0 | `ARCHIVAL` | 0.90 | 1,000ms (conservative) |

### Priority Placement

**Death enrichment** — New "Phase 4.5: Books" between Obituary Sites and Historical Archives:
1. Phase 1: Structured Data (Wikidata, Wikipedia, IMDb, BFI)
2. Phase 2: Web Search (Google, Bing, DuckDuckGo, Brave)
3. Phase 3: News Sources
4. Phase 4: Obituary Sites (Find a Grave, Legacy)
5. **Phase 4.5: Books (Google Books, Open Library, IA Books)** ← NEW
6. Phase 5: Historical Archives
7. Phase 6: Genealogy
8. Phase 7: AI Models

**Biography enrichment** — New "Phase 2.5: Books" between Reference Sites and Web Search:
1. Phase 1: Structured Data (Wikidata, Wikipedia)
2. Phase 2: Reference Sites (Britannica, Biography.com)
3. **Phase 2.5: Books (Google Books, Open Library, IA Books)** ← NEW
4. Phase 3: Web Search
5. Phase 4: News Sources
6. Phase 5: Obituary Sites
7. Phase 6: Historical Archives

Books are placed earlier in biography enrichment because published biographies are high-quality sources for personal life narratives.

## Content Extraction Strategy

### Google Books (3-tier extraction)

**Tier 1 — API snippets + descriptions (always available):**
- Search query: `"Actor Name" biography` (bio) or `"Actor Name" death cause obituary` (death)
- Extract `searchInfo.textSnippet` (1-3 sentences of match context) from top 3-5 results
- Extract `volumeInfo.description` (publisher synopsis, often mentions death circumstances)
- Deduplicate by volume ID

**Tier 2 — Preview page scraping (when `accessInfo.viewability` is `PARTIAL` or `ALL_PAGES`):**
- Only scrape top 1-2 most relevant preview-eligible books (API confidence below threshold)
- Use Playwright to navigate to `https://books.google.com/books?id={volumeId}`
- Search within preview for relevant keywords ("death", "died", "childhood", "family")
- Extract surrounding text from matching pages (full paragraphs)
- Fall back to Tier 1 if scraping fails
- `minDelayMs: 3000` for respectful scraping

**Tier 3 — Full public domain text (when `publicDomain: true`):**
- Download EPUB/PDF via API download links
- Extract relevant sections using keyword matching
- Best for pre-1929 actors

### Open Library (discovery + search-inside)

1. Query `/subjects/person:{name}.json` to find books about this actor
2. For each book with `has_fulltext: true`, get Internet Archive identifier
3. Use Search Inside API: `/search-inside.json?q="cause of death"&item_id={ia_id}`
4. Extract search-inside highlights with surrounding context
5. Pass IA identifiers to IA Books source for deeper extraction (shared cache prevents duplicate fetches)

### Internet Archive Books (full-text OCR for public domain)

1. Advanced search: `creator:"Actor Name" OR subject:"Actor Name" AND mediatype:texts`
2. For public domain items: use Search Inside API for targeted page finding
3. Fetch OCR text from relevant pages using Pages API
4. Extract 2-3 pages of context around keyword matches
5. Run through `sanitizeSourceText()` to clean OCR artifacts

### Cross-Source Coordination

Open Library and IA Books share Internet Archive identifiers. A shared cache keyed by IA identifier prevents fetching the same book content twice within an enrichment session.

## Configuration

### New Source Category

Both enrichment configs get a new `books` category:

```typescript
sourceCategories: {
  // ... existing categories ...
  books: true,           // Enable/disable all book sources
}
```

### CLI Flags

```bash
# Death enrichment
server/scripts/enrich-death-details.ts --disable-books

# Biography enrichment
server/scripts/enrich-biographies.ts --disable-books
```

### Environment Variables

```bash
GOOGLE_BOOKS_API_KEY=...    # Required for Google Books source
# Open Library and IA Books need no API keys
```

### Google Books Daily Budget Management

The free tier allows 1,000 requests/day. Track usage in Redis:

```typescript
const key = `google-books:daily:${dateStr}`
const count = await redis.incr(key)
if (count === 1) await redis.expire(key, 86400)
if (count > 950) {
  // Source reports unavailable, orchestrator skips it
  return { available: false, reason: "daily limit approaching" }
}
```

This allows `isAvailable()` to gracefully disable the source when budget is exhausted.

## Type Changes

### Death Enrichment Types (`server/src/lib/death-sources/types.ts`)

- `DataSourceType`: Already has `GOOGLE_BOOKS`, `OPEN_LIBRARY` — add `IA_BOOKS = "ia_books"`
- `SourceCategoryFlags`: Add `books?: boolean`
- `DEFAULT_SOURCE_CATEGORIES`: Add `books: true`

### Biography Enrichment Types (`server/src/lib/biography-sources/types.ts`)

- `BiographySourceType`: Add `GOOGLE_BOOKS = "google-books"`, `OPEN_LIBRARY = "open-library"`, `IA_BOOKS = "ia-books"`
- `SourceCategoryFlags`: Add `books?: boolean`
- `DEFAULT_BIOGRAPHY_CONFIG.sourceCategories`: Add `books: true`

### Source Family (Biography Orchestrator)

All three book sources count as one "family" for early-stop counting:

```typescript
const SOURCE_FAMILIES: Record<string, string> = {
  // ... existing families ...
  [BiographySourceType.GOOGLE_BOOKS]: "books",
  [BiographySourceType.OPEN_LIBRARY]: "books",
  [BiographySourceType.IA_BOOKS]: "books",
}
```

## Shared API Clients

### `server/src/lib/shared/google-books-api.ts`

```typescript
interface GoogleBooksSearchResult {
  totalItems: number
  items: GoogleBooksVolume[]
}

interface GoogleBooksVolume {
  id: string
  volumeInfo: {
    title: string
    authors?: string[]
    publisher?: string
    publishedDate?: string
    description?: string
    categories?: string[]
    pageCount?: number
  }
  searchInfo?: {
    textSnippet?: string
  }
  accessInfo: {
    viewability: "NO_PAGES" | "PARTIAL" | "ALL_PAGES"
    publicDomain: boolean
    epub?: { downloadLink?: string }
    pdf?: { downloadLink?: string }
  }
}

// Functions:
// searchBooks(query: string, maxResults?: number): Promise<GoogleBooksSearchResult>
// getVolume(volumeId: string): Promise<GoogleBooksVolume>
// scrapePreview(volumeId: string, searchTerms: string[]): Promise<string | null>
// getDailyUsage(): Promise<number>
```

### `server/src/lib/shared/open-library-api.ts`

```typescript
interface OpenLibrarySubjectResult {
  name: string
  subject_count: number
  works: OpenLibraryWork[]
}

interface OpenLibraryWork {
  key: string
  title: string
  authors: { name: string }[]
  has_fulltext: boolean
  ia?: string[]          // Internet Archive identifiers
  cover_id?: number
  first_publish_year?: number
}

// Functions:
// searchByPerson(personName: string): Promise<OpenLibrarySubjectResult>
// searchInside(iaId: string, query: string): Promise<SearchInsideResult[]>
```

### `server/src/lib/shared/ia-books-api.ts`

```typescript
interface IASearchResult {
  identifier: string
  title: string
  creator?: string
  date?: string
  mediatype: string
  publicdate: string
}

// Functions:
// searchBooks(query: string): Promise<IASearchResult[]>
// getPageOCR(identifier: string, pageNum: number): Promise<string>
// searchInside(identifier: string, query: string): Promise<SearchInsideHit[]>
```

## Confidence Scoring

### Death Enrichment

- Google Books snippets: Use existing `calculateConfidence()` on concatenated snippets + descriptions
- Open Library metadata-only: Base 0.2 (just knowing biographies exist), up to 0.5 with search-inside hits
- IA Books full OCR: Use existing `calculateConfidence()` on extracted text, typically 0.5-0.8

### Biography Enrichment

- Google Books: Use existing `calculateBiographicalConfidence()` on extracted text
- Open Library: Base 0.3 for metadata, up to 0.7 with search-inside biographical content
- IA Books: Use existing `calculateBiographicalConfidence()` on OCR text, typically 0.5-0.8

## Testing Strategy

### Test Files (9 total)

```
server/src/lib/shared/google-books-api.test.ts
server/src/lib/shared/open-library-api.test.ts
server/src/lib/shared/ia-books-api.test.ts
server/src/lib/death-sources/sources/google-books.test.ts
server/src/lib/death-sources/sources/open-library.test.ts
server/src/lib/death-sources/sources/ia-books.test.ts
server/src/lib/biography-sources/sources/google-books.test.ts
server/src/lib/biography-sources/sources/open-library.test.ts
server/src/lib/biography-sources/sources/ia-books.test.ts
```

### Test Coverage Per Source

- **Happy path**: API returns relevant books with snippets/text → correct EnrichmentData/RawBiographySourceData
- **Empty results**: Actor has no books → `{ success: false }` with no error
- **API errors**: 429 rate limit, 500 server error, network timeout → graceful error handling
- **Edge cases**: Books with no preview, OCR artifacts, non-English books, Google Books daily limit exhausted
- **Cache hit/miss**: Verify caching behavior via `BaseDataSource`/`BaseBiographySource` cache layer

Mock HTTP calls (not API clients) to test the full extraction pipeline.

## Documentation Updates

After implementation, update:
- `.claude/rules/death-enrichment.md` — Add books phase to source priority table
- `.claude/rules/biography-enrichment.md` — Add books phase to source priority table
- `CLAUDE.md` — Update environment variables section with `GOOGLE_BOOKS_API_KEY`
- `server/.env.example` — Add `GOOGLE_BOOKS_API_KEY`

## Implementation Order

1. Shared API clients (can be developed and tested independently)
2. Type changes (enums, config flags)
3. Death enrichment sources (3 files + registration in orchestrator)
4. Biography enrichment sources (3 files + registration in orchestrator)
5. CLI flag additions
6. Tests for all of the above
7. Documentation updates

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Google Books 1,000/day limit | Redis daily budget tracking, graceful `isAvailable()` degradation |
| Google Books preview scraping blocked | Fall back to API-only snippets (Tier 1) |
| Open Library person-subject search misses actors | Fall back to keyword search `q="Actor Name" biography` |
| IA OCR quality poor for old books | Run through `sanitizeSourceText()`, set lower confidence for OCR-heavy results |
| Rate limiting across concurrent enrichment runs | Share Redis counters across processes |
| Books about wrong "John Wayne" (disambiguation) | Include birth/death year in search queries where possible |
