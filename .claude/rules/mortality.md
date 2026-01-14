---
globs: ["**/mortality*", "**/curse*", "server/src/lib/mortality-stats.ts"]
---
# Mortality Statistics

Core library: `server/src/lib/mortality-stats.ts`

## Formulas

| Metric | Formula |
|--------|---------|
| Expected Deaths | Sum of P(death) for each actor from filming age to current age |
| Curse Score | (Actual - Expected) / Expected. Positive = cursed, negative = blessed |
| Years Lost | Expected Lifespan - Actual. Uses SSA cohort life expectancy |

## Calculation Rules

| Rule | Description |
|------|-------------|
| Archived Footage | Exclude actors who died >3 years before release |
| Same-Year Death | Count with minimum 1 year probability |
| Cursed Actors | Sum expected/actual co-star deaths, then compute score |

## Obscure Content

### Obscure Movies (`is_obscure = true`)

- `poster_path IS NULL`, OR
- English: `popularity < 5.0 AND cast_count < 5`, OR
- Non-English: `popularity < 20.0`

### Non-Obscure Actors

- Appeared in content with `popularity >= 20`, OR
- 3+ English content with `popularity >= 5`, OR
- 10+ movies total OR 50+ TV episodes

Backfill: `npm run backfill:actor-obscure`
