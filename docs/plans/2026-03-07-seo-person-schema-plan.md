# SEO Person Schema Enhancement — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance schema.org Person markup with structured SEO fields from biography enrichment, remove redundant BiographyLifeDetails UI, enable alternate-name search.

**Architecture:** Add 5 new fields to BiographyData (alternateNames, gender, nationality, occupations, awards). Claude prompt extracts them during synthesis. Wikidata already fetches occupations/awards (P106/P166) — add P742 (pseudonym). New DB columns store the fields. Both client and server schema builders emit enhanced Person JSON-LD. Search query matches alternate names.

**Tech Stack:** PostgreSQL (node-pg-migrate), Express, React, Claude API, SPARQL, Vitest

**Design doc:** `docs/plans/2026-03-07-seo-person-schema-design.md`

---

### Task 1: Database Migration — Add SEO Fields

**Files:**
- Modify: `server/migrations/1772877354770_add-biography-seo-fields.cjs` (already exists, needs `occupations` column added)

**Step 1: Update the existing migration file**

The migration file exists but is missing the `occupations` column. Update it:

```javascript
/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumns("actor_biography_details", {
    alternate_names: { type: "text[]", default: null },
    gender: { type: "text", default: null },
    nationality: { type: "text", default: null },
    occupations: { type: "text[]", default: null },
    awards: { type: "text[]", default: null },
  })

  pgm.addColumns("actors", {
    alternate_names: { type: "text[]", default: null },
  })

  // GIN index for array search on actors.alternate_names
  pgm.createIndex("actors", "alternate_names", {
    method: "gin",
    ifNotExists: true,
  })
}

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropIndex("actors", "alternate_names", { ifExists: true })
  pgm.dropColumns("actor_biography_details", [
    "alternate_names",
    "gender",
    "nationality",
    "occupations",
    "awards",
  ])
  pgm.dropColumns("actors", ["alternate_names"])
}
```

**Step 2: Run migration**

```bash
cd server && npm run migrate:up
```

Expected: Migration succeeds, new columns exist.

**Step 3: Commit**

```bash
git add server/migrations/1772877354770_add-biography-seo-fields.cjs
git commit -m "Add biography SEO fields migration (alternate_names, gender, nationality, occupations, awards)"
```

---

### Task 2: Update BiographyData Type + Claude Prompt + Response Parsing

**Files:**
- Modify: `server/src/lib/biography-sources/types.ts:190-203` — add 5 fields to `BiographyData`
- Modify: `server/src/lib/biography-sources/claude-cleanup.ts:120-134` — add fields to JSON schema in prompt
- Modify: `server/src/lib/biography-sources/claude-cleanup.ts:217-224` — update awards rule in CRITICAL section
- Modify: `server/src/lib/biography-sources/claude-cleanup.ts:377-397` — parse new fields from response

**Step 1: Add fields to BiographyData interface**

In `server/src/lib/biography-sources/types.ts`, add after `hasSubstantiveContent`:

```typescript
export interface BiographyData {
  // ... existing fields ...
  hasSubstantiveContent: boolean
  // SEO-specific structured fields
  alternateNames: string[]
  gender: string | null
  nationality: string | null
  occupations: string[]
  awards: string[]
}
```

**Step 2: Add fields to Claude prompt JSON schema**

In `server/src/lib/biography-sources/claude-cleanup.ts`, update the JSON schema block (lines 120-134) to add the new fields after `has_substantive_content`:

```
  "has_substantive_content": true/false,
  "alternate_names": ["Stage names, maiden names, nicknames, birth names if different from professional name. Empty array if none."],
  "gender": "male|female|non-binary|null (only if clearly stated in sources)",
  "nationality": "Primary nationality, e.g. 'American', 'British-American'. null if unknown.",
  "occupations": ["All known occupations beyond acting — e.g., 'politician', 'inventor', 'pilot', 'singer'. Include 'actor' or 'actress' as appropriate. Empty array if only acting."],
  "awards": ["Up to 5 notable awards if clearly sourced — e.g., 'Academy Award for Best Actor', 'Presidential Medal of Freedom'. Empty array if none clearly documented."]
```

