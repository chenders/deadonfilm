# 01: People Search

**Priority:** #1 (Critical)
**Confidence:** 10/10
**Effort:** Medium (5-7 days)
**Dependencies:** None

## Problem

Users cannot search for people directly. The site's only entry points are movie and TV show titles. If a user wants to check whether a specific actor has died, they must first remember a movie or show that actor appeared in, search for it, then scan the cast list.

The data exists -- 569,330 people in the database, 20,392 deceased, 123,368 with photos -- but the search UI only exposes movies and TV shows.

## Solution

### UX Design

Add "People" as a 4th option to the existing media type toggle:

```
[ All ] [ Movies ] [ TV Shows ] [ People ]
```

When "People" is selected:
- Search input placeholder: "Search for a person..."
- Results show circular headshots (not rectangular posters)
- Each result shows: name, birth/death years, death indicator (skull if deceased)
- Selecting a result navigates to `/actor/{slug}-{id}`

When "All" is selected:
- People results appear in a visually separated section below movies/TV results
- Section header: "People"
- Max 3 people results (alongside 5 movies + 5 TV shows, capped at 10 total)

### Person Result Card Design

```
┌──────────────────────────────────────┐
│  ○ Photo    Name                      │
│             Person · Died 2004 (80)   │
│             or: Person · b. 1955      │
└──────────────────────────────────────┘
```

- **Photo**: Circular crop (40x40), using TMDB `w45_and_h67_face` URL
- **Badge**: "Person" in a muted color (distinct from Film/TV badges)
- **Death indicator**: Skull icon + "Died {year} ({age})" if deceased; "b. {year}" if living
- **No poster fallback**: Generic person silhouette icon

## Technical Architecture

### 1. Database: Add pg_trgm Index

Create migration via `cd server && npm run migrate:create -- add-actor-name-search-index`:

```sql
-- Up
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_actors_name_trgm ON actors USING gin (name gin_trgm_ops);

-- Down
DROP INDEX IF EXISTS idx_actors_name_trgm;
-- Note: Don't drop pg_trgm extension as other things may use it
```

This brings `ILIKE` search from ~85ms to <5ms.

### 2. Backend: Extend Search Route

**File:** `server/src/routes/search.ts`

Add `"person"` as a valid `type` value. Create a `searchActors()` helper:

```typescript
async function searchActors(query: string, limit: number): Promise<PersonSearchResult[]> {
  // Run local DB + TMDB searches in parallel
  const [localResults, tmdbResults] = await Promise.all([
    searchActorsLocal(pool, query, limit),
    searchPerson(query),  // from server/src/lib/tmdb.ts
  ])

  // Local results take priority (have death info)
  // TMDB fills remaining slots
  // Deduplicate by tmdb_id
  return mergeAndDeduplicate(localResults, tmdbResults, limit)
}
```

**Local DB query:**

```sql
SELECT id, name, birthday, deathday, cause_of_death, profile_path, tmdb_id, tmdb_popularity
FROM actors
WHERE name ILIKE $1
  AND profile_path IS NOT NULL
ORDER BY
  CASE WHEN LOWER(name) = LOWER($2) THEN 0 ELSE 1 END,  -- exact match first
  tmdb_popularity DESC NULLS LAST
LIMIT $3
```

**"All" mode allocation:** 5 movies + 5 TV shows + 3 people (interleave movies/TV, then people section at end).

### 3. Frontend: Type Changes

**File:** `src/types/movie.ts`

```typescript
// Extend SearchMediaType
export type SearchMediaType = "movie" | "tv" | "all" | "person"

// Extend UnifiedSearchResult
export interface UnifiedSearchResult {
  id: number
  title: string
  release_date: string
  poster_path: string | null
  overview: string
  media_type: "movie" | "tv" | "person"
  // New optional fields for person results
  is_deceased?: boolean
  death_year?: number | null
  birth_year?: number | null
}
```

