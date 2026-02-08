# Comprehensive SEO & Accessibility Improvement Plan

**Status**: In Progress
**Created**: 2026-02-08
**PR**: feat/seo-accessibility-improvements

## Context

Dead on Film's prerender service was not running in production -- crawlers were seeing empty `<div id="root"></div>` pages. PR #391 fixes this. This plan covers: recovering from indexing damage, improving accessibility to WCAG 2.1 AA, optimizing SEO for target queries, and establishing measurement baselines.

**Goal**: Get the site to the top of search results for queries like "who died in [movie]", "is [actor] dead", "[actor] cause of death".

## Implementation Status

### P0 -- Completed

| # | Recommendation | Status |
|---|---------------|--------|
| 1 | Prerender recovery: force re-crawl via GSC + IndexNow | Manual (post-deploy) |
| 2 | Fix cursed-movies/cursed-actors sitemap mismatch | DONE |
| 3 | Accessibility: LoadingSpinner `role="status"` + ErrorMessage `role="alert"` | DONE |
| 4 | Accessibility: MortalityGauge SVG text alternative | DONE |

### P1 -- Completed

| # | Recommendation | Status |
|---|---------------|--------|
| 5 | Actor page meta descriptions (death status, cause of death) | DONE |
| 6 | Canonical URLs audit | DONE (already present via PaginationHead) |
| 7 | Add living actors to sitemap (popularity >= 20) | DONE |
| 8 | Add `actor` property to Movie JSON-LD schema | DONE |
| 9 | Accessibility: skip link | DONE |
| 10 | Accessibility: Header h1 -> p (one h1 per page) | DONE |
| 11 | Accessibility: HoverTooltip semantic fix (span->button, aria-describedby) | DONE |
| 12 | Accessibility: focus indicator fixes (focus-visible:ring-2) | DONE |
| 13 | Accessibility: text-muted contrast fix (#6b5b4f -> #5d4e43) | DONE |
| 14 | E-E-A-T: Organization schema + publisher attribution | DONE |
| 15 | Footer expanded with content navigation links | DONE |
| 16 | Person schema: jobTitle + sameAs support | DONE |

### P1 -- Remaining (Separate PRs)

| # | Recommendation | Status |
|---|---------------|--------|
| 17 | Header navigation menu | Separate PR |
| 18 | Core Web Vitals tracking (plan 02) | Separate PR |
| 19 | Bing Webmaster Tools setup | Manual |
| 20 | Measurement baseline (GSC + GA4 snapshot) | Manual |

### P2 -- Future

| # | Recommendation | Status |
|---|---------------|--------|
| 21 | Add "Related Movies" section to movie pages | Planned |
| 22 | Add episode sitemap | Planned |
| 23 | Add `dateModified` / "Last updated" to content pages | Planned |
| 24 | Accessibility: Toast Escape key dismiss | Planned |
| 25 | Accessibility: search loading state announcement | Planned |
| 26 | GSC monitoring dashboard in admin | Planned |
| 27 | Content hub strategy | Planned |
| 28 | Dynamic OG images | Planned |

## Changes Made

### Sitemap (Plan 02)
- **File**: `server/src/lib/sitemap-generator.ts`
- Removed `/cursed-movies` and `/cursed-actors` from static pages (routes are disabled)
- Removed paginated entries for cursed pages
- Updated tests in `sitemap-generator.test.ts` and `sitemap.test.ts`

### Accessibility Quick Wins (Plan 03)
- **LoadingSpinner**: Added `role="status"` for screen reader live region
- **ErrorMessage**: Added `role="alert"` for screen reader announcement
- **MortalityGauge**: Added `role="img"` and `aria-label` to SVG
- **HoverTooltip**: Changed `<span role="button">` to native `<button>`, added `aria-describedby` linking to tooltip with `role="tooltip"`, uses `useId()` for unique IDs

### Actor Meta Descriptions (Plan 04)
- **File**: `src/pages/ActorPage.tsx`
- Deceased: "{Name} died on {date} at age {age}. Cause of death: {cause}. See complete filmography and mortality statistics."
- Living: "{Name} is alive at age {age}. See filmography and which co-stars have passed away."
- Also added `og:description` meta tag

### Living Actors in Sitemap (Plan 06)
- **File**: `server/src/lib/sitemap-generator.ts`
- Changed actors query from `WHERE deathday IS NOT NULL` to `WHERE deathday IS NOT NULL OR tmdb_popularity >= 20`
- Makes popular living actors discoverable by search engines

### Movie Schema Actor Property (Plan 07)
- **File**: `src/utils/schema.ts`
- Added `actor` array (top 10 cast) to Movie JSON-LD schema
- Added `jobTitle: "Actor"` to Person schema
- Added `sameAs` support (TMDB URL) to Person schema
- Added `publisher` to WebSite schema
- Added `buildOrganizationSchema()` function

### Accessibility Semantic Fixes (Plan 09)
- **Skip link**: Added to `Layout.tsx`, targets `#main-content` on `<main>`
- **Header h1->p**: Changed to `<p>` tag, added sr-only `<h1>` to HomePage
- **Focus indicators**: Replaced `focus:outline-none` with `focus-visible:ring-2` on expand/collapse buttons in DeceasedCard, ShowDeceasedList, ShowLivingList
- **Text-muted contrast**: Changed from `#6b5b4f` (4.1:1) to `#5d4e43` (5.1:1) - passes WCAG AA

### E-E-A-T Authority Signals (Plan 12)
- **Organization schema**: Added to homepage via `buildOrganizationSchema()`
- **Footer navigation**: Expanded with content links (Death Watch, Notable Deaths, Causes of Death, Deaths by Decade, Movie Genres)

## Post-Deploy Manual Steps (Plan 01)

1. Verify prerender: `curl -H "User-Agent: Googlebot/2.1" https://deadonfilm.com/ | head -50`
2. GSC: URL Inspection on key pages, click "Request Indexing"
3. GSC: Re-submit sitemap
4. Monitor GSC Coverage weekly for 8 weeks
