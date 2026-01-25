# Dead on Film

A website to look up movies and TV shows to see which actors have passed away. Shows mortality statistics, death dates, and causes of death.

**Live at**: [deadonfilm.com](https://deadonfilm.com)

## Features

### Movies & TV Shows
- Search any movie or TV show and see its cast mortality statistics
- View deceased cast members with death dates and causes
- **Expected vs Actual mortality** - Compare deaths to actuarial predictions
- **Mortality surprise score** - Identify statistically abnormal cast mortality
- SEO-friendly URLs with slugs

### Discovery Pages
- **Cursed Movies** - Movies ranked by abnormally high cast mortality
- **Cursed Actors** - Actors whose co-stars died at unusually high rates
- **Forever Young** - Actors who died tragically young (years lost vs life expectancy)
- **COVID Deaths** - Actors who died from COVID-19
- **Unnatural Deaths** - Browse by accident, overdose, homicide, or suicide
- **Death Watch** - Living actors with highest mortality probability
- **Deaths by Cause/Decade** - Browse deaths by cause of death or decade
- **Notable Deaths** - Detailed death circumstances with sources
- **Strange Deaths** - Unusual or mysterious death circumstances

### Actor Profiles
- Full filmography for actors in the database
- Death info including cause and details
- Links to movies and shows they appeared in

### Other Features
- "On This Day" - Actors who died on the current date
- Real-time cause of death lookup with Claude AI
- Multi-source death information enrichment (Gemini, Perplexity, Wikidata, Wikipedia)
- Automatic source URL resolution and citation
- Daily sync with TMDB for new deaths
- Redis caching for fast responses
- New Relic APM monitoring

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, TanStack Query
- **Backend**: Node.js, Express.js, TypeScript
- **Database**: PostgreSQL 16 (self-hosted Docker)
- **Caching**: Redis 7
- **Deployment**: Bare-metal Docker with Cloudflare Tunnel
- **Monitoring**: New Relic APM
- **Data Sources**: TMDB API, Claude API, Gemini API, Perplexity API, Wikidata

## Quick Start

### Development

```bash
# Install dependencies
npm install && cd server && npm install && cd ..

# Set up environment variables
cp server/.env.example server/.env
# Edit server/.env with your API keys

# Start everything (db + redis containers, frontend + backend with HMR)
npm run dev

# Stop when done
npm run dev:stop
```

Access at http://localhost:5173

### Production

```bash
npm run docker:up    # Build and deploy
npm run docker:down  # Stop
```

### Seed actuarial data (required for mortality statistics)

```bash
cd server
npm run seed:actuarial
npm run seed:cohort
```

## Environment Variables

Create `server/.env`:

```
TMDB_API_TOKEN=your_tmdb_token
DATABASE_URL=postgresql://user:pass@host/db
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=your_anthropic_key    # For cause of death lookup
GEMINI_API_KEY=your_gemini_key          # For death enrichment
PERPLEXITY_API_KEY=your_perplexity_key  # For death enrichment
NEW_RELIC_LICENSE_KEY=your_nr_key       # For monitoring (optional)
```

## API Endpoints

### Search
- `GET /api/search?q={query}&type={movie|tv|all}` - Search movies and TV shows

### Movies
- `GET /api/movie/{slug}` - Get movie with cast mortality data
- `GET /api/movie/{id}/death-info?personIds=1,2,3` - Poll for cause of death updates
- `GET /api/cursed-movies` - Movies ranked by curse score

### TV Shows
- `GET /api/show/{slug}` - Get TV show with cast mortality data
- `GET /api/episode/{slug}` - Get episode with cast data

### Actors
- `GET /api/actor/{slug}` - Get actor profile and filmography
- `GET /api/cursed-actors` - Actors ranked by co-star mortality

### Deaths
- `GET /api/on-this-day` - Deaths on current date
- `GET /api/covid-deaths` - COVID-19 deaths
- `GET /api/unnatural-deaths` - Unnatural deaths by category
- `GET /api/deaths/causes` - List cause categories
- `GET /api/deaths/cause/{slug}` - Deaths by specific cause
- `GET /api/deaths/decades` - List decade categories
- `GET /api/deaths/decade/{decade}` - Deaths by decade

### Discovery
- `GET /api/discover/forever-young` - Actors who died young
- `GET /api/death-watch` - Living actors by mortality probability

### Other
- `GET /api/stats` - Site statistics
- `GET /health` - Health check
- `GET /sitemap.xml` - Dynamic sitemap

## License

MIT
