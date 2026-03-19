# Plan 03: Update Meta and Schema Image URLs

## Problem

Open Graph (`og:image`), Twitter Card (`twitter:image`), and JSON-LD schema.org `image` properties currently reference TMDB CDN URLs for some entity types. When social platforms or search engines crawl these pages, the image URLs they find point to TMDB rather than self-hosted images. This creates a dependency on TMDB availability for social sharing previews and rich search results.

## Current Architecture

### OG/Twitter Image Tags

Most entity pages use **custom-generated OG images** served from a self-hosted route (`/og/:type/:id.png`), which already avoids direct TMDB CDN references in the meta tags themselves. However, the OG image *generator* fetches source images from TMDB CDN internally.

Two page types still embed **raw TMDB CDN URLs** in their meta tags:

| Page | File | Meta Tag Value | CDN |
|------|------|----------------|-----|
| **Episode** | `src/pages/EpisodePage.tsx` (line 66) | `https://image.tmdb.org/t/p/w500${episode.stillPath}` | image.tmdb.org |
| **Season** | `src/pages/SeasonPage.tsx` (lines 42-46) | `https://image.tmdb.org/t/p/w300${season.posterPath}` or show poster fallback | image.tmdb.org |

Pages with self-hosted OG images (no direct TMDB meta tag dependency):

| Page | File | Meta Tag Value |
|------|------|----------------|
| Actor | `src/pages/ActorPage.tsx` | `https://deadonfilm.com/og/actor/{tmdbId}.png` |
| Movie | `src/pages/MoviePage.tsx` | `https://deadonfilm.com/og/movie/{id}.png` |
| Show | `src/pages/ShowPage.tsx` | `https://deadonfilm.com/og/show/{id}.png` |

### Server-Side Prerender Meta Tags

The prerender system generates meta tags server-side for crawler requests:

| File | Function | Image URL Pattern |
|------|----------|------------------|
| `server/src/lib/prerender/renderer.ts` (lines 64-70) | Renders `og:image`/`twitter:image` | Uses `data.imageUrl` from data-fetchers |
| `server/src/lib/prerender/data-fetchers.ts` (lines 49-55) | `tmdbPoster()`, `tmdbProfile()` | `https://image.tmdb.org/t/p/{size}{path}` |

The `tmdbPoster()`/`tmdbProfile()` helpers are defined in data-fetchers but only used for **season and episode** pages. Movie, show, and actor pages already use self-hosted `/og/...png` URLs for their `imageUrl` field. So the prerender TMDB dependency is limited to the same two page types (episode, season) that have raw TMDB URLs in their client-side meta tags.

### JSON-LD Schema.org `image` Property

Both client-side and server-side schema builders hardcode TMDB CDN URLs:

**Client-side** (`src/utils/schema.ts`):

| Function | Line | Image URL |
|----------|------|-----------|
| `buildMovieSchema()` | 42 | `https://image.tmdb.org/t/p/w500${movie.poster_path}` |
| `buildPersonSchema()` | 112 | `https://image.tmdb.org/t/p/h632${actor.profilePath}` |
| `buildTVSeriesSchema()` | 285 | `https://image.tmdb.org/t/p/w500${show.posterPath}` |
| `buildTVEpisodeSchema()` | 338 | `https://image.tmdb.org/t/p/w500${episode.stillPath}` |

**Server-side** (`server/src/lib/prerender/schema.ts`):

| Function | Line | Image URL |
|----------|------|-----------|
| `buildMovieSchema()` | 30 | `https://image.tmdb.org/t/p/w500${movie.poster_path}` |
| `buildPersonSchema()` | 83 | `https://image.tmdb.org/t/p/h632${actor.profile_path}` |
| `buildTVSeriesSchema()` | 126 | `https://image.tmdb.org/t/p/w500${show.poster_path}` |
| `buildTVEpisodeSchema()` | 131 | No `image` field currently (unlike client version) |

### OG Image Generator (Server-Side)

The OG image route (`server/src/routes/og-image.ts`) generates 1200x630 branded PNGs. It:
1. Fetches source images from TMDB CDN via `fetchImageAsBase64(path, size)` in `server/src/lib/og-image/generator.ts`
2. Composites them into a branded image with text overlay
3. Caches the result in Redis (1-week TTL)
4. On generation failure, **redirects to TMDB CDN URL as fallback** (lines ~156, ~162)

The generated images themselves are self-hosted (`/og/:type/:id.png`), but the generation process depends on TMDB CDN, and the failure fallback exposes TMDB URLs to social platforms.

## Dependency on Plan 01

This plan assumes plan 01's image storage is in place. The changes here are about **pointing meta tags and schema markup at self-hosted URLs** rather than TMDB CDN URLs. The actual image downloading and storage is covered by plan 01.

## Scope of Change

### Episode and Season OG/Twitter Images

Two options:

**Option A: Generate custom OG images** for episodes and seasons (like actors/movies/shows already have). This means extending the OG image generator to handle these types. More work, but consistent with the rest of the site.

**Option B: Use self-hosted image URLs** in the meta tags. Replace the TMDB CDN base URL with the self-hosted equivalent from plan 01. Simpler, but the images won't be branded 1200x630 social cards.