### 4. Frontend: MediaTypeToggle

**File:** `src/components/search/MediaTypeToggle.tsx`

Add 4th option:

```typescript
const options: { value: SearchMediaType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "tv", label: "TV Shows" },
  { value: "person", label: "People" },
]
```

### 5. Frontend: SearchResult Component

**File:** `src/components/search/SearchResult.tsx`

Add person-specific rendering branch:

- Circular photo (add `rounded-full` class) vs rectangular poster
- "Person" badge in a neutral/muted color
- Death indicator: skull + year if deceased, or "b. {year}" if alive
- No mortality hint skulls (those are for content, not people)

### 6. Frontend: SearchDropdown Section Headers

**File:** `src/components/search/SearchDropdown.tsx`

When `mediaType === "all"`, insert a "People" section header between content and person results. Use a divider line + "People" label in muted text.

### 7. Frontend: Navigation on Select

**Files:** `src/components/search/SearchBar.tsx`, `src/components/search/SearchModal.tsx`

Update `handleSelect`:

```typescript
if (result.media_type === "person") {
  // Only navigate if person is in our DB (has internal id)
  const slug = createActorSlug(result.title, result.id)
  navigate(`/actor/${slug}`)
}
```

For TMDB-only results (not in our DB), either:
- Show a toast: "This person isn't in our database yet"
- Or navigate to TMDB profile (less ideal, leaves the site)

### 8. Frontend: Placeholder Text

**Files:** `src/components/search/SearchBar.tsx`, `src/components/search/SearchModal.tsx`

```typescript
const placeholders: Record<SearchMediaType, string> = {
  all: "Search movies, shows, and people...",
  movie: "Search for a movie...",
  tv: "Search for a TV show...",
  person: "Search for a person...",
}
```

### 9. Home Page Tagline

**File:** `src/pages/HomePage.tsx`

Change from:
> "Search for a movie or TV show to see which cast members have passed away"

To:
> "Search for a movie, TV show, or person to see who has passed away"

### 10. Caching

**File:** `server/src/lib/cache.ts`

Add to `CACHE_PREFIX`:

```typescript
PERSON_SEARCH: "search:person"
```

TTL: `CACHE_TTL.SHORT` (300s / 5 minutes), matching existing content search.

## Files to Modify

| File | Change |
|------|--------|
| `server/migrations/` (new) | Add pg_trgm extension + GIN index on `actors.name` |
| `server/src/routes/search.ts` | Add person search type, `searchActors()` helper, merge logic |
| `server/src/lib/cache.ts` | Add `PERSON_SEARCH` cache key prefix |
| `src/types/movie.ts` | Extend `SearchMediaType`, `UnifiedSearchResult` |
| `src/components/search/MediaTypeToggle.tsx` | Add "People" 4th button |
| `src/components/search/SearchResult.tsx` | Add person result rendering |
| `src/components/search/SearchDropdown.tsx` | Add section headers for "All" mode |
| `src/components/search/SearchBar.tsx` | Update `handleSelect`, placeholder text |
| `src/components/search/SearchModal.tsx` | Update `handleSelect`, placeholder text |
| `src/pages/HomePage.tsx` | Update tagline |

## Anti-Patterns

1. **Don't search all 569K actors unfiltered** -- Always require `profile_path IS NOT NULL`. Consider also filtering to `tmdb_popularity > 0` or having appeared in at least one indexed movie/show.
2. **Don't rely solely on TMDB search** -- Local DB results have death info that TMDB doesn't. Local-first, TMDB-supplemented.
3. **Don't rely solely on local DB search** -- TMDB has better fuzzy matching and handles misspellings. Always query both in parallel.
4. **Don't show person results in rectangular poster frames** -- Circular headshots distinguish people from content visually.
5. **Don't navigate to TMDB for people not in our DB** -- This breaks the user's flow. Show a clear message instead.
