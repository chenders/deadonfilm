# Architecture

## Deployment Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Tunnel                     │
│               (SSL, routing, DDoS protection)           │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                   Docker Compose                        │
│                                                         │
│  ┌───────────┐  ┌──────────┐  ┌─────────┐  ┌───────┐  │
│  │  Nginx    │  │   App    │  │ Worker  │  │ Cron  │  │
│  │  reverse  │──│ Express  │  │ BullMQ  │  │ super │  │
│  │  proxy    │  │ API      │  │ jobs    │  │ cronic│  │
│  └───────────┘  └────┬─────┘  └────┬────┘  └───┬───┘  │
│                      │             │            │      │
│         ┌────────────┴─────────────┴────────────┘      │
│         │                                              │
│  ┌──────▼──────┐  ┌────────────┐  ┌────────────────┐  │
│  │ PostgreSQL  │  │  Redis     │  │  Redis (Jobs)  │  │
│  │    16       │  │  (Cache)   │  │  (BullMQ)      │  │
│  └─────────────┘  └────────────┘  └────────────────┘  │
│                                                        │
│  ┌────────────────────┐                                │
│  │  New Relic Infra   │  (monitoring agent)             │
│  └────────────────────┘                                │
└────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS 3, TanStack Query |
| Backend | Node.js, Express.js, TypeScript |
| Database | PostgreSQL 16 (raw SQL via `pg`, no ORM) |
| Cache | Redis 7 (ioredis) — query results, rate limiting, sessions |
| Job Queue | BullMQ on dedicated Redis instance |
| AI | Claude (Anthropic), Gemini (Google), GPT-4o (OpenAI), Perplexity, Grok (xAI), DeepSeek, Mistral, Groq/Llama |
| Data | TMDB API, Wikidata SPARQL, Wikipedia API |
| Reverse Proxy | Nginx with bot detection and prerendering |
| Deployment | Docker Compose on bare metal |
| SSL/Routing | Cloudflare Tunnel |
| Monitoring | New Relic APM + Infrastructure agent |
| CI/CD | GitHub Actions with self-hosted runners |
| Registry | GitHub Container Registry (GHCR) |

## Docker Compose Services

| Service | Role | Memory | Notes |
|---|---|---|---|
| **app** | Express API server | 1GB / 512MB | Main backend, serves API and SSR |
| **nginx** | Reverse proxy | 128MB / 64MB | Static assets, bot detection, prerendering |
| **worker** | BullMQ job processor | 1GB / 256MB | Enrichment, ratings, cache warming, maintenance |
| **cron** | Scheduled tasks | 512MB / 128MB | TMDB sync, sitemap generation, seeding |
| **db** | PostgreSQL 16 | 6GB / 2GB | Custom image with monitoring extensions |
| **redis** | Cache | 600MB / 256MB | AOF persistence, allkeys-LRU eviction |
| **redis-jobs** | Job queue | 700MB / 256MB | AOF + RDB persistence, noeviction policy |
| **agent** | New Relic Infrastructure | 256MB | Collects metrics from all services |

## Background Job Queues

| Queue | Concurrency | Rate Limit | Job Types |
|---|---|---|---|
| **ratings** | 5 | 5/sec | OMDB ratings, Trakt ratings, TheTVDB scores |
| **enrichment** | 2 | 2/sec | Death enrichment, cause of death, biography generation |
| **cache** | 10 | None | Actor cache warming, content cache, death cache rebuild |
| **images** | 3 | None | Actor image processing, poster processing |
| **maintenance** | 1 | None | Sitemap generation, TMDB sync, obscurity calculation, job cleanup |

## Cron Schedule

| Interval | Task | Purpose |
|---|---|---|
| Every 2 hours | TMDB sync | Detect newly reported deaths, sync metadata changes |
| Daily 6 AM UTC | Sitemap generation | Generate XML sitemaps for SEO |
| Weekly Sunday 4 AM | Movie seeding | Seed movies from previous + current year |
| Weekly Sunday 5 AM | Uncertain deaths | Identify actors with missing death info |

## Nginx Configuration

Nginx handles bot detection, serving 18 known bot user agents (Googlebot, Bingbot, Facebook, Twitter, Discord, etc.) with server-side rendered pages via Express. Human visitors get the SPA. Static assets are cached aggressively — 1 year for hashed assets, 30 days for fonts and images.

## PostgreSQL Extensions

The database runs three monitoring extensions:

- **pg_stat_statements** — Query statistics (tracks 10,000 statements)
- **pg_wait_sampling** — Wait event sampling for performance analysis
- **pg_stat_monitor** — Enhanced query statistics

Slow queries (>500ms), DDL statements, lock waits, and autovacuum runs are logged.

