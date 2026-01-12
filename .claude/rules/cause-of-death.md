---
globs: ["server/src/lib/claude.ts", "**/wikidata*", "**/wikipedia*"]
---
# Cause of Death Lookup

## Lookup Priority Order

You MUST try data sources in this exact order:

| Priority | Source | When to Use |
|----------|--------|-------------|
| 1 | **Claude API** | ALWAYS try first - most accurate |
| 2 | Wikidata SPARQL | Only if Claude returns null or vague answer |
| 3 | Wikipedia text | Last resort - extract from Death/Personal life sections or infobox |

**IMPORTANT**: NEVER use Wikipedia as the first method. Claude API must always be tried first.