# Recreation Plan: Death Watch

## Feature Overview

Death Watch is a discovery page showing living actors ranked by their 1-year actuarial death probability. It uses US SSA actuarial life tables to calculate each actor's probability of dying in the next year and their estimated remaining lifespan.

**Route:** `/death-watch`
**API endpoint:** `GET /api/death-watch`

## Database Query

### `getDeathWatchActors` (was in `server/src/lib/db/deaths-discovery.ts`)

Fetches living actors who have appeared in 2+ movies OR 10+ TV episodes, ordered by age (descending by default = highest death probability first).

**SQL pattern:**
```sql
WITH living_actors AS (
  SELECT
    a.id as actor_id,
    a.tmdb_id as actor_tmdb_id,
    a.name as actor_name,
    a.birthday,
    a.profile_path,
    a.tmdb_popularity,
    a.dof_popularity,
    COUNT(DISTINCT ama.movie_tmdb_id) as total_movies,
    COUNT(DISTINCT (asa.show_tmdb_id, asa.season_number, asa.episode_number)) as total_episodes,
    EXTRACT(YEAR FROM age(a.birthday))::integer as age
  FROM actors a
  LEFT JOIN actor_movie_appearances ama ON ama.actor_id = a.id
  LEFT JOIN actor_show_appearances asa ON asa.actor_id = a.id
  WHERE a.deathday IS NULL
    AND a.birthday IS NOT NULL
  GROUP BY a.id, a.tmdb_id, a.name, a.birthday, a.profile_path, a.tmdb_popularity, a.dof_popularity
  HAVING COUNT(DISTINCT ama.movie_tmdb_id) >= 2
     OR COUNT(DISTINCT (asa.show_tmdb_id, asa.season_number, asa.episode_number)) >= 10
)
SELECT
  actor_id, actor_tmdb_id, actor_name, birthday::text, age,
  profile_path, dof_popularity::decimal as popularity,
  total_movies::integer, total_episodes::integer,
  COUNT(*) OVER() as total_count
FROM living_actors
-- Dynamic WHERE for minAge, obscure filter, search
ORDER BY age DESC NULLS LAST, dof_popularity DESC NULLS LAST, actor_id ASC
LIMIT $limit OFFSET $offset
```

**Options interface:**
```typescript
interface DeathWatchOptions {
  limit?: number       // default 50
  offset?: number      // default 0
  minAge?: number      // optional age filter
  includeObscure?: boolean  // default false (filters: profile_path IS NOT NULL AND tmdb_popularity >= 5.0)
  search?: string      // ILIKE search on actor_name (splits multi-word)
  sort?: string        // "age" | "probability" | "name" (probability maps to age column)
  dir?: string         // "asc" | "desc"
}
```

**Sort column allowlist:**
```typescript
const DEATH_WATCH_SORT_MAP: Record<string, string> = {
  age: "age",
  probability: "age", // Same column since probability is derived from age
  name: "actor_name",
}
```

## Actuarial Functions (from `mortality-stats.ts` — shared, not deleted)

### `calculateCumulativeDeathProbability(startAge, endAge, sex)`
Calculates the probability of dying between two ages using period life tables. Used to calculate 1-year death probability: `calculateCumulativeDeathProbability(age, age + 1, "combined")`.

### `getCohortLifeExpectancy(birthYear, sex)`
Returns cohort-based life expectancy for a given birth year. Used to calculate years remaining: `lifeExpectancy - currentAge`.

## Route Handler

### `GET /api/death-watch` (was `server/src/routes/death-watch.ts`)

**Query parameters:**
- `page` (int, default 1)
- `limit` (int, default 50, max 100)
- `minAge` (int, optional)
- `includeObscure` (boolean, default false)
- `search` (string, optional)
- `sort` ("age" | "probability" | "name", default "age")
- `dir` ("asc" | "desc", default "desc")

**Response shape:**
```typescript
{
  actors: Array<{
    rank: number
    id: number           // TMDB ID preferred, fallback to internal ID
    name: string
    age: number
    birthday: string
    profilePath: string | null
    deathProbability: number   // 0-1, rounded to 4 decimal places
    yearsRemaining: number | null  // life expectancy - current age
    totalMovies: number
    totalEpisodes: number
  }>
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
  }
}
```

**Processing:** After fetching actors from DB, enriches each with:
1. `deathProbability` via `calculateCumulativeDeathProbability(age, age+1, "combined")`
2. `yearsRemaining` via `getCohortLifeExpectancy(birthYear, "combined")` — catches errors for unavailable cohort data

**Cache prefix:** `DEATH_WATCH` → `"death-watch"`

## Frontend

### Page: `DeathWatchPage` (was `src/pages/DeathWatchPage.tsx`)

Features:
- Search input with debounced URL sync (`useDebouncedSearchParam`)
- "Include lesser-known actors" checkbox
- Sort control (Age, Probability, Name) with direction toggle
- Paginated results with Previous/Next buttons
- Actor rows with responsive desktop/mobile layouts
- SEO: Helmet meta tags, PaginationHead, JsonLd (CollectionPage schema)

### Hook: `useDeathWatch` (was `src/hooks/useDeathWatch.ts`)

```typescript
useQuery({
  queryKey: ["death-watch", options],
  queryFn: () => getDeathWatch(options),
  retry: 1,
})
```

### API service function (was in `src/services/api.ts`)

```typescript
interface DeathWatchOptions {
  page?: number
  limit?: number
  minAge?: number
  includeObscure?: boolean
  search?: string
  sort?: string
  dir?: string
}

async function getDeathWatch(options): Promise<DeathWatchResponse> {
  // Builds URLSearchParams from options
  return fetchJson(`/death-watch?${params.toString()}`)
}
```

### TypeScript types (were in `src/types/actor.ts`)

```typescript
interface DeathWatchActor {
  rank: number
  id: number
  name: string
  age: number
  birthday: string
  profilePath: string | null
  deathProbability: number
  yearsRemaining: number | null
  totalMovies: number
  totalEpisodes: number
}

interface DeathWatchResponse {
  actors: DeathWatchActor[]
  pagination: { page: number; pageSize: number; totalCount: number; totalPages: number }
}
```

### UI Components Used

- `ActorRow` (inline component) — responsive layout with rank, photo/placeholder, name, age, movies, death probability %, years remaining
- `SortControl` — shared component for sort/direction
- `LoadingSpinner`, `ErrorMessage` — shared
- `PaginationHead`, `JsonLd` — SEO components
- `PersonIcon` — for actors without profile photos

### Route registration (was in `src/App.tsx`)

```tsx
<Route path="/death-watch" element={<DeathWatchPage />} />
```

### Footer link (was in `src/components/layout/Footer.tsx`)

Listed under "Explore" section as "Death Watch" linking to `/death-watch`.

## E2E Tests

`e2e/death-watch.spec.ts` — Playwright tests covering page load, search, pagination, sort controls.

## Server route registration (was in `server/src/index.ts`)

```typescript
app.get("/api/death-watch", getDeathWatchHandler)
```

## Cache invalidation

The `DEATH_WATCH` cache prefix was invalidated as part of the actor-related cache invalidation group in `invalidateActorCaches()`.
