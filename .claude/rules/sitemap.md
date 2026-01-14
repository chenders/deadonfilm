---
globs: ["server/src/routes/sitemap.ts", "server/src/lib/slug-utils.ts"]
---
# Sitemap Updates

When adding pages/routes, update `server/src/routes/sitemap.ts`:

- **Static pages**: Add to `staticPages` array
- **Dynamic pages**: Add query + loop to generate URLs
- **New slug types**: Add function to `server/src/lib/slug-utils.ts`
