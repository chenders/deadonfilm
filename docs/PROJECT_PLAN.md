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

### In Progress

#### Data Seeding
- [ ] Seed movies 2014-2024 (200 movies per year) - **Currently running**
- [ ] Seed classic films (1950s-1990s) for higher mortality data

### Planned Features

#### Young Deaths ("Gone Too Soon")
- [x] Calculate "years lost" for each deceased actor (expected lifespan - actual lifespan) - Implemented in `calculateMovieMortality()` and `calculateYearsLost()`
- [ ] Add badge on deceased cards showing years lost
- [ ] Create "Gone Too Soon" quick action endpoint
- [ ] Add filter/sort option on movie page by years lost

#### Cursed Actors
- [ ] Query actors across all movies in database
- [ ] For each living actor, calculate co-star mortality across their filmography
- [ ] Compare to expected mortality for those movies
- [ ] Rank by "curse score" (actual - expected deaths)
- [ ] Create "Cursed Actors" leaderboard page
- [ ] Show which movies contributed to their score

#### Discovery Pages
- [ ] Create `/discover/unusual-mortality` page showing movies with high surprise scores
- [ ] Create `/discover/cursed-actors` page
- [ ] Create `/discover/gone-too-soon` page for actors who died young

#### Quick Actions
- [ ] Add "Unusually High Mortality" quick action button
- [ ] Add "Cursed Actors" quick action button (when implemented)

---

## Seeding Commands

```bash
cd server

# Seed actuarial life tables (required first)
npm run seed:actuarial

# Seed movies by year range
npm run seed:movies -- 1995           # Single year
npm run seed:movies -- 1990 1999      # Year range

# Seed deceased actors (original script, also looks up cause of death)
npm run seed -- 1995
npm run seed -- 1990 1999
```

---

## Key Files

- `server/src/lib/mortality-stats.ts` - Mortality calculation utilities
- `server/data/actuarial-life-tables.json` - SSA Period Life Tables (2022)
- `server/scripts/seed-movies.ts` - Movie seeding script
- `server/scripts/seed-actuarial-tables.ts` - Actuarial data seeding
- `src/components/movie/MortalityGauge.tsx` - Expected vs actual display
