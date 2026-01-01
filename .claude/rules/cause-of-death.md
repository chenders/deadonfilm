---
globs: ["server/src/lib/claude.ts", "**/wikidata*", "**/wikipedia*"]
---
# Cause of Death Lookup Priority

When looking up cause of death for deceased actors, the priority order is:

1. **Claude API (primary)** - Most accurate, should always be tried first
2. **Wikidata SPARQL (fallback)** - Only if Claude returns null or a vague answer
3. **Wikipedia article text (last resort)** - Extract from Death sections, Personal life, or infobox

Wikipedia should NEVER be the first method used. Claude should always be tried first.