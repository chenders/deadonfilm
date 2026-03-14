# Debriefer: Multi-Source Research Orchestration Engine

**Date**: 2026-03-07
**Status**: Approved
**Scope**: Option 3 — Publishable library + built-in sources, separate repo, containerized

## Overview

Debriefer is a standalone open-source TypeScript/Node.js library that orchestrates research across 60+ data sources with reliability scoring, phased execution, cost control, and AI synthesis. It extracts the generic research infrastructure from deadonfilm's enrichment pipeline into a reusable engine.

Deadonfilm becomes the first consumer. Other consumers (journalism tools, OSINT platforms, academic research, due diligence) can adopt via npm or the HTTP service.

## Name

**debriefer** — captures the full intelligence cycle: agents go out, gather intel from multiple sources, come back, and the debriefer synthesizes everything into a structured report for the decision-maker.

- npm: `debriefer` (available)
- PyPI: `debriefer` (available)
- GitHub: `github.com/chenders/debriefer`

## Core Differentiators

1. **Wikipedia RSP-based reliability scoring** — Sources are scored using Wikipedia's Reliable Sources Perennial list. Two independent axes: source reliability (is Reuters trustworthy?) vs content confidence (does this page answer the question?).
2. **Phased execution with early stopping** — Free/cheap sources first, expensive only if needed. Stops when enough high-quality evidence accumulates.
3. **Per-query cost control** — Budget limits per subject and per batch. Never spend more than you authorize.
4. **60+ built-in source integrations** — Batteries included: web search, news APIs, Wikidata, Wikipedia, books, historical archives, obituary sites.
5. **Pluggable AI synthesis** — Claude ships as default, but users can swap in OpenAI, Gemini, local models, or no AI at all.

## Repository Structure

```
debriefer/
├── packages/
│   ├── core/                    # The orchestration engine ("debriefer")
│   │   ├── src/
│   │   │   ├── orchestrator.ts  # ResearchOrchestrator<TSubject, TOutput>
│   │   │   ├── base-source.ts   # BaseResearchSource<TSubject>
│   │   │   ├── synthesizer.ts   # Synthesizer interface + Claude implementation
│   │   │   ├── reliability.ts   # ReliabilityTier enum, RSP scores
│   │   │   ├── types.ts         # Configs, results, findings
│   │   │   ├── rate-limiter.ts  # SourceRateLimiter (per-domain async queue)
│   │   │   ├── cost-tracker.ts  # BatchCostTracker
│   │   │   ├── batch-runner.ts  # ParallelBatchRunner<T,R>
│   │   │   ├── cache/           # CacheProvider interface + implementations
│   │   │   ├── telemetry/       # TelemetryProvider interface + implementations
│   │   │   └── hooks.ts         # LifecycleHooks type definitions
│   │   └── package.json         # "debriefer"
│   │
│   ├── sources/                 # Built-in source integrations ("debriefer-sources")
│   │   ├── src/
│   │   │   ├── web-search/      # Google, Bing, DuckDuckGo, Brave
│   │   │   ├── structured/      # Wikidata, Wikipedia
│   │   │   ├── news/            # Guardian, NYT, AP, Reuters, BBC, etc.
│   │   │   ├── books/           # Google Books, Open Library, IA Books
│   │   │   ├── archives/        # Chronicling America, Trove, Europeana, IA
│   │   │   ├── obituary/        # Legacy.com, Find a Grave
│   │   │   └── shared/          # Readability, HTML sanitization, DDG search
│   │   └── package.json         # "debriefer-sources"
│   │
│   ├── cli/                     # CLI tool ("debriefer-cli", bin: "debriefer")
│   │   ├── src/
│   │   │   └── index.ts         # Commander.js CLI
│   │   └── package.json
│   │
│   ├── server/                  # HTTP service ("debriefer-server")
│   │   ├── src/
│   │   │   ├── index.ts         # Express/Fastify server
│   │   │   ├── routes/          # REST API endpoints
│   │   │   └── middleware/      # Auth, rate limiting
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── mcp/                     # MCP server ("debriefer-mcp")
│       ├── src/
│       │   └── index.ts         # MCP server exposing debriefer tools
│       └── package.json
│
├── docker/
│   ├── Dockerfile               # Multi-stage build
│   ├── Dockerfile.worker        # Optional async batch worker
│   └── docker-compose.yml       # Server + Redis
│
├── clients/
│   └── python/                  # PyPI package: "debriefer"
│       ├── debriefer/
│       │   ├── __init__.py
│       │   ├── client.py        # HTTP client for debriefer-server
│       │   └── types.py         # Pydantic models
│       └── pyproject.toml
│
├── docs/
├── examples/
├── package.json                 # npm workspace root
├── turbo.json                   # Build orchestration
└── tsconfig.base.json
```

