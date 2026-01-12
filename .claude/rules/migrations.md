---
globs: ["server/migrations/**", "**/*.cjs"]
---
# Database Migrations

This project uses `node-pg-migrate` for database migrations.

## Commands

```bash
cd server
npm run migrate:up                        # Run pending migrations
npm run migrate:down                      # Rollback last migration
npm run migrate:create -- migration-name  # Create new migration
```

Migration files location: `server/migrations/*.cjs`

---

## JavaScript/CommonJS Files

Some files MUST remain as JavaScript/CommonJS for tooling compatibility:

| File Type | Examples |
|-----------|----------|
| Config files | `eslint.config.js`, `postcss.config.js`, `tailwind.config.js` |
| Migrations | `server/migrations/*.cjs` |
| New Relic | `server/newrelic.cjs` |

## JSDoc Type Annotations

All JavaScript files MUST use JSDoc annotations for type safety:

```javascript
// Config files - use @type for the default export
/** @type {import('tailwindcss').Config} */
export default {
  // Full autocomplete available
}

// Migration files - annotate function parameters
/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Full type checking on pgm methods
}
```