# Deadonfilm: Consolidate on Claude (Remove Gemini)

## Context

Deadonfilm currently uses two AI providers:

- **Anthropic Claude**: Haiku for death section filtering, Opus for death/biography cleanup synthesis
- **Google Gemini**: Flash for date extraction + biography section filtering, Flash + Pro as research sources in the death pipeline

This plan replaces all Gemini usage with Claude equivalents, reducing to a single API key (`ANTHROPIC_API_KEY`) and a single SDK dependency.

## Current Gemini Usage (5 systems)

### 1. Wikipedia Date Extraction (`wikipedia-date-extractor.ts`)

- **Model**: Gemini 2.0 Flash via REST API
- **Purpose**: Extract birth/death years from Wikipedia intro text to validate person identity
- **Used by**: `person-validator.ts` → both death and biography adapters
- **Fallback**: Regex-based date extraction (already implemented)
- **Cost**: ~$0.0001/call

### 2. Wikipedia Section Selection — Biography (`biography-sources/wikipedia-section-selector.ts`)

- **Model**: Gemini 2.0 Flash via REST API
- **Purpose**: Select biography-relevant Wikipedia sections
- **Fallback**: Regex pattern matching (include/exclude lists, already implemented)
- **Status**: Used in biography adapter
- **Cost**: ~$0.0001/call

### 3. Wikipedia Section Selection — Death (`death-sources/wikipedia-section-selector.ts`)

- **Model**: Gemini 2.0 Flash via REST API
- **Purpose**: Select death/health-relevant Wikipedia sections
- **Status**: **ALREADY REPLACED** by `haiku-section-selector.ts` (Claude Haiku 4.5)
- **Action**: Delete file — it's dead code

### 4. GeminiFlashSource (`death-sources/ai-providers/gemini.ts`)

- **Model**: Gemini 2.0 Flash via REST API
- **Purpose**: Full research source in Phase 8 (AI Models). Generates death findings from AI knowledge, no search grounding
- **Reliability tier**: AI_MODEL (0.55)
- **Cost**: ~$0.0001/query
- **Position**: First in sequential Phase 8 (cheapest-first ordering)

### 5. GeminiProSource (`death-sources/ai-providers/gemini.ts`)

- **Model**: Gemini 2.5 Flash via REST API
- **Purpose**: Full research source with **Google Search grounding** — generates death findings backed by web citations
- **Reliability tier**: AI_MODEL (0.55)
- **Cost**: ~$0.002/query
- **Feature**: Extracts grounding URLs from Gemini's search results, resolves Google redirect URLs
- **Position**: Mid-tier in sequential Phase 8

## Migration Plan

### Phase 1: Replace date extraction with Claude Haiku (Low effort)

**Files to modify:**

- `server/src/lib/death-sources/wikipedia-date-extractor.ts` — Replace Gemini REST call with Anthropic SDK call using Haiku 4.5. Same prompt, same response parsing, same regex fallback. The function signature stays identical: `extractDatesWithAI(actorName, introText) → DateExtractionResult`

**Approach:**

```typescript
// Before: raw fetch to generativelanguage.googleapis.com
// After: Anthropic SDK
import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic()
const response = await client.messages.create({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 256,
  system: "Extract birth and death years from this Wikipedia introduction...",
  messages: [{ role: "user", content: `Person: ${actorName}\n\nText: ${introText}` }],
})
```

**Risk**: Minimal. The extraction task is trivial for Haiku. Regex fallback exists. No behavioral change for callers.

### Phase 2: Replace biography section selector with `@debriefer/ai` (Low effort)

**Files to modify:**

- `server/src/lib/biography-sources/debriefer/adapter.ts` — Use `createAIDefaults({ researchGoal: "Find biographical information: early life, personal life, education, family, childhood" }).sectionFilter` instead of the custom Gemini-based `selectBiographySections()`

**Files to delete:**

- `server/src/lib/biography-sources/wikipedia-section-selector.ts` — Replaced by `@debriefer/ai`
- `server/src/lib/biography-sources/wikipedia-section-selector.test.ts`

**Risk**: Low. The `@debriefer/ai` section filter has the same fallback behavior (returns all sections on failure). Needs prompt quality validation — run on 50 subjects and compare selected sections.

### Phase 3: Delete dead code (Zero effort)

**Files to delete:**