## Core API

### Subject (the thing you're researching)

```typescript
interface ResearchSubject {
  id: string | number
  name: string
  context?: Record<string, unknown>
}
```

Consumers extend this with domain-specific fields. Deadonfilm adds `birthday`, `deathday`, `tmdbId`, etc.

### Source (a data provider)

```typescript
abstract class BaseResearchSource<TSubject extends ResearchSubject> {
  abstract readonly name: string
  abstract readonly type: string
  abstract readonly reliabilityTier: ReliabilityTier
  abstract readonly domain: string
  abstract readonly isFree: boolean
  abstract readonly estimatedCostPerQuery: number

  isAvailable(): boolean
  abstract lookup(subject: TSubject, signal: AbortSignal): Promise<RawFinding>
  buildQuery(subject: TSubject): string
}
```

Base class provides: rate limiting (via injected `SourceRateLimiter`), caching (via injected `CacheProvider`), timeout signal creation, `calculateConfidence(text, keywords)`.

### Findings (raw evidence)

```typescript
interface RawFinding {
  text: string
  url?: string
  publication?: string
  articleTitle?: string
  confidence: number       // 0-1: content relevance
  costUsd: number
  metadata?: Record<string, unknown>
}

interface ScoredFinding extends RawFinding {
  sourceType: string
  sourceName: string
  reliabilityTier: ReliabilityTier
  reliabilityScore: number  // 0-1: publisher trustworthiness
}
```

### Synthesizer (AI distillation)

```typescript
interface Synthesizer<TSubject, TOutput> {
  synthesize(
    subject: TSubject,
    findings: ScoredFinding[],
    options: SynthesisOptions
  ): Promise<SynthesisResult<TOutput>>
}
```

Ships with `ClaudeSynthesizer`. Users can implement for OpenAI, Gemini, local models, or no AI.

### Orchestrator (the engine)

```typescript
class ResearchOrchestrator<TSubject extends ResearchSubject, TOutput> {
  constructor(
    phases: SourcePhaseGroup<TSubject>[],
    synthesizer: Synthesizer<TSubject, TOutput>,
    config?: ResearchConfig
  )

  async debrief(subject: TSubject): Promise<DebriefResult<TOutput>>

  async debriefBatch(
    subjects: TSubject[],
    hooks?: LifecycleHooks<TSubject, TOutput>
  ): Promise<Map<string, DebriefResult<TOutput>>>
}
```

### Configuration

```typescript
interface ResearchConfig {
  categories?: Record<string, boolean>
  concurrency?: number              // default 5, range 1-20
  confidenceThreshold?: number      // default 0.6
  reliabilityThreshold?: number     // default 0.6
  earlyStopThreshold?: number       // default 3 high-quality source families
  costLimits?: {
    maxCostPerSubject?: number
    maxTotalCost?: number
  }
  synthesis?: SynthesisOptions
  cache?: CacheProvider
  telemetry?: TelemetryProvider
}
```

### Lifecycle Hooks

16 hook points for observability and integration:

- `onRunStart`, `onRunComplete`, `onRunFailed`
- `onSubjectStart`, `onSubjectComplete`
- `onSourceAttempt`, `onSourceComplete`
- `onPhaseComplete`, `onEarlyStop`
- `onSynthesisStart`, `onSynthesisComplete`
- `onBatchProgress`, `onCostLimitReached`

All optional. Consumers wire up what they need (DB writes, progress bars, logging, monitoring).

