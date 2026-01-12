---
globs: ["**/mortality*", "**/curse*", "server/src/lib/mortality-stats.ts"]
---
# Mortality Statistics

The app calculates expected mortality using US Social Security Administration actuarial life tables.

## Key Formulas

```
Expected Death Probability
  For each actor: P(death) = cumulative probability of dying between age at filming and current age
  Expected Deaths = sum of all actor death probabilities

Mortality Surprise Score (Curse Score)
  Formula: (Actual Deaths - Expected Deaths) / Expected Deaths
  Positive score = more deaths than expected ("cursed")
  Negative score = fewer deaths than expected ("blessed")

Years Lost
  Formula: Expected Lifespan - Actual Lifespan
  Data source: Birth-year-specific cohort life expectancy from US SSA
  Positive = died early | Negative = lived longer than expected
```

## Calculation Rules

| Rule | Description |
|------|-------------|
| Archived Footage | Exclude actors who died >3 years before release |
| Same-Year Death | Count with minimum 1 year of death probability |
| Cursed Actors | Sum expected/actual co-star deaths across filmography, then compute curse score |

---

## Obscure Content Filtering

### Obscure Movies

A movie is marked `is_obscure = true` if ANY of:
- `poster_path IS NULL`
- English movie: `popularity < 5.0 AND cast_count < 5`
- Non-English movie: `popularity < 20.0`

Implemented as computed column in `movies` table.

### Non-Obscure Actors

An actor is NOT obscure if ANY of:
- Appeared in movie/show with `popularity >= 20`
- Has 3+ English movies/shows with `popularity >= 5`
- Has 10+ movies total OR 50+ TV episodes total

Backfill script: `npm run backfill:actor-obscure`

---

## Implementation

Core library: `server/src/lib/mortality-stats.ts`