### Prerender Data Fetchers

Replace `TMDB_IMAGE_BASE` and the `tmdbPoster()`/`tmdbProfile()` helper functions in `server/src/lib/prerender/data-fetchers.ts` to construct self-hosted image URLs instead.

### JSON-LD Schema Builders

Update all four schema builder functions in **both** files:

| File | Functions to Update |
|------|--------------------|
| `src/utils/schema.ts` | `buildMovieSchema()`, `buildPersonSchema()`, `buildTVSeriesSchema()`, `buildTVEpisodeSchema()` |
| `server/src/lib/prerender/schema.ts` | `buildMovieSchema()`, `buildPersonSchema()`, `buildTVSeriesSchema()`, `buildTVEpisodeSchema()` (add `image` field to match client) |

Each function constructs image URLs with the pattern `https://image.tmdb.org/t/p/{size}{path}`. Replace with self-hosted URL construction.

**Keep these files in sync** — the server-side schema builders are documented as "server-side copies of the client-side schema builders" and should produce identical output. Note: the server-side `buildTVEpisodeSchema()` currently omits the `image` field (and `duration`) that the client version includes — this should be resolved as part of this migration by adding the `image` field once episode stills are available via plan 01.

### OG Image Generator

| Change | File |
|--------|------|
| Replace `TMDB_IMAGE_BASE` constant | `server/src/routes/og-image.ts` |
| Update `fetchImageAsBase64()` to read from self-hosted storage | `server/src/lib/og-image/generator.ts` |
| Remove TMDB CDN redirect fallback | `server/src/routes/og-image.ts` (~lines 156, 162) |

The fallback redirect to TMDB CDN URLs should be replaced with either:
- A generic fallback image (self-hosted branded placeholder)
- A 404 response (if the source image isn't available locally, the OG image can't be generated)

### Shared Image URL Builder

All three areas (meta tags, schema, OG generator) need to construct self-hosted image URLs from a `{path}` + `{size}` pair. Rather than updating each hardcoded URL individually, create a shared utility:

```
// Conceptual — actual API depends on storage choice from plan 01
function selfHostedImageUrl(path: string, size: string): string
```

This utility would be used by:
- `src/services/api.ts` (plan 01 — frontend URL builders)
- `src/utils/schema.ts` (this plan — client-side schema)
- `server/src/lib/prerender/data-fetchers.ts` (this plan — prerender meta)
- `server/src/lib/prerender/schema.ts` (this plan — server-side schema)
- `server/src/routes/og-image.ts` (this plan — OG generator)
- `server/src/lib/og-image/generator.ts` (this plan — image fetching)

Note: Frontend and backend need separate implementations of this utility (different import contexts), but they should produce identical URLs.

## Affected Files Summary

| File | Change Type |
|------|-------------|
| `src/pages/EpisodePage.tsx` | Replace TMDB CDN URL in og:image/twitter:image meta tags |
| `src/pages/SeasonPage.tsx` | Replace TMDB CDN URL in og:image/twitter:image meta tags |
| `src/utils/schema.ts` | Replace TMDB CDN URLs in all 4 schema builder functions |
| `server/src/lib/prerender/data-fetchers.ts` | Replace `TMDB_IMAGE_BASE`, `tmdbPoster()`, `tmdbProfile()` |
| `server/src/lib/prerender/schema.ts` | Replace TMDB CDN URLs in all 4 schema builder functions (add `image` to `buildTVEpisodeSchema`) |
| `server/src/routes/og-image.ts` | Replace `TMDB_IMAGE_BASE`, remove TMDB redirect fallback |
| `server/src/lib/og-image/generator.ts` | Update `fetchImageAsBase64()` to read from self-hosted storage |

## Migration Strategy

This plan should be implemented **after plan 01** (self-hosted TMDB images are available).

1. **Create shared URL builder**: A utility that constructs self-hosted image URLs from path + size, shared by both frontend and backend.
2. **Update schema builders**: Both `src/utils/schema.ts` and `server/src/lib/prerender/schema.ts` — lowest risk, only affects structured data.
3. **Update prerender data-fetchers**: Switch `tmdbPoster()`/`tmdbProfile()` to self-hosted URLs.
4. **Update episode/season meta tags**: Replace inline TMDB URLs in `EpisodePage.tsx` and `SeasonPage.tsx`.
5. **Update OG image generator**: Switch `fetchImageAsBase64()` to read from local storage. Remove TMDB CDN redirect fallback.
6. **Verify**: Use Google's Rich Results Test and Facebook's Sharing Debugger to confirm schema and OG images resolve correctly from self-hosted URLs.

## Test Impact

- Schema builder tests — update expected URLs from TMDB CDN to self-hosted
- Prerender tests — update expected image URLs
- OG image route tests — update mock URLs and test the no-TMDB-fallback behavior
- EpisodePage/SeasonPage tests — update expected meta tag content
- Add integration test: fetch a page's HTML, verify no `image.tmdb.org` or `media.themoviedb.org` URLs appear in meta tags or JSON-LD
