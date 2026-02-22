# Recreation Plan: Cursed Actors (Highest Mortality Actors)

## Feature Overview

A leaderboard of actors whose co-stars have died at unusually high rates across their filmography, ranked by excess deaths (curse score). Sums actual and expected co-star deaths across all movies.

**Route:** `/cursed-actors`
**API endpoint:** `GET /api/cursed-actors`

## Curse Score Formula

```
Curse Score (Actors) = SUM(Actual Deaths) - SUM(Expected Deaths)
```

- Raw difference, no shrinkage (unlike movie curse score)
- Summed across all movies in the actor's filmography
- Positive score = more co-star deaths than statistically expected

## Database Query

### `getCursedActors` (was in `server/src/lib/db.ts`)

Ranks actors by total excess deaths across their filmography, joining actor appearances with movie mortality data.

```sql
SELECT
  aa.actor_id,
  a.tmdb_id as actor_tmdb_id,
  a.name as actor_name,
  (a.deathday IS NOT NULL) as is_deceased,
  COUNT(DISTINCT aa.movie_tmdb_id)::integer as total_movies,
  SUM(m.deceased_count)::integer as total_actual_deaths,
  ROUND(SUM(m.expected_deaths)::numeric, 1) as total_expected_deaths,
  ROUND((SUM(m.deceased_count) - SUM(m.expected_deaths))::numeric, 1) as curse_score,
  COUNT(*) OVER() as total_count
FROM actor_movie_appearances aa
JOIN movies m ON aa.movie_tmdb_id = m.tmdb_id
JOIN actors a ON aa.actor_id = a.id
WHERE m.expected_deaths IS NOT NULL
  -- Dynamic conditions for actor status, year range
GROUP BY aa.actor_id, a.tmdb_id, a.name, a.deathday
HAVING COUNT(DISTINCT aa.movie_tmdb_id) >= $minMovies
ORDER BY curse_score DESC
LIMIT $limit OFFSET $offset
```

**Options interface:**
```typescript
interface CursedActorsOptions {
  limit?: number        // default 50
  offset?: number       // default 0
  minMovies?: number    // default 2 (HAVING clause)
  actorStatus?: "living" | "deceased" | "all"  // default "all"
  fromYear?: number     // filters on m.release_year
  toYear?: number       // filters on m.release_year
}
```

**Return type:**
```typescript
interface CursedActorRecord {
  actor_id: number
  actor_tmdb_id: number | null
  actor_name: string
  is_deceased: boolean
  total_movies: number
  total_actual_deaths: number
  total_expected_deaths: number
  curse_score: number
}
```

## Route Handler

### `GET /api/cursed-actors` (was `getCursedActorsRoute` in `server/src/routes/actors.ts`)

**Query parameters:**
- `page` (int, default 1)
- `limit` (int, default 50, max 100)
- `from` (int, decade start year, converted to fromYear)
- `to` (int, decade start year, converted to toYear = decade + 9)
- `minMovies` (int, default 2)
- `status` ("living" | "deceased" | "all", default "all")

**Response shape:**
```typescript
{
  actors: Array<{
    rank: number
    id: number | null     // TMDB ID
    name: string
    isDeceased: boolean
    totalMovies: number
    totalActualDeaths: number
    totalExpectedDeaths: number
    curseScore: number
  }>
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number    // capped at 20
  }
}
```

**Cache prefix:** `CURSED_ACTORS` → `"cursed-actors"`
**Cache TTL:** `CACHE_TTL.WEEK`
**ETag:** Uses `sendWithETag` for conditional responses

**New Relic tracking:** Records `CursedActorsQuery` custom event and adds custom attributes for query.entity, query.operation, etc.

## Frontend

### Page: `CursedActorsPage` (was `src/pages/CursedActorsPage.tsx`)

Features:
- Filter bar with Status (All/Living/Deceased), Min Movies, From Decade, To Decade
- "Clear filters" button
- Responsive desktop/mobile filter layouts
- Paginated results with Previous/Next buttons
- Actor rows with rank, person icon, name, skull icon if deceased, total movies, death count, excess %, curse score
- `CalculationExplainer` accordion (type="actors")
- SEO: Helmet meta tags, PaginationHead, JsonLd (ItemList schema)

**Filter options:**
```typescript
const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "living", label: "Living" },
  { value: "deceased", label: "Deceased" },
]

const MIN_MOVIES_OPTIONS = [
  { value: "2", label: "Any" },
  { value: "3", label: "3+" },
  { value: "5", label: "5+" },
  { value: "10", label: "10+" },
  { value: "15", label: "15+" },
  { value: "20", label: "20+" },
]
```

### Hook: `useCursedActors` (was `src/hooks/useCursedActors.ts`)

```typescript
useQuery({
  queryKey: ["cursed-actors", options],
  queryFn: () => getCursedActors(options),
  retry: 1,
})
```

### API service function (was in `src/services/api.ts`)

```typescript
interface CursedActorsOptions {
  page?: number
  limit?: number
  fromDecade?: number
  toDecade?: number
  minMovies?: number
  status?: "living" | "deceased" | "all"
}

async function getCursedActors(options): Promise<CursedActorsResponse>
```

### TypeScript types (were in `src/types/actor.ts`)

```typescript
interface CursedActor {
  rank: number
  id: number
  name: string
  isDeceased: boolean
  totalMovies: number
  totalActualDeaths: number
  totalExpectedDeaths: number
  curseScore: number
}

interface CursedActorsResponse {
  actors: CursedActor[]
  pagination: { page: number; pageSize: number; totalCount: number; totalPages: number }
}
```

### Route registration (was commented out in `src/App.tsx`)

```tsx
<Route path="/cursed-actors" element={<CursedActorsPage />} />
```

## Server route registration (was in `server/src/index.ts`)

```typescript
import { getCursedActorsRoute } from "./routes/actors.js"

app.get("/api/cursed-actors", getCursedActorsRoute)
```

## Cache invalidation

The `CURSED_ACTORS` cache prefix was invalidated as part of the actor-related cache invalidation group in `invalidateActorCaches()`.

## Database Prerequisites

Relies on:
- `movies.expected_deaths` (numeric) — pre-calculated expected deaths per movie
- `movies.deceased_count` (integer) — actual deaths per movie
- `movies.release_year` (integer) — for decade filtering
- `actor_movie_appearances` junction table — links actors to movies
- `actors.deathday` — for living/deceased filtering
- `actors.tmdb_id` — for API response IDs

## Test file

`server/src/routes/actors.test.ts` — comprehensive tests covering:
- Happy path with pagination
- All filter combinations (status, decade range, min movies)
- Edge cases (invalid status defaults to "all", page 0 becomes 1)
- Error handling (database error → 500)
- Cache hit/miss paths
- New Relic custom event recording

## Decade filter helper

Uses `getDecadeOptions(1930)` from `src/utils/formatDate.ts` to generate decade dropdown options starting from the 1930s.
