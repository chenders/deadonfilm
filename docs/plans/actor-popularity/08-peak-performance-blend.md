# 08 — Peak-Performance Blend

**Priority**: P2 (Refinement)
**Impact**: 3 | **Difficulty**: 1 | **Feasibility**: 5 | **Confidence**: 4

---

## Problem

The current algorithm uses the top 10 contributions to measure an actor's career. This single number conflates two distinct qualities:

1. **Star power (peak)**: How big were their biggest roles? Tom Cruise in *Top Gun: Maverick* vs. a character actor's best role.
2. **Career breadth**: How many significant roles did they have? An actor with 10 good films vs. one with 3 great films and 7 minor ones.

Using only a top-10 average (or even the weighted positional average from Proposal 02) blends these into a single number. An actor with 3 exceptional roles and 7 mediocre ones gets a moderate score, while an actor with 10 good-but-not-exceptional roles gets a similar score. These are different kinds of fame that should be measured differently.

---

## Proposed Solution

Compute two sub-scores and blend them:

```typescript
const PEAK_WEIGHT = 0.40   // Top 3 average (star power)
const BREADTH_WEIGHT = 0.60 // Top 10 average (career breadth)

function calculateFilmographyScore(contributions: number[]): number {
  // Sort descending (already done before this point)
  const top3 = contributions.slice(0, 3)
  const top10 = contributions.slice(0, 10)

  const peakScore = top3.reduce((sum, c) => sum + c, 0) / Math.max(top3.length, 1)
  const breadthScore = top10.reduce((sum, c) => sum + c, 0) / Math.max(top10.length, 1)

  return peakScore * PEAK_WEIGHT + breadthScore * BREADTH_WEIGHT
}
```

### Why 40/60?

- **60% breadth**: A sustained career in notable films is the primary driver of an actor's overall recognition. People remember actors who appear in many things they've seen.
- **40% peak**: But the biggest roles create the most lasting impressions. "Tom Hanks in *Forrest Gump*" or "Heath Ledger as The Joker" define cultural memory.

### Interaction with Proposal 02 (Weighted Positional Scoring)

If both proposals are implemented, the weighted positional average (Proposal 02) replaces the simple average for the breadth component:

```typescript
const peakScore = simpleAverage(top3)  // Peak uses simple avg (only 3 items)
const breadthScore = weightedPositionalAverage(top10)  // Breadth uses weighted

return peakScore * PEAK_WEIGHT + breadthScore * BREADTH_WEIGHT
```

This creates a natural synergy: the breadth component rewards top-heavy careers via positional weighting, while the peak component ensures truly exceptional roles are fully valued.

---

## Expected Impact

### Example: Tom Cruise

- Top 3 contributions: ~95, ~90, ~88 → peak = 91
- Top 10 contributions: ~95, ~90, ~88, ~80, ~75, ~70, ~65, ~60, ~55, ~50 → breadth = 72.8
- Blended: 91 × 0.4 + 72.8 × 0.6 = **80.1**
- Current (simple top-10 avg): 72.8

Tom Cruise gains ~7 points from the peak component recognizing his exceptional top roles.

### Example: Prolific Character Actor

- Top 3: ~55, ~50, ~48 → peak = 51
- Top 10: ~55, ~50, ~48, ~45, ~42, ~40, ~38, ~35, ~32, ~30 → breadth = 41.5
- Blended: 51 × 0.4 + 41.5 × 0.6 = **45.3**
- Current: 41.5

Slight boost from peak, but the uniform distribution means peak and breadth are similar.

### Example: One-Hit Wonder

- Top 3: ~95, ~20, ~15 → peak = 43.3
- Top 10: ~95, ~20, ~15, ~10, ~8, ~5, ~5, ~3, ~2, ~1 → breadth = 16.4
- Blended: 43.3 × 0.4 + 16.4 × 0.6 = **27.2**
- Current: 16.4

The one-hit wonder gets a significant boost from peak but is still correctly ranked below sustained career actors.

---

## Files to Modify

| File | Change |
|------|--------|
| `server/src/lib/popularity-score.ts` | Add `PEAK_WEIGHT` and `BREADTH_WEIGHT` constants; restructure `calculateActorPopularity` to compute peak and breadth sub-scores |
| `server/src/lib/popularity-score.test.ts` | Add tests for peak/breadth blend; test peaked career vs uniform career vs one-hit wonder |

---

## Team Assessment

| Specialist | Assessment | Confidence |
|------------|-----------|------------|
| Researcher | "Peak-breadth blending is a standard technique in talent assessment. The 40/60 split is reasonable but should be validated against expected rankings." | 4/5 |
| Mathematician | "This addresses a real statistical problem: a single central tendency measure can't capture both the mode and the spread of a distribution. Two sub-scores provide more information." | 4/5 |
| Salary Specialist | "This is how the industry thinks about actors: 'What's their biggest role?' (peak) and 'How consistently do they work at a high level?' (breadth). Tom Cruise is Tom Cruise because of both *Mission: Impossible* AND the breadth of *Jerry Maguire*, *A Few Good Men*, *The Firm*, etc. The 40/60 blend captures this." | 5/5 |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Actors with <3 contributions get a noisy peak score | For actors with 1–2 contributions, fall back to simple average (peak = breadth = same number) |
| 40/60 split may not be optimal | Test against validation set; the split should be tuned so that Tom Cruise outranks character actors but doesn't outrank actors with genuinely broader careers |
| Complexity increase | The change is ~15 lines of code; the concept is simple to explain and audit |