## Monitoring

New Relic provides:

- **APM** — Distributed tracing, transaction monitoring, slow SQL detection, AI monitoring (tracks Anthropic API calls)
- **Infrastructure** — PostgreSQL connections/queries/bloat, Redis memory/commands, Nginx connections/requests
- **Browser** — Real User Monitoring (RUM) via injected agent script
- **Logs** — Correlated with traces via Pino structured logging

## CI/CD Pipeline

### On Push / PR

1. CodeQL security scan
2. Frontend: type-check, lint, format, tests, build
3. Backend: migrations, seed, type-check, lint, format, tests, build
4. E2E: Playwright tests (3-way sharded)
5. Docker build verification

### On Deploy

1. Build multi-stage Docker image (frontend → backend → production)
2. Push to GitHub Container Registry
3. On self-hosted runner: pull, recreate containers, verify health
4. Mark deployment in New Relic

## Environment Variables

### Required

| Variable | Purpose |
|---|---|
| `TMDB_API_TOKEN` | TMDB API access |
| `DATABASE_URL` | PostgreSQL connection (auto-set by Docker Compose) |

### Strongly Recommended

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API — biography generation and death enrichment cleanup |

### Infrastructure

| Variable | Purpose | Default |
|---|---|---|
| `REDIS_URL` | Redis cache connection | Auto-set by Docker Compose |
| `REDIS_JOBS_URL` | BullMQ Redis connection | Auto-set by Docker Compose |
| `PORT` | Server port | 8080 |
| `LOG_LEVEL` | Pino log level | info |
| `LOG_TO_FILE` | Enable file logging | false |
| `LOG_FILE_PATH` | Log file path | /var/log/deadonfilm/app.log |

### Ratings (Optional)

| Variable | Cost | Purpose |
|---|---|---|
| `OMDB_API_KEY` | $1/month | IMDb, Rotten Tomatoes, Metacritic scores |
| `TRAKT_API_KEY` | Free | Trending data, user ratings |

### AI Providers (Optional, ordered by cost)

| Variable | Cost/Query | Provider |
|---|---|---|
| `GOOGLE_AI_API_KEY` | ~$0.0001 | Gemini Flash |
| `GROQ_API_KEY` | ~$0.0002 | Llama |
| `OPENAI_API_KEY` | ~$0.0003–$0.01 | GPT-4o Mini / GPT-4o |
| `DEEPSEEK_API_KEY` | ~$0.0005 | DeepSeek |
| `MISTRAL_API_KEY` | ~$0.001 | Mistral |
| `PERPLEXITY_API_KEY` | ~$0.005 | Perplexity (with web search) |
| `XAI_API_KEY` | ~$0.005 | Grok (with X/Twitter data) |

### Search & Archives (Optional)

| Variable | Cost | Purpose |
|---|---|---|
| `BRAVE_SEARCH_API_KEY` | Free tier: 2K/month | Web search |
| `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_CX` | Free tier available | Google Custom Search |
| `BING_SEARCH_API_KEY` | Free tier available | Bing Web Search |
| `NEWSAPI_KEY` | Free: 100/day | News aggregator (80K+ sources) |
| `TROVE_API_KEY` | Free | Australian newspaper archives |
| `EUROPEANA_API_KEY` | Free | European digital archives |

### Browser Fetching (Optional)

| Variable | Default | Purpose |
|---|---|---|
| `BROWSER_FETCH_ENABLED` | true | Enable Playwright browser fallback for bot-protected sites |
| `BROWSER_FETCH_HEADLESS` | true | Headless mode |
| `BROWSER_EXECUTABLE_PATH` | — | Custom Chrome/Chromium path |
| `BROWSER_AUTH_ENABLED` | false | Login automation for paywalled sites |
| `NYTIMES_EMAIL` / `NYTIMES_PASSWORD` | — | NYT subscription credentials |
| `WASHPOST_EMAIL` / `WASHPOST_PASSWORD` | — | WaPo subscription credentials |
| `CAPTCHA_SOLVER_PROVIDER` | — | 2captcha or capsolver |
| `TWOCAPTCHA_API_KEY` | — | 2Captcha API key (~$0.003/solve) |

### Monitoring (Optional)

| Variable | Purpose |
|---|---|
| `NEW_RELIC_LICENSE_KEY` | New Relic APM |
| `NEW_RELIC_APP_NAME` | Application name in New Relic |
| `GSC_SERVICE_ACCOUNT_EMAIL` | Google Search Console API |
| `GSC_PRIVATE_KEY` | GSC service account key |
| `GSC_SITE_URL` | GSC property (e.g., `sc-domain:deadonfilm.com`) |