**Step 3: Update CRITICAL section re: awards**

In the CRITICAL section (lines 217-224), update the awards rule to clarify that awards should be extracted as structured metadata but NOT mentioned in the narrative:

Replace:
```
- Do NOT list filmography, awards, box office numbers
```
With:
```
- Do NOT list filmography or box office numbers in the narrative
- Do NOT mention specific awards in the narrative text. Extract them ONLY into the "awards" structured field.
```

And update the NEVER mention awards line:
```
- NEVER mention specific award names in the narrative (Oscar, Academy Award, Emmy, Tony, Grammy,
  Golden Globe, BAFTA, SAG, Pulitzer, Cannes, Venice). Instead extract them into the "awards"
  field. The narrative should say "recognized for her work" or simply omit the reference.
```

**Step 4: Parse new fields from Claude response**

In the response parsing block (lines 377-397), add parsing after `hasSubstantiveContent`:

```typescript
  const data: BiographyData = {
    // ... existing field parsing ...
    hasSubstantiveContent:
      typeof parsed.has_substantive_content === "boolean" ? parsed.has_substantive_content : false,
    alternateNames: Array.isArray(parsed.alternate_names)
      ? parsed.alternate_names.filter((f: unknown): f is string => typeof f === "string")
      : [],
    gender: typeof parsed.gender === "string" && parsed.gender !== "null" ? parsed.gender : null,
    nationality: typeof parsed.nationality === "string" && parsed.nationality !== "null" ? parsed.nationality : null,
    occupations: Array.isArray(parsed.occupations)
      ? parsed.occupations.filter((f: unknown): f is string => typeof f === "string")
      : [],
    awards: Array.isArray(parsed.awards)
      ? parsed.awards.filter((f: unknown): f is string => typeof f === "string").slice(0, 5)
      : [],
  }
```

**Step 5: Run existing tests**

```bash
cd server && npx vitest run src/lib/biography-sources/claude-cleanup.test.ts
```

Expected: All existing tests pass (new fields have safe defaults).

**Step 6: Commit**

```bash
git add server/src/lib/biography-sources/types.ts server/src/lib/biography-sources/claude-cleanup.ts
git commit -m "Add SEO fields to BiographyData type and Claude synthesis prompt"
```

---

### Task 3: Update DB Writer

**Files:**
- Modify: `server/src/lib/biography-enrichment-db-writer.ts:50-87` — add new columns to INSERT/UPSERT

**Step 1: Update the upsert SQL**

Add the 5 new columns to the INSERT statement and the ON CONFLICT DO UPDATE clause. Follow the existing COALESCE pattern.

In the INSERT column list, add after `lesser_known_facts`:
```sql
alternate_names, gender, nationality, occupations, awards,
```

In the VALUES, add corresponding `$14, $15, $16, $17, $18` (adjust param numbers).

In the ON CONFLICT DO UPDATE, add:
```sql
alternate_names = COALESCE(EXCLUDED.alternate_names, actor_biography_details.alternate_names),
gender = COALESCE(EXCLUDED.gender, actor_biography_details.gender),
nationality = COALESCE(EXCLUDED.nationality, actor_biography_details.nationality),
occupations = COALESCE(EXCLUDED.occupations, actor_biography_details.occupations),
awards = COALESCE(EXCLUDED.awards, actor_biography_details.awards),
```

In the params array, add:
```typescript
data.alternateNames.length > 0 ? data.alternateNames : null,
data.gender,
data.nationality,
data.occupations.length > 0 ? data.occupations : null,
data.awards.length > 0 ? data.awards : null,
```

**Step 2: Add alternate_names denormalization to actors table**

After the existing `UPDATE actors SET biography = ...` block (line 91-100), add:

```typescript
// Step 3b: Denormalize alternate_names to actors table for search
if (data.alternateNames.length > 0) {
  await db.query(
    `UPDATE actors SET alternate_names = $1 WHERE id = $2`,
    [data.alternateNames, actorId]
  )
}
```

**Step 3: Run tests**

