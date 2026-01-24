# Actor URL Migration - Additional Enhancement Ideas

**Branch**: `feat/actor-url-enhancements`
**Status**: Brainstorm / Proposal

This document outlines additional enhancement ideas beyond the two already implemented (cache warming and redirect instrumentation).

---

## 🎨 Admin Interface Enhancements

### 1. Actor URL Migration Dashboard Widget

**Priority**: HIGH
**Effort**: MEDIUM (4-6 hours)
**Location**: Add to `src/pages/admin/AnalyticsPage.tsx`

Create a dedicated section on the Analytics page showing migration health:

**UI Components**:
```tsx
<ActorUrlMigrationSection startDate={startDate} endDate={endDate} />
```

**Features**:
- **Redirect Volume Chart**: Line chart showing daily redirect counts
- **Top Redirected Actors**: Table of actors most accessed via old URLs
- **Referer Breakdown**: Pie chart showing where redirects come from:
  - Search engines (Google, Bing, etc.)
  - Social media
  - Direct bookmarks
  - Internal navigation
- **Migration Health Score**:
  - Green: <50 redirects/day (migration complete)
  - Yellow: 50-500 redirects/day (in progress)
  - Red: >500 redirects/day (high legacy URL usage)

**API Endpoint** (already exists):
- `/admin/api/analytics/actor-url-redirects?days=30`

**Value**:
- At-a-glance migration status
- Identify if sitemap resubmission needed
- Know when to remove fallback code

---

### 2. Actor Profile Diagnostic Tool

**Priority**: MEDIUM
**Effort**: MEDIUM (3-4 hours)
**Location**: New page `/admin/actors/diagnostic`

Quick lookup tool for diagnosing actor URL issues:

**Features**:
```
┌─────────────────────────────────────────┐
│ Actor Diagnostic Tool                   │
├─────────────────────────────────────────┤
│ Enter actor ID (internal or TMDB):     │
│ [____________________] [Lookup]         │
└─────────────────────────────────────────┘

Results:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Actor: Tom Hanks
Internal ID: 4165
TMDB ID: 31
Status: ✅ No conflict (IDs match)
Canonical URL: /actor/tom-hanks-4165
Legacy URL: /actor/tom-hanks-31 → redirects ✓

Cache Status:
  Profile: ✅ Cached (TTL: 18h 23m)
  Death:   ✅ Cached (TTL: 18h 23m)

Recent Redirects:
  Last 7 days: 23 redirects
  Last 30 days: 147 redirects
  Top referer: google.com (67%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**API Endpoint** (to create):
```typescript
GET /admin/api/actors/:id/diagnostic
{
  "actor": { ... },
  "idConflict": { hasConflict: true, conflictingActorId: 99003 },
  "urls": {
    "canonical": "/actor/tom-hanks-4165",
    "legacy": "/actor/tom-hanks-31"
  },
  "cache": {
    "profile": { cached: true, ttl: 66180 },
    "death": { cached: true, ttl: 66180 }
  },
  "redirectStats": {
    "last7Days": 23,
    "last30Days": 147,
    "topReferer": "google.com"
  }
}
```

**Value**:
- Instant troubleshooting for support issues
- Verify cache warming worked
- Identify problematic actors

---

### 3. Bulk Actor Cache Management

**Priority**: LOW
**Effort**: LOW (2 hours)
**Location**: Add to `src/pages/admin/ActorManagementPage.tsx`

UI for the cache warming script:

**Features**:
```
┌─────────────────────────────────────────┐
│ Cache Management                         │
├─────────────────────────────────────────┤
│ Warm Cache Options:                     │
│ ○ Top 500 actors                        │
│ ○ Top 1000 actors (default)             │
│ ○ Top 5000 actors                       │
│ ☑ Deceased only                         │
│                                          │
│ [Warm Cache] [Preview]                  │
│                                          │
│ Last warmed: 2 hours ago (1000 actors)  │
│ Cache hit rate (24h): 94.2%             │
└─────────────────────────────────────────┘
```

**API Endpoints** (to create):
```typescript
POST /admin/api/cache/warm
{ limit: 1000, deceasedOnly: false, dryRun: false }

