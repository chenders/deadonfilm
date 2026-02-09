# 09 — Confidence via Bayesian Regression

**Priority**: P3 (Advanced)
**Impact**: 2 | **Difficulty**: 3 | **Feasibility**: 3 | **Confidence**: 3

---

## Problem

The current actor confidence score is based solely on appearance count:

```typescript
// popularity-score.ts:643
const confidence = Math.min(1.0, contributions.length / MIN_APPEARANCES_FULL_CONFIDENCE)
```

Where `MIN_APPEARANCES_FULL_CONFIDENCE = 10`. This means:
- An actor with 10 appearances in obscure, poorly-scored films gets confidence = 1.0
- An actor with 5 appearances in *Star Wars*, *The Godfather*, and other well-documented films gets confidence = 0.5

This is a metadata-only confidence measure (counts inputs, not quality). It doesn't answer the real question: **how confident are we that this score accurately reflects the actor's fame?**

---

## Proposed Solution

### Replace with Bayesian Regression

Instead of using confidence as a binary "do we have enough data?" metric, use it as a Bayesian prior strength parameter:

```typescript
interface ActorConfidenceFactors {
  appearanceCount: number        // Number of scoreable appearances
  signalCoverage: number         // How many signal types are available (0-1)
  scoreVariance: number          // Variance of contribution scores
  topContributionStrength: number // How strong the top contributions are
}

function calculateActorConfidence(factors: ActorConfidenceFactors): number {
  // Appearance count (current approach, but sub-component)
  const countFactor = Math.min(1.0, factors.appearanceCount / 10) // 0-1

  // Signal coverage: how many of the actor's input signals are available
  // (filmography, TMDB, Wikipedia, Wikidata, awards)
  const coverageFactor = factors.signalCoverage // 0-1

  // Score variance: high variance = less confident
  // (actor has mix of huge and tiny roles — score is sensitive to which we pick)
  const variancePenalty = Math.max(0, 1 - factors.scoreVariance / 50)

  // Top contribution strength: if top contributions are high-quality, we trust the score more
  const strengthFactor = Math.min(1.0, factors.topContributionStrength / 70)

  // Weighted combination
  return (
    countFactor * 0.3 +
    coverageFactor * 0.3 +
    variancePenalty * 0.2 +
    strengthFactor * 0.2
  )
}
```

### Apply Bayesian Adjustment to Final Score

The confidence score is then used to regress the actor's score toward a prior mean (similar to how `aggregate-score.ts` uses `applyBayesianAdjustment`):

```typescript
const ACTOR_PRIOR_MEAN = 30  // Average actor score

function adjustedActorScore(rawScore: number, confidence: number): number {
  // High confidence: score stays near raw
  // Low confidence: score regresses toward prior mean
  return (confidence / (confidence + 0.4)) * rawScore +
         (0.4 / (confidence + 0.4)) * ACTOR_PRIOR_MEAN
}
```

This means:
- An actor with confidence 1.0 and raw score 80 gets: `(1/1.4) × 80 + (0.4/1.4) × 30 = 65.7`
- An actor with confidence 0.3 and raw score 80 gets: `(0.3/0.7) × 80 + (0.4/0.7) × 30 = 51.4`

The low-confidence actor's score is pulled significantly toward the mean, reflecting our uncertainty.

---

## Expected Impact

- **Well-documented actors (Tom Cruise)**: High confidence (many appearances, all signal types available, low variance). Score stays close to raw. Minimal change.
- **Actors with few but famous roles (James Dean — 3 films)**: Lower confidence due to few appearances, but high top-contribution strength. Score gets moderate regression — still high, but less extreme than raw.
- **Poorly-documented actors**: Low confidence across all factors. Score regresses significantly toward the mean, preventing obscure actors from accidentally scoring too high due to sparse data.

---

## Files to Modify

| File | Change |
|------|--------|
| `server/src/lib/popularity-score.ts` | Replace simple confidence calculation with multi-factor Bayesian confidence; add `adjustedActorScore` |
| `server/src/lib/popularity-score.test.ts` | Add tests for new confidence factors; test Bayesian adjustment with various confidence levels |

---

## Team Assessment

| Specialist | Assessment | Confidence |
|------------|-----------|------------|
| Researcher | "Bayesian regression is the right tool for handling sparse data. The `aggregate-score.ts` module already implements this pattern — we'd be applying the same principle to actor scores." | 3/5 |
| Mathematician | "The multi-factor confidence is more informative than appearance count alone. However, choosing the right prior mean and regression strength requires careful tuning. Start with conservative parameters and adjust based on score distribution analysis." | 3/5 |
| Salary Specialist | "The James Dean problem is real — 3 films shouldn't give you the same score as 30 films even if those 3 films are iconic. But the regression shouldn't be so strong that it makes James Dean look like a nobody. The prior mean of 30 seems about right." | 3/5 |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Prior mean and regression strength are hard to calibrate | Start with `ACTOR_PRIOR_MEAN = 30` and regression strength `0.4` (same as aggregate-score). Analyze score distribution after applying and tune. |
| Multi-factor confidence adds complexity | Each factor is independently meaningful and testable. The combined confidence is just a weighted average. |
| Bayesian adjustment compresses the score range | This is intentional for low-confidence actors. High-confidence actors are minimally affected. Monitor the score distribution's range and variance. |
| Interaction with other proposals | Bayesian confidence should be implemented after the core formula changes (P0–P2) are stable. The confidence factors should be calibrated against the new score distribution. |
