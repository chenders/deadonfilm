<div align="center">

# Dead on Film

*The cast list they don't print in the credits.*

[![Live Site](https://img.shields.io/badge/live-deadonfilm.com-a3333d)](https://deadonfilm.com)
[![License: MIT](https://img.shields.io/badge/license-MIT-a3333d)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-full--stack-a3333d)](https://www.typescriptlang.org/)

</div>

> You just finished watching a movie from 1985. The credits roll. You recognize a face and think — *are they still alive?* Now imagine asking that about every cast member, in every movie, with the math to back it up.

**[deadonfilm.com](https://deadonfilm.com)** tracks **572,000+ actors** across **152,000+ movies and TV shows** — who has died, when, how, and whether a production's death toll is statistically unusual.

<!-- Screenshot should show a movie page with the mortality gauge, expected vs.
     actual comparison, and at least one deceased actor with cause of death visible.
     This single image needs to communicate the project's depth, not just its existence. -->
![Dead on Film](docs/screenshot.png)

---

## Table of Contents

- [What Makes This Different](#what-makes-this-different)
- [Explore](#explore)
- [How It Works](#how-it-works)
- [The Numbers](#the-numbers)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Interesting Implementation Details](#interesting-implementation-details)
- [Project History](#project-history)
- [Contributing](#contributing)
- [License](#license)

## What Makes This Different

This is not a simple "who died" lookup. Dead on Film combines entertainment data with actuarial science and AI-powered research to surface patterns invisible to casual observation:

- **Expected vs. Actual Mortality** — For every production, the system calculates how many cast deaths SSA life tables predict, then compares to reality
- **Mortality Surprise Score** — A statistical measure of how abnormal a cast's death rate is — that is what "cursed" means here: not superstition, but statistical anomaly
- **AI-Powered Death Research** — Orchestrates 11 AI models and 80+ data sources — from Wikidata to the Library of Congress to Find a Grave — to cross-reference cause of death, with archive.org and archive.is bypassing paywalls
- **Discovery Features** — Cursed Movies, Death Watch, Forever Young, and more — designed for the kind of person who falls down Wikipedia rabbit holes at 2 AM

## Explore

| Feature | What It Shows |
|---|---|
| [**Cursed Movies**](https://deadonfilm.com/cursed-movies) | Productions ranked by abnormally high cast mortality |
| [**Cursed Actors**](https://deadonfilm.com/cursed-actors) | Actors whose co-stars died at statistically unusual rates |
| [**Death Watch**](https://deadonfilm.com/death-watch) | Living actors with highest actuarial mortality probability |
| [**Forever Young**](https://deadonfilm.com/forever-young) | Actors who died young, ranked by years of life lost |
| [**Notable Deaths**](https://deadonfilm.com/deaths/notable) | Detailed death circumstances with source citations |
| [**Strange Deaths**](https://deadonfilm.com/deaths/strange) | Unusual or mysterious death circumstances |
| [**Unnatural Deaths**](https://deadonfilm.com/unnatural-deaths) | Browse by accident, overdose, homicide, or suicide |
| [**COVID Deaths**](https://deadonfilm.com/covid-deaths) | Actors who died from COVID-19 |
| [**On This Day**](https://deadonfilm.com/on-this-day) | Actors who died on today's date |
| [**Deaths by Cause**](https://deadonfilm.com/causes-of-death) | Full taxonomy of causes of death |
| [**Deaths by Decade**](https://deadonfilm.com/deaths/decades) | Mortality trends across decades |

Every movie and TV show page includes a mortality gauge, expected vs. actual comparison, and individual actor profiles with cause of death and years relative to life expectancy.

## How It Works

### The Actuarial Model

The system uses **Social Security Administration life tables** to calculate the *expected* number of deaths for any cast, based on each actor's age and birth year. It compares expected to actual deaths and produces a **Mortality Surprise Score** — a statistical measure of how abnormal a cast's mortality really is.

A high Surprise Score means the cast has lost significantly more members than actuarial tables predict. That is the basis for the "Cursed Movies" ranking.

### The Death Research Pipeline

When a death lacks cause-of-death information, the system dispatches a multi-stage research pipeline across 80+ sources:

1. **Free structured sources first** — Wikidata (SPARQL), Wikipedia, IMDb, Television Academy In Memoriam, BFI Sight & Sound, IBDB, Find a Grave, Legacy.com, FamilySearch
2. **Search engines discover and follow links** — DuckDuckGo, Google Custom Search, and Bing find obituaries, news articles, and reference pages, then the system fetches and extracts content from each result
3. **Historical archives** — Library of Congress / Chronicling America (US newspapers 1756–1963), Trove (Australian newspapers from 1803), Europeana (European cultural archives), Internet Archive (books and documents)
4. **News APIs** — The Guardian, New York Times, AP News, NewsAPI (80,000+ sources), Variety, Deadline Hollywood
5. **11 AI models, cheapest-first** — Gemini Flash, Groq/Llama, GPT-4o Mini, DeepSeek, Mistral, Gemini Pro (with Google Search grounding), Grok (with X/Twitter data), Perplexity (with web search), GPT-4o, and Claude
6. **Paywall bypass** — Archive.org Wayback Machine and archive.is as fallbacks for paywalled sites (NYT, WaPo, WSJ, LA Times, Bloomberg, and others); browser automation with session persistence for sites requiring login
7. **Final cleanup** — Claude consolidates raw data from all sources into structured, confidence-scored output with source attribution

This pipeline has achieved **42% cause-of-death coverage** across 25,000+ deceased actors — a number that grows daily.

<details>
<summary><strong>Full Source Inventory</strong></summary>

**AI Models (11):** Claude (Anthropic), Gemini Flash, Gemini Pro (Google), GPT-4o, GPT-4o Mini (OpenAI), Perplexity (sonar-pro), Grok (xAI), DeepSeek, Mistral, Groq/Llama 3.3 70B, Claude Batch

**Knowledge Bases (4):** Wikidata (SPARQL), Wikipedia, IMDb, TMDB

**Film Industry Archives (5):** Television Academy In Memoriam, IBDB (Internet Broadway Database), BFI Sight & Sound, TVmaze, TheTVDB

**Search Engines (3):** DuckDuckGo, Google Custom Search, Bing Web Search

**News Sources (6+ active):** The Guardian (API), New York Times (API), AP News, NewsAPI (aggregates 80,000+ sources), Variety, Deadline Hollywood — plus dozens more via search engine link-following (CNN, BBC, Reuters, Rolling Stone, Hollywood Reporter, People, TMZ, etc.)

**Cemetery & Obituary Sites (2):** Find a Grave, Legacy.com

**Historical Archives (4):** Chronicling America / Library of Congress (US newspapers 1756–1963), Trove / National Library of Australia (newspapers from 1803), Europeana (European cultural heritage), Internet Archive (books, documents, historical media)

**Genealogy (1):** FamilySearch

**Paywall Bypass (2):** Archive.org Wayback Machine, archive.is/archive.today — configured for NYT, Washington Post, WSJ, Financial Times, The Economist, Bloomberg, LA Times, Boston Globe, The Telegraph, IMDb, Variety, Deadline, AP News, Legacy.com, IBDB

**Browser Automation:** Playwright-based login handlers with session persistence for New York Times and Washington Post; CAPTCHA solving via 2Captcha and CapSolver

**Actuarial Data:** U.S. Social Security Administration period life tables and cohort life expectancy data

</details>

### The Data Pipeline

1. **TMDB Sync** — Daily import of movie/TV metadata, cast lists, and death dates from [The Movie Database](https://www.themoviedb.org/)
2. **Death Enrichment** — For each known death, the research pipeline queries free sources first, then search engines, then AI models (cheapest-first), with archive services bypassing paywalls — all results cross-referenced and confidence-scored
3. **Actuarial Calculations** — SSA period life tables produce expected mortality figures for every cast

Death information is cross-referenced across multiple sources before publication. Confidence levels are tracked and uncertain information is flagged. See the [Methodology](https://deadonfilm.com/methodology) and [Data Sources](https://deadonfilm.com/data-sources) pages for details.

## The Numbers

| Metric | Value |
|---|---|
| Actors tracked | 572,000+ |
| Known deceased | 25,000+ |
| Movies & TV shows | 152,000+ |
| Average cast mortality | 47.5% |
| Causes of death known | 42.1% |
| Leading cause | Heart attack |
| Update frequency | Daily |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Tunnel                     │
│               (SSL, routing, DDoS protection)           │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                   Docker Compose                        │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │   Frontend   │  │   Backend    │  │  PostgreSQL   │  │
│  │  React 18    │──│  Express.js  │──│     16        │  │
│  │  Vite        │  │  TypeScript  │  │               │  │
│  │  Tailwind    │  │              │  └───────────────┘  │
│  │  TanStack    │  │              │  ┌───────────────┐  │
│  └─────────────┘  │              │──│   Redis 7     │  │
│                    └──────┬───────┘  └───────────────┘  │
│                           │                             │
└───────────────────────────┼─────────────────────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
   ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
   │   TMDB API  │  │  Claude /   │  │  Wikidata / │
   │             │  │  Gemini /   │  │  Wikipedia  │
   │             │  │  Perplexity │  │             │
   └─────────────┘  └─────────────┘  └─────────────┘
```

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query |
| Backend | Node.js, Express.js, TypeScript |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| AI | Claude API, Gemini API, Perplexity API |
| Data | TMDB API, Wikidata, Wikipedia |
| Deployment | Docker Compose, Cloudflare Tunnel |
| Monitoring | New Relic APM |

## Getting Started

<details>
<summary><strong>Prerequisites</strong></summary>

- [Node.js](https://nodejs.org/) 18+
- [Docker](https://www.docker.com/) and Docker Compose (for PostgreSQL and Redis)
- [TMDB API token](https://developer.themoviedb.org/docs/getting-started) (required)
- [Anthropic API key](https://console.anthropic.com/) (optional — AI cause of death lookup)
- [Gemini API key](https://ai.google.dev/) (optional — death enrichment)
- [Perplexity API key](https://docs.perplexity.ai/) (optional — death enrichment)

</details>

### Development

```bash
# Install dependencies
npm install && cd server && npm install && cd ..

# Set up environment variables
cp server/.env.example server/.env
# Edit server/.env with your API keys (TMDB_API_TOKEN is required)

# Start everything (PostgreSQL, Redis, frontend + backend with HMR)
npm run dev

# Seed actuarial data (required for mortality statistics)
cd server && npm run seed:actuarial && npm run seed:cohort
```

Access at `http://localhost:5173`

### Production

```bash
npm run docker:up    # Build and deploy
npm run docker:down  # Stop
```

<details>
<summary><strong>Environment Variables</strong></summary>

Create `server/.env`:

```
TMDB_API_TOKEN=your_tmdb_token
DATABASE_URL=postgresql://user:pass@host/db
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=your_anthropic_key
GEMINI_API_KEY=your_gemini_key
PERPLEXITY_API_KEY=your_perplexity_key
NEW_RELIC_LICENSE_KEY=your_nr_key
```

Only `TMDB_API_TOKEN` and `DATABASE_URL` are required. AI keys enable cause-of-death enrichment. New Relic is optional.

</details>

<details>
<summary><strong>API Endpoints</strong></summary>

**Search**
- `GET /api/search?q={query}&type={movie|tv|all}` — Search movies, TV shows, and people

**Movies & TV**
- `GET /api/movie/{slug}` — Movie with cast mortality data
- `GET /api/show/{slug}` — TV show with cast mortality data
- `GET /api/movie/{id}/death-info?personIds=1,2,3` — Poll for cause of death updates

**Actors**
- `GET /api/actor/{slug}` — Actor profile and filmography

**Discovery**
- `GET /api/cursed-movies` — Movies ranked by curse score
- `GET /api/cursed-actors` — Actors ranked by co-star mortality
- `GET /api/discover/forever-young` — Actors who died young
- `GET /api/death-watch` — Living actors by mortality probability

**Deaths**
- `GET /api/on-this-day` — Deaths on today's date
- `GET /api/covid-deaths` — COVID-19 deaths
- `GET /api/unnatural-deaths` — Unnatural deaths by category
- `GET /api/deaths/causes` — Cause categories
- `GET /api/deaths/cause/{slug}` — Deaths by specific cause
- `GET /api/deaths/decades` — Decade categories
- `GET /api/deaths/decade/{decade}` — Deaths by decade

**System**
- `GET /api/stats` — Site statistics
- `GET /health` — Health check
- `GET /sitemap.xml` — Dynamic sitemap

</details>

## Interesting Implementation Details

If you are browsing this codebase to learn from it, here are the parts worth studying:

- **Actuarial engine** — SSA life table lookups and Mortality Surprise Score calculation. The most mathematically interesting part of the codebase.
- **AI orchestration** — Multi-provider research dispatch with result reconciliation and confidence scoring across Claude, Gemini, Perplexity, Wikidata, and Wikipedia.
- **TMDB sync pipeline** — Daily automated detection of newly reported deaths with enrichment triggers.
- **SEO architecture** — Dynamic sitemap generation and slug-based routing for 572K+ entities.
- **Self-hosted deployment** — Production Docker Compose with Cloudflare Tunnel, PostgreSQL, and Redis on a single bare-metal host.

## Project History

Dead on Film was created on March 2, 2015 as a Flask app with a single question: *which actors in this movie are dead?* It used IMDbPY, a PostgreSQL table of death dates, and not much else.

Over eleven years, that question expanded. Movies became movies and TV shows. A death date became a cause of death, a manner of death, a source citation. A list of names became an actuarial comparison. The Flask backend became Node.js. The jQuery frontend became React. The static database became an AI-powered enrichment pipeline.

The curiosity never changed. The tools got better.

## Contributing

Dead on Film is a solo project. Contributions are welcome, but response times may vary.

Good first issues:
- Tests (there are not enough)
- Documentation improvements
- UI/UX suggestions via [issues](https://github.com/chenders/deadonfilm/issues)
- Data accuracy reports (if you spot a wrong death date or cause)

## License

[MIT](LICENSE)

---

<div align="center">

**[deadonfilm.com](https://deadonfilm.com)**

*Everyone dies. Not everyone is in a movie.*

</div>
