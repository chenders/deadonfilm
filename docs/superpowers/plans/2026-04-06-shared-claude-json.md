# Shared Claude JSON Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a shared helper for calling Claude and parsing JSON responses, replacing duplicated SDK+parsing code in both enrichment systems with a single reliable pipeline that includes assistant prefill and jsonrepair.

**Architecture:** New `callClaudeForJson()` in `server/src/lib/shared/claude-json.ts` handles Anthropic SDK call with `{` prefill, text extraction, fence stripping, jsonrepair, and JSON.parse. Both `biography-sources/claude-cleanup.ts` and `death-sources/claude-cleanup.ts` call it instead of managing their own pipelines. Callers keep cost computation, New Relic instrumentation, and domain-specific validation.

**Tech Stack:** TypeScript, @anthropic-ai/sdk, jsonrepair, vitest

---

### Task 1: Create shared claude-json helper with tests

**Files:**
- Create: `server/src/lib/shared/claude-json.ts`
- Create: `server/src/lib/shared/claude-json.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/src/lib/shared/claude-json.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest"
import { callClaudeForJson } from "./claude-json.js"

// Minimal mock Anthropic client
function mockClient(textResponse: string, tokens?: { input?: number; output?: number }) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: textResponse }],
        usage: {
          input_tokens: tokens?.input ?? 100,
          output_tokens: tokens?.output ?? 50,
        },
      }),
    },
  } as any
}

function mockClientNoText() {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "image", source: {} }],
        usage: { input_tokens: 100, output_tokens: 0 },
      }),
    },
  } as any
}

function mockClientError(error: Error) {
  return {
    messages: {
      create: vi.fn().mockRejectedValue(error),
    },
  } as any
}

describe("callClaudeForJson", () => {
  const opts = { model: "claude-sonnet-4-20250514", maxTokens: 1024, prompt: "Return JSON" }

  it("parses valid JSON response (prefill prepends opening brace)", async () => {
    // Claude's response omits the leading { because assistant prefill provides it
    const client = mockClient('"name": "John", "age": 30}')
    const result = await callClaudeForJson(client, opts)

    expect(result.data).toEqual({ name: "John", age: 30 })
    expect(result.error).toBeUndefined()
    expect(result.inputTokens).toBe(100)
    expect(result.outputTokens).toBe(50)
  })

  it("sends assistant prefill in messages", async () => {
    const client = mockClient('"ok": true}')
    await callClaudeForJson(client, opts)

    const call = client.messages.create.mock.calls[0][0]
    expect(call.messages).toEqual([
      { role: "user", content: "Return JSON" },
      { role: "assistant", content: "{" },
    ])
    expect(call.model).toBe("claude-sonnet-4-20250514")
    expect(call.max_tokens).toBe(1024)
  })

  it("passes system parameter when provided", async () => {
    const client = mockClient('"ok": true}')
    await callClaudeForJson(client, { ...opts, system: "You are a JSON bot" })

    const call = client.messages.create.mock.calls[0][0]
    expect(call.system).toBe("You are a JSON bot")
  })

  it("omits system parameter when not provided", async () => {
    const client = mockClient('"ok": true}')
    await callClaudeForJson(client, opts)

    const call = client.messages.create.mock.calls[0][0]
    expect(call.system).toBeUndefined()
  })

  it("strips markdown code fences before parsing", async () => {
    // Response wrapped in fences, without leading { (prefill provides it)
    const client = mockClient('```json\n"narrative": "test"}\n```')
    const result = await callClaudeForJson(client, opts)

    expect(result.data).toEqual({ narrative: "test" })
    expect(result.error).toBeUndefined()
  })

  it("repairs minor JSON issues via jsonrepair", async () => {
    // Trailing comma — invalid JSON but fixable by jsonrepair
    const client = mockClient('"name": "John", "age": 30,}')
    const result = await callClaudeForJson(client, opts)

    expect(result.data).toEqual({ name: "John", age: 30 })
    expect(result.error).toBeUndefined()
  })

  it("returns error when no text block in response", async () => {
    const client = mockClientNoText()
    const result = await callClaudeForJson(client, opts)

    expect(result.data).toBeNull()
    expect(result.error).toBe("No text response from Claude")
    expect(result.inputTokens).toBe(100)
    expect(result.outputTokens).toBe(0)
  })

  it("returns error when response is completely unparseable", async () => {
    const client = mockClient("Looking at the sources, I can see that...")
    const result = await callClaudeForJson(client, opts)

    expect(result.data).toBeNull()
    expect(result.error).toContain("Failed to parse")
    expect(result.inputTokens).toBe(100)
    expect(result.outputTokens).toBe(50)
  })

  it("returns error when API call fails", async () => {
    const client = mockClientError(new Error("Rate limit exceeded"))
    const result = await callClaudeForJson(client, opts)

    expect(result.data).toBeNull()
    expect(result.error).toBe("Claude API error: Rate limit exceeded")
    expect(result.inputTokens).toBe(0)
    expect(result.outputTokens).toBe(0)
  })

  it("returns token counts from response usage", async () => {
    const client = mockClient('"ok": true}', { input: 3000, output: 1200 })
    const result = await callClaudeForJson(client, opts)

    expect(result.inputTokens).toBe(3000)
    expect(result.outputTokens).toBe(1200)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/lib/shared/claude-json.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the helper**

Create `server/src/lib/shared/claude-json.ts`:

```typescript
/**
 * Shared helper for calling Claude and parsing JSON responses.
 *
 * Handles the full pipeline: API call with assistant prefill, text extraction,
 * markdown fence stripping, jsonrepair, and JSON.parse. Used by both biography
 * and death enrichment synthesis.
 *
 * Never throws — returns { data: null, error } on failure.
 */