### Pluggable Infrastructure

```typescript
interface CacheProvider {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds?: number): Promise<void>
  delete(key: string): Promise<void>
}
// Ships with: InMemoryCache, RedisCache, SqliteCache

interface TelemetryProvider {
  recordEvent(name: string, data: Record<string, unknown>): void
  startSpan(name: string): TelemetrySpan
  recordError(error: Error, context?: Record<string, unknown>): void
}
// Ships with: ConsoleTelemetry, OpenTelemetryProvider
```

## Reliability Scoring

Based on Wikipedia's Reliable Sources Perennial list (RSP). Each built-in source declares its tier. Users can override per-source.

| Tier | Score | RSP Equivalent | Examples |
|------|-------|----------------|----------|
| STRUCTURED_DATA | 1.0 | N/A | Wikidata, government databases |
| TIER_1_NEWS | 0.95 | "Generally reliable" | AP, NYT, BBC, Reuters, WaPo |
| TRADE_PRESS | 0.9 | "Generally reliable" (domain) | Variety, Nature, Lancet |
| ARCHIVAL | 0.9 | Primary sources | Trove, Europeana, Chronicling America |
| SECONDARY_COMPILATION | 0.85 | Wikipedia's self-assessment | Wikipedia |
| SEARCH_AGGREGATOR | 0.7 | Depends on linked sources | Google, Bing, DDG, Brave |
| ARCHIVE_MIRROR | 0.7 | Mirrors | Internet Archive |
| MARGINAL_EDITORIAL | 0.65 | "Use with caution" | People Magazine |
| MARGINAL_MIXED | 0.6 | Mixed editorial + UGC | Legacy.com |
| AI_MODEL | 0.55 | No RSP equivalent | Claude, GPT, Gemini |
| UNRELIABLE_FAST | 0.5 | "Generally unreliable" | TMZ |
| UNRELIABLE_UGC | 0.35 | User-generated content | Find a Grave |

New source PRs consult the RSP list to determine tier assignment.

## HTTP Service

REST API for cross-ecosystem access. Runs standalone or in Docker.

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/debrief | Research a single subject |
| POST | /api/debrief/batch | Start async batch (returns run ID) |
| GET | /api/runs/:id | Check batch progress |
| GET | /api/runs/:id/results | Get batch results |
| POST | /api/runs/:id/cancel | Cancel a batch |
| GET | /api/sources | List available sources + reliability tiers |
| GET | /api/health | Health check |

### Configuration

Server reads from environment variables and/or `debriefer.config.yml`:

```yaml
server:
  port: 8090
  auth:
    type: api-key
    keys: ["sk-..."]

defaults:
  concurrency: 5
  earlyStopThreshold: 3
  costLimits:
    maxCostPerSubject: 1.00
    maxTotalCost: 100.00
  synthesis:
    model: claude-sonnet-4-20250514

cache:
  type: redis
  url: redis://redis:6379

telemetry:
  type: opentelemetry
  endpoint: http://otel-collector:4318
```

## Docker

### Images

- **Slim** (~150MB): No Playwright. DDG uses fetch-only fallback.
- **Full** (~550MB): Includes Chromium for DDG stealth + CAPTCHA solving. Built with `--build-arg INSTALL_BROWSERS=true`.

### docker-compose.yml

