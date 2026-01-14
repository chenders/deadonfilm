---
globs: ["server/src/lib/claude.ts", "**/wikidata*", "**/wikipedia*"]
---
# Cause of Death Lookup

Priority order (NEVER skip to Wikipedia first):

1. **Claude API** - Most accurate, always try first
2. **Wikidata SPARQL** - Fallback if Claude returns null/vague
3. **Wikipedia text** - Last resort, extract from Death/Personal life sections
