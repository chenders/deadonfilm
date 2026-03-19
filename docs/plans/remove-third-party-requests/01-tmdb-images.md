# Plan 01: Self-Host TMDB Images

## Problem

Every page load makes direct browser requests to two TMDB CDNs:

- **`image.tmdb.org`** — standard TMDB image CDN (posters, profiles, backdrops, stills)
- **`media.themoviedb.org`** — TMDB media CDN with face-cropped variants

If either CDN goes down, rate-limits, or changes URL structure, all images on the site break. The database already stores TMDB image paths (e.g., `/abc123.jpg`); full URLs are constructed at runtime by prepending the CDN base.

## Current Architecture

### Database Columns (paths only, no full URLs)

| Table | Column | Example Value |
|-------|--------|---------------|
| `actors` | `profile_path` | `/abc123.jpg` |
| `movies` | `poster_path` | `/def456.jpg` |
| `shows` | `poster_path` | `/ghi789.jpg` |
| `shows` | `backdrop_path` | `/jkl012.jpg` |
| `seasons` | `poster_path` | `/mno345.jpg` |
| `episodes` | (none — `still_path` fetched from TMDB API per-request, not persisted) |

### Frontend URL Construction

**Primary CDN** (`image.tmdb.org/t/p`):

| File | Function | Sizes Used |
|------|----------|------------|
| `src/services/api.ts` | `getPosterUrl()` | w92, w154, w185, w342, w500, original |
| `src/services/api.ts` | `getProfileUrl()` | w45, w92, w185, h632, original |
| `src/services/api.ts` | `getBackdropUrl()` | w300, w500, w780, w1280, original |
| `src/pages/EpisodePage.tsx` | inline | w500 (still) |
| `src/pages/SeasonPage.tsx` | inline | w300 (poster) |

**Secondary CDN** (`media.themoviedb.org/t/p`) — face-cropped variants:

| File | Function | Sizes Used |
|------|----------|------------|
| `src/components/search/SearchResult.tsx` | `getPosterUrls()` | w45_and_h67_face, w94_and_h141_face |
| `src/components/search/SearchResult.tsx` | `getProfileUrls()` | w45_and_h67_face, w94_and_h141_face |
| `src/pages/SearchResultsPage.tsx` | `getPosterUrls()`, `getProfileUrls()` | w92, w185 |

### Frontend Components Using Images

Posters: `MovieHeader`, `ShowHeader`, `ActorPage` (filmography), `PopularMovies`, `SeasonPage`, `EpisodePage`, `GenresIndexPage`, `DecadesIndexPage`, search results

Profiles: `ActorCard`, `RecentDeaths` (+ LCP preload), `ThisWeekDeaths`, `NotableActorCard`, `CauseActorRow`, `ActorPage`, search results

Backdrops: `ShowHeader` (background), potentially other show pages

Stills: `EpisodePage`

### Backend URL Construction

| File | Constant/Function | Usage |
|------|-------------------|-------|
| `server/src/routes/og-image.ts` | `TMDB_IMAGE_BASE`, `fetchImageAsBase64()` | OG image generation (fetches TMDB images server-side) |
| `server/src/lib/prerender/data-fetchers.ts` | `TMDB_IMAGE_BASE`, `tmdbPoster()`, `tmdbProfile()` | Prerender meta tags |
| `server/src/lib/prerender/schema.ts` | inline TMDB URLs | JSON-LD schema (covered in plan 03) |
| `server/src/lib/tmdb.ts` | `getBestPersonImageUrl()` | Returns w185 profile URL (used by backfill script) |

## Image Size Inventory

Across both CDNs, these TMDB sizes are actively used:

### Posters
- `w92` — small thumbnails (filmography rows, search results)
- `w154` — available but rarely used
- `w185` — medium (popular movies)
- `w300` — season page
- `w342` — large (movie header, OG image fetch)
- `w500` — extra large (OG images, prerender, schema, episode stills)
- `w45_and_h67_face` — face-cropped tiny (search modal, media CDN)
- `w94_and_h141_face` — face-cropped small (search modal 2x, media CDN)

### Profiles
- `w45` — tiny
- `w92` — small (actor cards)
- `w185` — medium (various components, backfill script)
- `h632` — tall (OG images, schema)
- `w45_and_h67_face` — face-cropped (search modal, media CDN)
- `w94_and_h141_face` — face-cropped (search modal 2x, media CDN)

### Backdrops
- `w300`, `w500`, `w780`, `w1280` — responsive sizes

### Stills
- `w500` — episode stills

## Scope of Change

### Storage (left open for implementation)

Images need to be downloaded from TMDB and stored somewhere the site controls. Options include local filesystem behind nginx, S3/R2/object storage, or a self-hosted CDN. The storage choice affects the download pipeline, URL rewriting, and cache invalidation strategy but doesn't change the list of affected files.

