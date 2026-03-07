# Cache Consolidation Plan

**Date**: 2026-03-07
**Status**: Proposed
**Scope**: Consolidate all caching layers so invalidation is centralized and no layer gets missed

## Problem

Actor, movie, and show pages are served through **three independent caching layers** — API response cache, SSR HTML cache, and prerender HTML cache — but invalidation functions only know about some of them. This causes stale content after data changes.

The bug that prompted this plan: `invalidateActorCache()` cleared the API cache and prerender cache but **silently skipped the SSR cache**, so 10% of users (the SSR traffic split) continued seeing old actor biographies for up to 24 hours after re-enrichment.

This class of bug keeps recurring because each caching layer was added independently, and the invalidation functions in `cache.ts` were never updated to account for new layers.

## Current Architecture

### Caching Layers (5 total)

| Layer | Where | TTL | Invalidation | Scope |
|-------|-------|-----|--------------|-------|
| **API Redis cache** | `cache.ts` `setCached()` | 5 min – 1 week | `invalidateKeys()`, `invalidateByPattern()` | Route-level data (deaths, stats, causes, related) |
| **SSR HTML cache** | `ssr.ts` middleware, Redis prefix `ssr` | 1h (dynamic) / 24h (other) | `invalidateSSRCache()` — only called at startup and for death pages | Full rendered HTML for 10% of traffic |
| **Prerender HTML cache** | `prerender.ts` middleware, Redis prefix `prerender` | 1h (dynamic) / 24h (other) | `invalidatePrerenderCache()` — called per-actor + at startup | Minimal HTML for bots |
| **ETag validation** | `etag.ts` `sendWithETag()` | Client-side (browser) | Automatic (content hash changes) | Causes, deaths, movies, stats, related |
| **nginx Cache-Control** | `nginx.conf` `add_header` | Varies (no-cache for HTML, 30d for images) | None needed (validation-based for HTML) | Static assets and HTML |

### Entity Invalidation Coverage (before this fix)

| Entity | API Cache | Prerender | SSR | Notes |
|--------|:---------:|:---------:|:---:|-------|
| **Actor** | N/A (no API cache) | Cleared | **MISSED** | SSR gap caused this bug |
| **Death data** | Cleared | Cleared | Cleared | `invalidateDeathCaches()` handles all 3 |
| **Movie** | N/A (no API cache) | Not cleared | Not cleared | No `invalidateMovieCache()` exists |
| **Show** | N/A (no API cache) | Not cleared | Not cleared | No `invalidateShowCache()` exists |

## Root Cause

Invalidation logic is **scattered across ad-hoc functions** that each know about a subset of layers:

```
invalidateActorCache()       → API keys + prerender (missed SSR)
invalidateDeathCaches()      → API keys + prerender + SSR (correct, but only for death pages)
invalidateMovieCaches()      → API keys only (misses prerender + SSR)
invalidateActorCacheRequired() → same as invalidateActorCache()
```

There's no single abstraction that says "this entity changed — clear everything related to it across all layers."

## Proposed Solution: Entity-Based Cache Invalidation

### Core Idea

Replace the ad-hoc invalidation functions with a single `invalidateEntity()` function that knows about **all caching layers** for each entity type. When a new caching layer is added, only this one function needs updating.

### Implementation

#### Step 1: Define entity-to-cache-key mappings

Extend `CACHE_KEYS` to include SSR and prerender patterns for each entity:

```typescript
export const ENTITY_CACHE = {
  actor: (actorId: number) => ({
    apiKeys: [
      buildCacheKey(CACHE_PREFIX.ACTOR, { id: actorId, v: 2 }),
      buildCacheKey(CACHE_PREFIX.ACTOR, { id: actorId, type: "death" }),
      buildCacheKey(CACHE_PREFIX.RELATED_ACTORS, { id: actorId }),
    ],
    prerenderPattern: `${CACHE_PREFIX.PRERENDER}:*:/actor/*-${actorId}`,
    ssrPattern: `${CACHE_PREFIX.SSR}:*:/actor/*-${actorId}`,
  }),

  movie: (tmdbId: number) => ({
    apiKeys: [
      buildCacheKey(CACHE_PREFIX.MOVIE, { id: tmdbId }),
    ],
    prerenderPattern: `${CACHE_PREFIX.PRERENDER}:*:/movie/*-${tmdbId}`,
    ssrPattern: `${CACHE_PREFIX.SSR}:*:/movie/*-${tmdbId}`,
  }),

  show: (tmdbId: number) => ({
    apiKeys: [
      buildCacheKey(CACHE_PREFIX.SHOW, { id: tmdbId }),
    ],
    prerenderPattern: `${CACHE_PREFIX.PRERENDER}:*:/show/*-${tmdbId}`,
    ssrPattern: `${CACHE_PREFIX.SSR}:*:/show/*-${tmdbId}`,
  }),
} as const
```

#### Step 2: Single invalidation function

```typescript
/**
 * Invalidate ALL cache layers for an entity.
 * This is the only function callers should use — it guarantees
 * no caching layer is missed.
 */
