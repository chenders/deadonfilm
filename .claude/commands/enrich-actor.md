# Enrich Actor

Run the full enrichment workflow for a single actor by name or TMDB ID.

## Arguments

- `$ARGUMENTS` - Actor name (e.g., "John Wayne") or TMDB ID (e.g., 4165)

## Instructions

1. **Find the actor**
   - If a TMDB ID is provided (numeric), look up directly
   - If a name is provided, search the database:
     ```sql
     SELECT id, name, deathday, enriched_at, cause_of_death, biography_version
     FROM actors WHERE name ILIKE '%<name>%' AND deathday IS NOT NULL
     ORDER BY dof_popularity DESC LIMIT 5;
     ```
   - If multiple matches, show them and ask the user which one

2. **Check current enrichment state**
   ```sql
   -- Death enrichment status
   SELECT a.id, a.name, a.deathday, a.cause_of_death, a.enriched_at, a.enrichment_source,
          adc.circumstances IS NOT NULL AS has_circumstances
   FROM actors a
   LEFT JOIN actor_death_circumstances adc ON a.id = adc.actor_id
   WHERE a.id = <actor_id>;

   -- Biography enrichment status
   SELECT narrative IS NOT NULL AS has_narrative, narrative_confidence, biography_version
   FROM actor_biography_details WHERE actor_id = <actor_id>;
   ```

3. **Run death enrichment** (if missing cause_of_death or user requests re-enrichment)
   ```bash
   cd server && npx tsx scripts/enrich-death-details.ts --actor-id <id> --free --link-follow --claude-cleanup
   ```

4. **Run biography enrichment** (if missing narrative or user requests re-enrichment)
   ```bash
   cd server && npm run enrich:biographies -- --actor-id <id>
   ```

5. **Run field sync** (updates computed fields: death_manner, categories, age_at_death, etc.)
   ```bash
   cd server && npx tsx scripts/sync-actor-death-fields.ts --actor-id <id>
   ```

6. **Verify results**
   - Re-query the actor's enrichment state (step 2)
   - Show a summary of what was enriched/updated
   - If anything failed, show the relevant error output

## Notes

- Death enrichment requires API keys for best results (ANTHROPIC_API_KEY at minimum)
- Biography enrichment always uses Claude for synthesis (requires ANTHROPIC_API_KEY)
- The `--free` flag for death enrichment uses only free sources (no paid AI models)
- Add `--ignore-cache` to either enrichment script to bypass cached source results
