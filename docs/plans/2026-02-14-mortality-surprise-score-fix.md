# Design: Empirical Bayes Shrinkage for Mortality Surprise Score

## Problem

The mortality surprise score formula `(actual - expected) / expected` produces absurd values (44,000%+) when `expected` is near zero. This pushes obscure 1-death movies to the top of genre rankings, burying genuinely interesting results.

For example, "Fucked Up" (1986) has 1 of 2 cast deceased with expected deaths of ~0.002, producing a score of 44,197%. Meanwhile genuinely surprising movies like "Man-Made Monster" (1941, 26 of 30 dead) score only 568%.

## Solution

Replace the denominator with `expected + 2` (empirical Bayes shrinkage):

```
score = (actual - expected) / (expected + 2)
```

The constant `k=2` acts as a Bayesian prior — it says "before looking at any evidence, assume roughly 2 expected deaths." Calibrated against the dataset:

- 144,571 movies with deaths
- Median expected deaths: 2.86
- p25 expected deaths: 1.38
- k=2 sits between p25 and median, providing good shrinkage

For movies with large expected deaths (10+), the `+2` barely changes the score. For movies with expected deaths near zero, it prevents the score from exploding.

## Changes

### 1. Formula — `server/src/lib/mortality-stats.ts:319-320`

```typescript
// Before:
expectedDeaths > 0 ? (actualDeaths - expectedDeaths) / expectedDeaths : 0

// After:
(actualDeaths - expectedDeaths) / (expectedDeaths + 2)
```

The `expectedDeaths > 0` guard is no longer needed since the denominator can never be zero.

### 2. Backfill — migration to recalculate all stored scores

```sql
UPDATE movies
SET mortality_surprise_score = ROUND(((deceased_count - expected_deaths) / (expected_deaths + 2))::numeric, 3)
WHERE expected_deaths IS NOT NULL AND deceased_count IS NOT NULL;
```

Same pattern for shows, seasons, and episodes tables.

### 3. Tests — `server/src/lib/mortality-stats.test.ts`

Update assertions that check exact score values.

### 4. Documentation — `.claude/rules/mortality.md`

Update Curse Score formula.

## What doesn't change

- Display format (`+375% above expected`) stays the same
- Genre page query and frontend code untouched
- Cursed movies page `deceased_count >= 3` filter is orthogonal
- Per-actor mortality calculations unaffected

## Effect on rankings

| Rank | Current top | With k=2 top |
|------|-------------|--------------|
| 1 | "Lisa Left Eye Lopes" (1/1, score 908) | "Man-Made Monster" (26/30, score 3.75) |
| 2 | "stealing cars" (1/6, score 864) | "They Made Me a Criminal" (25/30, score 3.55) |
| 3 | "Diegohead" (1/14, score 844) | "The Woman in Room 13" (11/11, score 3.50) |