Key considerations for any storage approach:
- **Volume**: ~572K actors (profile_path), ~152K movies (poster_path), plus shows, seasons, backdrops, stills
- **Size variants**: Need to store multiple sizes per image, or store originals and resize on the fly
- **Face-cropped variants**: The `media.themoviedb.org` face-cropped sizes (`w45_and_h67_face`, etc.) are not available from `image.tmdb.org` — either generate them ourselves or replace with standard sizes in search components
- **Episode stills**: Not currently persisted in DB — need a new `still_path` column on `episodes` table, or fetch-and-cache on demand

### Download Pipeline

A script/job to:
1. Query all non-null image paths from DB
2. Download each needed size variant from TMDB
3. Store locally with a deterministic path mapping
4. Track download status to support incremental runs
5. Handle TMDB rate limits (40 requests/10 seconds for image CDN)

Must also handle ongoing additions — new movies/actors added by TMDB sync need their images downloaded.

### Frontend Changes

**Central URL builder rewrite** — the three functions in `src/services/api.ts` (`getPosterUrl`, `getProfileUrl`, `getBackdropUrl`) are the primary change point. Rewriting these to point to self-hosted URLs propagates to most components automatically.

**Components with hardcoded TMDB URLs** that need individual fixes:

| File | What to Change |
|------|---------------|
| `src/components/search/SearchResult.tsx` | Replace `media.themoviedb.org` base URL in `getPosterUrls()` and `getProfileUrls()` |
| `src/pages/SearchResultsPage.tsx` | Replace `media.themoviedb.org` base URL in local URL builders |
| `src/pages/EpisodePage.tsx` | Replace inline `image.tmdb.org` still URL construction |
| `src/pages/SeasonPage.tsx` | Replace inline `image.tmdb.org` poster URL construction |

### Backend Changes

| File | What to Change |
|------|---------------|
| `server/src/routes/og-image.ts` | Change `TMDB_IMAGE_BASE` constant; update `fetchImageAsBase64()` to read from self-hosted storage instead of fetching from TMDB CDN |
| `server/src/lib/prerender/data-fetchers.ts` | Change `TMDB_IMAGE_BASE` and `tmdbPoster()`/`tmdbProfile()` to construct self-hosted URLs |
| `server/src/lib/tmdb.ts` | `getBestPersonImageUrl()` — this fetches from TMDB API (not CDN) to find the best image, then returns a TMDB CDN URL. May need to download and store the result instead |
| `server/src/lib/og-image/generator.ts` | `fetchImageAsBase64()` currently fetches from TMDB CDN — change to read from local storage |

### Database Changes

- **Episode stills**: Add `still_path` column to `episodes` table (currently fetched per-request from TMDB API, not stored)
- **Optional**: Add columns to track image download status per entity, or use a separate tracking table

### LCP Optimization

`src/components/home/RecentDeaths.tsx` constructs `<link rel="preload">` tags with TMDB CDN URLs for the first actor image (LCP optimization). These must point to the self-hosted URL instead.

## Migration Strategy

1. **Download pipeline**: Build and run the image download job. This can run while the site still uses TMDB CDN — zero risk.
2. **Add self-hosted URL builder**: Create a new URL builder (or modify existing ones) that maps `profile_path` → self-hosted URL. Feature-flag or environment variable to switch between TMDB and self-hosted.
3. **Switch frontend**: Update the three central functions in `api.ts` plus the four files with hardcoded TMDB URLs. With the flag approach, this is a single config change.
4. **Switch backend**: Update OG image generator, prerender, and schema builders.
5. **Ongoing sync**: Hook into existing TMDB sync jobs to download images for newly added entities.
6. **Verify and remove**: Confirm no remaining TMDB CDN requests via browser network tab, then remove the old TMDB URL construction code.

## Face-Cropped Image Decision

The `media.themoviedb.org` face-cropped variants (`w45_and_h67_face`, `w94_and_h141_face`) are only used in two files (SearchResult.tsx, SearchResultsPage.tsx). Options:

- **Replace with standard sizes**: Use `w92`/`w185` crops from `image.tmdb.org` instead. Slightly different framing but avoids maintaining a face-detection pipeline.
- **Generate locally**: Use a face-detection library (e.g., sharp with crop-to-attention) to produce cropped variants. More work, preserves current UX.
- **Download and cache the face-cropped versions**: Fetch from `media.themoviedb.org` during the download phase and store alongside standard sizes. Simplest migration but still depends on TMDB for initial download.

## Test Impact

- Update any test files that mock TMDB image URLs (~40+ test files reference `image.tmdb.org`)
- Add tests for the image download pipeline
- Add tests for the new URL builder functions
- E2E tests should verify images load from self-hosted URLs
