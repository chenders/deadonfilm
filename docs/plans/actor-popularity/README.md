# Actor Popularity Scoring Improvement Plan

## Executive Summary

The `dof_popularity` scoring algorithm for actors produces inaccurate rankings. Tom Cruise — one of the most recognizable actors alive for any US audience member aged 15–60 — does not rank in the top 10. "Timeless" actors like Clark Gable score poorly due to TMDB recency bias. A critical bug in the scheduled update script produces wildly incorrect scores. This plan documents findings from three specialist analysts and proposes 11 prioritized improvements.

---

## Current Algorithm Overview

### Content Scoring (Movies/Shows → `dof_popularity` + `dof_weight`)

Content gets two scores on a 0–100 scale:

| Signal | Weight (Movies) | Weight (Shows) |
|--------|-----------------|----------------|
| Box Office (era-adjusted) | 25% | N/A |
| Trakt Watchers (log-percentile) | 20% | 30% |
| Trakt Plays | 10% | 15% |
| IMDb Votes (log-percentile) | 20% | 25% |
| TMDB Popularity (trending) | 15% | 20% |
| US/UK Production bonus | 5% | 5% |
| Awards | 5% | 5% |

Non-English content receives a **0.4× penalty** (`NON_ENGLISH_PENALTY_MULTIPLIER`).

A separate `dof_weight` score measures "cultural staying power" via longevity, repeat viewership, vote growth rate, aggregate score, and awards.

### Actor Scoring (`dof_popularity`)

**Library implementation** (`popularity-score.ts:calculateActorPopularity`):
1. For each appearance: `contentScore = popularity × 0.6 + weight × 0.4`
2. Apply billing weight: **1.0** (billing 1–3), **0.7** (billing 4–10), **0.4** (billing 11+)
3. Apply episode weight for TV: `min(1.0, episodeCount / 20)`
4. Sort contributions descending, take **top 10**
5. **Simple average** the top 10
6. Blend: `filmographyScore × 0.7 + tmdbPercentile × 0.3`

**Scheduled script** (`scheduled-popularity-update.ts:updateActorPopularity`) — **diverges from the library**:
1. SQL sums ALL contributions (no top-10 filtering)
2. Normalizes by dividing sum by 10 and capping at 100
3. Multiplies TMDB percentile by 100 (bug — see P0)
4. Same 70/30 blend

### Data Sources

| Source | Purpose | Cost |
|--------|---------|------|
| TMDB API | Actor popularity, content metadata | Free |
| Trakt API | Watchers, plays, ratings | Free |
| OMDb API | IMDb votes, RT/Metacritic scores, awards | Paid |
| Era Reference Stats | Inflation-adjusted box office | Precomputed |
| Wikidata SPARQL | Death details (existing infrastructure) | Free |
| Wikipedia | Death details (existing infrastructure) | Free |

---

## The "Tom Cruise Problem" — A Walkthrough

Tom Cruise should easily rank top-10 for any US audience. Here's why the current algorithm fails him:

### Problem 1: Simple Averaging Dilutes Peak Career

Tom Cruise has 40+ films. Many early/minor roles (e.g., *Taps*, *The Outsiders*) have moderate `dof_popularity` scores. The algorithm takes his top 10 and **averages** them equally. A simple average of his top 10 might yield ~65, while someone with fewer but more concentrated hits (e.g., an actor with 5 massive franchise films) scores higher despite being less famous overall.

### Problem 2: Billing Step Function

Cruise is billed #1 in almost every film — weight 1.0. But actors billed #4 suddenly drop to 0.7 (a 30% cliff), and #11 drops to 0.4 (another 43% cliff). This creates artificial ranking discontinuities rather than smooth career measurement.

### Problem 3: TMDB Recency at 30%

TMDB "popularity" is essentially a trending score based on recent searches and page views. Deceased actors score near-zero, meaning 30% of their final score is effectively zeroed out. For living actors like Cruise, TMDB fluctuates based on recent press coverage rather than career stature.

### Problem 4: The *×100 Bug* (P0)

