# Pino Structured Logging Migration Plan

**Date**: 2026-03-07
**Status**: Proposed
**Scope**: Replace `console.log` in enrichment orchestrators and CLI scripts with Pino structured logging

## Problem

The biography and death enrichment orchestrators use ~65 `console.log` calls for progress output. CLI scripts add another ~80. This creates several issues:

- **No structured data**: Progress info (cost, source counts, actor IDs) is embedded in formatted strings rather than queryable fields
- **No log levels**: Everything is `console.log` — can't filter debug noise from important warnings
- **Inconsistent with the rest of the codebase**: Route handlers, jobs, and middleware all use Pino via `server/src/lib/logger.ts`
- **Poor observability**: Console output in Docker/production goes to stdout as unstructured text, limiting New Relic and log aggregation

## Current State

### Logging Infrastructure Already in Place

| Component | File | Purpose |
|-----------|------|---------|
| **Pino logger** | `server/src/lib/logger.ts` | Main structured logger with child logger factories |
| **Script logger** | `createScriptLogger(name)` | Ready-made factory for CLI scripts |
| **Job logger** | `createJobLogger(name, runId)` | For BullMQ job handlers |
| **RunLogger** | `server/src/lib/run-logger.ts` | Buffers structured logs → `run_logs` table + console |
| **Death file logger** | `server/src/lib/death-sources/logger.ts` | Apache-style rotation, enrichment-specific methods |
| **StatusBar** | `server/src/lib/death-sources/logger.ts` | ANSI scroll region for terminal UI (death only) |

### Console.log Usage by File

| File | Count | Categories |
|------|-------|------------|
| `biography-sources/orchestrator.ts` | 36 | Init, per-actor progress, phase tracking, cost summaries |
| `death-sources/orchestrator.ts` | 29 | Init, per-actor progress (via StatusBar), cost summaries |
| `scripts/enrich-biographies.ts` | ~40 | Config display, query results, progress counters |
| `scripts/enrich-death-details.ts` | ~40 | Config display, query results, progress counters |
| Death source implementations | ~20 | Debug output in wikipedia.ts, browser-fetch.ts |

### Console.log Call Categories

| Category | Example | Migration Approach |
|----------|---------|-------------------|
| **Config display** | `console.log("  Concurrency: 5")` | `logger.info({ concurrency: 5 }, "Configuration")` |
| **Progress counters** | `console.log("[3/10] Processing John Wayne")` | `logger.info({ progress: { completed: 3, total: 10 }, actor: "John Wayne" }, "Processing actor")` |
| **Source attempts** | `console.log("  Trying Wikipedia...")` | `logger.debug({ source: "wikipedia" }, "Source attempt")` |
| **Cost tracking** | `console.log("  Cost: $0.0234")` | `logger.info({ costUsd: 0.0234 }, "Synthesis complete")` |
| **Decorative separators** | `console.log("=".repeat(60))` | Remove entirely — structured logs don't need visual separators |
| **Error messages** | `console.log("  Failed: timeout")` | `logger.warn({ error: "timeout", source: "wikipedia" }, "Source failed")` |

## Migration Plan

### Phase 1: Biography Orchestrator (Smallest scope, proves the pattern)

**Files**: `server/src/lib/biography-sources/orchestrator.ts`

1. Import the Pino logger and create a module-level child logger:
   ```typescript
   import { logger as rootLogger } from "../logger.js"
   const logger = rootLogger.child({ module: "biography-orchestrator" })
   ```

2. Replace all 36 `console.log` calls with appropriate Pino levels:
   - `logger.info()` — initialization, per-actor completion, batch summary
   - `logger.debug()` — per-source attempts, phase transitions, cache hits
   - `logger.warn()` — source failures, low confidence, cost limit warnings
   - `logger.error()` — synthesis failures, unexpected errors

3. Move data from string interpolation into structured fields:
   ```typescript
   // Before
   console.log(`  Phase: ${phase} (${sources.length} sources)`)
   console.log(`    ${source.name}: confidence=${confidence.toFixed(2)}`)

   // After
   logger.debug({ phase, sourceCount: sources.length }, "Starting phase")
   logger.debug({ source: source.name, confidence }, "Source result")
   ```

4. Remove decorative separators (`=`.repeat, `─`.repeat)

5. Keep RunLogger integration unchanged — it serves a different purpose (DB persistence)

**Estimated effort**: 1-2 hours
**Risk**: Low — only changes log output format, no logic changes

