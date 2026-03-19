# Plan 02: Self-Host Wikimedia Commons Fallback Images

## Problem

Actors without TMDB profile photos fall back to images from Wikimedia Commons. The `fallback_profile_url` column stores full URLs pointing to `commons.wikimedia.org/wiki/Special:FilePath/...`. When a browser renders an actor card for one of these actors, it makes a direct request to Wikimedia's servers. If Wikimedia is slow, rate-limits, or changes their URL structure, these fallback images break.

## Current Architecture

### How Fallback URLs Get Into the Database

The backfill script (`server/scripts/backfill-actor-fallback-photos.ts`) populates `actors.fallback_profile_url` using a priority chain:

1. **Wikidata P18** — SPARQL query returns `commons.wikimedia.org/wiki/Special:FilePath/{filename}` URLs
2. **Wikipedia infobox** — Extracts image filename from article infobox, converts to Commons FilePath URL
3. **TMDB images endpoint** — `getBestPersonImageUrl()` returns a TMDB CDN URL (not Wikimedia)
4. **Wikimedia Commons search** — Direct search of Commons API, returns FilePath URLs

Sources 1, 2, and 4 produce `commons.wikimedia.org` URLs. Source 3 produces a TMDB CDN URL (covered in plan 01).

The Wikidata/Wikipedia/Commons image functions live in `server/src/lib/wikidata.ts`:
- `getActorImageFromWikidata()` (lines 857-926)
- `getActorImageFromWikipediaInfobox()` (lines 935-1007)
- `getActorImageFromCommonsSearch()` (lines 1057-1155)

### How Fallback URLs Are Displayed

The `fallback_profile_url` is used as a direct `<img src>` when TMDB `profile_path` is null:

| File | Pattern |
|------|---------|
| `src/components/common/ActorCard.tsx` | TMDB profile → `fallbackProfileUrl` → PersonIcon placeholder |
| `src/components/causes/NotableActorCard.tsx` | `getProfileUrl(profilePath) \|\| actor.fallbackProfileUrl` |
| `src/components/causes/CauseActorRow.tsx` | Same pattern |
| `src/components/home/ThisWeekDeaths.tsx` | Same pattern |
| `src/components/home/RecentDeaths.tsx` | Passes to ActorCard |
| `src/pages/ActorPage.tsx` | Related actors section |

### Database Schema

| Table | Column | Type | Content |
|-------|--------|------|---------|
| `actors` | `fallback_profile_url` | text, nullable | Full URL (Commons or TMDB CDN) |

Migration: `server/migrations/1769871141289_add-actor-fallback-profile-url.cjs`

### API Routes Returning Fallback URLs

- `server/src/routes/stats.ts` (line 288) — maps DB `fallback_profile_url` to API field `fallbackProfileUrl`
- `server/src/routes/admin/actors.ts` — includes in admin actor response
- `server/src/lib/db/deaths-discovery.ts` — death discovery queries include the column

### Volume

Only actors without a TMDB `profile_path` AND not marked obscure get a fallback URL. This is a much smaller set than the full actor table — likely in the low thousands.

## Scope of Change

### Storage (left open for implementation)

Same storage approach as plan 01. Wikimedia fallback images are single-size (no variants needed — they're displayed at the same dimensions as TMDB profiles).

### Download Pipeline

1. Query all actors where `fallback_profile_url` is not null and contains `commons.wikimedia.org`
2. Download each image (Commons FilePath URLs return the actual image file via redirect)
3. Store locally with a deterministic filename derived from the actor ID
4. Update `fallback_profile_url` in the database to point to the self-hosted URL (or add a new column and update the frontend to prefer it)

Considerations:
- Commons FilePath URLs redirect (302) to the actual image file on `upload.wikimedia.org` — the download pipeline must follow redirects
- Some images may be large (Commons stores originals) — may want to resize to a standard profile size during download
- Wikimedia has rate limits; space requests appropriately

### Two Migration Approaches

**Option A: Rewrite `fallback_profile_url` in place**
- After downloading, update the column to the self-hosted URL
- Zero frontend changes needed — components already use whatever URL is in the column
- Simpler, but destructive (loses the original Commons URL)

**Option B: Add a `fallback_profile_local_path` column**
- Store the local path separately, keep the original URL for reference
- Frontend URL builder checks local path first, falls back to original URL
- Non-destructive, but adds complexity

Option A is likely sufficient since the original Commons URLs can be re-derived from Wikidata/Wikipedia at any time.

### Frontend Changes

If using Option A (rewrite in place): **None** — components already render whatever URL is in `fallbackProfileUrl`.

If using Option B (new column): Update the 6 components listed above to prefer `fallbackProfileLocalUrl` over `fallbackProfileUrl`.

### Backend Changes

**Backfill script** (`server/scripts/backfill-actor-fallback-photos.ts`): After finding a Wikimedia URL, download the image and store the self-hosted URL instead. This ensures future backfill runs produce self-hosted URLs directly.

**Wikidata functions** (optional): Could modify `getActorImageFromWikidata()`, `getActorImageFromWikipediaInfobox()`, and `getActorImageFromCommonsSearch()` to download-and-store instead of returning Commons URLs. Or keep them returning Commons URLs and have the backfill script handle the download step.

### TMDB Fallback URLs in the Column

Source 3 in the backfill chain (`getBestPersonImageUrl()`) stores TMDB CDN URLs in `fallback_profile_url`. These are `image.tmdb.org` URLs, which are covered by plan 01. The download pipeline for this plan should handle both URL types, or coordinate with plan 01's pipeline.

## Migration Strategy

1. **Audit**: Query `SELECT COUNT(*) FROM actors WHERE fallback_profile_url LIKE '%commons.wikimedia.org%'` to confirm volume.
2. **Download**: Run a one-time script to download all Wikimedia fallback images.
3. **Update DB**: Replace `fallback_profile_url` values with self-hosted URLs (Option A).
4. **Update backfill script**: Ensure future runs of `backfill-actor-fallback-photos.ts` store self-hosted URLs.
5. **Verify**: Confirm no remaining `commons.wikimedia.org` requests via browser network tab on pages with fallback-image actors.

## Test Impact

- `server/src/lib/wikidata.test.ts` — tests that assert Commons URLs in return values may need updating
- Frontend component tests that mock `fallbackProfileUrl` with Commons URLs — update to self-hosted URLs
- Add tests for the download/conversion pipeline