- `server/src/lib/death-sources/wikipedia-section-selector.ts` — Already replaced by `haiku-section-selector.ts`
- `server/src/lib/death-sources/wikipedia-section-selector.test.ts`

### Phase 4: Replace GeminiFlashSource with ClaudeHaikuSource (Medium effort)

**Files to modify:**

- `server/src/lib/death-sources/ai-providers/` — Create `claude-haiku.ts` that extends `BaseDataSource` (or `BaseResearchSource` via `LegacySourceAdapter`). Uses the same `buildEnrichedDeathPrompt()` from `shared-prompt.ts` and `parseEnrichedResponse()`. Same interface, different model.

**Key details:**

- Reuse the existing `shared-prompt.ts` infrastructure — the prompts are provider-agnostic
- Set `reliabilityTier: AI_MODEL` (0.55), same as Gemini
- Cost: Haiku is ~$0.0001/query (same as Gemini Flash)
- Slot into Phase 8 sequential ordering in the same position

**Risk**: Low. The prompt and response format are already provider-agnostic via `shared-prompt.ts`. The `parseEnrichedResponse()` function handles JSON extraction.

### Phase 5: Handle GeminiProSource search grounding (Decision required)

GeminiProSource uses Gemini's built-in **Google Search grounding** — a Gemini-specific feature that Claude does not have. This source returns AI-generated text backed by web citations that Gemini found via search.

**Options:**

#### Option A: Drop it (Recommended)

The death pipeline already has dedicated web search sources (Google Search, Bing, DuckDuckGo, Brave) that fetch real web pages with higher reliability scores (SEARCH_AGGREGATOR: 0.7). GeminiProSource at AI_MODEL reliability (0.55) is strictly lower quality than these.

The unique value of GeminiProSource is that it combines search + synthesis in one call. But the pipeline already does this: web search sources find pages → orchestrator collects findings → Claude Opus synthesizes. The two-step approach produces higher reliability scores.

**Action**: Remove GeminiProSource from Phase 8. No replacement needed.

#### Option B: Replace with Claude + tool use

Create a Claude source that uses tool use to call a search API, then synthesizes results. This replicates the grounding behavior but with Claude.

**Action**: Build `ClaudeSearchSource` that calls Haiku with a web search tool. More complex, and the reliability tier would still be AI_MODEL (0.55).

**Recommendation**: Option A. The search grounding was valuable when deadonfilm had fewer web search sources. With 4+ web search sources in the pipeline, the marginal value of another search-grounded AI source is low.

### Phase 6: Clean up environment and types (Low effort)

**Files to modify:**

- `server/.env.example` — Remove `GOOGLE_AI_API_KEY` documentation
- `server/src/lib/death-sources/types.ts` — Remove `GEMINI_PRO`, `GEMINI_FLASH`, `GEMINI_SECTION_SELECTOR`, `GEMINI_DATE_EXTRACTOR` enum values (mark deprecated first if concerned about DB references)
- `server/src/lib/biography-sources/types.ts` — Remove `GEMINI_BIO`, `GEMINI_BIO_SECTION_SELECTOR` enum values

**Files to delete:**

- `server/src/lib/death-sources/ai-providers/gemini.ts`
- `server/src/lib/death-sources/ai-providers/gemini.test.ts`

**Risk**: Check if any database records reference the removed enum values. If historical records use `gemini_pro` or `gemini_flash` as source type strings, the enum values should be kept for deserialization but removed from active source registration.

## Dependency Changes

### Before

```
deadonfilm dependencies:
  @anthropic-ai/sdk    — for Haiku section filter + Opus cleanup
  (raw fetch)          — for Gemini Flash/Pro
  ANTHROPIC_API_KEY    — required
  GOOGLE_AI_API_KEY    — required
```

### After

```
deadonfilm dependencies:
  @anthropic-ai/sdk    — for all AI tasks
  @debriefer/ai        — for createAIDefaults() callbacks (NEW)
  debriefer            — >=1.0.0 (bumped from ^1.0.1)
  ANTHROPIC_API_KEY    — required
  (GOOGLE_AI_API_KEY)  — removed
```

## Verification

1. Run death enrichment on 50 subjects — compare findings count, quality, and cost before/after
2. Run biography enrichment on 50 subjects — compare section selection quality
3. Verify person validation still catches disambiguation (e.g., "John Smith" with wrong birth year)
4. Verify `GOOGLE_AI_API_KEY` is not referenced anywhere after cleanup
5. Full test suite passes