export async function invalidateEntity(
  entity: ReturnType<typeof ENTITY_CACHE.actor>
): Promise<void> {
  await Promise.all([
    entity.apiKeys.length > 0 ? invalidateKeys(...entity.apiKeys) : Promise.resolve(),
    invalidateByPattern(entity.prerenderPattern),
    invalidateByPattern(entity.ssrPattern),
  ])
}
```

#### Step 3: Replace all call sites

```typescript
// Before (easy to forget a layer)
await invalidateActorCache(actorId)

// After (impossible to miss a layer)
await invalidateEntity(ENTITY_CACHE.actor(actorId))
```

#### Step 4: Deprecate old functions

Mark `invalidateActorCache`, `invalidateActorCacheRequired`, and `invalidateMovieCaches` as deprecated. Remove them once all call sites are migrated.

#### Step 5: Update `invalidateDeathCaches`

Death cache invalidation is broader (many prefixes + discovery pages). Keep it as a separate function but have it call `invalidateEntity` internally for any per-entity work, plus its own bulk pattern invalidation for discovery pages.

### Call Sites to Update

| File | Current Call | New Call |
|------|-------------|---------|
| `biography-enrichment-db-writer.ts:103` | `invalidateActorCache(actorId)` | `invalidateEntity(ENTITY_CACHE.actor(actorId))` |
| `enrichment-db-writer.ts:234` | `invalidateActorCache(actorId)` | `invalidateEntity(ENTITY_CACHE.actor(actorId))` |
| `routes/admin/actors.ts:727` | `invalidateActorCache(actorId)` | `invalidateEntity(ENTITY_CACHE.actor(actorId))` |
| `routes/admin/cache.ts:207` | `invalidateActorCache(actorId)` | `invalidateEntity(ENTITY_CACHE.actor(actorId))` |

### Testing

1. Unit test `invalidateEntity()` to verify it calls `invalidateKeys` and `invalidateByPattern` for all three layers
2. Test that `ENTITY_CACHE.actor()` generates correct patterns
3. Test that `ENTITY_CACHE.movie()` and `ENTITY_CACHE.show()` generate correct patterns
4. Integration test: after `invalidateEntity(ENTITY_CACHE.actor(id))`, verify no Redis keys remain matching any of the three patterns

### Migration Path

1. Add `ENTITY_CACHE` and `invalidateEntity()` alongside existing functions
2. Update call sites one at a time
3. Keep old functions as wrappers calling `invalidateEntity()` during transition
4. Remove old functions once no callers remain

## Estimated Effort

| Step | Time |
|------|------|
| Define `ENTITY_CACHE` mappings | 30 min |
| Implement `invalidateEntity()` | 30 min |
| Update call sites (4 files) | 30 min |
| Write tests | 1 hour |
| Update `invalidateDeathCaches()` | 30 min |
| **Total** | ~3 hours |

## Success Criteria

- [ ] Single `invalidateEntity()` function that clears API, prerender, and SSR caches
- [ ] All entity cache patterns defined in one `ENTITY_CACHE` object
- [ ] No direct calls to `invalidateActorCache()` remain (only `invalidateEntity()`)
- [ ] Adding a new caching layer requires updating only `ENTITY_CACHE` + `invalidateEntity()`
- [ ] Tests verify all three layers are cleared for actors, movies, and shows

## Non-Goals

- Changing TTL values or caching strategy
- Adding API-level caching for actors/movies/shows (separate decision)
- Replacing the ETag system (it's self-invalidating)
- Changing nginx caching (it's validation-based for HTML)