```bash
cd server && npx vitest run src/lib/biography-enrichment-db-writer
```

Expected: Tests pass (or update test mocks to include new fields).

**Step 4: Commit**

```bash
git add server/src/lib/biography-enrichment-db-writer.ts
git commit -m "Write SEO fields to actor_biography_details and denormalize alternate_names"
```

---

### Task 4: Add P742 (Pseudonym) to Wikidata Biography Source

**Files:**
- Modify: `server/src/lib/biography-sources/sources/wikidata.ts:214-250` — add P742 to SPARQL
- Modify: `server/src/lib/biography-sources/sources/wikidata.ts:273-287` — parse pseudonym
- Modify: `server/src/lib/biography-sources/sources/wikidata.ts:296-309` — format pseudonym in output

**Step 1: Add P742 to SPARQL query**

In `buildSparqlQuery`, add to the SELECT clause (after `?awards`):
```sparql
(GROUP_CONCAT(DISTINCT ?pseudonymLabel; SEPARATOR=", ") AS ?pseudonyms)
```

Add to the WHERE clause (after the P166 line):
```sparql
OPTIONAL { ?person wdt:P742 ?pseudonym . ?pseudonym rdfs:label ?pseudonymLabel . FILTER(LANG(?pseudonymLabel) = "en") }
```

Note: P742 values are often literals (not entities), so also add a fallback:
```sparql
OPTIONAL { ?person wdt:P742 ?pseudonymDirect . BIND(STR(?pseudonymDirect) AS ?pseudonymLabel) }
```

Actually, P742 stores string literals directly (not Q-items), so the pattern is simpler:
```sparql
OPTIONAL { ?person wdt:P742 ?pseudonymLabel . }
```

**Step 2: Parse pseudonym in parseResults**

Add to the `ParsedWikidataBio` interface and the return object:
```typescript
pseudonyms: filterValidLabels(binding.pseudonyms?.value),
```

**Step 3: Format in output text**

In `formatBiographyText`, add:
```typescript
if (parsed.pseudonyms) lines.push(`Also known as: ${parsed.pseudonyms}`)
```

**Step 4: Update the WikidataBioBinding interface**

Add `pseudonyms?: { value: string }` to the interface.

**Step 5: Run tests**

```bash
cd server && npx vitest run src/lib/biography-sources/sources/wikidata
```

**Step 6: Commit**

```bash
git add server/src/lib/biography-sources/sources/wikidata.ts
git commit -m "Add P742 (pseudonym) to Wikidata biography SPARQL query"
```

---

### Task 5: Enhance Schema Builders (Client + Server)

**Files:**
- Modify: `src/utils/schema.ts:57-100` — enhance `PersonSchemaInput` and `buildPersonSchema`
- Modify: `src/utils/schema.test.ts` — add tests for new schema fields
- Modify: `server/src/lib/prerender/schema.ts:35-61` — enhance server-side `buildPersonSchema`

**Step 1: Write failing tests for new schema fields**

Add tests in `src/utils/schema.test.ts`:

