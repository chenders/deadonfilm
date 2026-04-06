# Shared Claude JSON Helper

Extract a shared helper for calling Claude and parsing JSON responses, used by both biography and death enrichment synthesis.

## Problem

Both `biography-sources/claude-cleanup.ts` and `death-sources/claude-cleanup.ts` independently manage: Anthropic SDK calls, text block extraction, markdown fence stripping, and JSON parsing. Neither uses assistant prefill (causing occasional natural-language responses) or `jsonrepair` (causing failures on minor JSON issues). The bio synthesis just had a production failure (run 74, actor 2454 — Vladimir Lenin) where Claude returned "Looking at..." instead of JSON.

## Solution

New shared helper at `server/src/lib/shared/claude-json.ts` that handles the full call-to-JSON pipeline.

### Function Signature

```typescript
import type Anthropic from "@anthropic-ai/sdk"

export async function callClaudeForJson<T = Record<string, unknown>>(
  client: Anthropic,
  options: {
    model: string
    maxTokens: number
    prompt: string
    system?: string
  }
): Promise<{
  data: T | null
  inputTokens: number
  outputTokens: number
  error?: string
}>
```

### Pipeline

1. `client.messages.create()` with messages `[{ role: "user", content: prompt }, { role: "assistant", content: "{" }]` and optional `system`
2. Extract first text block from `response.content` — return `{ data: null, error: "No text response" }` if missing
3. `stripMarkdownCodeFences(text.trim())` — imported from `../claude-batch/response-parser.js`
4. Prepend `{` (from assistant prefill)
5. `jsonrepair()` — fixes trailing commas, unescaped quotes, minor malformations
6. `JSON.parse()` — return `{ data: null, error: "..." }` on failure (never throws)
7. Return `{ data: T, inputTokens, outputTokens }` on success

### Design Decisions

- **Accepts Anthropic client as parameter** — testable (pass a mock), consistent with pool-threading pattern used elsewhere in the codebase
- **Returns raw token counts, not cost** — pricing differs by model and changes over time. Callers compute cost from their own constants.
- **Returns error string, never throws** — callers already handle `{ data: null, error }` pattern. Throwing would require callers to catch and re-wrap.
- **Generic type parameter `<T>`** — callers can type the parsed result (`callClaudeForJson<BiographyData>(...)`) for downstream validation
- **`system` is optional** — neither caller uses it today, but it's a natural Claude API parameter

## Files Changed

| File | Change |
|------|--------|
| `server/src/lib/shared/claude-json.ts` | New shared helper |
| `server/src/lib/shared/claude-json.test.ts` | Tests for all pipeline stages |
| `server/src/lib/biography-sources/claude-cleanup.ts` | Replace SDK call + parsing with `callClaudeForJson()` |
| `server/src/lib/biography-sources/claude-cleanup.test.ts` | Keep mocking Anthropic SDK `messages.create()`; update returned text for assistant-prefill JSON behavior |
| `server/src/lib/death-sources/claude-cleanup.ts` | Replace SDK call + parsing with `callClaudeForJson()` |
| `server/src/lib/death-sources/claude-cleanup.test.ts` | No mock changes needed (tests cover prompt building, not API calls) |

## What Stays in Callers

- Cost computation (each has its own cost-per-million constants)
- New Relic instrumentation (custom events, segments, error tracking)
- Response validation and post-processing (BiographyData fields, ClaudeCleanupResponse fields)
- Prompt construction
- Logging

## Dependencies

- `@anthropic-ai/sdk` — type import for `Anthropic`
- `stripMarkdownCodeFences` from `../claude-batch/response-parser.js` — already exists
- `jsonrepair` from `jsonrepair` package — already a project dependency