GET /admin/api/cache/stats
{
  "lastWarmed": "2026-01-24T12:00:00Z",
  "actorsWarmed": 1000,
  "hitRate24h": 0.942,
  "missRate24h": 0.058
}
```

**Value**:
- No need to SSH to run script
- Monitor cache effectiveness
- Re-warm after Redis restart

---

## 🔍 SEO & Search Engine Tools

### 4. Sitemap Change Detector

**Priority**: MEDIUM
**Effort**: MEDIUM (3-4 hours)
**Location**: New endpoint + admin page

Track which actor URLs changed in sitemap and notify search engines:

**Features**:
- Compare current sitemap to previous version
- Identify changed URLs (tmdb_id → id)
- Auto-submit to Google/Bing when >100 URLs change
- Track last submission date

**Implementation**:
```typescript
// Store sitemap hash after generation
await pool.query(`
  INSERT INTO sitemap_versions (generated_at, url_count, hash)
  VALUES (NOW(), $1, $2)
`, [urlCount, sha256(sitemapXml)])

// Detect changes
const changedUrls = compareVersions(previousHash, currentHash)

// Auto-submit if >100 changes
if (changedUrls.length > 100) {
  await submitToSearchEngines('/sitemap.xml')
}
```

**Admin UI**:
```
Sitemap Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Last generated: 2 hours ago
Actor URLs: 48,523
Changed URLs: 48,523 (100% migration)

Search Engine Status:
  Google: ✅ Submitted 1 hour ago
  Bing:   ✅ Submitted 1 hour ago

