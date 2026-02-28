# Create Migration

Create a new database migration with proper naming and validation.

## Arguments

- `$ARGUMENTS` - Migration name in kebab-case (e.g., "add-actor-awards-column")

## Instructions

1. **Validate the migration name**
   - Must be provided (error if empty)
   - Must be kebab-case (lowercase letters, numbers, hyphens only)
   - Must be descriptive of the change (e.g., "add-index-on-actor-popularity", not "update-db")

2. **Create the migration file**
   ```bash
   cd server && npm run migrate:create -- $ARGUMENTS
   ```
   This generates a timestamped `.js` file in `server/migrations/`. Rename it to `.cjs` to match the project convention (most migrations use `.cjs` with CommonJS exports).

3. **Verify no timestamp conflicts**
   ```bash
   ls server/migrations/ | cut -d'_' -f1 | sort | uniq -d
   ```
   This should output nothing. Any output means duplicate timestamps exist.

4. **Rename to `.cjs` and add the template**
   - Find the newly created `.js` file (most recent in `server/migrations/`)
   - Rename it from `.js` to `.cjs`
   - Replace its contents with the CommonJS migration template:

   ```javascript
   /** @param {import('node-pg-migrate').MigrationBuilder} pgm */
   exports.up = (pgm) => {
     // TODO: Add migration logic
   }

   /** @param {import('node-pg-migrate').MigrationBuilder} pgm */
   exports.down = (pgm) => {
     // TODO: Add rollback logic
   }
   ```

5. **Ask the user what the migration should do**
   - Based on their description, implement the `up` and `down` functions
   - Common patterns:
     - `pgm.addColumn('table', { col: { type: 'text', notNull: false } })`
     - `pgm.createIndex('table', 'column')`
     - `pgm.sql('UPDATE ...')`
   - The `down` function must reverse the `up` function exactly

6. **Test the migration**
   ```bash
   cd server && npm run migrate:up
   ```
   - If it fails, fix and retry
   - After success, verify with: `npm run migrate:down` then `npm run migrate:up` again

## Rules

- **CRITICAL**: Never manually set migration timestamps — always use `npm run migrate:create`
- Migration files should be `.cjs` (CommonJS) with `exports.up`/`exports.down` — this is the project convention (a small number of legacy `.js` migrations with ESM exports also exist but `.cjs` is preferred for new migrations)
- Use JSDoc for types (not TypeScript imports)
- Always implement both `up` AND `down`
- The `down` must be a perfect reverse of `up` (drop what was added, restore what was removed)
