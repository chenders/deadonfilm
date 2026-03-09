# Education Institutions Field Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a structured `education_institutions` field (string array of institution names) to the biography enrichment pipeline so schema.org `alumniOf` uses clean institution names instead of narrative text.

**Architecture:** Add `education_institutions` as a new `string[]` field alongside the existing narrative `education` field. Claude synthesis produces both: the narrative for display, the array for structured data. Schema builders use the new array for `alumniOf`, falling back to nothing if empty. The narrative `education` field is unchanged.

**Tech Stack:** PostgreSQL migration, TypeScript types, Claude prompt update, Vitest

---

### Task 1: Database Migration

**Files:**
- Create: `server/migrations/{timestamp}_add-education-institutions.cjs`

**Step 1: Create migration**

Run: `cd server && npm run migrate:create -- add-education-institutions`

**Step 2: Write migration**

```javascript
/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumn("actor_biography_details", {
    education_institutions: { type: "text[]" },
  })
}

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropColumn("actor_biography_details", "education_institutions")
}
```

**Step 3: Run migration locally**

Run: `cd server && npm run migrate:up`
Expected: Migration applies successfully

**Step 4: Commit**

```bash
git add server/migrations/*add-education-institutions*
git commit -m "Add education_institutions column to actor_biography_details"
```

---

### Task 2: Update BiographyData Type and Claude Prompt

**Files:**
- Modify: `server/src/lib/biography-sources/types.ts:190-209` (BiographyData interface)
- Modify: `server/src/lib/biography-sources/claude-cleanup.ts:120-139` (prompt JSON template)
- Modify: `server/src/lib/biography-sources/claude-cleanup.ts:383-417` (parsing logic)

**Step 1: Add field to BiographyData interface**

In `types.ts`, add after the `education` field (line 196):

```typescript
educationInstitutions: string[]
```

**Step 2: Update Claude prompt JSON template**

In `claude-cleanup.ts`, add to the JSON template after the `"education"` line (line 126):

```
  "education_institutions": ["Array of formal institution names only — e.g., 'Harvard University', 'Royal Academy of Dramatic Art'. No descriptions, no narratives. Empty array if no institutions are documented."],
```

**Step 3: Update parsing logic**

In `claude-cleanup.ts`, add after the `education` parsing (around line 392):

```typescript
educationInstitutions: Array.isArray(parsed.education_institutions)
  ? parsed.education_institutions.filter((f: unknown): f is string => typeof f === "string")
  : [],
```

**Step 4: Run type-check**

Run: `npm run type-check`
Expected: Errors in DB writer and other consumers that need the new field — that's expected, we fix those next.

**Step 5: Commit**

```bash
git add server/src/lib/biography-sources/types.ts server/src/lib/biography-sources/claude-cleanup.ts
git commit -m "Add educationInstitutions to BiographyData type and Claude prompt"
```

---

### Task 3: Update DB Writer

**Files:**
- Modify: `server/src/lib/biography-enrichment-db-writer.ts:51-98`

**Step 1: Update the INSERT/UPSERT query**

Add `education_institutions` to the column list (after `education` on line 55), the COALESCE list (after line 66), and the parameter binding (after line 86).

The column list becomes:
```
education, education_institutions, pre_fame_life, ...
```

The COALESCE line:
```sql
education_institutions = COALESCE(EXCLUDED.education_institutions, actor_biography_details.education_institutions),
```

The parameter binding (convert empty array to null for COALESCE):
```typescript
data.educationInstitutions.length > 0 ? data.educationInstitutions : null,
```

Note: Parameter indices ($N) shift by 1 for all parameters after education_institutions. Update the VALUES clause accordingly — there will be 19 parameters total (was 18).

**Step 2: Run type-check**

Run: `npm run type-check`
Expected: Fewer errors now. Remaining errors should be in schema builders and route.

**Step 3: Commit**

```bash
git add server/src/lib/biography-enrichment-db-writer.ts
git commit -m "Write educationInstitutions to actor_biography_details"
```

---

### Task 4: Update Prerender Data Fetcher and Schema Builder (Server-Side)