[Regenerate Sitemap] [Submit to Search Engines]
```

**Value**:
- Faster SEO recovery
- Reduced 404s from stale search results
- Automated submission vs manual

---

### 5. 404 Monitor for Actor URLs

**Priority**: MEDIUM
**Effort**: LOW (2 hours)
**Location**: Add to Analytics page

Track 404s on actor URLs to catch broken links:

**Features**:
- Daily count of 404s matching `/actor/*` pattern
- Top 10 broken actor URLs
- Alert if 404 rate >1% of actor requests

**Query**:
```sql
SELECT
  visited_path,
  COUNT(*) as error_count
FROM page_visits
WHERE visited_path LIKE '/actor/%'
  AND response_status = 404
  AND visited_at >= NOW() - INTERVAL '7 days'
GROUP BY visited_path
ORDER BY error_count DESC
LIMIT 10
```

**Admin UI**:
```
Actor URL 404s (Last 7 Days)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total: 23 (0.04% of actor requests) ✅

Top Broken URLs:
/actor/john-deo-999999     12 hits
/actor/jane-smith-88888     8 hits
/actor/unknown-3333         3 hits
```

**Value**:
- Catch typos in external links
- Identify deleted actors
- Monitor migration issues

---

## 📊 Database & Performance Tools

### 6. Actor ID Overlap Report

**Priority**: MEDIUM
**Effort**: LOW (1-2 hours)
**Location**: New admin page or analytics section

Comprehensive report on ID conflicts:

**Features**:
```sql
-- Actors with ID conflicts
SELECT
  a1.id as internal_id,
  a1.tmdb_id,
  a1.name as actor_by_internal_id,
  a2.name as actor_by_tmdb_id,
  a1.popularity as pop1,
  a2.popularity as pop2
FROM actors a1
JOIN actors a2 ON a1.tmdb_id = a2.id
WHERE a1.id != a1.tmdb_id
ORDER BY GREATEST(a1.popularity, a2.popularity) DESC NULLS LAST
LIMIT 100;
```

**Admin UI**:
```
Actor ID Overlap Analysis
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total conflicts: 99,003 (100% of actors where id ≠ tmdb_id)

Top Conflicts (by popularity):
┌────────┬─────────┬──────────────────┬──────────────────┬────────────┐
│ Int ID │ TMDB ID │ By Internal ID   │ By TMDB ID       │ Popularity │
├────────┼─────────┼──────────────────┼──────────────────┼────────────┤
│  4165  │   31    │ Tom Hanks        │ James Dean       │   45.2     │
│  8891  │  287    │ Brad Pitt        │ John Wayne       │   42.1     │
│ 12345  │  500    │ Leonardo DiCaprio│ Marlon Brando    │   39.8     │
└────────┴─────────┴──────────────────┴──────────────────┴────────────┘

Migration Impact:
- Slug validation prevents wrong matches: ✅
- Redirects handle legacy URLs: ✅
- No user-facing issues expected: ✅
```

**Value**:
- Understand scale of problem
- Verify migration handles conflicts
- Documentation for future work

---

### 7. Query Performance Monitor

**Priority**: LOW
**Effort**: MEDIUM (3-4 hours)
**Location**: Add to Analytics page

Track actor query performance over time:

**Features**:
- Log query duration for `getActorByEitherIdWithSlug`
- Track cache hit/miss ratio
- Alert if P95 latency >100ms

**Implementation**:
```typescript
const startTime = performance.now()
const actor = await getActorByEitherIdWithSlug(id, slug)
const duration = performance.now() - startTime

// Record in New Relic
newrelic.recordMetric('Custom/ActorQuery/Duration', duration)
newrelic.recordMetric('Custom/ActorQuery/CacheHit', cached ? 1 : 0)
```

**Admin UI**:
```
Actor Query Performance (Last 24h)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Avg Duration: 12.3ms
P95 Duration: 45.2ms
P99 Duration: 89.1ms

Cache Hit Rate: 94.2%
Cache Miss Rate: 5.8%

OR Query Overhead: <0.5ms ✅
```

**Value**:
- Confirm <0.5ms OR overhead assumption
- Identify performance regressions
- Justify OR query approach

---

## 🛠️ Data Integrity Tools

### 8. Actor Appearance Schema Consistency Check

**Priority**: MEDIUM
**Effort**: HIGH (6-8 hours)
**Location**: New admin tool page

Audit `actor_movie_appearances` and `actor_show_appearances` tables:

**Current Issue**:
- Tables use `actor_tmdb_id` column
- Should use `actor_id` for consistency
- Foreign keys reference tmdb_id instead of id

**Admin Tool Features**:
```
Appearance Schema Audit
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status: ⚠️ Inconsistent

Issues Found:
1. actor_movie_appearances.actor_tmdb_id should be actor_id
   - 1,234,567 rows affected
   - Foreign key constraint missing

2. actor_show_appearances.actor_tmdb_id should be actor_id
   - 567,890 rows affected
   - Foreign key constraint missing

[Preview Migration] [Run Migration]
```

**Migration Plan**:
1. Add `actor_id` column to both tables
2. Populate from `actors.id` WHERE `actors.tmdb_id = actor_tmdb_id`
3. Add foreign key constraints
4. Update queries to use `actor_id`
5. Deprecate `actor_tmdb_id` columns (or remove in later release)

**Value**:
- Consistent data model
- Proper referential integrity
- Simpler queries (no JOIN to get actor.id)

---

### 9. Slug Canonicalization Script

**Priority**: LOW
**Effort**: MEDIUM (3-4 hours)
**Location**: One-time script

Audit and fix any hardcoded actor URLs in database:

**Check These Fields**:
```sql
-- Death circumstances
SELECT actor_id, official_circumstances
FROM actor_death_circumstances
WHERE official_circumstances LIKE '%deadonfilm.com/actor/%';

-- Death details
SELECT actor_id, cause_of_death_details
FROM actors
WHERE cause_of_death_details LIKE '%deadonfilm.com/actor/%';

-- Trivia
SELECT actor_id, trivia_text
FROM actor_trivia
WHERE trivia_text LIKE '%deadonfilm.com/actor/%';
```

**Fix Script**:
```typescript
// Replace old URLs with new ones
UPDATE actor_death_circumstances
SET official_circumstances = regexp_replace(
  official_circumstances,
  'deadonfilm\.com/actor/([a-z-]+)-(\d+)',
  'deadonfilm.com/actor/\1-' || actor_id::text,
  'g'
)
WHERE official_circumstances LIKE '%deadonfilm.com/actor/%';
```

**Admin UI**:
```
Hardcoded URL Audit
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Scanning for hardcoded actor URLs...

Found: 0 hardcoded URLs ✅
(No action needed)

[Scan Again]
```

**Value**:
- No broken internal links
- Consistent user experience
- Better analytics tracking

---

## 🎯 User Experience Improvements

### 10. Actor URL "Did You Mean?" Suggestions

**Priority**: LOW
**Effort**: MEDIUM (4-5 hours)
**Location**: 404 error page enhancement

When actor URL fails (slug mismatch or not found), suggest similar actors:

**Features**:
```
Actor Not Found

The URL "/actor/tom-hank-4165" didn't match any actor.

Did you mean?
→ Tom Hanks (/actor/tom-hanks-4165)
→ Tom Hardy (/actor/tom-hardy-2524)
→ Tom Cruise (/actor/tom-cruise-500)
```

**Implementation**:
```typescript
// When slug mismatch occurs
if (!actorLookup) {
  // Extract name portion from slug
  const namePortion = slug.substring(0, slug.lastIndexOf('-'))

  // Find similar names using trigram similarity
  const suggestions = await pool.query(`
    SELECT id, name, similarity(name, $1) as sim
    FROM actors
    WHERE similarity(name, $1) > 0.3
    ORDER BY sim DESC
    LIMIT 3
  `, [namePortion.replace(/-/g, ' ')])

  return { suggestions }
}
```

**Value**:
- Better user experience on typos
- Reduced bounce rate from 404s
- Helpful for users with stale bookmarks

---

### 11. Actor Profile Performance Badge

**Priority**: LOW
**Effort**: LOW (1-2 hours)
**Location**: Actor profile page

Show users when they're viewing a cached vs fresh response:

**UI** (only in dev mode):
```
┌─────────────────────────────────────┐
│ Tom Hanks                           │
│                                     │
│ [Photo]  Born: 1956                │
│          Died: N/A                  │
│                                     │
│ ⚡ Served from cache (12ms)        │
└─────────────────────────────────────┘
```

**Implementation**:
```typescript
// Backend response header
res.setHeader('X-Cache-Status', cached ? 'HIT' : 'MISS')
res.setHeader('X-Response-Time', `${duration}ms`)

// Frontend (dev mode only)
{process.env.NODE_ENV === 'development' && (
  <div className="text-xs text-gray-500">
    ⚡ {cacheStatus === 'HIT' ? 'Served from cache' : 'Fresh from database'}
    ({responseTime})
  </div>
)}
```

**Value**:
- Verify cache warming worked
- Debug performance issues
- Developer insight

---

## 📈 Advanced Analytics

### 12. Actor Popularity Trend After Migration

**Priority**: LOW
**Effort**: MEDIUM (3-4 hours)
**Location**: Add to Analytics page

Track if certain actors become more/less popular after migration:

**Features**:
- Before/after traffic comparison
- Identify actors with traffic drops (SEO issue?)
- Identify actors with traffic increases

**Query**:
```sql
-- Compare traffic 30 days before vs 30 days after migration
SELECT
  a.id,
  a.name,
  COUNT(CASE WHEN pv.visited_at < '2026-01-24' THEN 1 END) as visits_before,
  COUNT(CASE WHEN pv.visited_at >= '2026-01-24' THEN 1 END) as visits_after,
  (COUNT(CASE WHEN pv.visited_at >= '2026-01-24' THEN 1 END)::float /
   NULLIF(COUNT(CASE WHEN pv.visited_at < '2026-01-24' THEN 1 END), 0) - 1) * 100 as pct_change
FROM actors a
LEFT JOIN page_visits pv ON pv.visited_path LIKE '/actor/%' || a.id || '%'
  AND pv.visited_at >= '2025-12-25'  -- 30 days before migration
  AND pv.visited_at < '2026-02-23'   -- 30 days after migration
GROUP BY a.id, a.name
HAVING COUNT(CASE WHEN pv.visited_at < '2026-01-24' THEN 1 END) > 10  -- Min traffic threshold
ORDER BY pct_change DESC
LIMIT 20;
```

**Admin UI**:
```
Traffic Impact Analysis
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Period: 30 days before/after migration

Top Gainers:
Tom Hanks:     +45% (redirects from old Google results)
Brad Pitt:     +32%
Meryl Streep:  +28%

Top Losers:
Unknown Actor: -67% (broken backlink?)
John Doe:      -45%
```

**Value**:
- Identify SEO issues
- Measure migration success
- Catch broken external links

---

## Priority Summary

### Implement Now (High Value, Low-Medium Effort):
1. ✅ **Cache Warming Script** - Already done!
2. ✅ **Redirect Instrumentation** - Already done!
3. 🟢 **Migration Dashboard Widget** - Best ROI for monitoring

### Implement in 30-60 Days:
4. 🟡 **Actor Profile Diagnostic Tool** - Helpful for support
5. 🟡 **404 Monitor** - Catch issues early
6. 🟡 **Sitemap Change Detector** - SEO recovery

### Consider for Future:
7. ⚪ **Bulk Cache Management UI** - Nice to have
8. ⚪ **ID Overlap Report** - Documentation
9. ⚪ **Query Performance Monitor** - Optimization
10. ⚪ **Appearance Schema Fix** - Data consistency

### Low Priority / Nice to Have:
11. ⚪ **Slug Canonicalization** - Only if hardcoded URLs exist
12. ⚪ **"Did You Mean?"** - UX polish
13. ⚪ **Performance Badge** - Dev tool
14. ⚪ **Traffic Trend Analysis** - Long-term insight

---

## Recommended Next Steps

1. **Week 1**: Implement Migration Dashboard Widget (#1)
2. **Week 2-3**: Build Actor Diagnostic Tool (#2)
3. **Week 4**: Add 404 Monitor (#5)
4. **Month 2**: Sitemap automation (#4)
5. **Month 3+**: Consider lower priority items based on actual need

Total high-priority work: ~10-12 hours spread over 4 weeks
