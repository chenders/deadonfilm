# Surprise Discovery Agent — Design Spec

## Problem

The biography enrichment pipeline produces high-quality personal narratives but misses widely-known quirky associations that the general public knows about. These associations — like Helen Mirren expressing sadness that Kurt Cobain died before GPS was invented — show up in Google autocomplete but are never surfaced by our biography-focused search queries.

The current pipeline searches for "profile", "interview", "early life", "childhood", and "lesser known facts", which biases toward structured biographical content and misses viral moments, bizarre quotes, and unexpected associations that make a biography feel complete.

## Solution

A **post-enrichment surprise discovery agent** that:

1. Discovers what the public associates with an actor via Google Autocomplete
2. Filters for associations that are *surprising* — things that don't obviously connect to the actor's career, family, or known biography
3. Researches the story behind each surprising association via Reddit
4. Verifies the claim in a reliable journalistic source before accepting it
5. Integrates verified findings into the actor's biography

## Architecture

### Pipeline Overview

```
Main Bio Enrichment (existing)
  → biography written to DB
  → if surprise_discovery enabled:

      Phase 1: Discover & Filter (cheap, always runs)
        1. Google Autocomplete: 57 queries per actor
        2. Boring filter: drop filmography, co-stars, generic terms
        3. Haiku incongruity scoring: batch-score remaining candidates
        4. Gate: if no candidates score >= 7, stop here

      Phase 2: Research & Verify (only if Phase 1 found something)
        5. Reddit search: find the story behind the association
        6. Web search verification: confirm in reliable source
        7. Reliability gate: must be ReliabilityTier.TRADE_PRESS (0.9) or better

      Phase 3: Integrate
        8. Sonnet integration: decide narrative vs lesserKnownFacts
        9. DB write: update actor_biography_details
```

### Phase 1: Discover & Filter

#### Autocomplete Collection

57 free HTTP requests to Google's autocomplete endpoint per actor:

| Pattern | Queries | Example |
|---------|---------|---------|
| `"{name}" {a-z}` | 26 | `"helen mirren" k` |
| `{name} {a-z}` | 26 | `helen mirren k` |
| `"{name}" {keyword}` | 5 | `"helen mirren" why`, `did`, `secret`, `weird`, `surprising` |

Each suggestion is tagged with its query pattern (`quoted-letter`, `quoted-space-letter`, `keyword`) for later analysis of which patterns are productive. Typical yield: 200-400 raw suggestions, deduplicating to 80-150 unique terms.

All autocomplete responses are cached in `source_query_cache` with source type `autocomplete-discovery`.

#### Boring Filter (Heuristic, No AI)

