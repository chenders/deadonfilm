# 03 — Reduce TMDB Recency Weight

**Priority**: P1 (High Impact)
**Impact**: 4 | **Difficulty**: 1 | **Feasibility**: 5 | **Confidence**: 5

---

## Problem

TMDB actor "popularity" is a recency/trending metric based on recent searches, page views, and social media activity. It is **not** a measure of career significance or long-term fame. Currently, it receives 30% of the actor's final score:

```typescript
// popularity-score.ts:174-175
const ACTOR_FILMOGRAPHY_WEIGHT = 0.7
const ACTOR_TMDB_RECENCY_WEIGHT = 0.3
```

### Issues with 30% TMDB Weight

1. **Deceased actors score ~0 on TMDB**: A dead actor's TMDB popularity quickly decays to near-zero (no new searches). This means 30% of their score is effectively zeroed out, creating a structural disadvantage for deceased actors on a site called "Dead on Film."

2. **Living actors' scores are volatile**: TMDB popularity spikes when an actor is in the news (new movie release, scandal, death of a co-star). Tom Cruise's TMDB popularity might be 80 during a Mission: Impossible release and 15 six months later. This creates score instability.

3. **Recency ≠ fame**: An actor trending on social media today (high TMDB) is not necessarily more famous than a consistently recognized actor (lower TMDB). The signal is useful as a tiebreaker but should not swing rankings by 30%.

---

## Proposed Solution

### Option A (Recommended): Reduce to 15% and Bound

```typescript
const ACTOR_FILMOGRAPHY_WEIGHT = 0.85  // Increased from 0.7
const ACTOR_TMDB_RECENCY_WEIGHT = 0.15  // Reduced from 0.3
```

This frees up 15% for new signals (Wikipedia pageviews, Wikidata sitelinks, awards — see proposals 05, 06, 10).

### Option B: Bounded Bonus (Max +10 Points)

Instead of a weighted percentage, cap TMDB's contribution:

```typescript
const TMDB_MAX_BONUS = 10  // Maximum points TMDB can add

const tmdbScore = logPercentile(tmdbPopularity, PERCENTILE_THRESHOLDS.tmdbPopularity) ?? 0
const tmdbBonus = Math.min(TMDB_MAX_BONUS, tmdbScore * 0.1)  // Max +10 pts

finalScore = filmographyScore + tmdbBonus
```

This ensures TMDB can differentiate between actively-discussed actors (slight boost) without dominating rankings.

### Option C: Different Weights for Living vs Deceased

```typescript
// Living actors: TMDB is a useful recency signal
const LIVING_TMDB_WEIGHT = 0.15

// Deceased actors: TMDB is nearly useless (always ~0)
const DECEASED_TMDB_WEIGHT = 0.05
```

This acknowledges the structural bias against deceased actors. However, it requires knowing alive/dead status during scoring, which may complicate the calculation.

### Recommendation

**Option A** is simplest and most impactful. The freed weight goes to new signals (Wikipedia, Wikidata) that measure fame more accurately for both living and deceased actors. If Option A is combined with Wikipedia pageviews (Proposal 05), the new distribution becomes:

```
55% filmography + 15% TMDB + 15% Wikipedia + 15% other signals
```

---

## Expected Impact

- **Deceased actors (Clark Gable, Humphrey Bogart)**: Score increase of ~5–15 points, since 30% of their score was previously near-zero; now only 15% is near-zero
- **Tom Cruise**: Score decrease of ~3–5 points from reduced TMDB weight, but this is offset by the Wikipedia pageviews signal (Proposal 05) which will be very high for him
- **Volatile trending actors**: Scores become more stable over time — a TMDB spike changes the score by ±7 instead of ±15

---

## Files to Modify

| File | Change |
|------|--------|
| `server/src/lib/popularity-score.ts` | Change `ACTOR_FILMOGRAPHY_WEIGHT` and `ACTOR_TMDB_RECENCY_WEIGHT` constants (lines 174–175); update `calculateActorPopularity` to accommodate new signal weights |
| `server/src/lib/popularity-score.test.ts` | Update tests that assert on weight distribution |

---

## Team Assessment

| Specialist | Assessment | Confidence |
|------------|-----------|------------|
| Researcher | "TMDB popularity is explicitly documented as a 'trending' metric, not a fame metric. 30% is far too much weight for a signal this volatile. 15% is generous — 10% would also be defensible." | 5/5 |
| Mathematician | "Reducing from 30% to 15% halves the volatility introduced by TMDB fluctuations while still preserving its useful recency signal. The freed weight should go to signals with higher signal-to-noise ratio." | 5/5 |
| Salary Specialist | "For deceased actors, TMDB recency is meaningless. Even 15% of the score being near-zero for dead actors is a problem, but it's much better than 30%. The bounded bonus (Option B) is worth considering for deceased actors specifically." | 4/5 |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Currently-trending actors lose rank | This is intentional — trending should not equal famous. Monitor top-100 changes. |
| 15% may still be too high for deceased actors | If Wikipedia pageviews (Proposal 05) is implemented, it partially compensates; Option C can be revisited later |
| Weight redistribution depends on new signals | If Proposals 05/06/10 are delayed, temporarily increase filmography weight to 85% |