```typescript
it("includes alternateName when provided", () => {
  const schema = buildPersonSchema(
    { ...baseActor, alternateNames: ["Marion Morrison", "Duke"] },
    "john-wayne"
  )
  expect(schema.alternateName).toEqual(["Marion Morrison", "Duke"])
})

it("includes gender when provided", () => {
  const schema = buildPersonSchema(
    { ...baseActor, gender: "male" },
    "john-wayne"
  )
  expect(schema.gender).toBe("male")
})

it("includes nationality when provided", () => {
  const schema = buildPersonSchema(
    { ...baseActor, nationality: "American" },
    "john-wayne"
  )
  expect(schema.nationality).toBe("American")
})

it("includes hasOccupation when occupations provided", () => {
  const schema = buildPersonSchema(
    { ...baseActor, occupations: ["actor", "politician"] },
    "john-wayne"
  )
  expect(schema.hasOccupation).toEqual([
    { "@type": "Role", roleName: "actor" },
    { "@type": "Role", roleName: "politician" },
  ])
})

it("includes award when awards provided", () => {
  const schema = buildPersonSchema(
    { ...baseActor, awards: ["Academy Award for Best Actor"] },
    "john-wayne"
  )
  expect(schema.award).toEqual(["Academy Award for Best Actor"])
})

it("includes alumniOf when education provided", () => {
  const schema = buildPersonSchema(
    { ...baseActor, education: "University of Southern California" },
    "john-wayne"
  )
  expect(schema.alumniOf).toBe("University of Southern California")
})

it("maps known_for_department to jobTitle", () => {
  const schema = buildPersonSchema(
    { ...baseActor, knownForDepartment: "Directing" },
    "john-wayne"
  )
  expect(schema.jobTitle).toBe("Director")
})

it("omits undefined SEO fields when not provided", () => {
  const schema = buildPersonSchema(baseActor, "john-wayne")
  expect(schema.alternateName).toBeUndefined()
  expect(schema.gender).toBeUndefined()
  expect(schema.nationality).toBeUndefined()
  expect(schema.hasOccupation).toBeUndefined()
  expect(schema.award).toBeUndefined()
  expect(schema.alumniOf).toBeUndefined()
})
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/utils/schema.test.ts
```

Expected: FAIL — new properties not in PersonSchemaInput.

**Step 3: Update PersonSchemaInput and buildPersonSchema**

In `src/utils/schema.ts`, update the interface:

```typescript
interface PersonSchemaInput {
  name: string
  birthday: string | null
  deathday: string | null
  biography: string
  profilePath: string | null
  placeOfBirth: string | null
  tmdbId?: number | null
  causeOfDeath?: string | null
  // SEO enhancement fields
  knownForDepartment?: string | null
  alternateNames?: string[] | null
  gender?: string | null
  nationality?: string | null
  occupations?: string[] | null
  awards?: string[] | null
  education?: string | null
}
```

Add a department-to-title mapping:

```typescript
const DEPARTMENT_TO_TITLE: Record<string, string> = {
  Acting: "Actor",
  Directing: "Director",
  Writing: "Writer",
  Production: "Producer",
  Camera: "Cinematographer",
  Editing: "Editor",
  Sound: "Sound Designer",
  Art: "Art Director",
  "Costume & Make-Up": "Costume Designer",
  "Visual Effects": "VFX Artist",
  Crew: "Crew Member",
}
```

Update `buildPersonSchema`:

```typescript
export function buildPersonSchema(actor: PersonSchemaInput, slug: string): Record<string, unknown> {
  // ... existing sameAs logic ...

  const jobTitle = actor.knownForDepartment
    ? DEPARTMENT_TO_TITLE[actor.knownForDepartment] ?? actor.knownForDepartment
    : "Actor"

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: actor.name,
    jobTitle,
    birthDate: actor.birthday || undefined,
    deathDate: actor.deathday || undefined,
    birthPlace: actor.placeOfBirth || undefined,
    description: actor.biography?.slice(0, 200) || undefined,
    image: actor.profilePath ? `https://image.tmdb.org/t/p/h632${actor.profilePath}` : undefined,
    url: `${BASE_URL}/actor/${slug}`,
    sameAs: sameAs.length > 0 ? sameAs : undefined,
    // SEO enhancement fields
    alternateName: actor.alternateNames?.length ? actor.alternateNames : undefined,
    gender: actor.gender || undefined,
    nationality: actor.nationality || undefined,
    hasOccupation: actor.occupations?.length
      ? actor.occupations.map((o) => ({ "@type": "Role", roleName: o }))
      : undefined,
    award: actor.awards?.length ? actor.awards : undefined,
    alumniOf: actor.education || undefined,
  }

  // ... existing causeOfDeath description logic ...

  return schema
}
```

**Step 4: Update server-side schema builder**

In `server/src/lib/prerender/schema.ts`, update `buildPersonSchema` to accept and emit the same new fields. The server-side version uses snake_case DB column names:

```typescript
export function buildPersonSchema(
  actor: {
    name: string
    birthday: string | null
    deathday: string | null
    profile_path: string | null
    tmdb_id: number | null
    known_for_department?: string | null
    alternate_names?: string[] | null
    gender?: string | null
    nationality?: string | null
    occupations?: string[] | null
    awards?: string[] | null
    education?: string | null
  },
  slug: string
): Record<string, unknown>
```

Apply the same mapping and field additions.

**Step 5: Run tests**

```bash
npx vitest run src/utils/schema.test.ts
```

Expected: All pass.

**Step 6: Commit**

```bash
git add src/utils/schema.ts src/utils/schema.test.ts server/src/lib/prerender/schema.ts
git commit -m "Enhance Person schema with SEO fields (alternateName, gender, nationality, occupation, award)"
```

---

### Task 6: Pass New Fields Through Actor Route

**Files:**
- Modify: `server/src/routes/actor.ts:160-188` — add new columns to biography details query
- Modify: `src/types/actor.ts:104-117` — add new fields to frontend BiographyDetails type

**Step 1: Update biography details SQL query**

In `server/src/routes/actor.ts`, add the new columns to the SELECT:

```sql
SELECT narrative, narrative_confidence,
       life_notable_factors, birthplace_details, family_background,
       education, pre_fame_life, fame_catalyst,
       personal_struggles, relationships, lesser_known_facts,
       alternate_names, gender, nationality, occupations, awards,
       sources
