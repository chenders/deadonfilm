# Enrich Actor

Run the full enrichment workflow for a single actor by name or TMDB actor ID.

## Arguments

- `$ARGUMENTS` - Actor name (e.g., "John Wayne") or TMDB actor ID as a bare number (e.g., 4165). Bare numeric values are always treated as TMDB IDs, not internal `actors.id` values.

## Instructions

1. **Find the actor**
   - If the argument is a bare number, treat it as a TMDB actor ID and look up the internal record:
     ```sql
     SELECT id, name, deathday, enriched_at, cause_of_death, biography_version
     FROM actors WHERE tmdb_id = $1 AND deathday IS NOT NULL;
     ```
     Use the returned `id` as `<actor_id>` in subsequent steps.
   - If a name is provided (non-numeric), search the database (using parameterized query):
     ```sql
     SELECT id, name, deathday, enriched_at, cause_of_death, biography_version
     FROM actors WHERE name ILIKE $1 ESCAPE '\\' AND deathday IS NOT NULL
     ORDER BY dof_popularity DESC LIMIT 5;
     ```
     Build `$1` as a search pattern: escape `%`, `_`, and `\` in the actor name by prefixing with `\`, then wrap with `%` on both sides.
   - If multiple matches, show them and ask the user which one. Use the selected record's `id` as `<actor_id>`.

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
   cd server && npx tsx scripts/enrich-death-details.ts --actor-id <id>
   ```
   Free sources, link following, and Claude cleanup are enabled by default. Use `--disable-free`, `--disable-follow-links`, or `--disable-claude-cleanup` to turn them off.

4. **Run biography enrichment** (if missing narrative or user requests re-enrichment)
   ```bash
   cd server && npm run enrich:biographies -- --actor-id <id>
   ```

5. **Run field sync** (bulk operation: updates computed fields like death_manner, categories, age_at_death for all relevant actors)
   ```bash
   cd server && npx tsx scripts/sync-actor-death-fields.ts
   ```
   Note: This script does not support `--actor-id` — it processes all actors. Use `--dry-run` to preview changes.

6. **Verify results**
   - Re-query the actor's enrichment state (step 2)
   - Show a summary of what was enriched/updated
   - If anything failed, show the relevant error output

## Notes

- Death enrichment requires API keys for best results (ANTHROPIC_API_KEY at minimum)
- Biography enrichment always uses Claude for synthesis (requires ANTHROPIC_API_KEY)
- Death enrichment enables free sources, link following, and Claude cleanup by default
- Add `--ignore-cache` to either enrichment script to bypass cached source results
