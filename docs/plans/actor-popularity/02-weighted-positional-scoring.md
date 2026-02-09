# 02 — Weighted Positional Scoring

**Priority**: P1 (High Impact)
**Impact**: 4 | **Difficulty**: 2 | **Feasibility**: 5 | **Confidence**: 4

---

## Problem

The current algorithm takes an actor's top 10 filmography contributions and computes a **simple average**:

```typescript
// popularity-score.ts:630-631
const filmographySum = topContributions.reduce((sum, c) => sum + c, 0)
const filmographyScore = filmographySum / topContributions.length
```

A simple average treats the #1 contribution identically to the #10 contribution. This punishes actors with "peaked" careers — massive hits alongside merely good films — while rewarding actors with uniformly high-but-not-exceptional work.

**Example**: Actor A has contributions `[95, 90, 85, 40, 35, 30, 25, 20, 15, 10]` (peaked career — 3 massive hits). Actor B has contributions `[55, 55, 50, 50, 50, 45, 45, 45, 40, 40]` (consistent supporting roles). Simple average: A = 44.5, B = 47.5. Actor B outranks Actor A despite Actor A being far more famous for their top work.

---

## Proposed Solution

Replace simple averaging with **exponentially-decaying positional weights**:

```typescript
const POSITIONAL_DECAY = 0.85  // alpha

function weightedPositionalAverage(contributions: number[]): number {
  let weightedSum = 0
  let totalWeight = 0

  for (let i = 0; i < contributions.length; i++) {
    const weight = Math.pow(POSITIONAL_DECAY, i)  // 1.0, 0.85, 0.72, 0.61, ...
    weightedSum += contributions[i] * weight
    totalWeight += weight
  }

  return weightedSum / totalWeight
}
```

With `alpha = 0.85`, the positional weights for top 10 are:

| Position | Weight | Cumulative % |
|----------|--------|-------------|
| 1 | 1.000 | 16.7% |
| 2 | 0.850 | 30.9% |
| 3 | 0.723 | 42.9% |
| 4 | 0.614 | 53.2% |
| 5 | 0.522 | 61.9% |
| 6 | 0.444 | 69.3% |
| 7 | 0.377 | 75.6% |
| 8 | 0.321 | 81.0% |
| 9 | 0.273 | 85.5% |
| 10 | 0.232 | 89.4% |

The top 3 contributions account for ~43% of the score (vs 30% with simple average). This appropriately rewards actors known for a few iconic roles.

### Revisiting the Example

Actor A: weighted = `(95×1.0 + 90×0.85 + 85×0.72 + 40×0.61 + ...)` / total = **57.8**
Actor B: weighted = `(55×1.0 + 55×0.85 + 50×0.72 + ...)` / total = **49.2**

Actor A now correctly outranks Actor B.

### Why alpha = 0.85?

- **0.90**: Too flat — nearly identical to simple average
- **0.85**: Top contribution is ~4.3× the weight of #10 — models "what are you known for?" well
- **0.80**: Top contribution is ~7.5× the weight of #10 — overly top-heavy, penalizes breadth
- **0.75**: Essentially only the top 3 matter — too aggressive

Alpha 0.85 was chosen because it matches the intuition that an actor's fame is primarily driven by their top 3–5 roles but sustained by a broader body of work.

---

## Expected Impact

- **Tom Cruise**: His top 3 films (*Top Gun: Maverick*, *Mission: Impossible* franchise, *Jerry Maguire*) will dominate his score instead of being diluted by his #7–10 films. Expected score increase: +5–10 points.
- **Clark Gable**: Similar effect — *Gone with the Wind* and *It Happened One Night* will carry more weight relative to his lesser-known 1930s films.
- **Character actors**: Minimal change if their top 10 are uniformly scored. Slight decrease if their contributions are flat (the weighting has minimal effect on uniform inputs).

---

## Files to Modify

| File | Change |
|------|--------|
| `server/src/lib/popularity-score.ts` | Replace simple average (lines 629–631) with `weightedPositionalAverage`; add `POSITIONAL_DECAY` constant |
| `server/src/lib/popularity-score.test.ts` | Add tests for weighted positional scoring; test edge cases (1 contribution, uniform contributions, peaked vs flat) |
| `server/scripts/scheduled-popularity-update.ts` | After P0 fix, this will use the library — no separate changes needed |

---

## Team Assessment

| Specialist | Assessment | Confidence |
|------------|-----------|------------|
| Researcher | "Standard technique in information retrieval (DCG/NDCG). Well-understood behavior." | 4/5 |
| Mathematician | "Exponential decay is the right family of functions here. Alpha 0.85 is a reasonable starting point; we should validate against a sample of 50 known-famous actors and tune if needed." | 4/5 |
| Salary Specialist | "Matches how Hollywood careers work — you're known for your best roles, not your average role. A-listers have 3–5 defining films plus a supporting body of work." | 5/5 |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Alpha value may need tuning | Run scoring against a validation set of 50 actors with known expected rankings; tune alpha to minimize ranking inversions |
| Actors with exactly 1 massive hit get inflated scores | The confidence system already penalizes actors with few appearances (`confidence = min(1.0, count/10)`); consider also requiring minimum 3 contributions for full score |
| Changes rankings for all actors | Run `--dry-run` comparison before and after; publish top-100 diff for review |
