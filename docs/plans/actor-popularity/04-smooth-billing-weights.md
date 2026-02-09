# 04 — Smooth Billing Weights

**Priority**: P2 (Refinement)
**Impact**: 3 | **Difficulty**: 1 | **Feasibility**: 5 | **Confidence**: 4

---

## Problem

The current billing weight uses a step function with three tiers:

```typescript
// popularity-score.ts:157-161
const BILLING_WEIGHTS = {
  lead: 1.0,      // Billing 1-3
  supporting: 0.7, // Billing 4-10
  minor: 0.4,      // Billing 11+
}
```

This creates **artificial cliffs**:
- Billing #3 → #4: Weight drops 30% (1.0 → 0.7)
- Billing #10 → #11: Weight drops 43% (0.7 → 0.4)

In reality, the difference between billing #3 and #4 is not a 30% gap. Hollywood billing reflects a gradient: #1 is the marquee star, #2 is the co-lead, #3–5 are major supporting, #6–10 are ensemble, 11+ are minor/cameo.

### Impact on Rankings

An actor consistently billed #4 in major films gets 70% credit, while an actor billed #3 in comparable films gets 100% credit — a 30% penalty for being one position lower. This can swap rankings for actors whose careers differ by only one billing position.

---

## Proposed Solution

Replace the step function with a **continuous decay function**:

### Option A (Recommended): Hyperbolic Decay

```typescript
function getBillingWeight(billingOrder: number | null): number {
  if (billingOrder === null) return 0.3  // Unknown = conservative estimate

  // Hyperbolic decay: 1.0 / (1 + 0.15 * (position - 1))
  // Position 1: 1.000
  // Position 2: 0.870
  // Position 3: 0.769
  // Position 4: 0.690
  // Position 5: 0.625
  // Position 10: 0.426
  // Position 15: 0.323
  // Position 20: 0.260
  return 1.0 / (1 + 0.15 * (billingOrder - 1))
}
```

### Option B: Salary Specialist's Gradient Table

Based on how Hollywood actually compensates and credits actors:

```typescript
function getBillingWeight(billingOrder: number | null): number {
  if (billingOrder === null) return 0.25
  const weights = [1.0, 0.85, 0.75, 0.60, 0.50, 0.40, 0.35, 0.30, 0.28, 0.25]
  if (billingOrder <= weights.length) return weights[billingOrder - 1]
  return 0.20  // 11+ = minor
}
```

### Comparison

| Position | Current | Hyperbolic (A) | Gradient (B) |
|----------|---------|----------------|--------------|
| 1 | 1.00 | 1.000 | 1.00 |
| 2 | 1.00 | 0.870 | 0.85 |
| 3 | 1.00 | 0.769 | 0.75 |
| 4 | 0.70 | 0.690 | 0.60 |
| 5 | 0.70 | 0.625 | 0.50 |
| 6 | 0.70 | 0.571 | 0.40 |
| 7 | 0.70 | 0.526 | 0.35 |
| 8 | 0.70 | 0.488 | 0.30 |
| 9 | 0.70 | 0.455 | 0.28 |
| 10 | 0.70 | 0.426 | 0.25 |
| 11 | 0.40 | 0.400 | 0.20 |
| 15 | 0.40 | 0.323 | 0.20 |
| 20 | 0.40 | 0.260 | 0.20 |

**Option A** is recommended because:
- No lookup table to maintain
- Smooth mathematical function — no discontinuities anywhere
- Still reaches ~0.4 at position 11 (matches current "minor" weight)
- Naturally asymptotes toward 0 for very high billing positions

---

## Expected Impact

- **Actors billed #4–10**: Slight score changes as weights become position-specific rather than flat 0.7
- **Actors billed #1 vs #2 vs #3**: Now differentiated (currently all 1.0). This matters for distinguishing true leads (#1) from co-leads (#2) and major supporting (#3)
- **Tom Cruise**: Mostly billed #1, so his weight stays at 1.0. No significant change.
- **Clark Gable**: Often billed #1 in classic films. Minimal change.
- **Character actors**: Those consistently billed #5–8 see modest changes vs the flat 0.7 tier

---

## Files to Modify

| File | Change |
|------|--------|
| `server/src/lib/popularity-score.ts` | Replace `BILLING_WEIGHTS` constant and `getBillingWeight()` function (lines 157–357) with continuous decay |
| `server/src/lib/popularity-score.test.ts` | Update billing weight tests; add tests for specific positions (1, 2, 3, 5, 10, 15, 20, null) |
| `server/scripts/scheduled-popularity-update.ts` | After P0 fix (uses library), the SQL billing CASE statement needs to match or be removed in favor of library calls |

---

## Team Assessment

| Specialist | Assessment | Confidence |
|------------|-----------|------------|
| Researcher | "Continuous functions are more maintainable than lookup tables. The hyperbolic decay matches the observed distribution of actor visibility by billing position." | 4/5 |
| Mathematician | "The step function introduces unnecessary discontinuities that can swap rankings for actors near the boundaries. A smooth function eliminates this artifact. The specific decay rate (0.15) should be validated empirically." | 4/5 |
| Salary Specialist | "The gradient table (Option B) matches Hollywood compensation more closely, but the hyperbolic function (Option A) is close enough and more elegant. The key improvement is differentiating #1 from #2 from #3 — they are very different roles in Hollywood." | 4/5 |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Actors previously billed #2–3 (weight 1.0) now get 0.87/0.77 | This is more accurate — #2 is genuinely less prominent than #1. Monitor for unexpected ranking changes. |
| Decay constant (0.15) may need tuning | Test against a validation set; the constant should produce weights that match intuitive billing importance |
| null billing order now gets 0.3 instead of 0.4 | Actors with unknown billing are likely minor roles; 0.3 is a safer estimate |
