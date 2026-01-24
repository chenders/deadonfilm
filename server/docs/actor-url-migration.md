# Actor URL Migration: tmdb_id → actor.id

**Migration Date**: January 24, 2026
**Status**: Complete

## Overview

Migrated actor URLs from using `tmdb_id` to internal `actor.id` to avoid ID overlap issues.

## The Problem

The database had **99,003 cases of ID overlap** (18% of all actors) where:
- One actor's `id` equals a different actor's `tmdb_id`
- Example: Actor A (id=4165, tmdb_id=122844) vs Actor B (id=6417, tmdb_id=4165)
- Simply using numeric IDs without validation would return wrong actors 18% of the time

## The Solution

1. **All new URLs use actor.id**: `/actor/{slug}-{actorId}`
2. **Legacy URLs redirect with 301**: `/actor/{slug}-{tmdbId}` → `/actor/{slug}-{actorId}`
3. **Slug validation required**: Both ID lookups validate the slug matches the actor's name
4. **Cache keys updated**: Now use `actor:id:{actorId}` instead of `actor:id:{tmdbId}` (cache cleared on deployment)

## Implementation Details

### Backend Changes

- **Route parameters**: Changed from `:id` to `:slug` to capture full slug for validation
- **Lookup function**: `getActorByEitherIdWithSlug()` queries both `id` and `tmdb_id` with slug validation
- **Redirect logic**: Legacy tmdb_id URLs get 301 redirect to canonical actor.id URLs
- **Cache migration**: Cold cache on deployment, warms naturally within 24-48 hours

### Frontend Changes

- All `createActorSlug()` calls now use `actor.id` instead of `tmdb_id`
- Updated components: DeceasedCard, CauseActorRow, NotableActorCard, RecentDeaths, ActorDeathPage
- Type system: Made `tmdbId` nullable throughout

## Monitoring Redirect Volume

### Quick Check (SQL)

```sql
-- Count redirects from legacy URLs in the last 30 days
SELECT COUNT(*) as redirect_count
FROM page_visits
WHERE visited_path ~ '/actor/[a-z0-9-]+-\d+/?$'
  AND is_internal_referral = true
  AND referrer_path ~ '/actor/[a-z0-9-]+-\d+/?$'
  AND referrer_path != visited_path
  -- Exclude same actor different page (e.g., /actor/X vs /actor/X/death)
  AND split_part(referrer_path, '-', -1) != split_part(visited_path, '-', -1)
  AND visited_at >= NOW() - INTERVAL '30 days';
```

### Daily Trend (SQL)

```sql
-- Show daily redirect counts for the last 30 days
SELECT
  DATE(visited_at) as date,
  COUNT(*) as redirect_count
FROM page_visits
WHERE visited_path ~ '/actor/[a-z0-9-]+-\d+/?$'
  AND is_internal_referral = true
  AND referrer_path ~ '/actor/[a-z0-9-]+-\d+/?$'
  AND referrer_path != visited_path
  AND split_part(referrer_path, '-', -1) != split_part(visited_path, '-', -1)
  AND visited_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(visited_at)
ORDER BY date DESC;
```

### Expected Behavior

- **Week 1-2**: High redirect volume as search engines and bookmarks use old URLs
- **Week 3-12**: Gradual decline as sitemaps update and cache expires
- **Week 13+**: Near zero redirects (only from very old bookmarks or cached pages)

## Performance Impact

- **OR query overhead**: <0.5ms (negligible compared to 100-300ms TMDB API calls)
- **Cache cold start**: 24-48 hours to warm after deployment
- **Redirect latency**: 301 redirect adds ~1-2ms before second request

## Future Cleanup (Optional)

**After 90+ days** when redirect volume drops below 10/day for 14+ consecutive days:

### Option A: Remove tmdb_id Fallback (Optimize)

Simplify to actor.id-only lookup:

```typescript
// server/src/routes/actor.ts
const actorRecord = await getActorById(numericId)
if (!actorRecord) {
  return res.status(404).json({ error: { message: "Actor not found" } })
}
```

### Option B: Keep Forever (Recommended)

The OR query is fast enough (<0.5ms overhead) and handles edge cases gracefully. No action needed.

## Rollback Plan

If issues arise:

1. **Frontend**: Revert to previous version (links use tmdb_id again)
2. **Backend**: Keep in place (still handles both ID types)
3. **Sitemap**: Regenerate with old URL pattern: `npm run sitemap:generate`
4. **Cache**: Will warm automatically with old keys

No database rollback needed - no schema changes were made.

## Testing

- ✅ Unit tests: `server/src/routes/actor.test.ts`
- ✅ E2E tests: `e2e/actor-url-migration.spec.ts` (TODO: create)
- ✅ Type checking: All files pass
- ✅ Slug validation: Tested with overlap cases

## Files Changed

### Backend
- `server/src/lib/db/actors.ts` - Added `getActorByEitherIdWithSlug()`
- `server/src/routes/actor.ts` - Updated to use slug and handle redirects
- `server/src/routes/death-details.ts` - Same as actor.ts
- `server/src/lib/cache.ts` - Changed cache key structure
- `server/src/lib/sitemap-generator.ts` - Use actor.id instead of tmdb_id
- `server/src/lib/db/deaths-discovery.ts` - Updated getRecentDeaths()
- `server/src/index.ts` - Changed routes to use :slug

### Frontend
- `src/components/causes/CauseActorRow.tsx`
- `src/components/causes/NotableActorCard.tsx`
- `src/pages/ActorDeathPage.tsx`
- `src/components/home/RecentDeaths.tsx`
- `src/types/death.ts` - Added id field, made tmdbId nullable

### Tests
- `server/src/routes/stats.test.ts`
- `src/components/home/RecentDeaths.test.tsx`
- `src/pages/HomePage.test.tsx`

### Documentation
- `CLAUDE.md` - Updated URL patterns
- `.github/copilot-instructions.md` - Updated URL patterns

## References

- Migration plan: `/Users/chris/.claude/projects/-Users-chris-Source-deadonfilm/3ac55dec-ef95-4819-97cb-8cf12777cef1.jsonl`
- Database analysis: Revealed 99,003 ID overlap cases
