# 10 — Enhanced Awards Bonus

**Priority**: P3 (Advanced)
**Impact**: 2 | **Difficulty**: 2 | **Feasibility**: 4 | **Confidence**: 3

---

## Problem

The current system has awards data at the content level (Oscar wins/nominations from OMDb) but no actor-level awards signal. An actor who has personally won an Academy Award, Emmy, or Golden Globe receives no direct boost for that achievement.

Awards are a strong signal of career significance:
- Oscar winners are household names even decades after their wins
- Emmy winners for lead roles indicate sustained TV stardom
- Golden Globe recognition spans both film and TV

The content-level awards signal (`calculateAwardsScore`) counts wins and nominations for a movie/show, not for the actor specifically. An actor who won an Oscar for a film with 3 Oscar wins gets the same film-level score as a non-winning actor in the same film.

---

## Proposed Solution

### Data Source: Wikidata SPARQL (Existing Infrastructure)

Wikidata stores award data for actors. Major awards can be queried:

```sparql
SELECT ?person ?award ?awardLabel WHERE {
  ?person wdt:P166 ?award .  # P166 = "award received"
  VALUES ?award {
    wd:Q103916    # Academy Award for Best Actor
    wd:Q103618    # Academy Award for Best Actress
    wd:Q106301    # Academy Award for Best Supporting Actor
    wd:Q106291    # Academy Award for Best Supporting Actress
    wd:Q152388    # Emmy Award for Outstanding Lead Actor
    wd:Q152393    # Emmy Award for Outstanding Lead Actress
    wd:Q152403    # Emmy Award for Outstanding Supporting Actor
    wd:Q152407    # Emmy Award for Outstanding Supporting Actress
    wd:Q1011547   # Golden Globe Award for Best Actor - Drama
    wd:Q1011548   # Golden Globe Award for Best Actress - Drama
    # ... additional major awards
  }
}
```

### Award Tier System

```typescript
const AWARD_TIERS = {
  tier1: {  // Highest prestige
    awards: ['oscar_actor', 'oscar_actress', 'oscar_supporting_actor', 'oscar_supporting_actress'],
    winPoints: 15,
    nomPoints: 5,
  },
  tier2: {  // High prestige
    awards: ['emmy_lead_actor', 'emmy_lead_actress', 'golden_globe_drama_actor', 'golden_globe_drama_actress'],
    winPoints: 10,
    nomPoints: 3,
  },
  tier3: {  // Notable
    awards: ['emmy_supporting', 'golden_globe_comedy', 'bafta_actor', 'sag_actor'],
    winPoints: 7,
    nomPoints: 2,
  },
}
```

### Score Calculation

```typescript
function calculateActorAwardsScore(awards: ActorAward[]): number {
  let totalPoints = 0

  for (const award of awards) {
    const tier = getTierForAward(award.wikidataId)
    if (!tier) continue
    totalPoints += award.isWin ? tier.winPoints : tier.nomPoints
  }

  // Convert to 0-100 scale
  // 15 points (1 Oscar win) = ~60
  // 30 points (2 Oscar wins or 1 win + 3 nominations) = ~80
  // 50+ points = 95+
  return Math.min(100, totalPoints * 2)
}
```

### Integration

```typescript
const ACTOR_WEIGHTS = {
  filmography: 0.55,
  tmdbRecency: 0.15,
  wikipediaPageviews: 0.15,
  wikidataSitelinks: 0.05,
  awards: 0.05,           // ← This proposal
  starPower: 0.05,
}
```

At 5% weight, an Oscar winner gets a ~3–5 point boost. This is a meaningful differentiator between otherwise similar actors.

---

## Expected Impact

- **Oscar winners (e.g., Meryl Streep — 3 wins, 21 noms)**: Maximum awards score (~100). Gets full 5-point boost. Helps distinguish her from actors with similar filmography quality but no awards.
- **Emmy winners (e.g., Bryan Cranston)**: High awards score (~70-80). Gets 3.5–4 point boost.
- **Character actors with no major awards**: Score = 0. No boost. This is appropriate — the awards signal specifically rewards recognized excellence.
- **Tom Cruise (3 Oscar noms, 3 Golden Globe wins)**: ~60 awards score. Gets ~3 point boost.

---

## Files to Modify

| File | Change |
|------|--------|
| `server/src/lib/popularity-score.ts` | Add `actorAwards` to `ActorPopularityInput`, add `calculateActorAwardsScore`, update weight distribution |
| `server/src/lib/popularity-score.test.ts` | Add tests for awards scoring |
| `server/src/lib/wikidata.ts` | Add `fetchActorAwards()` function using SPARQL |
| `server/src/lib/wikidata.test.ts` | Add tests for awards query |
| **Migration** | Add `actor_awards` JSONB column to `actors` table (or a separate `actor_awards` table) |
| `server/scripts/backfill-actor-awards.ts` | **New file** — One-time backfill from Wikidata |
| `server/scripts/scheduled-popularity-update.ts` | Include awards in actor scoring pipeline |

---

## Team Assessment

| Specialist | Assessment | Confidence |
|------------|-----------|------------|
| Researcher | "Wikidata has comprehensive award data for major awards. The SPARQL queries are straightforward. Coverage for Oscar/Emmy/Globe winners is nearly 100%." | 4/5 |
| Mathematician | "At 5% weight, the awards bonus is appropriately bounded. The tier system prevents local/minor awards from inflating scores. The point system should be calibrated so that a single Oscar win produces a score of ~60 (not 100)." | 3/5 |
| Salary Specialist | "Awards are one of the strongest signals of career significance in Hollywood. An Oscar winner's salary typically doubles; their name recognition increases permanently. Even 5% weight is somewhat conservative — in the industry, awards carry enormous weight." | 4/5 |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Wikidata award data may be incomplete for older actors | Cross-reference with known Oscar/Emmy databases for validation |
| Award Wikidata IDs may change | Use stable QIDs; implement a mapping layer that can be updated |
| Some prestigious awards not included (Cannes, BAFTA) | Start with the most recognizable US awards (Oscar, Emmy, Globe); expand the tier list over time |
| Awards bias toward English-language films | This is intentional for a US-audience-focused site. International awards could be added as a lower tier later. |
| SPARQL queries for awards are more complex than sitelinks | Use VALUES clauses to batch award lookups; cache results (awards don't change often) |