FROM actor_biography_details
WHERE actor_id = $1
```

Update the TypeScript type annotation for the query to include:
```typescript
alternate_names: string[] | null
gender: string | null
nationality: string | null
occupations: string[] | null
awards: string[] | null
```

**Step 2: Map new fields to response**

Ensure the response mapping includes:
```typescript
alternateNames: row.alternate_names ?? [],
gender: row.gender ?? null,
nationality: row.nationality ?? null,
occupations: row.occupations ?? [],
awards: row.awards ?? [],
```

**Step 3: Pass fields to schema builder**

Find where the actor page's schema is built (may be in the route or in the frontend component) and pass the new fields. Check if `buildPersonSchema` is called from the route or from the frontend component — the frontend `ActorPage` likely calls it from `src/utils/schema.ts` via React Helmet.

Find the frontend component that calls `buildPersonSchema` and pass the new fields from `biographyDetails`.

**Step 4: Update frontend BiographyDetails type**

In `src/types/actor.ts`, add to `BiographyDetails`:

```typescript
export interface BiographyDetails {
  // ... existing fields ...
  lesserKnownFacts: string[]
  // SEO fields
  alternateNames: string[]
  gender: string | null
  nationality: string | null
  occupations: string[]
  awards: string[]
  sources: BiographySource[] | null
}
```

**Step 5: Run tests**

```bash
npx vitest run src/routes/actor && npx vitest run src/types/
```

**Step 6: Commit**

```bash
git add server/src/routes/actor.ts src/types/actor.ts
git commit -m "Pass SEO fields through actor route and frontend types"
```

---

### Task 7: Search Enhancement — Alternate Names

**Files:**
- Modify: `server/src/routes/search.ts:143-151` — add alternate_names to search query

**Step 1: Update search SQL**

Change the WHERE clause to also match alternate names:

```sql
SELECT id, name, birthday, deathday, profile_path, tmdb_popularity
FROM actors
WHERE (name ILIKE $1 ESCAPE '\\' OR EXISTS (
  SELECT 1 FROM unnest(alternate_names) AS alt WHERE alt ILIKE $1 ESCAPE '\\'
))
  AND profile_path IS NOT NULL
ORDER BY
  CASE WHEN LOWER(name) = LOWER($2) THEN 0 ELSE 1 END,
  tmdb_popularity DESC NULLS LAST
LIMIT $3
```

Alternatively, for better GIN index performance:

```sql
SELECT id, name, birthday, deathday, profile_path, tmdb_popularity
FROM actors
WHERE (name ILIKE $1 ESCAPE '\\' OR alternate_names::text ILIKE $1 ESCAPE '\\')
  AND profile_path IS NOT NULL
