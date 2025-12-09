# Dead on Film

A website to look up movies and see which actors have passed away. Shows mortality statistics, death dates, and causes of death.

**Live at**: [deadonfilm.com](https://deadonfilm.com)

## Features

- Search any movie and see its cast mortality statistics
- View deceased cast members with death dates and causes
- **Expected vs Actual mortality** - See how many deaths were expected based on actuarial data
- **Mortality surprise score** - Identify movies with unusually high or low cast mortality
- "On This Day" feature showing actors who died on the current date
- Real-time cause of death lookup with loading indicators
- SEO-friendly URLs with movie slugs

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, TanStack Query
- **Backend**: Node.js, Express.js, TypeScript
- **Database**: PostgreSQL (Neon serverless)
- **Deployment**: Google Kubernetes Engine (GKE)
- **Data Sources**: TMDB API, Claude API, Wikidata

## Quick Start

```bash
# Install dependencies
npm install && cd server && npm install && cd ..

# Set up environment variables
cp server/.env.example server/.env
# Edit server/.env with your API keys

# Run development servers
npm run dev:all
```

Access at http://localhost:5173

### Seed actuarial data (required for mortality statistics)

```bash
cd server && npm run seed:actuarial
```

## Environment Variables

Create `server/.env`:

```
TMDB_API_TOKEN=your_tmdb_token
DATABASE_URL=postgresql://user:pass@host/db
ANTHROPIC_API_KEY=your_anthropic_key  # For cause of death lookup
```

## API Endpoints

- `GET /api/search?q={query}` - Search movies
- `GET /api/movie/{id}` - Get movie with cast mortality data
- `GET /api/movie/{id}/death-info?personIds=1,2,3` - Poll for cause of death updates
- `GET /api/on-this-day` - Deaths on current date
- `GET /health` - Health check

## License

MIT
