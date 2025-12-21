# Dead on Film - Project Plan

## Mortality Statistics Features

Based on actuarial data from US Social Security Administration life tables, the app calculates expected mortality for movie casts and identifies interesting patterns.

### Completed Features

#### Phase 1: Foundation - Actuarial Data
- [x] Created `actuarial_life_tables` database table
- [x] Added US SSA Period Life Tables (2022) data
- [x] Created seed script: `npm run seed:actuarial`
- [x] Created utility functions in `server/src/lib/mortality-stats.ts`

#### Phase 2: Expected vs Actual Mortality
- [x] Calculate expected deaths based on actor ages and movie release year
- [x] Added `expectedDeaths` and `mortalitySurpriseScore` to API response
- [x] Updated MortalityGauge component to show expected vs actual comparison
- [x] Added surprise labels: "Unusually High", "Higher Than Expected", "As Expected", "Lower Than Expected"

#### Phase 3: Database Infrastructure for Cross-Movie Analysis
- [x] Created `movies` table to cache movie metadata and mortality stats
- [x] Created `actor_appearances` table to link actors to movies
- [x] Added database functions for movies and actor appearances
- [x] Created seed script: `npm run seed:movies -- <startYear> [endYear]`

#### Phase 4: Cursed Movies
- [x] Created `/cursed-movies` page with pagination and filters
- [x] Filter by decade, minimum deaths, include/exclude obscure movies
- [x] Rank movies by mortality surprise score

#### Phase 5: Cursed Actors
- [x] Query actors across all movies in database
- [x] Calculate co-star mortality across filmography
- [x] Compare to expected mortality for those movies
- [x] Rank by "curse score" (actual - expected deaths)
- [x] Created `/cursed-actors` page with filters

#### Phase 6: Discovery Pages
- [x] `/cursed-movies` - Movies with high mortality surprise scores
- [x] `/cursed-actors` - Actors with high co-star mortality
- [x] `/forever-young` - Actors who died tragically young (years lost)
- [x] `/covid-deaths` - Actors who died from COVID-19
- [x] `/unnatural-deaths` - Accidents, suicides, overdoses, homicides
- [x] `/death-watch` - Living actors with highest mortality probability
- [x] `/deaths` - Browse deaths by cause or decade

#### Phase 7: TV Show Support
- [x] Created `shows`, `seasons`, `episodes` tables
- [x] Show pages with cast mortality at series or episode level
- [x] Episode pages with episode-specific cast
- [x] Same mortality statistics as movies

#### Phase 8: Actor Profile Pages
- [x] Full filmography for any actor in the database
- [x] Death info for deceased actors
- [x] Links to movies they appeared in

### Planned Features

#### Enhanced Visualizations
- [ ] Interactive timeline showing when cast members died over years since release
- [ ] Network graph of actor connections through shared movies

#### Genre/Director Analysis
- [ ] Mortality analysis by genre (horror vs comedy, etc.)
- [ ] Director mortality patterns

---

## Seeding Commands

```bash
cd server

# Seed actuarial life tables (required first)
npm run seed:actuarial

# Seed cohort life expectancy (for years lost calculations)
npm run seed:cohort

# Seed movies by year range
npm run seed:movies -- 1995           # Single year
npm run seed:movies -- 1990 1999      # Year range
npm run seed:movies -- --all-time     # All years since 1920

# Seed TV shows
npm run seed:shows -- <show_id>

# Seed deceased actors (original script)
npm run seed -- 1995
npm run seed -- 1990 1999

# Sync with TMDB for new deaths
npm run sync:tmdb
```

---

## Key Files

- `server/src/lib/mortality-stats.ts` - Mortality calculation utilities
- `server/src/lib/db.ts` - Database functions
- `server/data/actuarial-life-tables.json` - SSA Period Life Tables (2022)
- `server/scripts/seed-movies.ts` - Movie seeding script
- `server/scripts/seed-shows.ts` - TV show seeding script
- `server/scripts/sync-tmdb-changes.ts` - TMDB sync for new deaths
- `src/components/movie/MortalityGauge.tsx` - Expected vs actual display
