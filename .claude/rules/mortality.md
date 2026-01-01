---
globs: ["**/mortality*", "**/curse*", "server/src/lib/mortality-stats.ts"]
---
# Mortality Statistics

The app calculates expected mortality using US Social Security Administration actuarial life tables.

## Key Formulas

```
Expected Death Probability:
  For each actor: P(death) = cumulative probability of dying between age at filming and current age
  Expected Deaths = sum of all actor death probabilities

Mortality Surprise Score (Curse Score):
  (Actual Deaths - Expected Deaths) / Expected Deaths
  Positive = more deaths than expected ("cursed" movie)
  Negative = fewer deaths than expected ("blessed" movie)

Years Lost:
  Expected Lifespan - Actual Lifespan
  Uses birth-year-specific cohort life expectancy from US SSA data
  Positive = died early, Negative = lived longer than expected
```

## Calculation Rules

1. **Archived Footage Exclusion**: Actors who died more than 3 years before a movie/show's release are excluded. They appeared via archived footage.

2. **Same-Year Death Handling**: Actors who died the same year as release are counted with at least 1 year of death probability.

3. **Cursed Actors**: Sum expected and actual co-star deaths across all filmography, then compute curse score.

## Obscure Movie Filtering

A movie is "obscure" if:
- No poster image: `poster_path IS NULL`
- English movies: `popularity < 5.0 AND cast_count < 5`
- Non-English movies: `popularity < 20.0`

Implemented as computed column `is_obscure` in movies table.

## Obscure Actor Filtering

An actor is NOT obscure if ANY of:
- Has appeared in a movie/TV show with popularity >= 20
- Has 3+ English movies/shows with popularity >= 5
- Has 10+ movies total or 50+ TV episodes total

See `npm run backfill:actor-obscure` for the backfill script.

## Server Library

- `server/src/lib/mortality-stats.ts` - Calculation utilities