The scheduled script multiplies the already-0–100 TMDB percentile by 100 again, producing values 0–10,000. After weighting (×0.3) and clamping, any actor with even minimal TMDB presence gets their score dominated by this component.

---

## Priority Matrix

| # | Proposal | Impact | Difficulty | Feasibility | Confidence | Priority |
|---|----------|--------|------------|-------------|------------|----------|
| 00 | [History tracking & periodic updates](./00-popularity-score-history.md) | 3 | 2 | 5 | 5 | **P0** |
| 01 | [Fix scheduled job bugs](./01-fix-scheduled-job-bugs.md) | 5 | 1 | 5 | 5 | **P0** |
| 02 | [Weighted positional scoring](./02-weighted-positional-scoring.md) | 4 | 2 | 5 | 4 | **P1** |
| 03 | [Reduce TMDB recency weight](./03-reduce-tmdb-recency-weight.md) | 4 | 1 | 5 | 5 | **P1** |
| 05 | [Wikipedia pageviews signal](./05-wikipedia-pageviews.md) | 5 | 3 | 4 | 4 | **P1** |
| 04 | [Smooth billing weights](./04-smooth-billing-weights.md) | 3 | 1 | 5 | 4 | **P2** |
| 06 | [Wikidata sitelinks signal](./06-wikidata-sitelinks.md) | 3 | 2 | 5 | 4 | **P2** |
| 07 | [Graduated language penalty](./07-graduated-language-penalty.md) | 3 | 2 | 4 | 3 | **P2** |
| 08 | [Peak-performance blend](./08-peak-performance-blend.md) | 3 | 1 | 5 | 4 | **P2** |
| 09 | [Bayesian confidence regression](./09-confidence-bayesian-regression.md) | 2 | 3 | 3 | 3 | **P3** |
| 10 | [Enhanced awards bonus](./10-enhanced-awards.md) | 2 | 2 | 4 | 3 | **P3** |
| 11 | [Star power indicators](./11-star-power-indicators.md) | 2 | 3 | 3 | 3 | **P3** |

**Scoring**: 1 (low) → 5 (high). Impact = effect on ranking accuracy. Difficulty = implementation effort. Feasibility = data availability + infrastructure readiness. Confidence = team agreement on approach.

---

## Recommended Implementation Phases

### Phase 0 — Critical Bug Fix & Infrastructure (Days)
- **00**: History tracking tables + algorithm versioning (MUST be deployed BEFORE any score changes)
- **01**: Fix the `×100` bug, align scheduled script with library, fix sum-all-contributions issue

> **Important**: Proposal 00 must be implemented and the first baseline snapshot captured
> BEFORE Proposal 01 is deployed. This ensures pre-fix scores are recorded for comparison.

### Phase 1 — High-Impact Formula Changes (1–2 Weeks)
- **02**: Exponentially-weighted positional scoring
- **03**: Reduce TMDB recency from 30% → 15%
- **05**: Add Wikipedia pageviews as new signal

### Phase 2 — Refinements (2–4 Weeks)
- **04**: Smooth billing weights (continuous decay)
- **06**: Wikidata sitelinks for "timeless fame" floor
- **07**: Fix double non-English penalty, graduate by language
- **08**: Peak-performance blend (top-3 + top-10)

### Phase 3 — Advanced Enhancements (Future)
- **09**: Bayesian regression for confidence scoring
- **10**: Major awards bonus via Wikidata
- **11**: Star power indicators (sole-lead, franchise, consistency)

---

## Proposed New Weight Distribution

### Current
```
Actor dof_popularity = filmography × 70% + TMDB recency × 30%
```

### Proposed (after all phases)
```
Actor dof_popularity =
    filmography (weighted positional)  × 55%
  + TMDB recency (bounded)             × 15%
  + Wikipedia pageviews                 × 15%
  + Wikidata sitelinks                  ×  5%
  + Awards bonus                        ×  5%
  + Star power indicators               ×  5%
```

---

## Specialist Team Assessments

### Researcher (Data Sources & Infrastructure)
**Focus**: What new signals are available, what infrastructure already exists.

