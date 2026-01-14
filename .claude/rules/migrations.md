---
globs: ["server/migrations/**", "**/*.cjs", "*.config.js"]
---
# Database Migrations & JavaScript Files

## Migration Commands

```bash
cd server
npm run migrate:up                        # Run pending
npm run migrate:down                      # Rollback last
npm run migrate:create -- migration-name  # Create new
```

Files: `server/migrations/*.cjs`

## JavaScript/CommonJS Files

These files MUST remain JS/CJS for tooling compatibility:

- Config: `eslint.config.js`, `postcss.config.js`, `tailwind.config.js`
- Migrations: `server/migrations/*.cjs`
- New Relic: `server/newrelic.cjs`

## JSDoc Type Annotations Required

```javascript
// Config files
/** @type {import('tailwindcss').Config} */
export default { /* config */ }

// Migrations
/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => { /* migration */ }
```
