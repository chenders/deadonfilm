# 05 — Wikipedia Pageviews Signal

**Priority**: P1 (High Impact)
**Impact**: 5 | **Difficulty**: 3 | **Feasibility**: 4 | **Confidence**: 4

---

## Problem

The current actor scoring relies on two signals: filmography quality and TMDB trending. Neither directly measures **how famous an actor is to the general public**. TMDB is recency-biased. Filmography quality measures what movies they were in, not whether anyone remembers them.

Wikipedia pageviews are arguably the single best proxy for public recognition:
- High pageviews = people actively look up this person
- Works for both living and deceased actors (deceased actors often have steady pageview baselines)
- Available for free, no API key required
- The data already partially exists — `wikipedia_url` is stored on the actors table

---

## Proposed Solution

### Data Source: Wikimedia Pageviews API

```
GET https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/
    en.wikipedia/all-access/all-agents/{article_title}/monthly/{start}/{end}
```

**Rate limit**: 100 requests/second (generous)
**Auth**: None required (but should send `User-Agent` header per Wikimedia policy)
**Cost**: Free

### Metrics to Capture

1. **Trailing 12-month total pageviews**: Primary signal — how many people looked up this actor in the last year
2. **Trailing 12-month monthly average**: Smoothed version, less sensitive to death spikes
3. **All-time daily average** (optional): For actors who died long ago, the trailing-12 may be low; all-time average captures sustained interest

### Score Calculation

Use log-percentile scaling (same approach as other metrics):

```typescript
const WIKIPEDIA_PAGEVIEW_THRESHOLDS = {
  p25: 10_000,     // 10K annual views — minor actors
  p50: 50_000,     // 50K — moderately known
  p75: 200_000,    // 200K — well-known
  p90: 1_000_000,  // 1M — very famous
  p99: 10_000_000, // 10M — A-list / recently deceased
}

const wikiScore = logPercentile(annualPageviews, WIKIPEDIA_PAGEVIEW_THRESHOLDS)
```

### Death Spike Handling

When an actor dies, their Wikipedia pageviews spike 10–100×. This would artificially inflate their score for 1–2 months after death. Mitigation:

```typescript
// If actor died in the last 3 months, use the 3-month average
// BEFORE the death month instead of trailing-12
function getStablePageviews(monthlyData, deathDate): number {
  const deathMonth = deathDate ? getMonth(deathDate) : null
  if (deathMonth && monthsSince(deathMonth) < 3) {
    // Use 3 months before death
    return averageBeforeDeath(monthlyData, deathMonth) * 12
  }
  return sum(monthlyData) // Normal trailing-12
}
```

### Integration into Actor Score

```typescript
// New weight distribution
const ACTOR_WEIGHTS = {
  filmography: 0.55,
  tmdbRecency: 0.15,
  wikipediaPageviews: 0.15,
  // Remaining 0.15 for future signals (Proposals 06, 10, 11)
}
```

### Data Pipeline

1. **Initial backfill script**: Fetch pageviews for all actors with `wikipedia_url`. Estimated: ~50K actors × 1 API call each = ~8 minutes at 100 req/s.
2. **Scheduled update**: Weekly, fetch trailing-12 for all actors. Add to the existing scheduled popularity update.
3. **Store on actors table**: New columns `wikipedia_annual_pageviews` (int), `wikipedia_pageviews_updated_at` (timestamp).

---

## Expected Impact

- **Tom Cruise**: English Wikipedia gets ~1.5M annual pageviews for Tom Cruise. Log-percentile score: ~85. This is a strong, stable signal that correctly ranks him as one of the most famous actors.
- **Clark Gable**: ~500K annual pageviews (enduring fame). Score: ~72. Much better than his TMDB score (~5).
- **Character actors**: Wikipedia pageviews correlate strongly with public recognition. Character actors with 5K–20K annual views get appropriately modest scores.
- **Non-English actors**: May have low English Wikipedia views but high views on their native-language Wikipedia. Consider using sum of all-language pageviews (API supports this).

---

## Files to Modify

| File | Change |
|------|--------|
| `server/src/lib/popularity-score.ts` | Add Wikipedia pageviews to `ActorPopularityInput`, add thresholds, update `calculateActorPopularity` |
| `server/src/lib/popularity-score.test.ts` | Add tests for Wikipedia integration |
| `server/scripts/scheduled-popularity-update.ts` | Add Wikipedia pageview fetching to actor update pipeline |
| `server/src/lib/wikipedia-pageviews.ts` | **New file** — API client for Wikimedia Pageviews API |
| `server/src/lib/wikipedia-pageviews.test.ts` | **New file** — Tests with mocked API responses |
| **Migration** | Add `wikipedia_annual_pageviews` and `wikipedia_pageviews_updated_at` columns to `actors` table |
| `server/scripts/backfill-wikipedia-pageviews.ts` | **New file** — One-time backfill script |

---

## Team Assessment

| Specialist | Assessment | Confidence |
|------------|-----------|------------|
| Researcher | "Wikipedia pageviews are the gold standard for measuring public recognition. The API is free, fast, and well-documented. The `wikipedia_url` field already exists on actors — we just need to extract the article title. This is the single highest-impact new signal we can add." | 5/5 |
| Mathematician | "Log-percentile scaling is appropriate here since pageviews follow a power-law distribution. The death spike handling is important — without it, recently deceased actors would be artificially inflated for months." | 4/5 |
| Salary Specialist | "Wikipedia pageviews correlate strongly with actor Q-rating (industry recognition metric). An actor that people actively search for is, by definition, someone the public recognizes. This would fix the Clark Gable problem — he has enduring public interest that TMDB completely misses." | 4/5 |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Wikimedia API rate limits or downtime | Cache aggressively (weekly updates); implement retry logic with exponential backoff |
| Not all actors have `wikipedia_url` | Use as optional signal; actors without it fall back to filmography + TMDB only. Run coverage analysis to determine how many actors have URLs. |
| Death spike inflates recently-deceased actors | Use pre-death baseline for 3 months after death (see Death Spike Handling) |
| Non-English actors disadvantaged by English-only pageviews | Consider all-language pageviews sum via `all-projects` endpoint |
| Wikipedia article titles may not match stored URLs | Parse article title from `wikipedia_url` using URL parsing (the URL path is the article title) |
| API may return 404 for redirected/renamed articles | Handle 404 gracefully; attempt redirect resolution |
