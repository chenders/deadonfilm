# 🎬 Dead on Film

> **Actuarial-based mortality analysis for film and television casts**

A comprehensive web application that analyzes cast mortality across movies and TV shows using statistical methods. Look up any film or show to see which actors have passed away, discover statistically abnormal mortality patterns, and explore detailed death circumstances enriched by AI and 45+ data sources.

**Live at**: [deadonfilm.com](https://deadonfilm.com)

---

## ✨ Unique Features

### 📊 Statistical Mortality Analysis
- **Actuarial-based "Curse" Scores** - Uses US SSA life tables to calculate expected vs actual deaths
- **Mortality Surprise Metric** - Identifies films with statistically abnormal cast mortality
- **Years Lost Analysis** - Shows how far actors died below their life expectancy
- **Living Actor Forecasting** - Ranks living actors by one-year mortality probability

### 🤖 AI-Powered Death Information
- **45+ Data Sources** orchestrated by AI (Claude, GPT-4, Gemini, Perplexity)
- **Automatic source ranking** by success rate and cost
- **Confidence scoring** for each data point (0.0-1.0)
- **Multi-language support** - English, French, Chinese, Korean, Indian cinema sources
- **Historical archives** - Coverage back to 1756 via Library of Congress

### 🔍 Detailed Death Circumstances
- Official vs rumored/disputed accounts
- Notable factors (illness complications, contributing causes)
- Related celebrities involved
- Career status at time of death
- Posthumous releases
- Complete source attribution with URLs

### 📺 Granular Content Analysis
- Cast mortality at **movie**, **season**, and **episode** levels
- Real-time TMDB integration for live actor information
- Full filmography tracking with character roles
- Per-project mortality statistics

---

## 🚀 Core Features

### Discovery Pages

| Page | Description | Metric |
|------|-------------|--------|
| 🎭 **Forever Young** | Actors who died tragically young | Years lost vs life expectancy |
| 🎥 **Cursed Movies** | Films with abnormally high mortality | Statistical surprise score |
| 😷 **COVID Deaths** | Actors who died from COVID-19 | Death dates and details |
| ⚰️ **Death Watch** | Living actors by mortality risk | One-year mortality probability |
| 💀 **Unnatural Deaths** | Browse by accident, overdose, homicide, suicide | Category filters |
| 📅 **On This Day** | Actors who died on the current date | Historical calendar |
| 📖 **Notable Deaths** | Detailed circumstances with sources | Confidence levels |
| 🏥 **Causes of Death** | 3-level taxonomy with 12 primary categories | Actor counts by cause |
| 📆 **Deaths by Decade** | Browse mortality by decade | 1900s-2020s |

### Search & Lookup

- **Unified Search** - Movies, TV shows, and actors with relevance scoring
- **Actor Profiles** - Full filmography, death information, mortality statistics
- **Movie Pages** - Cast lists with deceased actors, expected vs actual deaths
- **TV Show Pages** - Series-level mortality analysis
- **Episode Pages** - Episode-specific cast mortality

### Admin Dashboard

- **Real-time Enrichment Monitoring** - Live progress bars, cost tracking, ETA
- **Multi-Source Management** - Configure and prioritize 45+ data sources
- **Cost Analytics** - Track API costs per source, per run, total spend
- **Coverage Analysis** - Measure death info coverage by actor popularity
- **Audit Trail** - All admin actions logged to database and New Relic
- **Cache Management** - Redis inspection and invalidation

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18 • TypeScript • Vite • Tailwind CSS • TanStack Query |
| **Backend** | Node.js • Express.js • TypeScript |
| **Database** | PostgreSQL 16 (Docker) |
| **Caching** | Redis 7 with graceful degradation |
| **AI/ML** | Claude 3.5 Sonnet • GPT-4 • Gemini Pro • Perplexity |
| **Data** | TMDB • Wikidata • Wikipedia • IMDb • 40+ sources |
| **Deployment** | Docker • Cloudflare Tunnel |
| **Monitoring** | New Relic APM • Custom event tracking |
| **SEO** | Dynamic sitemaps • JSON-LD • Helmet.js |

---

## 🏃 Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose V2
- TMDB API key ([get one here](https://www.themoviedb.org/settings/api))
- Anthropic API key for AI enrichment ([get one here](https://console.anthropic.com/))

### Development Setup

```bash
# 1. Clone and install
git clone https://github.com/chenders/deadonfilm.git
cd deadonfilm
npm install && cd server && npm install && cd ..

# 2. Configure environment
cp server/.env.example server/.env
# Edit server/.env with your API keys

# 3. Start everything (database + redis + frontend + backend)
npm run dev
```

Access at **http://localhost:5173**

### Seed Actuarial Data (Required)

```bash
cd server
npm run seed:actuarial  # US SSA life tables (2022)
npm run seed:cohort     # Cohort life expectancy data
```

### Production Deployment

```bash
npm run docker:up    # Build and deploy all services
npm run docker:down  # Stop all services
```

---

## 🔑 Environment Variables

Create `server/.env` with the following:

```bash
# Required
TMDB_API_TOKEN=your_tmdb_token
DATABASE_URL=postgresql://user:pass@localhost:5432/deadonfilm
REDIS_URL=redis://localhost:6379

# AI Enrichment (at least one recommended)
ANTHROPIC_API_KEY=your_claude_key      # Best accuracy
OPENAI_API_KEY=your_openai_key         # Alternative
GEMINI_API_KEY=your_gemini_key         # Google AI
PERPLEXITY_API_KEY=your_perplexity_key # Web search

# Monitoring (optional)
NEW_RELIC_LICENSE_KEY=your_nr_key
NEW_RELIC_APP_NAME=Dead on Film
```

See `server/.env.example` for all 45+ source configurations.

---

## 📡 API Reference

### URL Patterns

All URLs use SEO-friendly slugs:

| Type | Pattern | Example |
|------|---------|---------|
| Movie | `/movie/{slug}-{year}-{tmdbId}` | `/movie/the-godfather-1972-238` |
| TV Show | `/show/{slug}-{year}-{tmdbId}` | `/show/breaking-bad-2008-1396` |
| Episode | `/episode/{showSlug}-s{S}e{E}-{episodeSlug}-{showId}` | `/episode/seinfeld-s4e11-the-contest-1400` |
| Actor | `/actor/{slug}-{actorId}` | `/actor/marlon-brando-3084` |

> **Note**: Actor URLs use internal `actor.id` (not `tmdb_id`) to avoid ID overlap. Legacy URLs redirect with 301.

### Core Endpoints

#### Search
```http
GET /api/search?q={query}&type={movie|tv|all}
```
Returns movies and/or TV shows with relevance scoring.

#### Movies
```http
GET /api/movie/{slug}-{year}-{tmdbId}
```
Returns movie details with cast mortality statistics.

```http
GET /api/cursed-movies?page=1&limit=50&from=1980&to=1990
```
Returns movies ranked by mortality surprise score.

#### TV Shows
```http
GET /api/show/{slug}-{year}-{tmdbId}
```
Returns show details with series-level mortality.

```http
GET /api/show/{tmdbId}/season/{season}/episode/{episode}
```
Returns episode with cast mortality data.

#### Actors
```http
GET /api/actor/{slug}-{actorId}
```
Returns actor profile with full filmography and death info.

```http
GET /api/actor/{slug}-{actorId}/death
```
Returns detailed death circumstances with sources and confidence levels.

#### Discovery
```http
GET /api/recent-deaths?limit=10
```
Returns most recent actor deaths.

```http
GET /api/death-watch?page=1&limit=50
```
Returns living actors ranked by mortality probability.

```http
GET /api/covid-deaths?page=1&includeObscure=false
```
Returns actors who died from COVID-19.

```http
GET /api/unnatural-deaths?category=accident&page=1
```
Returns unnatural deaths by category (accident, overdose, homicide, suicide).

#### Causes of Death
```http
GET /api/causes-of-death
```
Returns 3-level cause hierarchy (categories → specific causes → actors).

```http
GET /api/deaths/cause/{causeSlug}?page=1
```
Returns actors who died from a specific cause.

```http
GET /api/deaths/decade/{1980s}?page=1
```
Returns actors who died in a specific decade.

#### Statistics
```http
GET /api/stats
```
Returns site-wide statistics (actor counts, top causes, etc.).

```http
GET /api/on-this-day
```
Returns actors who died on the current calendar date.

---

## 🗄 Database Schema

### Key Tables

| Table | Purpose |
|-------|---------|
| `actors` | Actor records with death info (tmdb_id nullable) |
| `movies` / `shows` / `episodes` | Content with mortality stats |
| `actor_movie_appearances` | Links actors to movies via actor_id |
| `actor_show_appearances` | Links actors to shows/episodes via actor_id |
| `actuarial_life_tables` | US SSA mortality tables (2022) |
| `cohort_life_expectancy` | Birth cohort life expectancy |
| `enrichment_runs` | Tracks AI enrichment batches |
| `admin_audit_log` | Admin action logging |

**Important**: Always join actors using `actor_id` (primary key), never `tmdb_id` (can be NULL).

---

## 🧪 Testing

```bash
# Frontend tests
npm test              # Run all tests
npm test -- --ui      # Open Vitest UI
npm test ActorPage    # Run specific test

# Backend tests
cd server
npm test              # Run all tests
npm test actor.test   # Run specific test

# Type checking
npm run type-check
cd server && npm run type-check

# Linting
npm run lint
cd server && npm run lint
```

All PRs must pass:
- ✅ 1,198 frontend tests
- ✅ 2,739 backend tests
- ✅ TypeScript type checking
- ✅ ESLint rules
- ✅ Prettier formatting

---

## 📊 Mortality Statistics

### Formulas

| Metric | Formula |
|--------|---------|
| **Expected Deaths** | Sum of P(death) for each actor from filming age to current age |
| **Curse Score** | `(Actual Deaths - Expected) / Expected` |
| **Years Lost** | `Expected Lifespan - Actual Age at Death` |

### Rules

1. **Archived Footage**: Exclude actors who died >3 years before film release
2. **Same-Year Death**: Count with minimum 1-year death probability
3. **Obscure Filtering**: Exclude actors with <2 movies OR <10 TV episodes

---

## 🏗 Project Structure

```
deadonfilm/
├── src/                        # React frontend
│   ├── components/            # Reusable UI components
│   ├── pages/                 # Route pages
│   ├── hooks/                 # Custom React hooks
│   ├── services/              # API clients
│   ├── types/                 # TypeScript definitions
│   └── utils/                 # Helper functions
├── server/                     # Express backend
│   ├── src/
│   │   ├── routes/           # API route handlers
│   │   ├── lib/              # Business logic
│   │   │   ├── db/          # Database queries
│   │   │   └── death-sources/ # 45+ data sources
│   │   └── index.ts          # Server entry
│   ├── migrations/            # Database migrations
│   └── scripts/               # CLI utilities
├── docs/                       # Documentation
└── e2e/                        # End-to-end tests
```

---

## 🤝 Contributing

Contributions welcome! Please:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feat/amazing-feature`)
3. **Write** tests for new features
4. **Ensure** all tests pass (`npm test && cd server && npm test`)
5. **Commit** with conventional commits (`feat:`, `fix:`, `docs:`)
6. **Push** to your fork
7. **Open** a Pull Request

See [CLAUDE.md](.claude/CLAUDE.md) for detailed contribution guidelines.

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **TMDB** - Movie and actor metadata
- **US Social Security Administration** - Actuarial life tables
- **Anthropic** - Claude AI for death information enrichment
- **Wikidata** - Structured death data
- **45+ additional sources** - News outlets, archives, and databases

---

## 📧 Contact

- **Website**: [deadonfilm.com](https://deadonfilm.com)
- **Issues**: [GitHub Issues](https://github.com/chenders/deadonfilm/issues)
- **Discussions**: [GitHub Discussions](https://github.com/chenders/deadonfilm/discussions)

---

Built with ❤️ using actuarial science and AI
