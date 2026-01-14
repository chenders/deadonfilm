---
globs: ["server/src/lib/claude.ts", "**/wikidata*", "**/wikipedia*"]
---
# Cause of Death Lookup

## Priority Order

| Priority | Source | When |
|----------|--------|------|
| 1 | **Claude API** | ALWAYS try first |
| 2 | Wikidata SPARQL | Only if Claude returns null/vague |
| 3 | Wikipedia text | Last resort - extract from Death/Personal sections |

**NEVER use Wikipedia first.** Claude API must always be tried first.
