# Backlog

Ideas and future improvements for consideration.

## Features

| Idea | Effort | Benefit | Notes |
|------|--------|---------|-------|
| **Obscure movies filter/page** | Low | Medium | Leverages existing `is_obscure` column. Add checkbox to Cursed Movies or create dedicated page. Query is trivial: `WHERE is_obscure = true` |

## Performance

| Idea | Effort | Benefit | When to Consider |
|------|--------|---------|------------------|
| **ETag headers** | Medium | Low | When adding a CDN (Cloudflare, CloudFront) for edge cache validation. Current in-memory cache provides most benefit already. |
| **Redis caching** | Medium | Medium | When scaling to 3+ replicas or needing shared session state. Adds ~$10-20/mo operational cost. |
| **Table partitioning for TV shows** | High | High | When `show_actor_appearances` reaches 20M+ rows. Partition by show_tmdb_id ranges. Do before bulk TV data import. |
| **Materialized views** | Medium | High | Pre-compute actor stats (total movies, co-star deaths). Refresh nightly via cron. Useful when actor queries become slow. |

## Technical Debt

| Idea | Effort | Benefit | Notes |
|------|--------|---------|-------|
| **Fix mortality-stats tests** | Low | Low | 13 integration tests failing due to missing `cohort_life_expectancy` data in test environment. Need to seed test data or mock the queries. |
