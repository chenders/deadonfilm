# 11 — Star Power Indicators

**Priority**: P3 (Advanced)
**Impact**: 2 | **Difficulty**: 3 | **Feasibility**: 3 | **Confidence**: 3

---

## Problem

The current algorithm treats all billing #1 appearances equally. But Hollywood distinguishes between different types of lead roles:

1. **Sole lead**: The actor is billing #1 and there's a large gap to #2 (the movie is "their" movie — e.g., Tom Cruise in *Mission: Impossible*)
2. **Co-lead**: Billing #1 but #2 is comparable (e.g., an ensemble film)
3. **Franchise star**: Leading the same franchise across 3+ films (e.g., Daniel Craig as Bond)
4. **Consistent star**: Billing #1 in 3+ films with `dof_popularity ≥ 60` (repeatedly bankable)

These patterns indicate different levels of "star power" — the ability to carry a film on name alone. The current algorithm captures none of this nuance.

---

## Proposed Solution

### Three Star Power Bonuses

#### 1. Sole-Lead Bonus

When an actor is billing #1 and there is a significant billing gap to #2 (i.e., the movie is "their" movie — e.g., Tom Cruise in *Mission: Impossible*):

```typescript
// Full implementation: check billing gap between #1 and next billed actor
function isSoleLead(
  billingOrder: number,
  nextBillingOrder: number | null,
  castSize: number
): boolean {
  if (billingOrder !== 1 || castSize < 5) return false
  // Sole lead if no #2 actor, or gap of 2+ billing positions to next
  return nextBillingOrder === null || nextBillingOrder >= 3
}

// Bonus: 10% boost to that contribution
const SOLE_LEAD_MULTIPLIER = 1.10
```

Note: The billing gap heuristic uses data already available (we have billing orders for all cast members). A simpler fallback — just checking `billingOrder === 1 && castSize >= 5` — could be used initially, but would not distinguish sole leads from co-leads in ensemble films.

#### 2. Franchise Participation Bonus

If an actor appears in 3+ films from the same franchise (same TMDB collection), they get a franchise bonus:

```typescript
interface FranchiseAppearance {
  collectionId: number
  filmCount: number
  avgDofPopularity: number
}

function calculateFranchiseBonus(franchises: FranchiseAppearance[]): number {
  let bonus = 0
  for (const franchise of franchises) {
    if (franchise.filmCount >= 3 && franchise.avgDofPopularity >= 40) {
      // Each qualifying franchise adds a bonus based on its popularity
      bonus += Math.min(5, franchise.avgDofPopularity / 20)
    }
  }
  return Math.min(15, bonus) // Cap at 15 bonus points
}
```

Example: Daniel Craig appeared in 5 Bond films (avg dof_popularity ~75). Bonus = min(5, 75/20) = 3.75 per franchise. With one franchise, he gets +3.75.

#### 3. Consistent Star Multiplier

If an actor has billing #1 in 3+ films with `dof_popularity ≥ 60`:

```typescript
function getConsistentStarMultiplier(topBilledHighPopFilms: number): number {
  if (topBilledHighPopFilms >= 5) return 1.10  // 10% boost
  if (topBilledHighPopFilms >= 3) return 1.05  // 5% boost
  return 1.0  // No boost
}
```

Example: Tom Cruise has 15+ films where he's billing #1 with dof_popularity ≥ 60. He gets the full 10% boost.

### Integration

These bonuses are applied as multipliers/additions to the filmography component:

```typescript
// After calculating filmographyScore (from Proposals 02/08):
let adjustedFilmography = filmographyScore

// Apply consistent star multiplier
adjustedFilmography *= getConsistentStarMultiplier(topBilledCount)

// Add franchise bonus
adjustedFilmography += calculateFranchiseBonus(franchises)

// Cap at 100
adjustedFilmography = Math.min(100, adjustedFilmography)
```

At 5% of overall weight (as part of the proposed weight distribution), these bonuses contribute 0–5 points to the final score.

---

## Expected Impact

- **Tom Cruise**: Consistent star (15+ lead roles in hits) + franchise (Mission: Impossible). Gets +5-7 points from star power indicators.
- **Daniel Craig**: Franchise (Bond series) + consistent star (5 Bond films, *Knives Out*). Gets +4-5 points.
- **Clark Gable**: Consistent star of his era (many #1 billings in popular films). Gets +3-5 points.
- **Character actors**: Rarely billing #1 in high-popularity films. Gets 0 points. Appropriate.
- **One-film leads**: Billing #1 in one hit but no consistency. Gets 0 points from consistent star. May get sole-lead bonus for that one film (+10% to that contribution).

---

## Files to Modify

| File | Change |
|------|--------|
| `server/src/lib/popularity-score.ts` | Add star power interfaces, functions (`isSoleLead`, `calculateFranchiseBonus`, `getConsistentStarMultiplier`), update `ActorPopularityInput` to include franchise data, update `calculateActorPopularity` |
| `server/src/lib/popularity-score.test.ts` | Add tests for each star power indicator |
| `server/src/lib/jobs/handlers/calculate-actor-popularity.ts` | Add franchise data fetching to `getActorFilmography` |
| `server/scripts/scheduled-popularity-update.ts` | Add franchise data to actor scoring pipeline |

### Additional Data Needed

- **TMDB collections**: Need to fetch and store collection membership for movies (TMDB provides `belongs_to_collection` on movie records). May already be available — check if the movies table has a `collection_id` column.
- **Cast billing gap**: To detect sole leads, need billing #2's position for each film. This data exists in `actor_movie_appearances` — query for the minimum billing order > actor's billing order.

---

## Team Assessment

| Specialist | Assessment | Confidence |
|------------|-----------|------------|
| Researcher | "TMDB collections data is available and would identify franchise actors. The sole-lead detection requires querying billing data for other actors in the same film, which is achievable but adds query complexity." | 3/5 |
| Mathematician | "These are multiplicative bonuses on top of the base filmography score. The caps (15 points for franchise, 10% for consistent star) are appropriately bounded. However, the interaction between three bonuses stacking needs testing to ensure total bonuses don't exceed expectations." | 3/5 |
| Salary Specialist | "These indicators map directly to how the industry values talent. 'Can they open a movie?' (consistent star), 'Are they a franchise anchor?' (franchise), 'Is this THEIR movie?' (sole lead) are the three questions that determine an actor's compensation tier. This is the most accurate model of Hollywood star power in the proposal set." | 5/5 |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Franchise data may not be in the database yet | Check if `belongs_to_collection` exists on movies table. If not, this requires a TMDB data enrichment step first. |
| Sole-lead detection is noisy (billing gaps vary) | Start with a simpler proxy (billing #1 with cast size ≥ 5). Refine later with actual billing gap analysis. |
| Bonuses could stack too aggressively | Cap total star power bonus at 5% of final score (already bounded by the weight distribution). Test with known actors to verify. |
| Implementation complexity is higher than other proposals | This is why it's P3 — implement after core formula changes are stable. Each indicator can be implemented independently. |
| Historical billing data may be less reliable | Pre-1980 films may have unreliable billing orders. Apply star power indicators only when billing confidence is high. |
