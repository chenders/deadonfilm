---
globs: ["**/mortality*", "**/curse*", "server/src/lib/mortality-stats.ts"]
---
# Mortality Statistics

Uses US SSA actuarial life tables. Implementation: `server/src/lib/mortality-stats.ts`

## Formulas

| Metric | Formula |
|--------|---------|
| Expected Deaths | Sum of P(death) for each actor from filming age to current age |
| Curse Score | `(Actual - Expected) / Expected`. Positive = "cursed" |
| Years Lost | `Expected Lifespan - Actual`. Positive = died early |

## Rules

1. **Archived Footage**: Exclude actors who died >3 years before release
2. **Same-Year Death**: Count with minimum 1 year death probability
3. **Cursed Actors**: Sum co-star deaths across filmography, then compute score

## Obscure Filtering

**Movies** are obscure if: no poster, OR (English + popularity <5 + cast <5), OR (non-English + popularity <20)

**Actors** are NOT obscure if: appeared in content with popularity ≥20, OR 3+ English works with popularity ≥5, OR 10+ movies OR 50+ TV episodes