### Phase 2: Death Orchestrator (StatusBar complexity)

**Files**: `server/src/lib/death-sources/orchestrator.ts`, `server/src/lib/death-sources/logger.ts`

1. Same Pino child logger pattern as Phase 1

2. **StatusBar compatibility**: The death orchestrator routes console output through `consoleLog()` / `statusBar.log()` to avoid ANSI conflicts with the terminal progress bar. Options:
   - **Option A**: Keep StatusBar for terminal UI, add Pino as a parallel channel for structured logs. StatusBar handles visual display; Pino handles observability.
   - **Option B** (preferred): Replace StatusBar with a Pino transport that renders pino-pretty output within the ANSI scroll region. This unifies the two channels.

3. Replace `consoleLog()` wrapper calls with `logger.info/debug/warn`

4. Keep the custom `EnrichmentLogger` file logger — it serves rotation/archival needs that Pino doesn't handle out-of-box (or consider replacing with `pino-roll` transport)

**Estimated effort**: 3-4 hours (StatusBar integration adds complexity)
**Risk**: Medium — StatusBar terminal UI interaction needs careful testing

### Phase 3: CLI Scripts

**Files**: `server/scripts/enrich-biographies.ts`, `server/scripts/enrich-death-details.ts`, `server/scripts/resynthesize-biographies.ts`

1. Use `createScriptLogger(scriptName)` at script entry point

2. Replace config display tables with structured log calls:
   ```typescript
   // Before
   console.log(`  Limit:       ${options.limit}`)
   console.log(`  Concurrency: ${options.concurrency}`)

   // After
   logger.info({ config: options }, "Script configuration")
   ```

3. For interactive prompts (`readline`), keep `console.log` — prompts are user-facing UI, not logs

4. Remove `LOG_LEVEL=silent` suppression in death script (was suppressing Pino; after migration, we want it active)

**Estimated effort**: 2-3 hours
**Risk**: Low — scripts are standalone, easy to test

### Phase 4: Individual Source Files

**Files**: Various files in `server/src/lib/death-sources/sources/` and `server/src/lib/biography-sources/sources/`

1. Most source implementations already log through `BaseDataSource` / `BaseBiographySource` which use the cache and NewRelic — minimal direct console.log

2. Key files with console.log: `wikipedia.ts` (~20 calls), `browser-fetch.ts` (~19 calls)

3. Replace with source-specific child loggers:
   ```typescript
   const logger = rootLogger.child({ module: "death-source", source: "wikipedia" })
   ```

**Estimated effort**: 2-3 hours
**Risk**: Low

## Pino Configuration for CLI vs Server

The key challenge is that CLI scripts want human-readable progress output while production servers want JSON. Pino handles this natively:

```typescript
// In logger.ts — already configured:
// Dev:  pino-pretty transport → colored human-readable output
// Prod: default JSON transport → stdout → log aggregator

// For CLI scripts specifically:
const scriptLogger = createScriptLogger("enrich-biographies")
// Uses pino-pretty in all environments since scripts are always run interactively
```

If richer CLI progress display is needed (progress bars, tables), consider:
- `pino-pretty` with custom `messageFormat` for progress lines
- A thin CLI display layer that subscribes to Pino events (via `pino.destination()` with tee)
- Keep minimal `console.log` for interactive-only output (prompts, confirmation messages)

## Testing Strategy

1. **Unit tests**: Mock the logger module, verify structured fields are logged at correct levels
2. **Integration**: Run enrichment script with `--dry-run --limit 1`, verify pino-pretty output is readable
3. **Production**: Verify JSON output parses correctly in log aggregator (New Relic, Docker logs)

## Success Criteria

- [ ] Zero `console.log` calls in orchestrator files (excluding RunLogger internals)
- [ ] All enrichment progress data available as structured fields in Pino output
- [ ] `pino-pretty` output in dev/CLI is at least as readable as current console.log output
- [ ] No regression in StatusBar terminal UI for death enrichment
- [ ] RunLogger DB persistence continues to work unchanged
- [ ] Log level filtering works (e.g., `LOG_LEVEL=warn` suppresses per-source debug noise)

## Non-Goals

- Replacing RunLogger (DB persistence layer) — it serves a different purpose
- Replacing the death-specific `EnrichmentLogger` file rotation — evaluate separately
- Changing NewRelic custom event integration — orthogonal to logging
- Adding log aggregation infrastructure — just making logs structured for existing tooling
