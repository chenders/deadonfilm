---
globs: ["server/src/routes/sitemap.ts", "server/src/lib/slug-utils.ts"]
---
# Sitemap Updates

When adding new pages/routes, update the sitemap:

| Page Type | Action |
|-----------|--------|
| Static (discovery, landing) | Add to `staticPages` in `server/src/routes/sitemap.ts` |
| Dynamic (movie/show/actor) | Add query + loop in `server/src/routes/sitemap.ts` |
| New slug type | Add function to `server/src/lib/slug-utils.ts` |
