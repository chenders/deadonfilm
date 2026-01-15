---
globs: ["**/*.ts", "**/*.tsx"]
---
# Security Best Practices

## HTML Sanitization

When stripping HTML tags from external content (scraping, API responses), simple regex like `/<[^>]+>/g` is **insufficient**. It fails on:
- Malformed tags: `<script` (no closing `>`)
- Tags with spaces: `</script >`
- Nested/repeated patterns

**Correct approach - iterative removal:**

```typescript
function stripHtmlTags(html: string): string {
  let result = html
  let previousLength: number
  do {
    previousLength = result.length
    result = result.replace(/<[^>]*>/g, "")
  } while (result.length < previousLength)
  // Remove any remaining angle brackets from incomplete tags
  return result.replace(/[<>]/g, "")
}
```

## HTML Entity Decoding

Use the `he` library for robust HTML entity handling. Never write custom entity decoding.

```typescript
import he from "he"

// Decode entities
const text = he.decode("&lt;script&gt;") // "<script>"

// Encode for HTML output
const safe = he.escape("<script>") // "&lt;script&gt;"
```

**Shared utility:** Use `decodeHtmlEntities()` from `server/src/lib/death-sources/html-utils.ts`

## Regex Safety

### Escape User Input in RegExp

Never construct RegExp from unescaped user input:

```typescript
// WRONG - special chars break regex
const pattern = new RegExp(actorName)

// CORRECT - escape special characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")
}
const pattern = new RegExp(escapeRegex(actorName))
```

### Avoid Catastrophic Backtracking

Patterns with nested quantifiers can cause ReDoS:

```typescript
// DANGEROUS - exponential backtracking
/(\w+)*$/
/(a+)+b/
/([a-zA-Z]+)*,/

// SAFER - remove nested quantifiers, use single-level repetition
/^\w*$/                           // instead of /(\w+)*$/
/^a+b$/                           // instead of /(a+)+b/
/^[a-zA-Z]+(?:,[a-zA-Z]+)*,$/     // instead of /([a-zA-Z]+)*,/
```

## SPARQL String Escaping

When building SPARQL queries, escape backslashes AND quotes:

```typescript
function escapeSparql(str: string): string {
  return str
    .replace(/\\/g, "\\\\")  // Backslashes first
    .replace(/"/g, '\\"')     // Then quotes
}
```

## Cross-Platform File Paths

Use `fileURLToPath` for cross-platform compatibility:

```typescript
// WRONG - fails on Windows (returns /C:/...)
const dir = new URL(".", import.meta.url).pathname

// CORRECT - works everywhere
import { fileURLToPath } from "url"
import { dirname } from "path"
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
```
