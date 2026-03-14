# Debriefer Platform Vision (Option 4)

**Date**: 2026-03-07
**Status**: Future vision — not part of initial build
**Depends on**: Option 3 (library + built-in sources) being stable

## Overview

This document describes the full platform vision for debriefer: a hosted research orchestration service with a web dashboard, marketplace for community sources, and enterprise features. This builds on top of the Option 3 library and is the aspirational end state.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     debriefer.dev (Platform)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Web       │  │ REST API     │  │ WebSocket    │              │
│  │ Dashboard │  │ Gateway      │  │ (live        │              │
│  │           │  │              │  │  progress)   │              │
│  └─────┬────┘  └──────┬───────┘  └──────┬───────┘              │
│        │               │                 │                       │
│  ┌─────┴───────────────┴─────────────────┴───────┐              │
│  │              Orchestration Layer                │              │
│  │  ┌──────────────────────────────────────────┐  │              │
│  │  │  debriefer core (Option 3 library)       │  │              │
│  │  │  ResearchOrchestrator<TSubject, TOutput> │  │              │
│  │  └──────────────────────────────────────────┘  │              │
│  └────────────────────┬──────────────────────────┘              │
│                       │                                          │
│  ┌────────────────────┴──────────────────────────┐              │
│  │              Source Registry                    │              │
│  │  Built-in (60+) │ Community │ Enterprise       │              │
│  └────────────────────────────────────────────────┘              │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Redis    │  │ Postgres │  │ Blob     │  │ OTel     │       │
│  │ (cache)  │  │ (runs,   │  │ Storage  │  │ Collector│       │
│  │          │  │  users)  │  │ (results)│  │          │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Web Dashboard

A React-based admin/monitoring interface (similar to what deadonfilm already has for enrichment management, but generalized).

**Features**:
- **Run manager**: Start research runs, monitor progress in real-time, view results
- **Source health**: Dashboard showing source availability, hit rates, error rates, cost efficiency
- **Cost analytics**: Spending by source category, per-query cost distribution, budget utilization
- **Run history**: Browse past runs, compare results, view per-subject source breakdowns
- **Source configuration**: Enable/disable sources, adjust reliability overrides, manage API keys
- **Result explorer**: View synthesized output alongside raw findings, trace which sources contributed to each claim

