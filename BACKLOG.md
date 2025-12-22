# Backlog

Ideas and future improvements for consideration.

## Features

| Idea | Effort | Benefit | Notes |
|------|--------|---------|-------|
| **Obscure movies filter/page** | Low | Medium | Leverages existing `is_obscure` column. Add checkbox to Cursed Movies or create dedicated page. Query is trivial: `WHERE is_obscure = true` |

## Performance

| Idea | Effort | Benefit | When to Consider |
|------|--------|---------|------------------|
| ~~**ETag headers**~~ | ~~Medium~~ | ~~Low~~ | Done. Added to Tier 1 (static data, 1hr cache) and Tier 2 (paginated, 5min cache) endpoints. |
| **Redis caching** | Medium | Medium | When scaling to 3+ replicas or needing shared session state. Adds ~$10-20/mo operational cost. |
| **Table partitioning for TV shows** | High | High | When `show_actor_appearances` reaches 20M+ rows. Partition by show_tmdb_id ranges. Do before bulk TV data import. |
| **Materialized views** | Medium | High | Pre-compute actor stats (total movies, co-star deaths). Refresh nightly via cron. Useful when actor queries become slow. |

## Operations

| Idea | Effort | Benefit | Notes |
|------|--------|---------|-------|
| **Increase TMDB sync frequency to every 2 hours** | Low | Medium | Change cron schedule from `0 0,6,12,18 * * *` to `0 */2 * * *` in `k8s/cronjob-sync.yaml`. Provides fresher death data. Current runs take 7-17 min, well within 2-hour window. |

## Technical Debt

_No items currently._
