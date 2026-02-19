# API Reference

All endpoints return JSON unless otherwise noted. The API is read-only for public endpoints.

## Rate Limits

| Scope | Limit | Notes |
|---|---|---|
| General API | 100 requests/min per IP | Authenticated admins exempt |
| Heavy endpoints (sitemap, OG images) | 10 requests/min per IP | Authenticated admins exempt |
| Page view tracking | 20 requests/min per IP | |

## Caching

- Default browser cache: `public, max-age=600` (10 minutes)
- ETag support for conditional requests on most endpoints
- Redis backend caching with TTLs ranging from 5 minutes to 1 week

---

## Search

### `GET /api/search`

Search movies, TV shows, and actors.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `q` | string (required) | — | Search query (min 2 characters) |
| `type` | string | `movie` | `movie`, `tv`, `all`, or `person` |

### `GET /api/search/tv`

Search TV shows only.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `q` | string (required) | — | Search query (min 2 characters) |

---

## Movies

### `GET /api/movie/:id`

Movie details with cast mortality data, curse score, and deceased actor information.

### `GET /api/movie/:id/death-info`

Poll for cause-of-death enrichment updates (used for real-time enrichment status).

| Parameter | Type | Description |
|---|---|---|
| `personIds` | string | Comma-separated TMDB person IDs |

### `GET /api/movie/:id/related`

Related movies by shared cast members.

### `GET /api/movies/genres`

All movie genres.

### `GET /api/movies/genre/:genre`

Movies filtered by genre slug.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number |

---

## TV Shows

### `GET /api/show/:id`

TV show details with cast mortality data.

### `GET /api/show/:id/seasons`

All seasons in a show.

### `GET /api/show/:id/season/:seasonNumber`

Season details with cast.

### `GET /api/show/:id/season/:seasonNumber/episodes`

Episodes in a season.

### `GET /api/show/:showId/season/:season/episode/:episode`

Episode details.

### `GET /api/show/:id/related`

Related shows by shared cast members.

---

## Actors

### `GET /api/actor/:slug`

Actor profile with biography, filmography, and mortality data. Slug format: `actor-name-{actorId}` (using the internal `actor.id` primary key; legacy `tmdb_id` slugs are 301-redirected).

### `GET /api/actor/:slug/death`

Detailed death circumstances, narrative, sources, related celebrities. Only available for actors with `has_detailed_death_info = true`.

### `GET /api/actor/:id/related`

Related actors by cause of death or decade.

### `GET /api/cursed-actors`

Actors ranked by co-star mortality (Mortality Surprise Score across filmography).

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number |
| `limit` | number | 50 | Results per page (max 100) |
| `from` | number | — | Decade start filter |
| `to` | number | — | Decade end filter |
| `minMovies` | number | 2 | Minimum filmography size |
| `status` | string | — | `living`, `deceased`, or `all` |

---

## Discovery

### `GET /api/cursed-movies`

Movies ranked by Mortality Surprise Score (abnormally high cast mortality).

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number |
| `limit` | number | 50 | Results per page (max 100) |
| `from` | number | — | Decade start filter |
| `to` | number | — | Decade end filter |
| `minDeaths` | number | 3 | Minimum actual deaths |
| `includeObscure` | boolean | false | Include obscure productions |

### `GET /api/cursed-movies/filters`

Filter options for cursed movies (decades, etc.).

### `GET /api/death-watch`

Living actors ranked by actuarial mortality probability.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number |
| `limit` | number | 50 | Results per page (max 100) |
| `minAge` | number | — | Minimum age filter |
| `includeObscure` | boolean | false | Include lesser-known actors |
| `search` | string | — | Name search |
| `sort` | string | `age` | `age`, `probability`, or `name` |
| `dir` | string | `desc` | `asc` or `desc` |

### `GET /api/forever-young`

Actors who died young, ranked by years of life lost.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number |
| `sort` | string | `years_lost` | `years_lost` or `name` |
| `dir` | string | `asc` | `asc` or `desc` |

### `GET /api/discover/:type`

Discover random content. Currently supports `type=forever-young`.

---

## Deaths

### `GET /api/deaths/notable`

Notable deaths with detailed circumstances.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number |
| `pageSize` | number | 50 | Results per page (max 100) |
| `filter` | string | `all` | `all`, `strange`, `disputed`, or `controversial` |
| `includeObscure` | boolean | false | Include lesser-known actors |
| `sort` | string | `date` | `date` or `name` |
| `dir` | string | `desc` | `asc` or `desc` |

### `GET /api/deaths/all`

All deaths with optional search.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number |
| `pageSize` | number | 50 | Results per page |
| `includeObscure` | boolean | false | Include lesser-known actors |
| `search` | string | — | Name search |
| `sort` | string | `date` | `date`, `name`, or `age` |
| `dir` | string | `desc` | `asc` or `desc` |

### `GET /api/deaths/causes`

Cause of death categories with counts.

### `GET /api/deaths/cause/:cause`

Deaths filtered by cause slug.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number |
| `includeObscure` | boolean | false | Include lesser-known actors |

### `GET /api/deaths/decades`

Decade categories with counts.

### `GET /api/deaths/decade/:decade`

Deaths filtered by decade (e.g., `1950` or `1950s`).

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number |
| `includeObscure` | boolean | false | Include lesser-known actors |

---

## Causes of Death (3-Level Hierarchy)

### `GET /api/causes-of-death`

All cause categories with statistics.

### `GET /api/causes-of-death/:categorySlug`

Category with actors.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number |
| `includeObscure` | boolean | false | Include lesser-known actors |
| `cause` | string | — | Optional specific cause filter |

### `GET /api/causes-of-death/:categorySlug/:causeSlug`

Specific cause with actors.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number |
| `includeObscure` | boolean | false | Include lesser-known actors |

---

## Statistics & Feeds

### `GET /api/stats`

Site-wide statistics (total actors, deceased count, movie count, etc.).

### `GET /api/recent-deaths`

Recent actor deaths.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | number | 5 | Number of results (max 20) |

### `GET /api/on-this-day`

Random actor who died on today's date.

### `GET /api/this-week`

Actors who died during the current week.

### `GET /api/covid-deaths`

COVID-19-related deaths.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number |
| `includeObscure` | boolean | false | Include lesser-known actors |

### `GET /api/unnatural-deaths`

Unnatural deaths (accidents, overdoses, homicides, suicides).

### `GET /api/featured-movie`

The most "cursed" featured movie (highest Mortality Surprise Score).

### `GET /api/trivia`

Mortality and death trivia facts.

### `GET /api/popular-movies`

Popular movies.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number |

### `GET /api/popular-movies/random`

Random selection of popular movies.

---

## System

### `GET /api/health`

Health check endpoint.

### `GET /sitemap.xml`

Sitemap index pointing to paginated sub-sitemaps.

### `GET /sitemap-static.xml`

Static pages sitemap.

### `GET /sitemap-movies.xml`, `/sitemap-movies-:page.xml`

Movies sitemap (paginated, 50K entries per page).

### `GET /sitemap-actors.xml`, `/sitemap-actors-:page.xml`

Actors sitemap (paginated).

### `GET /sitemap-shows.xml`, `/sitemap-shows-:page.xml`

TV shows sitemap (paginated).

### `GET /og/:type/:id.png`

Dynamic Open Graph image generation for social sharing. Types: `movie`, `actor`, `show`.

### `POST /api/page-views/track`

Track page views for analytics.