**Technology**: React + TanStack Query + Tailwind (same stack as deadonfilm's admin). Communicates via REST API + WebSocket for live progress.

### 2. Source Marketplace

A registry where community members can publish and discover source integrations.

**How it works**:
- Sources are npm packages that extend `BaseResearchSource`
- Published to npm with a `debriefer-source` keyword for discoverability
- The marketplace indexes these packages and displays: name, description, reliability tier, cost, availability status, community rating
- Users install sources via `npm install debriefer-source-sec-edgar` and register them in their config

**Source package convention**:
```
debriefer-source-{name}/
├── src/
│   └── index.ts          # exports a factory function
├── package.json          # keywords: ["debriefer-source"]
├── debriefer.source.yml  # metadata: tier, domain, cost, category
└── README.md
```

```yaml
# debriefer.source.yml
name: SEC EDGAR
description: Search SEC filings for corporate and executive information
category: regulatory
reliabilityTier: STRUCTURED_DATA
domain: efts.sec.gov
isFree: true
estimatedCostPerQuery: 0
requiredEnvVars: []
```

**Potential community sources** (by domain):

| Domain | Sources |
|--------|---------|
| Legal | SEC EDGAR, PACER (court records), state corporate registries |
| Academic | PubMed, arXiv, Semantic Scholar, CrossRef, JSTOR |
| Government | data.gov, Census Bureau, BLS, FDA, USPTO patents |
| Financial | Yahoo Finance, FRED (Federal Reserve), World Bank Open Data |
| Social | Reddit (via API), Hacker News, Stack Exchange |
| Geospatial | OpenStreetMap, GeoNames, US Gazetteer |
| Medical | ClinicalTrials.gov, WHO, CDC, DrugBank |
| Media | Podcast transcripts, YouTube captions, C-SPAN |

### 3. Hosted API Service

A managed version of debriefer-server where users don't need to self-host.

**Tiers**:

| Tier | Price | Includes |
|------|-------|----------|
| Free | $0/mo | 100 debriefs/mo, built-in free sources only, community support |
| Pro | $49/mo | 2,000 debriefs/mo, all built-in sources, API key management, priority support |
| Team | $199/mo | 10,000 debriefs/mo, shared workspace, run history, SSO |
| Enterprise | Custom | Unlimited, SLA, dedicated instance, custom sources, on-premise deployment |

**Key managed features**:
- **API key vault**: Users provide their API keys (Anthropic, Google, Bing, etc.) once. Debriefer manages rotation, rate limits, and failover.
- **Shared cache**: Findings cached across all users (for public information). A debrief about "John Wayne" that was already researched recently returns cached findings instantly at zero cost.
- **Usage dashboard**: Real-time cost tracking, budget alerts, spending caps.

### 4. Enterprise Features

Features for organizations running debriefer at scale.

**Team workspaces**: Shared source configurations, API keys, and run history across team members.

**Custom reliability overrides**: Organizations define their own reliability tiers for internal or domain-specific sources. A law firm might rate Westlaw as STRUCTURED_DATA. A pharmaceutical company might rate PubMed higher than Wikipedia.

**Audit trail**: Every debrief produces an immutable record: what was queried, which sources were tried, what they returned, what the synthesis produced. Critical for compliance in legal, financial, and medical contexts.

**Webhook integrations**: Push debrief results to Slack, email, Notion, Airtable, or any webhook endpoint.

**SSO/SAML**: Enterprise authentication.

**On-premise deployment**: Helm chart for Kubernetes deployment behind the corporate firewall.

### 5. CLI Tool (Enhanced)

Beyond the basic `npx debriefer` in Option 3, the platform CLI adds:

```bash
# Interactive research session
debriefer interactive "John Wayne"
# Opens a TUI showing sources being queried in real-time,
# findings streaming in, reliability scores, running cost

# Pipe-friendly output
debriefer --query "Hedy Lamarr" --format json | jq '.data.narrative'
debriefer --query "Hedy Lamarr" --format csv > findings.csv
debriefer --query "Hedy Lamarr" --format markdown > report.md

# Source management
debriefer sources list                    # show available sources + tiers
debriefer sources add sec-edgar           # install community source
debriefer sources test guardian           # verify a source is working

# Config management
debriefer config init                     # create debriefer.config.yml
debriefer config validate                 # check config + API keys

# Batch from file
debriefer batch --input subjects.csv --output results.json --budget 10.00

# Server mode
debriefer serve --port 8090              # start HTTP server
debriefer serve --docker                 # print docker-compose.yml
```

## Pricing Model

Research queries, not API calls. A single "debrief" that orchestrates 15 sources, follows 3 links, and synthesizes via Claude is one query.

**Value-based pricing**: The user specifies their budget per query. Debriefer optimizes within that budget (phased execution, early stopping). A $0.05 debrief uses free sources only. A $0.50 debrief adds paid search APIs and AI synthesis.

**Pass-through costs are separate**: API costs for Anthropic, Google Search, Bing, etc. are billed at cost or users bring their own API keys. The debriefer platform fee is for orchestration, caching, reliability scoring, and infrastructure.

## Cross-Ecosystem Strategy

### Phase 1: TypeScript primary (Option 3)
- npm packages: `debriefer`, `debriefer-sources`, `debriefer-cli`, `debriefer-server`
- Full power, zero overhead, all features

### Phase 2: HTTP service + thin clients
- Python (`pip install debriefer`): HTTP client with Pydantic models
- Go: HTTP client with typed structs
- Ruby: HTTP client gem
- All clients get the same API, same reliability scoring, same results

### Phase 3: Native Python SDK (long-term)
- Port core orchestrator to Python
- Shared source plugin spec (sources defined in YAML + a lookup function)
- Sources written once (TypeScript or Python), registered in the same marketplace
- Python-native data science integration: Pandas DataFrames, Jupyter widgets

### Phase 4: Language-agnostic source spec (very long-term)
- Sources defined as containers (Docker/WASM) with a standard I/O protocol
- Any language can implement a source
- Debriefer orchestrates containers rather than function calls
- This is the "universal research plugin" model

## Potential Integrations

| Integration | How |
|-------------|-----|
| LangChain/LlamaIndex | Debriefer as a LangChain Tool or LlamaIndex QueryEngine |
| MCP (Model Context Protocol) | Debriefer as an MCP server — any AI assistant can research via debriefer |
| Jupyter | `%debrief "query"` magic command, results rendered as rich widgets |
| Zapier/n8n | Webhook triggers, research-as-a-step in automation workflows |
| VS Code | Extension that debriefs from the editor (select text, right-click, "Research this") |
| Slack/Discord | Bot that responds to `/debrief query` with structured results |

## Revenue Projections (Speculative)

Based on market analysis of comparable tools (Tavily, Firecrawl, Apify):

| Year | Users | ARR | Model |
|------|-------|-----|-------|
| Y1 | 500 free, 50 pro | $30K | Open-source adoption + early pro users |
| Y2 | 2,000 free, 200 pro, 10 team | $150K | Word of mouth, community sources |
| Y3 | 10,000 free, 500 pro, 50 team, 5 enterprise | $500K-$1M | Enterprise contracts, marketplace |

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Well-funded competitor adds reliability scoring | High | First-mover advantage, depth of 60+ battle-tested sources, community moat |
| Source APIs change/break frequently | Medium | Each source has maintainer, automated health checks, community PRs |
| AI synthesis costs make free tier unsustainable | Medium | Free tier uses structured data only (no AI). Pro tier covers AI costs via subscription |
| npm/PyPI name squatting | Low | Both names verified available as of 2026-03-07 |
| Playwright/browser deps make Docker images large | Low | Slim image without browsers is default. Full image is opt-in |
| Legal issues with scraping news sites | Medium | Respect robots.txt, use official APIs where available, cache aggressively to minimize requests |
| Open-source fork undercuts commercial offering | Low | The commercial value is in managed infrastructure (caching, key vault, shared cache), not the code |

## Success Criteria

### Option 3 (current build) is successful when:
- Both deadonfilm enrichment systems (death + biography) run on debriefer
- `npm install debriefer` works and the README example runs out of the box
- Docker container starts and serves the HTTP API
- Python client can research a subject via the HTTP API
- At least 40 of the 60+ sources pass integration tests

### Option 4 (platform) is successful when:
- 10+ community-contributed source packages exist
- 100+ monthly active users on the free tier
- 3+ paying enterprise customers
- Shared cache reduces average debrief cost by 50%+
