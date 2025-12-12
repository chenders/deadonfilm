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

## Future Feature Ideas

Features enabled by storing all actor appearances (not just deceased):

### Six Degrees of Death
- Find connections between any two actors through shared movies
- Show the "mortality chain" - how many deceased actors link them

### Actor Profile Pages
- Full filmography for any actor (not just deceased ones)
- Personal mortality stats: "X of Y co-stars have died"
- "Luckiest actors" - those with unusually low co-star mortality

### Blessed Movies (inverse of Cursed)
- Movies with significantly fewer deaths than expected
- Casts that have aged remarkably well

### Living Cast Reunion Stats
- "X% of the original cast could still reunite"
- Countdown/tracking for older movies approaching 0% living

### Actor Longevity Predictions
- Based on filmography patterns and co-star data
- "Actors most likely to be the last survivor of [movie]"

### Genre/Director Mortality Analysis
- Do horror movie casts have higher mortality? Action films?
- Which directors' casts have the highest/lowest mortality rates?

### "Working Together" Stats
- Actors who frequently appeared together
- Track mortality of recurring ensembles (e.g., Christopher Guest films)

### Timeline Visualizations
- Interactive timeline showing when cast members died over the years since a movie's release

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
