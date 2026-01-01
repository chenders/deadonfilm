---
globs: ["server/migrations/**", "**/*.cjs"]
---
# Database Migrations

The project uses `node-pg-migrate` for database migrations.

## Commands

```bash
cd server
npm run migrate:up      # Run pending migrations
npm run migrate:down    # Rollback last migration
npm run migrate:create -- migration-name  # Create new migration
```

Migration files are stored in `server/migrations/` as CommonJS files.

## JavaScript Files and JSDoc

Some files remain as JavaScript/CommonJS for tooling compatibility:

- **Config files** (`eslint.config.js`, `postcss.config.js`, `tailwind.config.js`)
- **Migration files** (`server/migrations/*.cjs`)
- **New Relic config** (`server/newrelic.cjs`)

All JavaScript files use JSDoc annotations for type safety:

```javascript
// Config files use @type for the default export
/** @type {import('tailwindcss').Config} */
export default {
  // config here gets full autocomplete
}

// Migration files annotate function parameters
/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // pgm methods get full type checking
}
```