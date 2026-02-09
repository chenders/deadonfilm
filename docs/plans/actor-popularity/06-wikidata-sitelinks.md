# 06 — Wikidata Sitelinks Signal

**Priority**: P2 (Refinement)
**Impact**: 3 | **Difficulty**: 2 | **Feasibility**: 5 | **Confidence**: 4

---

## Problem

Some actors maintain enduring cultural significance across the world but score poorly on recency-based metrics (TMDB) and may not have high recent Wikipedia pageviews (steady but not spiking). There is no "timeless fame" signal in the current algorithm.

Wikidata **sitelinks count** — the number of Wikipedia language editions that have an article about this person — is an excellent proxy for cross-cultural, enduring fame:
- Clark Gable: ~70 sitelinks (articles in 70+ languages)
- Tom Cruise: ~90 sitelinks
- A minor character actor: 5–15 sitelinks
- A regionally-known actor: 20–40 sitelinks

The more languages that have a Wikipedia article about someone, the more globally recognized they are. This metric is stable over time (articles rarely get deleted) and works equally well for living and deceased actors.

---

## Proposed Solution

### Data Source: Wikidata SPARQL (Existing Infrastructure)

The project already has Wikidata SPARQL infrastructure (`server/src/lib/wikidata.ts`). Sitelinks count can be queried directly:

```sparql
SELECT ?person ?sitelinks WHERE {
  ?person wdt:P31 wd:Q5 .         # Instance of human
  ?person wdt:P646 ?freebaseId .   # Has Freebase ID (links to TMDB)
  ?person wikibase:sitelinks ?sitelinks .
}
```

Or for a specific actor by Wikidata ID:

```sparql
SELECT ?sitelinks WHERE {
  wd:Q37079 wikibase:sitelinks ?sitelinks .  # Clark Gable
}
```

### Score Calculation

```typescript
const SITELINKS_THRESHOLDS = {
  p25: 10,   // Minor/regional actor
  p50: 25,   // Moderately known internationally
  p75: 50,   // Well-known globally
  p90: 75,   // Very famous
  p99: 100,  // Legendary (Marilyn Monroe: ~120)
}

const sitelinksScore = logPercentile(sitelinksCount, SITELINKS_THRESHOLDS)
```

### Integration

```typescript
// Part of the proposed new weight distribution
const ACTOR_WEIGHTS = {
  filmography: 0.55,
  tmdbRecency: 0.15,
  wikipediaPageviews: 0.15,
  wikidataSitelinks: 0.05,  // Small but meaningful "timeless fame" floor
  // awards: 0.05, starPower: 0.05
}
```

At 5% weight, sitelinks provide a **floor** for globally recognized actors. A legendary actor with 90 sitelinks gets ~4.5 bonus points (score ~90 × 0.05). This prevents truly famous actors from scoring too low due to low recency metrics.

### Data Pipeline

1. **Batch SPARQL query**: Fetch sitelinks for all actors with known Wikidata IDs. Can be done in a single SPARQL query (Wikidata allows up to 50K results).
2. **Store on actors table**: New column `wikidata_sitelinks` (int).
3. **Scheduled update**: Monthly (sitelinks change slowly — articles are added rarely).

### Mapping Actors to Wikidata

The actors table has `wikipedia_url`. Wikidata items can be resolved from Wikipedia article titles:

```
GET https://www.wikidata.org/w/api.php?action=wbgetentities&sites=enwiki&titles={article}&props=sitelinks
```

Or via SPARQL if we have the TMDB ID (stored as P4985 in Wikidata):

```sparql
SELECT ?person ?sitelinks WHERE {
  ?person wdt:P4985 "{tmdb_id}" .
  ?person wikibase:sitelinks ?sitelinks .
}
```

---

## Expected Impact

- **Clark Gable (~70 sitelinks)**: Gets ~3.5 bonus points from sitelinks alone. Combined with improved Wikipedia pageviews signal, his "timeless fame" is now properly captured.
- **Tom Cruise (~90 sitelinks)**: Gets ~4.5 bonus points. A nice floor, though his other signals are already strong.
- **Regional actors (10–20 sitelinks)**: Minimal bonus (1–2 points). Appropriate — they're not globally recognized.
- **Character actors (5–15 sitelinks)**: Negligible bonus. This signal correctly identifies them as not globally famous.

---

## Files to Modify

| File | Change |
|------|--------|
| `server/src/lib/popularity-score.ts` | Add `wikidataSitelinks` to `ActorPopularityInput`, add thresholds, update score calculation |
| `server/src/lib/popularity-score.test.ts` | Add tests for sitelinks integration |
| `server/src/lib/wikidata.ts` | Add `fetchSitelinksCount()` function using existing SPARQL infrastructure |
| `server/src/lib/wikidata.test.ts` | Add tests for sitelinks query |
| **Migration** | Add `wikidata_sitelinks` column to `actors` table |
| `server/scripts/backfill-wikidata-sitelinks.ts` | **New file** — One-time backfill via batch SPARQL |
| `server/scripts/scheduled-popularity-update.ts` | Include sitelinks in actor scoring pipeline |

---

## Team Assessment

| Specialist | Assessment | Confidence |
|------------|-----------|------------|
| Researcher | "Sitelinks count is the most stable fame metric available. It changes slowly (unlike TMDB or Wikipedia pageviews), making it ideal as a 'floor' signal. The existing Wikidata infrastructure makes implementation straightforward." | 4/5 |
| Mathematician | "At 5% weight, this signal can contribute 0–5 points. That's the right magnitude for a 'timeless fame' floor — it can't dominate the score, but it prevents globally famous actors from scoring embarrassingly low." | 4/5 |
| Salary Specialist | "Sitelinks count maps roughly to 'international box office draw'. An actor with articles in 70+ languages was almost certainly a global star at some point. This is particularly valuable for pre-1980 actors who lack Trakt/TMDB data." | 4/5 |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Not all actors have Wikidata entries | Use as optional signal (like TMDB); actors without Wikidata fall back to other signals. Coverage is likely high for famous actors. |
| SPARQL query timeouts for large batches | Batch queries in groups of 1000; use SPARQL `VALUES` clause for batch lookups |
| Sitelinks count can be artificially inflated by bot-created articles | At 5% weight, the impact is bounded. Cross-reference with Wikipedia pageviews for consistency. |
| Mapping TMDB IDs to Wikidata may have gaps | Multiple resolution strategies: TMDB ID (P4985), IMDb ID (P345), Wikipedia URL. Fall back through each. |