For each unique suggestion, extract the association term (everything after the actor's name) and drop if it matches:

1. **Filmography match** — movie titles, show titles, or character names from the actor's TMDB credits
2. **Known associates** — co-star names from top credits, spouse/partner names from existing bio text
3. **Generic blocklist** — predictable patterns: age, height, net worth, young, movies, awards, oscar, husband, wife, children, kids, death, died, house, salary, birthday, born, nationality, ethnicity, religion, Instagram, Twitter, photos, images, hot, sexy, bikini, dress, hair, makeup
4. **Duplicate/subset detection** — if "kurt cobain" and "kurt cobain gps" both appear, keep only the more specific one

Expected to eliminate 80-90% of suggestions. Remaining 10-20 candidates proceed to Haiku.

#### Haiku Incongruity Scoring

Single batched Haiku call with all remaining candidates:

```
For the actor {name}, score each of these public associations for how
SURPRISING the connection is (1-10).

A high score (7-10) means the association is unexpected and not obviously
related to their career, personal life, or public persona.
A low score (1-3) means it's predictable or expected.

{candidates list}

For each, respond with: score (1-10) and one sentence explaining why.
Return as JSON array.
```

**Gate:** Candidates scoring **>= 7** proceed to Phase 2. Everything else is logged and dropped.

**Cost:** ~$0.001 per actor for the Haiku call.

### Phase 2: Research & Verify

Only runs if Phase 1 produced at least one candidate scoring >= 7. For each high-scoring association:

#### Reddit Research

Search Reddit using existing web search infrastructure (Google CSE, Brave) with `site:reddit.com` queries:

- `"{actor name}" "{surprising term}" site:reddit.com`

Target subreddits: r/todayilearned, r/movies, r/television, r/til, r/celebs, r/askreddit

From matching threads, extract:
- The **claimed story** — what Reddit says the connection is
- **Thread quality signals** — upvote count, comment count, subreddit
- **Source URLs** cited in the thread — Redditors often link to the original article

Results cached in `source_query_cache` with source type `reddit-discovery`.

#### Verification

The claim extracted from Reddit must be confirmed by a reliable source. Strategy:

1. **Follow Reddit's own citations** — if the thread links to a reliable source, fetch and confirm
2. **Direct search** — use Google/Brave with targeted query: `"{actor name}" "{key claim terms}"` (no site restriction)
3. **Reliability check** — confirming source must be `ReliabilityTier.TRADE_PRESS` (0.9) or better:
   - Tier 1 news: Guardian, NYT, BBC, AP, Reuters, WaPo, LA Times
   - Trade press: Variety, THR, Deadline
   - Reference: Britannica, Biography.com, Wikipedia
   - Structured data: Wikidata

If after 2-3 search attempts no reliable source confirms the claim, log as `verified: false` and drop.

Results cached in `source_query_cache` with source type `discovery-verification`.

**Cost:** 2-4 web search requests per association, ~$0.005-0.01 each.

### Phase 3: Integrate

After verification, typically 0-1 verified findings per actor (occasionally 2-3 for very public figures).

#### Integration Strategy (A/B Configurable)

Two strategies, selectable in admin UI:

**append-only (default, safer):** Sonnet receives the existing bio and verified findings. Instructed to write only new `lesserKnownFacts` entries or targeted narrative insertions. Existing text is never rewritten.

**re-synthesize:** Sonnet receives the existing bio and verified findings. Returns the updated full narrative and `lesserKnownFacts`. Same model as original synthesis to maintain consistency.

Both strategies store the result alongside the original bio for comparison. The discovery results record tracks which strategy was used.

#### Sonnet Prompt (append-only)

```
Here is the existing biography for {actor name}:
{existing narrative}

Existing lesser-known facts:
{existing lesserKnownFacts}

We've discovered and verified these additional facts:

1. {verified claim}
   Source: {reliable source URL}
   Source text: {relevant excerpt}

For each finding, decide:
- LESSER_KNOWN_FACT: a surprising standalone tidbit (most common)
- NARRATIVE_INSERT: a biographical fact that should be added to the
  narrative, with the specific location and new text
- DISCARD: doesn't add meaningful value

Do not remove or modify existing content unless new information
directly contradicts it.
```

#### Sonnet Prompt (re-synthesize)

```
You previously wrote this biography for {actor name}:
{existing narrative}

Existing lesser-known facts:
{existing lesserKnownFacts}

We've discovered and verified these additional facts:

1. {verified claim}
   Source: {reliable source URL}
   Source text: {relevant excerpt}

Return an updated biography incorporating any findings that add value.
For each finding, it may belong in the narrative (if biographical),
in lesser_known_facts (if a surprising standalone tidbit), or be
discarded (if not valuable enough).
```

**Cost:** ~$0.01-0.03 per actor for the Sonnet call.

#### DB Write

Update `actor_biography_details`:
- `narrative` — updated if changed
- `lesser_known_facts` — appended if new facts added
- `biography_version` — incremented
- Discovery results stored (see Data Tracking section)

Invalidate the actor's Redis cache.

## Data Tracking & Observability

### Source Query Cache

Every external request is cached in `source_query_cache` with new source types:

| Source Type | Content |
|-------------|---------|
| `autocomplete-discovery` | Raw autocomplete responses per actor |
| `reddit-discovery` | Reddit search results per association |
| `discovery-verification` | Verification search results |

### Run Logging

Discovery logs to `run_logs` via `RunLogger` with structured entries:

```
[INFO]  discovery:autocomplete    57 queries, 287 suggestions, 143 unique
[INFO]  discovery:boring-filter   131 dropped (filmography: 45, co-stars: 38, generic: 48), 12 remaining
[INFO]  discovery:incongruity     12 scored → 2 above threshold (kurt cobain: 9.2, tattoo: 7.4)
[INFO]  discovery:reddit          kurt cobain: 3 threads found, best: r/todayilearned (2.1k upvotes)
[INFO]  discovery:reddit          tattoo: 1 thread found, r/movies (340 upvotes)
[INFO]  discovery:verify          kurt cobain: VERIFIED via theguardian.com (2024-10-25)
[WARN]  discovery:verify          tattoo: not verified after 3 attempts, dropping
[INFO]  discovery:integrate       1 verified finding → integration triggered (append-only)
[INFO]  discovery:integrate       kurt cobain/GPS → added to lesserKnownFacts
```

### Per-Actor Discovery Record

Stored as a new JSONB column `discovery_results` on `actor_biography_details`:

```typescript
interface DiscoveryResults {
  discoveredAt: string
  config: {
    integrationStrategy: "append-only" | "re-synthesize"
    incongruityThreshold: number
  }
  autocomplete: {
    queriesRun: number
    totalSuggestions: number
    uniqueSuggestions: number
    byPattern: Record<string, number>  // e.g. { "quoted-letter": 89, "quoted-space-letter": 42, "keyword": 12 }
  }
  boringFilter: {
    dropped: number
    droppedByReason: Record<string, number>  // e.g. { filmography: 45, co-stars: 38, generic: 48 }
    remaining: number
  }
  incongruityCandidates: Array<{
    term: string
    score: number
    reasoning: string
  }>
  researched: Array<{
    term: string
    incongruityScore: number
    redditThreads: Array<{
      url: string
      subreddit: string
      title: string
      upvotes: number
    }>
    claimExtracted: string
    verificationAttempts: Array<{
      source: string
      url: string
      found: boolean
    }>
    verified: boolean
    verificationSource?: string
    verificationUrl?: string
  }>
  integrated: Array<{
    term: string
    destination: "narrative" | "lesserKnownFacts" | "discarded"
    verificationSource: string
  }>
  costUsd: number
}
```

### Admin Visibility

Actor detail page in admin gets a "Discovery Results" expandable section showing the full decision trail.

## Admin UI & Configuration

### Enrichment Options

New "Surprise Discovery" section in bio enrichment config:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| Enable surprise discovery | checkbox | on | Run discovery after bio enrichment |
| Integration strategy | radio | append-only | "Append only" or "Re-synthesize" |
| Max cost per actor (discovery) | number | $0.10 | Cost cap for the discovery step |
| Incongruity threshold | number (1-10) | 7 | Minimum Haiku score to proceed to Phase 2 |

These are passed as config in both batch and single-actor enrichment.

### Batch Runs

Discovery runs automatically after each actor's main enrichment completes (if enabled). The existing batch runner handles this as an additional step per actor.

### Single-Actor Enrichment

The "Enrich" button runs discovery inline after the bio is written.

## Cost Estimates

| Scenario | Cost | Time |
|----------|------|------|
| No surprising associations found (most actors) | ~$0.005 | ~5-10s |
| 1-2 surprising associations, none verified | ~$0.02 | ~15-20s |
| 1 verified finding integrated | ~$0.03-0.05 | ~20-30s |
| 3 verified findings integrated (rare) | ~$0.06-0.10 | ~30-45s |

Typical additional cost on top of main bio enrichment: **$0.005-0.05 per actor**, or roughly 10-30% overhead.

## File Locations

| Component | Path |
|-----------|------|
| Discovery agent | `server/src/lib/biography-sources/surprise-discovery/` |
| Autocomplete client | `server/src/lib/biography-sources/surprise-discovery/autocomplete.ts` |
| Boring filter | `server/src/lib/biography-sources/surprise-discovery/boring-filter.ts` |
| Incongruity scorer | `server/src/lib/biography-sources/surprise-discovery/incongruity-scorer.ts` |
| Reddit researcher | `server/src/lib/biography-sources/surprise-discovery/reddit-researcher.ts` |
| Verification | `server/src/lib/biography-sources/surprise-discovery/verifier.ts` |
| Integration | `server/src/lib/biography-sources/surprise-discovery/integrator.ts` |
| Orchestrator | `server/src/lib/biography-sources/surprise-discovery/orchestrator.ts` |
| Types | `server/src/lib/biography-sources/surprise-discovery/types.ts` |
| Tests | `server/src/lib/biography-sources/surprise-discovery/*.test.ts` |

## Dependencies

- Google Autocomplete endpoint (free, no API key)
- Existing web search infrastructure (Google CSE, Brave) for Reddit and verification searches
- Anthropic API (Haiku for scoring, Sonnet for integration)
- Existing `source_query_cache` for caching
- Existing `RunLogger` for logging
- Existing `ReliabilityTier` for source verification
- TMDB actor data (filmography, co-stars) for boring filter

No new API keys or external services required.
