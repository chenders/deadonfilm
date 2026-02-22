# Recreation Plan: Cursed Movies (Highest Mortality Movies)

## Feature Overview

A leaderboard of movies with statistically abnormal cast mortality, ranked by a "mortality surprise score" (curse score). Uses actuarial life tables to calculate how many cast deaths were expected vs. how many actually occurred.

**Route:** `/cursed-movies`
**API endpoints:** `GET /api/cursed-movies`, `GET /api/cursed-movies/filters`

## Curse Score Formula

```
Curse Score (Movies) = (Actual Deaths - Expected Deaths) / (Expected Deaths + 2)
```

- Empirical Bayes shrinkage with k=2 prevents small casts from dominating
- Positive score = "cursed" (more deaths than expected)
- Stored as `mortality_surprise_score` on the `movies` table

## Database Queries

### `getHighMortalityMovies` (was in `server/src/lib/db/movies.ts`)

Fetches movies with high mortality surprise scores, supporting pagination and filtering.

```sql
SELECT COUNT(*) OVER () as total_count, *
FROM movies
WHERE mortality_surprise_score IS NOT NULL
  AND deceased_count >= $minDeadActors
  AND ($fromYear IS NULL OR release_year >= $fromYear)
  AND ($toYear IS NULL OR release_year <= $toYear)
  AND ($includeObscure = true OR NOT is_obscure)
ORDER BY mortality_surprise_score DESC
LIMIT $limit OFFSET $offset
```

**Uses index:** `idx_movies_not_obscure_curse` partial index when `includeObscure = false`

**Options interface:**
```typescript
interface HighMortalityOptions {
  limit?: number        // default 50
  offset?: number       // default 0
  fromYear?: number     // optional year filter
  toYear?: number       // optional year filter
  minDeadActors?: number  // default 3
  includeObscure?: boolean  // default false
}
```

### `getMaxValidMinDeaths` (was in `server/src/lib/db/movies.ts`)

Finds the highest deceased_count threshold that still returns at least 5 movies. Used to populate the "Min Deaths" filter dropdown dynamically.

```sql
SELECT MAX(deceased_count) as max_threshold
FROM (
  SELECT deceased_count, COUNT(*) as count
  FROM movies
  WHERE mortality_surprise_score IS NOT NULL
    AND deceased_count >= 3
  GROUP BY deceased_count
  HAVING COUNT(*) >= 5
) subq
```

Returns `number` (default 3 if no valid thresholds found).

## Route Handlers

### `GET /api/cursed-movies` (was `getCursedMovies` in `server/src/routes/discover.ts`)

**Query parameters:**
- `page` (int, default 1)
- `limit` (int, default 50, max 100)
- `from` (int, decade start year e.g. 1980)
- `to` (int, decade start year e.g. 1990, converted to toYear = decade + 9)
- `minDeaths` (int, default 3)
- `includeObscure` (boolean, default false)

**Response shape:**
```typescript
{
  movies: Array<{
    rank: number
    id: number          // TMDB ID
    title: string
    releaseYear: number
    posterPath: string | null
    deceasedCount: number
    castCount: number
    expectedDeaths: number
    mortalitySurpriseScore: number  // the curse score
  }>
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number    // capped at 20
  }
}
```

**New Relic tracking:** Records `CursedMoviesQuery` custom event with page, filters, timing.

**Cache:** Uses `sendWithETag` with 300s (5 min) TTL.

### `GET /api/cursed-movies/filters` (was `getCursedMoviesFilters` in `server/src/routes/discover.ts`)

**Response:** `{ maxMinDeaths: number }` — the highest min-deaths threshold for the filter dropdown.

**Cache:** Uses `sendWithETag` with 3600s (1 hour) TTL.

## Frontend

### Page: `CursedMoviesPage` (was `src/pages/CursedMoviesPage.tsx`)

Features:
- Filter bar with From Decade, To Decade, Min Deaths dropdowns
- "Include obscure movies" checkbox
- "Clear filters" button (shown when any filter is active)
- Responsive desktop/mobile filter layouts
- Paginated results with Previous/Next buttons
- Movie rows with poster, title, year, deaths ratio, excess mortality %
- `CalculationExplainer` accordion explaining the math
- SEO: Helmet meta tags, PaginationHead, JsonLd (ItemList schema)

### Hook: `useCursedMovies` (was `src/hooks/useCursedMovies.ts`)

```typescript
useQuery({
  queryKey: ["cursed-movies", options],
  queryFn: () => getCursedMovies(options),
  retry: 1,
})
```

Also uses inline `useQuery` for filters:
```typescript
useQuery({
  queryKey: ["cursed-movies-filters"],
  queryFn: getCursedMoviesFilters,
})
```

### Component: `CalculationExplainer` (was `src/components/common/CalculationExplainer.tsx`)

Expandable accordion with `type: "movies" | "actors"` prop explaining:
- **Movies mode:** Expected Deaths calculation, Excess Mortality formula, why it matters, exclusions (archived footage)
- **Actors mode:** How it works, Excess Mortality formula, Expected Deaths, why it matters, minimum movies

### Component: `FeaturedCursedMovie` (was `src/components/home/FeaturedCursedMovie.tsx`)

Home page widget showing the #1 highest mortality movie. Displays poster, title, year, death ratio, expected deaths, and excess mortality percentage. Uses `useFeaturedMovie` hook. Silently fails if data unavailable.

### API service functions (were in `src/services/api.ts`)

```typescript
interface CursedMoviesOptions {
  page?: number
  limit?: number
  fromDecade?: number
  toDecade?: number
  minDeadActors?: number
  includeObscure?: boolean
}

async function getCursedMovies(options): Promise<CursedMoviesResponse>
async function getCursedMoviesFilters(): Promise<CursedMoviesFiltersResponse>
```

### TypeScript types (were in `src/types/movie.ts`)

```typescript
interface CursedMovie {
  rank: number
  id: number
  title: string
  releaseYear: number
  posterPath: string | null
  deceasedCount: number
  castCount: number
  expectedDeaths: number
  mortalitySurpriseScore: number
}

interface CursedMoviesResponse {
  movies: CursedMovie[]
  pagination: { page: number; pageSize: number; totalCount: number; totalPages: number }
}

interface CursedMoviesFiltersResponse {
  maxMinDeaths: number
}
```

### Route registration (was commented out in `src/App.tsx`)

```tsx
<Route path="/cursed-movies" element={<CursedMoviesPage />} />
```

## Server route registration (was in `server/src/index.ts`)

```typescript
import { getCursedMovies, getCursedMoviesFilters } from "./routes/discover.js"

app.get("/api/cursed-movies", getCursedMovies)
app.get("/api/cursed-movies/filters", getCursedMoviesFilters)
```

## Cache

- **Cache prefix:** `CURSED_MOVIES` → `"cursed-movies"`
- Invalidated as part of movie-related cache invalidation group in `invalidateMovieCaches()`

## Database Prerequisites

The `movies` table must have these columns (already exist, not removed):
- `mortality_surprise_score` (numeric) — the curse score
- `deceased_count` (integer)
- `cast_count` (integer)
- `expected_deaths` (numeric)
- `is_obscure` (boolean)
- `release_year` (integer)
- `poster_path` (text)

These are populated by the mortality calculation jobs and are used by other features (movie detail pages).

## Decade filter helper

Uses `getDecadeOptions(1930)` from `src/utils/formatDate.ts` to generate decade dropdown options starting from the 1930s.