import type Anthropic from "@anthropic-ai/sdk"
import { stripMarkdownCodeFences } from "../claude-batch/response-parser.js"
import { jsonrepair } from "jsonrepair"

export interface ClaudeJsonResult<T> {
  data: T | null
  inputTokens: number
  outputTokens: number
  error?: string
}

export async function callClaudeForJson<T = Record<string, unknown>>(
  client: Anthropic,
  options: {
    model: string
    maxTokens: number
    prompt: string
    system?: string
  }
): Promise<ClaudeJsonResult<T>> {
  const { model, maxTokens, prompt, system } = options

  // Call Claude with assistant prefill to force JSON output
  let response: Anthropic.Message
  try {
    response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "user", content: prompt },
        { role: "assistant", content: "{" },
      ],
      ...(system !== undefined && { system }),
    })
  } catch (error) {
    return {
      data: null,
      inputTokens: 0,
      outputTokens: 0,
      error: `Claude API error: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }

  const inputTokens = response.usage.input_tokens
  const outputTokens = response.usage.output_tokens

  // Extract text block
  const textBlock = response.content.find((block) => block.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    return {
      data: null,
      inputTokens,
      outputTokens,
      error: "No text response from Claude",
    }
  }

  // Parse JSON: strip fences, prepend { from prefill, repair, parse
  try {
    const stripped = stripMarkdownCodeFences(textBlock.text.trim())
    const withBrace = "{" + stripped
    const repaired = jsonrepair(withBrace)
    const parsed = JSON.parse(repaired) as T
    return { data: parsed, inputTokens, outputTokens }
  } catch (error) {
    return {
      data: null,
      inputTokens,
      outputTokens,
      error: `Failed to parse Claude response as JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/lib/shared/claude-json.test.ts`
Expected: PASS — all 9 tests

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/shared/claude-json.ts server/src/lib/shared/claude-json.test.ts
git commit -m "Add shared callClaudeForJson helper

Handles the full Claude-to-JSON pipeline: API call with assistant
prefill '{', text extraction, markdown fence stripping, jsonrepair,
and JSON.parse. Never throws — returns error string on failure.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Update biography synthesis to use shared helper

**Files:**
- Modify: `server/src/lib/biography-sources/claude-cleanup.ts`
- Modify: `server/src/lib/biography-sources/claude-cleanup.test.ts`

- [ ] **Step 1: Update claude-cleanup.ts**

In `server/src/lib/biography-sources/claude-cleanup.ts`:

1. Add import at top:
```typescript
import { callClaudeForJson } from "../shared/claude-json.js"
```

2. Remove the now-unused import of `stripMarkdownCodeFences`:
```typescript
// REMOVE: import { stripMarkdownCodeFences } from "../claude-batch/response-parser.js"
```

3. Remove the `new Anthropic()` creation and inline API call. Replace the block from `let response: Anthropic.Message` through the JSON parsing `catch` block (approximately lines 284-370) with:

```typescript
  const anthropic = new Anthropic()

  // Call Claude via shared helper (handles prefill, fence stripping, jsonrepair)
  const claudeResult = await newrelic.startSegment("BioClaudeAPI", true, async () => {
    return callClaudeForJson<Record<string, unknown>>(anthropic, {
      model,
      maxTokens: MAX_TOKENS,
      prompt,
    })
  })

  const { inputTokens, outputTokens } = claudeResult
  const costUsd =
    (inputTokens * INPUT_COST_PER_MILLION) / 1_000_000 +
    (outputTokens * OUTPUT_COST_PER_MILLION) / 1_000_000

  // Record Claude API call in New Relic
  newrelic.recordCustomEvent("BioClaudeAPICall", {
    actorId: actor.id,
    actorName: actor.name,
    model,
    inputTokens,
    outputTokens,
    costUsd,
    purpose: "biography_synthesis",
  })

  if (claudeResult.error || !claudeResult.data) {
    if (claudeResult.error) {
      newrelic.recordCustomEvent("BioClaudeParseError", {
        actorId: actor.id,
        actorName: actor.name,
        error: claudeResult.error,
      })
    }
    return {
      data: null,
      costUsd,
      model,
      inputTokens,
      outputTokens,
      error: claudeResult.error ?? "No data from Claude",
    }
  }

  const parsed = claudeResult.data
```

After this point, the existing code continues with `parsed` to validate `life_notable_factors`, build the `BiographyData` object, etc. That code stays as-is.

4. Keep the `Anthropic` import (still needed for `new Anthropic()`) but it can now be a type import if the constructor call is the only usage. Actually, keep it as a value import since we call `new Anthropic()`.

- [ ] **Step 2: Update claude-cleanup.test.ts**

The test file mocks `@anthropic-ai/sdk` and provides responses via `mockCreate`. Since we now call `callClaudeForJson` which calls `client.messages.create` internally, and `synthesizeBiography` creates `new Anthropic()` which uses the mocked SDK, the existing mock pattern should still work — the mock SDK creates the mock client, and `callClaudeForJson` calls `create` on it.

However, the response format changes because `callClaudeForJson` handles the prefill internally. The mock responses no longer need to account for the prefill — `callClaudeForJson` prepends `{` itself.

Update the `makeMockApiResponse` function to return full JSON (revert the `slice(1)` that was added for the prefill):

```typescript
function makeMockApiResponse(
  jsonData: Record<string, unknown>,
  tokenOverrides?: { input?: number; output?: number }
) {
  // callClaudeForJson prepends "{" from assistant prefill,
  // so the mock response should be the JSON without the leading brace
  const fullJson = JSON.stringify(jsonData)
  return {
    content: [
      {
        type: "text" as const,
        text: fullJson.slice(1),
      },
    ],
    usage: {
      input_tokens: tokenOverrides?.input ?? 2000,
      output_tokens: tokenOverrides?.output ?? 800,
    },
  }
}
```

Wait — this is actually the same as what's already there after the earlier prefill change. The `makeMockApiResponse` already slices off the leading `{`. So no change needed here.

Update the markdown fence test — it currently strips the brace from the fenced content. Since `callClaudeForJson` handles fences + prepend internally, the mock should provide fenced content without the leading `{`:

The existing test already has this:
```typescript
const jsonWithoutBrace = JSON.stringify(validResponse).slice(1)
mockCreate.mockResolvedValue(
  makeMockApiResponseRaw("```json\n" + jsonWithoutBrace + "\n```")
)
```

This should still work since `callClaudeForJson` strips fences, then prepends `{`.

Run the tests to verify nothing broke.

- [ ] **Step 3: Run tests**

Run: `cd server && npx vitest run src/lib/biography-sources/claude-cleanup.test.ts`
Expected: PASS — all 48 tests

- [ ] **Step 4: Commit**

```bash
git add server/src/lib/biography-sources/claude-cleanup.ts server/src/lib/biography-sources/claude-cleanup.test.ts
git commit -m "Update bio synthesis to use shared callClaudeForJson

Replaces inline Anthropic SDK call, text extraction, fence stripping,
and JSON parsing with single callClaudeForJson() call. Adds jsonrepair
as a parsing fallback. Keeps cost computation and New Relic instrumentation.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Update death enrichment synthesis to use shared helper

**Files:**
- Modify: `server/src/lib/death-sources/claude-cleanup.ts`

- [ ] **Step 1: Update claude-cleanup.ts**

In `server/src/lib/death-sources/claude-cleanup.ts`:

1. Add import at top:
```typescript
import { callClaudeForJson } from "../shared/claude-json.js"
```

2. Remove the now-unused import of `stripMarkdownCodeFences`:
```typescript
// REMOVE: import { stripMarkdownCodeFences } from "../claude-batch/response-parser.js"
```

3. In the `cleanupWithClaude` function, replace the block from `const response = await anthropic.messages.create(...)` through the JSON parsing `catch` block (approximately lines 355-419) with:

```typescript
  const claudeResult = await callClaudeForJson<ClaudeCleanupResponse>(anthropic, {
    model: MODEL_ID,
    maxTokens: MAX_TOKENS,
    prompt,
  })

  const inputTokens = claudeResult.inputTokens
  const outputTokens = claudeResult.outputTokens
  const costUsd =
    (inputTokens * INPUT_COST_PER_MILLION) / 1_000_000 +
    (outputTokens * OUTPUT_COST_PER_MILLION) / 1_000_000

  // Extract text content for logging (reconstruct from parsed data or empty)
  const responseText = claudeResult.data ? JSON.stringify(claudeResult.data) : ""

  // Log the response
  logger.logClaudeCleanupResponse(
    actor.id,
    actor.name,
    inputTokens,
    outputTokens,
    costUsd,
    responseText
  )

  console.log(
    `  Claude cleanup complete: ${inputTokens} input, ${outputTokens} output tokens ($${costUsd.toFixed(4)})`
  )

  // Record Claude API call in New Relic
  newrelic.recordCustomEvent("ClaudeAPICall", {
    actorId: actor.id,
    actorName: actor.name,
    model: MODEL_ID,
    inputTokens,
    outputTokens,
    costUsd,
    purpose: "death_cleanup",
  })

  if (claudeResult.error || !claudeResult.data) {
    const errorMsg = claudeResult.error ?? "No data from Claude"
    console.error(`JSON parse error for ${actor.name}: ${errorMsg}`)
    throw new Error(`Failed to parse Claude response: ${errorMsg}`)
  }

  const parsed = claudeResult.data
```

Note: The death cleanup throws on errors (unlike bio which returns `{ error }`). Keep this behavior — the caller (`enrichment-runner.ts`) catches and handles the throw.

4. Keep `new Anthropic()` — it's still created earlier in the function (line 338). Keep the `Anthropic` import as a value import.

- [ ] **Step 2: Run death cleanup tests**

Run: `cd server && npx vitest run src/lib/death-sources/claude-cleanup.test.ts`
Expected: PASS — the death cleanup tests only test `buildCleanupPrompt`, `estimateCleanupCost`, `VALID_NOTABLE_FACTORS`, and `isViolentDeath`. They don't mock the Anthropic SDK or test `cleanupWithClaude` directly, so no mock updates needed.

- [ ] **Step 3: Run type check**

Run: `cd server && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/src/lib/death-sources/claude-cleanup.ts
git commit -m "Update death synthesis to use shared callClaudeForJson

Replaces inline Anthropic SDK call, text extraction, fence stripping,
and JSON parsing with callClaudeForJson(). Adds assistant prefill and
jsonrepair — both were missing from death enrichment. Keeps throw-on-error
behavior for the death enrichment caller.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Full verification

- [ ] **Step 1: Run all tests**

Run: `npm test && cd server && npm test`
Expected: All tests pass

- [ ] **Step 2: Run type checks**

Run: `npm run type-check && cd server && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No new errors

- [ ] **Step 4: Commit any remaining changes**

If lint-staged or formatting produced changes:

```bash
git add -A && git commit -m "Final formatting fixes

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