**Files:**
- Modify: `server/src/lib/prerender/data-fetchers.ts:203-217` (SEO query)
- Modify: `server/src/lib/prerender/schema.ts:51-97` (buildPersonSchema)

**Step 1: Add education_institutions to the prerender SEO query**

In `data-fetchers.ts`, add `education_institutions` to the SELECT and type annotation:

```typescript
const bioSeoRow = await getPool()
  .query<{
    alternate_names: string[] | null
    gender: string | null
    nationality: string | null
    occupations: string[] | null
    awards: string[] | null
    education: string | null
    education_institutions: string[] | null
  }>(
    `SELECT alternate_names, gender, nationality, occupations, awards, education, education_institutions
     FROM actor_biography_details
     WHERE actor_id = $1`,
    [actor.id]
  )
  .then((r) => r.rows[0] ?? null)
```

Add to the `schemaInput` merge (around line 246):

```typescript
education_institutions: bioSeoRow?.education_institutions ?? null,
```

**Step 2: Update server-side buildPersonSchema**

In `schema.ts`, update the input interface to add:

```typescript
education_institutions?: string[] | null
```

Change the `alumniOf` logic (lines 93-95) from:

```typescript
alumniOf: actor.education
  ? { "@type": "EducationalOrganization", name: actor.education }
  : undefined,
```

To:

```typescript
alumniOf: actor.education_institutions?.length
  ? actor.education_institutions.map((name) => ({
      "@type": "EducationalOrganization",
      name,
    }))
  : undefined,
```

This produces an array of `EducationalOrganization` objects (valid schema.org — `alumniOf` accepts arrays). Falls back to `undefined` (omitted from schema) if no institutions are available.

**Step 3: Run type-check**

Run: `npm run type-check`
Expected: Pass or near-pass (client-side schema still needs update).

**Step 4: Commit**

```bash
git add server/src/lib/prerender/data-fetchers.ts server/src/lib/prerender/schema.ts
git commit -m "Use education_institutions for alumniOf in server-side Person schema"
```

---

### Task 5: Update Client-Side Schema Builder and Types

**Files:**
- Modify: `src/utils/schema.ts:56-73` (PersonSchemaInput interface)
- Modify: `src/utils/schema.ts:122-124` (alumniOf logic)
- Modify: `src/types/actor.ts:110` (BiographyDetails interface)
- Modify: `src/pages/ActorPage.tsx:251` (education prop)

**Step 1: Add educationInstitutions to BiographyDetails type**

In `src/types/actor.ts`, add after `education`:

```typescript
educationInstitutions: string[]
```

**Step 2: Update PersonSchemaInput and alumniOf logic**

In `src/utils/schema.ts`, change the `education` field in PersonSchemaInput to `educationInstitutions`:

```typescript
educationInstitutions?: string[] | null
```

Remove the old `education` field from PersonSchemaInput.

Update the `alumniOf` logic (lines 122-124):

```typescript
alumniOf: actor.educationInstitutions?.length
  ? actor.educationInstitutions.map((name) => ({
      "@type": "EducationalOrganization",
      name,
    }))
  : undefined,
```

**Step 3: Update ActorPage.tsx**

In `src/pages/ActorPage.tsx` (around line 251), change:

```typescript
education: data.biographyDetails?.education,
```

To:

```typescript
educationInstitutions: data.biographyDetails?.educationInstitutions,
```

**Step 4: Run type-check**

Run: `npm run type-check`
Expected: Pass

**Step 5: Commit**

```bash
git add src/utils/schema.ts src/types/actor.ts src/pages/ActorPage.tsx
git commit -m "Use educationInstitutions for alumniOf in client-side Person schema"
```

---

### Task 6: Update Actor API Route

**Files:**
- Modify: `server/src/routes/actor.ts:170-313` (biography details query and response)

**Step 1: Add education_institutions to the biography details query**

In the SELECT clause (around line 192), add `education_institutions`:

```sql
SELECT narrative, narrative_confidence,
        life_notable_factors, birthplace_details, family_background,
        education, education_institutions, pre_fame_life, fame_catalyst,
        ...
```

