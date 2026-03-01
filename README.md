<div align="center">

# Dead on Film

*Biographies, death records, and mortality analysis for the people of film and television.*

[![Live Site](https://img.shields.io/badge/live-deadonfilm.com-a3333d)](https://deadonfilm.com)
[![License: MIT](https://img.shields.io/badge/license-MIT-a3333d)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-full--stack-a3333d)](https://www.typescriptlang.org/)

</div>

**[deadonfilm.com](https://deadonfilm.com)** tracks **572,000+ people** who have appeared on film — actors, documentary subjects, anyone who's been on screen — across **152,000+ movies and TV shows**. It tells their stories as people, not performers. The private, human stories that career-focused biographies never cover: childhoods, family tragedies, private struggles, unlikely origins. And for the 25,000+ who have died, it documents how — with detailed death records researched across 80+ sources and actuarial mortality analysis for every production.

- **Audrey Hepburn** — Both parents were active fascists. She survived the Nazi occupation of Holland on tulip-bulb flour, performed silent ballet recitals to fund the Dutch resistance, and hid a British paratrooper in her family's home. Her famous slender figure was childhood starvation, not Hollywood dieting. When terminal cancer was diagnosed in 1992, Hubert de Givenchy arranged a private jet filled with flowers to fly her home to Switzerland. Gregory Peck recorded a tearful tribute reciting Tagore's "Unending Love." → [Read her story](https://deadonfilm.com/actor/audrey-hepburn-6834)

- **Charlie Chaplin** — Sent to a Victorian workhouse twice before age nine. His mother was committed to an asylum. At fourteen he lived alone, sleeping rough and searching for food. He died peacefully on Christmas Day 1977 — then the body was stolen from its grave by ransom seekers, recovered eleven weeks later in a field, and re-interred in a reinforced concrete vault. → [Read his story](https://deadonfilm.com/actor/charlie-chaplin-15030)

- **David Bowie** — A schoolyard fight at fifteen gave him the mismatched pupils that became his trademark. He kept a photograph of Little Richard he'd cut out at age ten on his bedroom wall for the rest of his life. A Lama once told him he shouldn't become a Buddhist monk — he should follow music instead. He kept his eighteen-month cancer battle entirely secret, released *Blackstar* two days before his death, and left $2 million to the personal assistant who had helped him through addiction forty years earlier. → [Read his story](https://deadonfilm.com/actor/david-bowie-3294)

- **James Earl Jones** — Childhood trauma from the Great Migration left him with a stutter so severe he was nearly mute until high school. A teacher who discovered he wrote poetry dared him to read it aloud — and that voice became one of the most recognizable in cinema. → [Read his story](https://deadonfilm.com/actor/james-earl-jones-7540)

---

## What You'll Find

### The Lives

- AI-generated biographies focused on the person, not the career — childhood, family, struggles, relationships, private moments
- Multi-source enrichment pipeline researching 29 sources (Wikipedia, Britannica, news archives, books, obituaries) to build rich personal narratives
- "Lesser-Known Facts" — surprising personal details most biographies never mention, extracted from source material by Claude
- Life circumstance tags — color-coded badges like Orphaned, Refugee, Military Service, Dropout, Rags to Riches, Polyglot, Addiction Recovery
- Entity-linked narratives connecting people to each other across the database

### The Deaths

- Detailed death circumstances with source citations and confidence levels
- Cause of death research across 80+ sources — Wikidata, Wikipedia, Library of Congress, Find a Grave, news archives, 11 AI models
- Actuarial mortality analysis using SSA life tables for every production
## Explore

| Feature | What It Shows |
|---|---|
| [**Actor Profiles**](https://deadonfilm.com/actor/audrey-hepburn-6834) | Life stories, death narratives, filmography with mortality data |
| [**Notable Deaths**](https://deadonfilm.com/deaths/notable) | Detailed death circumstances with source citations |
| [**Strange Deaths**](https://deadonfilm.com/deaths/strange) | Unusual or mysterious death circumstances |
| [**Forever Young**](https://deadonfilm.com/forever-young) | Actors who died young, ranked by years of life lost |
| [**Deaths by Cause**](https://deadonfilm.com/causes-of-death) | Full taxonomy of causes of death |
| [**Deaths by Decade**](https://deadonfilm.com/deaths/decades) | Mortality trends across decades |
| [**Unnatural Deaths**](https://deadonfilm.com/unnatural-deaths) | Browse by accident, overdose, homicide, suicide |
| [**On This Day**](https://deadonfilm.com/on-this-day) | Actors who died on today's date |

## How It Works

### Biographies

Two systems work together. The **biography generator** produces concise 6-line summaries from TMDB and Wikipedia via Claude Sonnet — strict editorial policy, no superlatives, no hagiography. The **biography enrichment pipeline** goes deeper: it researches 29 sources (Wikipedia, Britannica, Biography.com, news archives, books, obituary sites, historical archives) to build rich personal narratives with childhood details, family background, personal struggles, and lesser-known facts. Claude synthesizes all source material into structured biography data including life circumstance tags (Orphaned, Military Service, Immigrant, Dropout, etc.) and surprising personal facts.

See [Biography System](docs/biography-system.md) for generation details and editorial philosophy.

### Death Research

When a death lacks cause-of-death information, the system dispatches a multi-stage research pipeline: free structured sources first (Wikidata, Wikipedia), then search engines with link following, then news archives (Guardian, NYT, AP, Reuters, Washington Post, BBC, and more) and historical databases (Library of Congress, Trove, Europeana), then 11 AI models ordered cheapest-first — from Gemini Flash at $0.0001/query to GPT-4o at $0.01. Claude consolidates raw data from all sources into structured, confidence-scored output. This pipeline has achieved 42% cause-of-death coverage across 25,000+ deceased actors.

See [Death Research Pipeline](docs/death-research-pipeline.md) for the full source inventory and pipeline details.

## The Numbers

| Metric | Value |
|---|---|
| People tracked | 572,000+ |
| Known deceased | 25,000+ |
| Movies & TV shows | 152,000+ |
| Causes of death known | ~42% |
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

React 18 + Vite frontend, Express/TypeScript backend, PostgreSQL 16, Redis 7 for caching, BullMQ for background jobs. AI via Claude, Gemini, Perplexity, and 8 other models. Self-hosted on bare metal with Docker Compose and Cloudflare Tunnel. Monitored by New Relic APM.

See [Architecture](docs/architecture.md) for deployment details, environment variables, and infrastructure.

## Getting Started

<details>
<summary><strong>Prerequisites</strong></summary>

- [Node.js](https://nodejs.org/) 18+
- [Docker](https://www.docker.com/) and Docker Compose (for PostgreSQL and Redis)
- [TMDB API token](https://developer.themoviedb.org/docs/getting-started) (required)
- [Anthropic API key](https://console.anthropic.com/) (optional — biography generation and death enrichment)

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

See [Architecture](docs/architecture.md) for environment variables and deployment configuration. See [API Reference](docs/api.md) for endpoint documentation.

## Interesting Implementation Details

If you're browsing this codebase to learn from it, here are the parts worth studying:

- **Biography generation** — Claude-powered pipeline that rewrites TMDB/Wikipedia content into personal narratives with strict editorial policy and substantive content gates.
- **Biography enrichment** — Multi-source research pipeline (29 sources) that builds rich personal narratives, extracts lesser-known facts, and assigns life circumstance tags. Three-stage content pipeline: mechanical pre-clean, Haiku AI extraction, Claude synthesis.
- **Actuarial engine** — SSA life table lookups and mortality statistics calculation. The most mathematically interesting part of the codebase.
- **Death research orchestration** — Multi-provider pipeline dispatching across 80+ sources with result reconciliation, confidence scoring, and cheapest-first cost optimization.
- **TMDB sync pipeline** — Daily automated detection of newly reported deaths with enrichment triggers.
- **SEO architecture** — Dynamic sitemap generation and slug-based routing for 572K+ entities.
- **Self-hosted deployment** — Production Docker Compose with Cloudflare Tunnel, PostgreSQL, and Redis on a single bare-metal host.

## Project History

Dead on Film was created on March 2, 2015 as a Flask app with a single question: *which actors in this movie are dead?* It used IMDbPY, a PostgreSQL table of death dates, and not much else.

Over eleven years, that question expanded. Movies became movies and TV shows. A death date became a cause of death, a manner of death, a source citation. A list of names became an actuarial comparison. The Flask backend became Node.js. The jQuery frontend became React. The static database became an AI-powered enrichment pipeline. In 2025, the biography system was added — shifting the project from pure mortality tracking toward telling people's stories as people, not just recording how they died. In 2026, the biography enrichment pipeline deepened that work: researching 19+ sources to build multi-paragraph personal narratives with lesser-known facts and life circumstance tags.

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

</div>