**Key findings**:
- `wikipedia_url` already stored on actors table — Wikipedia pageviews API is free, rate-limited at 100 req/s, no auth needed
- Wikidata SPARQL infrastructure already exists (`server/src/lib/wikidata.ts`) — sitelinks and awards queries are trivial to add
- TMDB actor popularity is fundamentally a recency/trending metric, not a fame metric — it should be bounded, not weighted linearly
- The scheduled script diverges from the library function in critical ways

**Top recommendations**: Wikipedia pageviews (P1), Wikidata sitelinks (P2), Enhanced awards (P3)

### Mathematician (Formula & Statistics)
**Focus**: Mathematical correctness, statistical properties, score distributions.

**Key findings**:
- Simple averaging of top-10 contributions is dominated by the weakest of the 10, punishing actors with peaked but not broad careers
- Billing order step function (1.0/0.7/0.4) creates artificial cliffs — a continuous decay function would be more accurate
- The `×100` bug in the scheduled script is catastrophic — it makes TMDB the only meaningful signal
- Non-English penalty is applied at content level (0.4×) and there's no double-application at actor level currently (initially suspected but confirmed not present in `server/src/lib/popularity-score.ts` or `server/scripts/scheduled-popularity-update.ts`)
- The content-level language penalty is still harsh — a single 0.4× multiplier treats Japanese blockbusters the same as obscure regional films

**Top recommendations**: Exponentially-weighted positional scoring (P1), Reduce TMDB recency (P1), Smooth billing weights (P2)

### Salary/Industry Specialist (Career Patterns & Star Power)
**Focus**: How Hollywood career patterns should map to scoring, what "star power" means.

**Key findings**:
- Billing order in Hollywood follows a very specific gradient: #1 is the marquee star, #2 is the co-lead, #3–5 are major supporting, #6–10 are supporting ensemble, 11+ are minor
- The jump from 1.0 to 0.7 at position 4 is too aggressive — loses nuance between #4 (major supporting) and #10 (ensemble)
- "Peak career" measurement should blend top-3 average (star power) with top-10 average (career breadth)
- Franchise participation (appearing in 3+ films of a franchise) is a strong signal of bankability
- Sole-lead (billing #1 with no close #2) in a hit film is a premium signal

**Top recommendations**: Billing gradient (P2), Peak-performance blend (P2), Star power indicators (P3), Reduce TMDB recency for deceased actors specifically (P1)

---

## Files in This Plan

| File | Description |
|------|-------------|
| [00-popularity-score-history.md](./00-popularity-score-history.md) | P0: History tracking infrastructure, algorithm versioning, periodic update formalization |
| [01-fix-scheduled-job-bugs.md](./01-fix-scheduled-job-bugs.md) | P0: Fix divergent implementations and TMDB ×100 bug |
| [02-weighted-positional-scoring.md](./02-weighted-positional-scoring.md) | P1: Replace simple average with exponentially-weighted top-N |
| [03-reduce-tmdb-recency-weight.md](./03-reduce-tmdb-recency-weight.md) | P1: Reduce TMDB from 30% to 15% or bounded bonus |
| [04-smooth-billing-weights.md](./04-smooth-billing-weights.md) | P2: Replace step function with continuous decay |
| [05-wikipedia-pageviews.md](./05-wikipedia-pageviews.md) | P1: Add Wikipedia pageviews as new signal |
| [06-wikidata-sitelinks.md](./06-wikidata-sitelinks.md) | P2: Add Wikidata sitelinks for "timeless fame" floor |
| [07-graduated-language-penalty.md](./07-graduated-language-penalty.md) | P2: Graduate penalty by actual US penetration |
| [08-peak-performance-blend.md](./08-peak-performance-blend.md) | P2: Blend peak (top-3) with breadth (top-10) |
| [09-confidence-bayesian-regression.md](./09-confidence-bayesian-regression.md) | P3: Bayesian regression for actor confidence scoring |
| [10-enhanced-awards.md](./10-enhanced-awards.md) | P3: Major awards bonus via Wikidata |
| [11-star-power-indicators.md](./11-star-power-indicators.md) | P3: Sole-lead bonus, franchise, consistent-star multiplier |
