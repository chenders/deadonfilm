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

## JavaScript/CommonJS Files

These must remain JS for tooling: `eslint.config.js`, `postcss.config.js`, `tailwind.config.js`, `server/migrations/*.cjs`, `server/newrelic.cjs`

Use JSDoc for types:

```javascript
/** @type {import('tailwindcss').Config} */
export default { /* config */ }

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => { /* migration */ }
```