Update the query type annotation to include:

```typescript
education_institutions: string[] | null
```

**Step 2: Add to the response object**

In the `biographyDetails` response mapping (around line 301), add:

```typescript
educationInstitutions: bioRow.education_institutions || [],
```

**Step 3: Run type-check**

Run: `npm run type-check`
Expected: Pass

**Step 4: Commit**

```bash
git add server/src/routes/actor.ts
git commit -m "Return educationInstitutions in actor API response"
```

---

### Task 7: Update Tests

**Files:**
- Modify: `src/utils/schema.test.ts:142-161` (alumniOf tests)
- Modify: `server/src/lib/biography-sources/claude-cleanup.test.ts` (parsing tests)
- Modify: `server/src/lib/biography-enrichment-db-writer.test.ts` (DB writer mock)

**Step 1: Update client-side schema tests**

In `src/utils/schema.test.ts`, update the existing alumniOf tests:

```typescript
it("includes alumniOf as EducationalOrganization array when educationInstitutions provided", () => {
  const result = buildPersonSchema(
    { ...baseActor, educationInstitutions: ["University of Southern California", "Glendale High School"] },
    "john-wayne-4165"
  )
  expect(result.alumniOf).toEqual([
    { "@type": "EducationalOrganization", name: "University of Southern California" },
    { "@type": "EducationalOrganization", name: "Glendale High School" },
  ])
})

it("omits alumniOf when educationInstitutions is null", () => {
  const result = buildPersonSchema({ ...baseActor, educationInstitutions: null }, "john-wayne-4165")
  expect(result.alumniOf).toBeUndefined()
})

it("omits alumniOf when educationInstitutions is empty array", () => {
  const result = buildPersonSchema({ ...baseActor, educationInstitutions: [] }, "john-wayne-4165")
  expect(result.alumniOf).toBeUndefined()
})
```

Remove the old `education`-based alumniOf tests. Update the "omits all SEO fields" test to use `educationInstitutions` instead of `education`.

**Step 2: Update claude-cleanup tests**

Add `educationInstitutions` to mock Claude response fixtures. Verify the parsing extracts the array correctly.

**Step 3: Update DB writer tests**

Add `educationInstitutions: []` to any BiographyData mock objects to satisfy the type.

**Step 4: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/utils/schema.test.ts server/src/lib/biography-sources/claude-cleanup.test.ts server/src/lib/biography-enrichment-db-writer.test.ts
git commit -m "Update tests for educationInstitutions field"
```

---

### Task 8: Clean Up Old Education References in Schema Builders

**Files:**
- Modify: `server/src/lib/prerender/schema.ts` (remove `education` from input interface)
- Modify: `server/src/lib/prerender/data-fetchers.ts` (remove `education` from schemaInput merge)

**Step 1: Remove education from server-side schema builder input**

The server-side `buildPersonSchema` input interface still has `education?: string | null`. Remove it — the schema builder now only uses `education_institutions`. The prerender data fetcher can also stop passing `education` to `schemaInput` (though it still queries it for the SEO query, the schema builder doesn't need it).

Note: Keep `education` in the SQL query since it's still stored and used for display elsewhere. Only remove it from the schema builder's input interface and the `schemaInput` merge object.

**Step 2: Run type-check and tests**

Run: `npm run type-check && npm test`
Expected: Pass

**Step 3: Commit**

```bash
git add server/src/lib/prerender/schema.ts server/src/lib/prerender/data-fetchers.ts
git commit -m "Remove unused education field from schema builder interface"
```

---

### Notes

**Re-enrichment for existing actors:** Existing actors have `education_institutions = NULL`. They'll get populated on the next re-enrichment run since the Claude prompt now asks for the field. No backfill migration is needed — `alumniOf` will simply be omitted from the schema until an actor is re-enriched (same as any actor without the field).

**The narrative `education` field is untouched** — it continues to work for display in biographies and golden test scoring. This change only affects the schema.org structured data output.

**schema.org compliance:** `alumniOf` accepts either a single `EducationalOrganization` or an array. We use an array since actors may attend multiple institutions.
