# Plan: Dynamic OG Images + Social Sharing (SEO Plan #09)

## Context

When Dead on Film links are shared on social media, the preview cards show raw TMDB posters with no branding or mortality statistics. The site's unique data (mortality percentages, death stats) is invisible in social previews. There are also no share buttons on content pages, despite the inherently shareable content. This is the last remaining item in the SEO strategy.

## What We're Building

1. **Server-side OG image generation** at `/og-image/:type/:id.png` (1200x630px branded images)
2. **Share buttons** on content pages (Twitter/X, Facebook, Reddit, Copy link, native Web Share)
3. **Updated og:image meta tags** pointing to the new branded images

---

## Phase 1: Server-Side OG Image Generation

### Dependencies

Install in `server/`:
- `satori` — JSX-to-SVG renderer (Vercel's library, ~100KB)
- `@resvg/resvg-js` — SVG-to-PNG (Rust-based, fast, no system deps like libvips)

### Font Files

Create `server/src/assets/fonts/` with:
- `inter-400.ttf`, `inter-700.ttf` — body text (download from Google Fonts)
- `playfair-display-700.ttf` — headings (download from Google Fonts)

These are loaded once at startup (~200KB total). Satori requires TTF, not woff2.

### Template Approach

Use a simple `h()` helper function to create satori-compatible element trees in plain `.ts` files (no JSX/TSX needed, no React dependency, no tsconfig changes):

```typescript
function h(type: string, props: any, ...children: any[]) {
  return { type, props: { ...props, children: children.flat().filter(Boolean) } }
}
```

### Files to Create

| File | Purpose |
|------|---------|
| `server/src/lib/og-image/element.ts` | `h()` helper for building satori element trees |
| `server/src/lib/og-image/fonts.ts` | Load TTF fonts at module level |
| `server/src/lib/og-image/templates.ts` | Template functions per entity type (movie, show, actor, episode) |
| `server/src/lib/og-image/data.ts` | Lightweight DB queries (only fields needed for OG images) |
| `server/src/lib/og-image/generate.ts` | Pipeline: template → satori → resvg → PNG buffer |
| `server/src/lib/og-image/index.ts` | Barrel export |
| `server/src/routes/og-image.ts` | Express route handler with caching |

### Template Layout (all types)

```
+------------------------------------------------------------------+
|  DEAD ON FILM                                   deadonfilm.com    |
|                                                                    |
|  +----------+  Title (Playfair Display Bold)                      |
|  |  Poster/ |  Subtitle (year, dates, etc.)                      |
|  |  Photo   |                                                      |
|  |  (w342)  |  ┌─────────────────────────┐                       |
|  |          |  │  XX% of cast deceased    │  (accent badge)      |
|  +----------+  └─────────────────────────┘                       |
|                                                                    |
|  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄  (accent bottom bar)   |
+------------------------------------------------------------------+
```

Colors (hardcoded, matching site theme):
- Background: `#f5f0e8` (cream) | Title text: `#3d2914` (brown-dark)
- Stat badge: `#8b0000` (deceased red) | Muted text: `#5d4e43`

### Data Queries (`data.ts`)

Simple, targeted queries using `getPool()` — NOT reusing the full route handlers:

- **Movie**: `title, release_date, poster_path, deceased_count, total_cast` from `movies`
- **Show**: `name, first_air_date, poster_path, deceased_count, total_cast` from `shows`
- **Actor**: `name, birthday, deathday, profile_path, cause_of_death` from `actors`
- **Episode**: `episode.name, season_number, episode_number` + show name/poster from join

TMDB images fetched server-side as base64 data URIs (w342 for posters, w185 for profiles) and embedded directly in the template.

### Route Handler (`server/src/routes/og-image.ts`)

**URL**: `GET /og-image/:type/:id.png`
- `:type` = `movie` | `show` | `actor` | `episode`
- `:id` = numeric ID (tmdbId for movies/shows, actorId for actors)
- Episode: `/og-image/episode/:showId-s:season-e:episode.png`

Flow:
1. Validate type param
2. Check Redis cache → return cached PNG if hit
3. Fetch data from DB + TMDB image
4. Build template → satori SVG → resvg PNG
5. Cache PNG as base64 in Redis (24h TTL)
6. Return PNG with `Cache-Control: public, max-age=86400`
7. On error → 404 (social crawlers fall back to no image)

### Cache Integration (`server/src/lib/cache.ts`)

Add:
- `OG_IMAGE: "og-image"` to `CACHE_PREFIX`
- `OG_IMAGE: 86400` to `CACHE_TTL` (24 hours)
- `ogImage: (type, id) => ({ image: buildCacheKey(...) })` to `CACHE_KEYS`

### Route Registration (`server/src/index.ts`)

Mount before API routes with `heavyEndpointLimiter`:
```typescript
app.get("/og-image/:type/:id.png", heavyEndpointLimiter, getOgImage)
```

### Prerender Skip

Add `/og-image` to the prerender middleware skip list in `server/src/middleware/prerender.ts` (alongside `/api`, `/admin`, `/health`, `/sitemap`).

### Vite Proxy (`vite.config.ts`)

Add `/og-image` proxy entry for local dev.

---

## Phase 2: Share Buttons Component

### Files to Create

| File | Purpose |
|------|---------|
| `src/components/social/ShareButtons.tsx` | Share button row component |
| `src/components/social/ShareButtons.test.tsx` | Tests |

### Design

Compact horizontal row of icon buttons matching the site's pill-button style:

```
[𝕏 Tweet]  [f Share]  [↗ Reddit]  [🔗 Copy Link]
```

On mobile (when `navigator.share` available): single [↗ Share] button using Web Share API.

**Props**:
```typescript
interface ShareButtonsProps {
  url: string        // Canonical URL path (e.g., location.pathname)
  title: string      // Page title for share text
  description: string // Key stat for share text
}
```

**Share targets** (link-based, no external scripts):
- Twitter/X: `https://twitter.com/intent/tweet?url=...&text=...`
- Facebook: `https://www.facebook.com/sharer/sharer.php?u=...`
- Reddit: `https://www.reddit.com/submit?url=...&title=...`
- Copy link: `navigator.clipboard.writeText()` → toast "Link copied!"
- Mobile: `navigator.share()` when available

**Style**: Matches existing site patterns — `rounded-full border border-brown-medium/30 bg-beige px-3 py-1.5 text-xs text-brown-dark` with hover transitions.

SVG icons inline in the component (small, no separate icon files needed).

### Tests

- Renders all share buttons on desktop
- Copy link calls clipboard API and triggers toast
- Web Share button appears when `navigator.share` exists
- Share URLs correctly encoded
- data-testid attributes present

---

## Phase 3: Page Integration

### Update OG Meta Tags

In each page, replace conditional TMDB og:image with always-present branded image:

**MoviePage.tsx** (`src/pages/MoviePage.tsx:94-98`):
```tsx
// Before: {movie.poster_path && <meta property="og:image" content={tmdb_url} />}
// After:
<meta property="og:image" content={`https://deadonfilm.com/og-image/movie/${movieId}.png`} />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
```

Same pattern for `twitter:image`. Apply to all 4 page types:
- **MoviePage** → `/og-image/movie/${movieId}.png`
- **ShowPage** → `/og-image/show/${showId}.png`
- **ActorPage** → `/og-image/actor/${actorId}.png` (uses internal actor ID, not tmdb_id)
- **EpisodePage** → `/og-image/episode/${showId}-s${season}-e${episode}.png`

### Add Share Buttons

Place `<ShareButtons>` on each page:
- **MoviePage**: After the poster+gauge section (line ~150), before the cast toggle
- **ShowPage**: Same position as MoviePage
- **ActorPage**: In the header info section, after external links
- **EpisodePage**: Below episode header

---

## Phase 4: Housekeeping

Rename completed plan files:
- `02-core-web-vitals.md` → `DONE-02-core-web-vitals.md`
- `07-gsc-monitoring-dashboard.md` → `DONE-07-gsc-monitoring-dashboard.md`
- `08-editorial-content.md` → `DONE-08-editorial-content.md`
- `09-social-sharing-og-images.md` → `DONE-09-social-sharing-og-images.md` (after this work)

---

## Testing Strategy

### Server Tests
- `server/src/routes/og-image.test.ts` — Route handler: valid/invalid types, cache hit/miss, 404 on missing entity, correct headers
- `server/src/lib/og-image/data.test.ts` — Data queries return correct fields, handle missing entities
- `server/src/lib/og-image/generate.test.ts` — Pipeline produces valid PNG buffer (check magic bytes `\x89PNG`)

### Frontend Tests
- `src/components/social/ShareButtons.test.tsx` — Rendering, clipboard, Web Share API, URL encoding

### Manual Verification
1. Start dev server, visit `/og-image/movie/238.png` (The Godfather) — verify branded image
2. Test with Facebook Sharing Debugger
3. Test with Twitter Card Validator
4. Verify share buttons on movie/actor/show pages
5. Test copy link → toast feedback
6. Test mobile Web Share API (device or DevTools)

---

## Implementation Order

1. Install deps + download fonts
2. Build data queries + tests
3. Build element helper + templates
4. Build generation pipeline + tests
5. Build route handler + cache integration + tests
6. Mount route, add vite proxy, update prerender skip list
7. Build ShareButtons component + tests
8. Integrate into all 4 page types (og:image + ShareButtons)
9. Rename plan files
10. Manual verification