ORDER BY
  CASE WHEN LOWER(name) = LOWER($2) THEN 0 ELSE 1 END,
  tmdb_popularity DESC NULLS LAST
LIMIT $3
```

**Step 2: Add test for alternate name search**

Add a test case in the search test file that verifies an actor can be found by alternate name.

**Step 3: Run tests**

```bash
cd server && npx vitest run src/routes/search
```

**Step 4: Commit**

```bash
git add server/src/routes/search.ts server/src/routes/search.test.ts
git commit -m "Search actors by alternate names"
```

---

### Task 8: Remove BiographyLifeDetails Component

**Files:**
- Delete: `src/components/actor/BiographyLifeDetails.tsx`
- Delete: `src/components/actor/BiographyLifeDetails.test.tsx`
- Modify: `src/components/actor/BiographySection.tsx:5,117-120` — remove import and rendering

**Step 1: Remove from BiographySection**

In `src/components/actor/BiographySection.tsx`:
- Delete line 5: `import BiographyLifeDetails from "./BiographyLifeDetails"`
- Delete lines 117-120: the `{isExpanded && biographyDetails && (` block

**Step 2: Delete the component and test files**

```bash
rm src/components/actor/BiographyLifeDetails.tsx src/components/actor/BiographyLifeDetails.test.tsx
```

**Step 3: Run tests**

```bash
npx vitest run src/components/actor/BiographySection
```

Expected: Tests pass (BiographyLifeDetails integration tests will need to be removed from `BiographySection.test.tsx` if they exist).

**Step 4: Commit**

```bash
git add -A src/components/actor/BiographyLifeDetails.tsx src/components/actor/BiographyLifeDetails.test.tsx src/components/actor/BiographySection.tsx src/components/actor/BiographySection.test.tsx
git commit -m "Remove BiographyLifeDetails component (structured fields used for SEO only)"
```

---

### Task 9: Version Bump + Documentation

**Files:**
- Modify: `server/src/lib/enrichment-version.ts:13` — bump to 6.0.0
- Modify: `docs/biography-system.md` — update to reflect new fields
- Modify: `.claude/rules/biography-enrichment.md` — add new fields to BiographyData table

**Step 1: Bump version**

In `server/src/lib/enrichment-version.ts`:
```typescript
export const BIO_ENRICHMENT_VERSION = "6.0.0"
```

**Step 2: Update test assertions**

Find any tests that assert on `BIO_ENRICHMENT_VERSION` being "5.1.0" and update them.

```bash
cd server && grep -rn "5\.1\.0" src/ --include="*.ts" | grep -i bio
```

**Step 3: Update documentation**

In `docs/biography-system.md`, update the Output Fields table to include:
```markdown
| `alternateNames` | string[] | Stage names, maiden names, nicknames |
| `gender` | string \| null | Gender identity |
| `nationality` | string \| null | Primary nationality |
| `occupations` | string[] | All known occupations |
| `awards` | string[] | Notable awards (max 5) |
```

In `.claude/rules/biography-enrichment.md`, add the new fields to the BiographyData Fields table.

**Step 4: Run all tests**

```bash
npm test -- --run && npm run type-check && npm run lint
```

Expected: All pass.

**Step 5: Commit**

```bash
git add server/src/lib/enrichment-version.ts docs/ .claude/rules/biography-enrichment.md
git commit -m "Bump BIO_ENRICHMENT_VERSION to 6.0.0 and update documentation"
```

---

### Task 10: Final Verification

**Step 1: Run full test suite**

```bash
npm test -- --run
npm run type-check
npm run lint
```

**Step 2: Verify schema output**

If dev server is available, check the JSON-LD output on an actor page by inspecting the `<script type="application/ld+json">` tag. Existing actors without enriched SEO fields should still produce valid schema (new fields are undefined/omitted when not present).

**Step 3: Document re-synthesis command**

To backfill existing enriched actors with the new SEO fields:

```bash
cd server && npx tsx scripts/resynthesize-biographies.ts --version-below 6.0.0 --limit 100 --concurrency 5
```

This re-runs Claude synthesis on cached source data without re-fetching, populating the new fields.
