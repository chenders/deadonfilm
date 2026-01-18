---
globs: ["server/migrations/**", "**/*.cjs"]
---
# Database Migrations

Uses `node-pg-migrate`. Files: `server/migrations/*.cjs`

```bash
cd server
npm run migrate:up                        # Run pending
npm run migrate:down                      # Rollback last
npm run migrate:create -- migration-name  # Create new
```

## Migration Timestamps

**CRITICAL: Never reuse or manually set migration timestamps.**

Migration files are named `{timestamp}_{name}.cjs`. The timestamp determines execution order.

```bash
# ALWAYS use this command to create migrations - it generates a unique timestamp
npm run migrate:create -- migration-name

# NEVER manually create migration files with hardcoded timestamps
```

**Why this matters:** If two migrations share the same timestamp prefix and one has already run in production, node-pg-migrate will reject the new migration if it sorts alphabetically before the existing one.

Before committing a new migration, verify no timestamp conflicts:
```bash
ls server/migrations/ | cut -d'_' -f1 | sort | uniq -d
# Should output nothing - any output means duplicate timestamps exist
```

## JavaScript/CommonJS Files

These must remain JS for tooling: `eslint.config.js`, `postcss.config.js`, `tailwind.config.js`, `server/migrations/*.cjs`, `server/newrelic.cjs`

Use JSDoc for types:

```javascript
/** @type {import('tailwindcss').Config} */
export default { /* config */ }

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => { /* migration */ }
```