```yaml
services:
  debriefer:
    build:
      context: ..
      dockerfile: docker/Dockerfile
      args:
        INSTALL_BROWSERS: "true"
    ports:
      - "8090:8090"
    environment:
      - ANTHROPIC_API_KEY
      - REDIS_URL=redis://redis:6379
    volumes:
      - ./debriefer.config.yml:/app/debriefer.config.yml:ro
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

## MCP Server

Debriefer ships as an MCP (Model Context Protocol) server, allowing any AI assistant (Claude Code, ChatGPT, Cursor, etc.) to use it as a research tool.

### Tools Exposed

| Tool | Description |
|------|-------------|
| `debrief` | Research a subject — returns synthesized findings with reliability scores |
| `debrief_batch` | Start async batch research, returns run ID |
| `get_run_status` | Check batch progress |
| `get_run_results` | Retrieve batch results |
| `list_sources` | Show available sources, their reliability tiers, and availability |
| `configure` | Adjust categories, cost limits, thresholds for the session |

### Example Usage in Claude Code

```json
// .claude/settings.json or mcp_servers config
{
  "mcpServers": {
    "debriefer": {
      "command": "npx",
      "args": ["debriefer-mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "...",
        "DEBRIEFER_CONFIG": "./debriefer.config.yml"
      }
    }
  }
}
```

An AI assistant can then research anything mid-conversation:

```
User: "What happened to Steve McQueen?"
Assistant: [calls debrief tool with name="Steve McQueen"]
→ Returns synthesized narrative + raw findings from Wikipedia, NYT, AP, etc.
→ Each finding tagged with reliability tier and confidence score
```

### Implementation

The MCP server wraps `debriefer` core directly (in-process, no HTTP). It uses the `@modelcontextprotocol/sdk` package and exposes tools following the MCP specification. Configuration is loaded from `debriefer.config.yml` or environment variables.

The MCP package can also connect to a running `debriefer-server` instance instead of running sources in-process, useful when the server is already deployed in Docker:

```json
{
  "mcpServers": {
    "debriefer": {
      "command": "npx",
      "args": ["debriefer-mcp", "--server", "http://localhost:8090"]
    }
  }
}
```

## Python Client

Thin HTTP wrapper published to PyPI as `debriefer`.

```python
from debriefer import Debriefer

db = Debriefer("http://localhost:8090", api_key="sk-...")

result = db.debrief(
    "John Wayne",
    context={"deathday": "1979-06-11"},
    categories={"structured": True, "news": True},
    max_cost=0.50,
    synthesis_prompt="Research how this person died.",
)

print(result.data)
print(result.findings)
print(result.cost_usd)
```

## Deadonfilm as Consumer

Deadonfilm uses debriefer in two modes:

1. **Library import** (batch enrichment scripts, job handlers): `import { ResearchOrchestrator } from 'debriefer'` — zero HTTP overhead.
2. **HTTP client** (admin UI, on-demand enrichment): Calls `debriefer-server` running as a sidecar container.

Domain-specific code stays in deadonfilm: synthesis prompts, output schemas (DeathData, BiographyData), actor selection queries, staging/review workflow, entity linking.

## Extraction Strategy

1. Create `github.com/chenders/debriefer` repo
2. Create `feat/debriefer-extraction` experimental branch on deadonfilm
3. Build debriefer core by extracting from deadonfilm's shared infrastructure
4. Refactor deadonfilm's biography enrichment to consume debriefer (cleaner orchestrator, better reference consumer)
5. Refactor death enrichment to consume debriefer
6. Publish `debriefer` to npm
7. Add HTTP server, Docker, Python client
8. Add MCP server (dogfood immediately in Claude Code for research during development)
9. Cut deadonfilm over to the published package

## What Stays in Deadonfilm

- Actor selection queries (`deathday IS NOT NULL`, `dof_popularity`)
- Synthesis prompts (death and biography system prompts)
- Output schemas (DeathData, BiographyData, zod schemas)
- DB writers (COALESCE upsert to deadonfilm tables)
- Staging/review workflow
- Entity linker (post-processing)
- Admin routes and UI
- Golden test cases (7 test actors)
- Cache invalidation (`invalidateActorCache`)

## What Moves to Debriefer

- `ResearchOrchestrator` (generic, parameterized)
- `BaseResearchSource` (generic base class)
- `ReliabilityTier` + `RELIABILITY_SCORES` (RSP framework)
- `SourceRateLimiter`, `BatchCostTracker`, `ParallelBatchRunner`
- All source implementations (Wikipedia, Wikidata, Guardian, NYT, etc.)
- Readability extraction, HTML sanitization, text sanitization
- DuckDuckGo search with browser fallback
- Page fetch with archive fallbacks
- `ClaudeSynthesizer` (generic AI synthesis)
- Cache interface + Redis/SQLite/in-memory implementations
- Telemetry interface + console/OpenTelemetry implementations
- Lifecycle hooks system
- `calculateConfidence()` algorithm
