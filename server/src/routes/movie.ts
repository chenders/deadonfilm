import type { Request, Response } from "express"
import { getMovieDetails, getMovieCredits, batchGetPersonDetails } from "../lib/tmdb.js"
import { getCauseOfDeath, type DeathInfoSource } from "../lib/wikidata.js"
import {
  getActors,
  batchUpsertActors,
  updateDeathInfo,
  upsertMovie,
  batchUpsertActorMovieAppearances,
  type ActorRecord,
  type ActorInput,
  type ActorMovieAppearanceRecord,
} from "../lib/db.js"
import {
  calculateMovieMortality,
  calculateYearsLost,
  type ActorForMortality,
} from "../lib/mortality-stats.js"
import { buildMovieRecord, buildActorMovieAppearanceRecord } from "../lib/movie-cache.js"

interface DeceasedActor {
  id: number
  name: string
  character: string
  profile_path: string | null
  birthday: string | null
  deathday: string
  causeOfDeath: string | null
  causeOfDeathSource: DeathInfoSource
  causeOfDeathDetails: string | null
  causeOfDeathDetailsSource: DeathInfoSource
  wikipediaUrl: string | null
  tmdbUrl: string
  // Mortality statistics
  ageAtDeath: number | null
  yearsLost: number | null
}

interface LivingActor {
  id: number
  name: string
  character: string
  profile_path: string | null
  birthday: string | null
  age: number | null
}

interface MovieResponse {
  movie: {
    id: number
    title: string
    release_date: string
    poster_path: string | null
    overview: string
    runtime: number | null
    genres: Array<{ id: number; name: string }>
  }
  deceased: DeceasedActor[]
  living: LivingActor[]
  stats: {
    totalCast: number
    deceasedCount: number
    livingCount: number
    mortalityPercentage: number
    // Mortality statistics
    expectedDeaths: number
    mortalitySurpriseScore: number
  }
  lastSurvivor: LivingActor | null
  enrichmentPending?: boolean
}

const CAST_LIMIT = 30

export async function getMovie(req: Request, res: Response) {
  const movieId = parseInt(req.params.id, 10)

  if (!movieId || isNaN(movieId)) {
    return res.status(400).json({ error: { message: "Invalid movie ID" } })
  }

  try {
    // Fetch movie details and credits in parallel
    const [movie, credits] = await Promise.all([getMovieDetails(movieId), getMovieCredits(movieId)])

    // Limit to top billed cast members
    const mainCast = credits.cast.slice(0, CAST_LIMIT)

    // Batch fetch person details
    const personIds = mainCast.map((c) => c.id)
    const personDetails = await batchGetPersonDetails(personIds)

    // Check database for existing death info
    const dbRecords = await getDeceasedPersonsIfAvailable(personIds)

    // Separate deceased and living
    const deceased: DeceasedActor[] = []
    const living: LivingActor[] = []
    const newDeceasedForDb: ActorInput[] = []

    for (const castMember of mainCast) {
      const person = personDetails.get(castMember.id)
      const dbRecord = dbRecords.get(castMember.id)

      if (!person) {
        living.push({
          id: castMember.id,
          name: castMember.name,
          character: castMember.character,
          profile_path: castMember.profile_path,
          birthday: null,
          age: null,
        })
        continue
      }

      if (person.deathday) {
        // Generate TMDB profile URL (always available since we have the person ID)
        const tmdbUrl = `https://www.themoviedb.org/person/${person.id}`

        // Use database record if available, otherwise use TMDB data
        // Note: ageAtDeath and yearsLost will be updated by mortality calculation if not in DB
        deceased.push({
          id: person.id,
          name: person.name,
          character: castMember.character,
          profile_path: person.profile_path,
          birthday: person.birthday,
          deathday: person.deathday,
          causeOfDeath: dbRecord?.cause_of_death || null,
          causeOfDeathSource: dbRecord?.cause_of_death_source || null,
          causeOfDeathDetails: dbRecord?.cause_of_death_details || null,
          causeOfDeathDetailsSource: dbRecord?.cause_of_death_details_source || null,
          wikipediaUrl: dbRecord?.wikipedia_url || null,
          tmdbUrl,
          // Use database values if available, otherwise will be calculated later
          ageAtDeath: dbRecord?.age_at_death ?? null,
          yearsLost: dbRecord?.years_lost ?? null,
        })

        // Track new deceased persons to save to database
        if (!dbRecord) {
          // Calculate mortality stats for new deceased person
          const yearsLostResult = await calculateYearsLost(person.birthday, person.deathday)

          newDeceasedForDb.push({
            tmdb_id: person.id,
            name: person.name,
            birthday: person.birthday,
            deathday: person.deathday,
            cause_of_death: null,
            cause_of_death_source: null,
            cause_of_death_details: null,
            cause_of_death_details_source: null,
            wikipedia_url: null,
            profile_path: person.profile_path,
            age_at_death: yearsLostResult?.ageAtDeath ?? null,
            expected_lifespan: yearsLostResult?.expectedLifespan ?? null,
            years_lost: yearsLostResult?.yearsLost ?? null,
          })
        }
      } else {
        living.push({
          id: person.id,
          name: person.name,
          character: castMember.character,
          profile_path: person.profile_path,
          birthday: person.birthday,
          age: calculateAge(person.birthday),
        })
      }
    }

    // Save new deceased persons to database in background
    if (newDeceasedForDb.length > 0) {
      saveDeceasedToDb(newDeceasedForDb)
    }

    // Sort deceased by death date (most recent first)
    deceased.sort((a, b) => {
      return new Date(b.deathday).getTime() - new Date(a.deathday).getTime()
    })

    // Calculate stats
    const totalCast = deceased.length + living.length
    const deceasedCount = deceased.length
    const livingCount = living.length
    const mortalityPercentage = totalCast > 0 ? Math.round((deceasedCount / totalCast) * 100) : 0

    // Calculate mortality statistics
    let expectedDeaths = 0
    let mortalitySurpriseScore = 0
    const releaseYear = movie.release_date ? parseInt(movie.release_date.split("-")[0]) : null

    if (releaseYear && totalCast > 0) {
      // Prepare actor data for mortality calculation
      const allActors: ActorForMortality[] = [
        ...deceased.map((d) => ({
          tmdbId: d.id,
          name: d.name,
          birthday: d.birthday,
          deathday: d.deathday,
        })),
        ...living.map((l) => ({
          tmdbId: l.id,
          name: l.name,
          birthday: l.birthday,
          deathday: null,
        })),
      ]

      try {
        const mortalityResult = await calculateMovieMortality(releaseYear, allActors)
        expectedDeaths = mortalityResult.expectedDeaths
        mortalitySurpriseScore = mortalityResult.mortalitySurpriseScore

        // Update deceased actors with age at death and years lost (only if not already from DB)
        for (const actorResult of mortalityResult.actorResults) {
          if (actorResult.isDeceased) {
            const deceasedActor = deceased.find((d) => d.id === actorResult.tmdbId)
            if (deceasedActor) {
              // Only update if not already populated from database
              if (deceasedActor.ageAtDeath === null) {
                deceasedActor.ageAtDeath = actorResult.ageAtDeath
              }
              if (deceasedActor.yearsLost === null) {
                deceasedActor.yearsLost = actorResult.yearsLost
              }
            }
          }
        }
      } catch (error) {
        console.error("Error calculating mortality stats:", error)
        // Continue without mortality stats if calculation fails
      }
    }

    // Find last survivor
    let lastSurvivor: LivingActor | null = null
    if (living.length > 0 && living.length <= 5) {
      lastSurvivor = living[0]
    }

    const response: MovieResponse = {
      movie: {
        id: movie.id,
        title: movie.title,
        release_date: movie.release_date,
        poster_path: movie.poster_path,
        overview: movie.overview,
        runtime: movie.runtime,
        genres: movie.genres,
      },
      deceased,
      living,
      stats: {
        totalCast,
        deceasedCount,
        livingCount,
        mortalityPercentage,
        expectedDeaths,
        mortalitySurpriseScore,
      },
      lastSurvivor,
    }

    // Check if any actors need enrichment
    const needsEnrichment = deceased.some((actor) => !actor.causeOfDeath && !actor.wikipediaUrl)

    // Start Wikidata enrichment in background (don't await)
    if (needsEnrichment) {
      const enrichmentPromise = enrichWithWikidata(movieId, deceased)
      pendingEnrichment.set(movieId, enrichmentPromise)
      enrichmentPromise.finally(() => pendingEnrichment.delete(movieId))
      response.enrichmentPending = true
    }

    // Cache movie and actor appearances in background (on-demand seeding)
    // This populates the movies and actor_appearances tables for cursed movies/actors features
    cacheMovieInBackground({
      movie,
      deceased,
      living,
      expectedDeaths,
      mortalitySurpriseScore,
      personDetails,
      mainCast,
    })

    res.json(response)
  } catch (error) {
    console.error("Movie fetch error:", error)
    res.status(500).json({ error: { message: "Failed to fetch movie data" } })
  }
}

function calculateAge(birthday: string | null): number | null {
  if (!birthday) return null

  const birth = new Date(birthday)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }

  return age
}

// Track movies with pending enrichment
const pendingEnrichment = new Map<number, Promise<void>>()

// Helper to safely get deceased persons from database (returns empty map if DB unavailable)
async function getDeceasedPersonsIfAvailable(tmdbIds: number[]): Promise<Map<number, ActorRecord>> {
  if (!process.env.DATABASE_URL) return new Map()
  try {
    return await getActors(tmdbIds)
  } catch (error) {
    console.error("Database read error:", error)
    return new Map()
  }
}

// Helper to save deceased persons to database in background
function saveDeceasedToDb(persons: ActorInput[]): void {
  if (!process.env.DATABASE_URL) return
  batchUpsertActors(persons).catch((error) => {
    console.error("Database write error:", error)
  })
}

// Helper to cache movie and actor appearances in background (on-demand seeding)
interface CacheMovieParams {
  movie: {
    id: number
    title: string
    release_date: string | null
    poster_path: string | null
    genres: Array<{ id: number; name: string }>
  }
  deceased: DeceasedActor[]
  living: LivingActor[]
  expectedDeaths: number
  mortalitySurpriseScore: number
  personDetails: Map<number, { birthday?: string | null; deathday?: string | null }>
  mainCast: Array<{ id: number; name: string; character: string | null }>
}

function cacheMovieInBackground(params: CacheMovieParams): void {
  if (!process.env.DATABASE_URL) return

  const {
    movie,
    deceased,
    living,
    expectedDeaths,
    mortalitySurpriseScore,
    personDetails,
    mainCast,
  } = params
  const releaseYear = movie.release_date ? parseInt(movie.release_date.split("-")[0]) : null

  // Build movie record using extracted utility
  const movieRecord = buildMovieRecord({
    movie,
    deceasedCount: deceased.length,
    livingCount: living.length,
    expectedDeaths,
    mortalitySurpriseScore,
  })

  // Build actor appearance records using extracted utility
  const appearances: ActorMovieAppearanceRecord[] = mainCast.map((castMember, index) => {
    const person = personDetails.get(castMember.id)
    return buildActorMovieAppearanceRecord({
      castMember,
      movieId: movie.id,
      billingOrder: index,
      releaseYear,
      birthday: person?.birthday ?? null,
    })
  })

  // Save in background
  Promise.all([upsertMovie(movieRecord), batchUpsertActorMovieAppearances(appearances)]).catch(
    (error) => {
      console.error("Movie cache error:", error)
    }
  )
}

// Helper to update death info in database
function updateDeathInfoInDb(
  tmdbId: number,
  causeOfDeath: string | null,
  causeOfDeathSource: DeathInfoSource,
  causeOfDeathDetails: string | null,
  causeOfDeathDetailsSource: DeathInfoSource,
  wikipediaUrl: string | null
): void {
  if (!process.env.DATABASE_URL) return
  if (!causeOfDeath && !wikipediaUrl) return
  updateDeathInfo(
    tmdbId,
    causeOfDeath,
    causeOfDeathSource,
    causeOfDeathDetails,
    causeOfDeathDetailsSource,
    wikipediaUrl
  ).catch((error) => {
    console.error("Database update error:", error)
  })
}

async function enrichWithWikidata(_movieId: number, deceased: DeceasedActor[]): Promise<void> {
  // Only enrich actors that don't already have cause of death
  const toEnrich = deceased.filter((actor) => !actor.causeOfDeath).slice(0, 15)

  if (toEnrich.length === 0) return

  // Fetch in parallel for speed
  const results = await Promise.allSettled(
    toEnrich.map((actor) => getCauseOfDeath(actor.name, actor.birthday, actor.deathday))
  )

  // Store results in database
  for (let i = 0; i < toEnrich.length; i++) {
    const result = results[i]
    const actor = toEnrich[i]

    if (result.status === "fulfilled") {
      const {
        causeOfDeath,
        causeOfDeathSource,
        causeOfDeathDetails,
        causeOfDeathDetailsSource,
        wikipediaUrl,
      } = result.value

      // Update the deceased actor in the array
      if (causeOfDeath || wikipediaUrl) {
        actor.causeOfDeath = causeOfDeath
        actor.causeOfDeathSource = causeOfDeathSource
        actor.causeOfDeathDetails = causeOfDeathDetails
        actor.causeOfDeathDetailsSource = causeOfDeathDetailsSource
        actor.wikipediaUrl = wikipediaUrl
      }

      // Save to database for permanent storage
      updateDeathInfoInDb(
        actor.id,
        causeOfDeath,
        causeOfDeathSource,
        causeOfDeathDetails,
        causeOfDeathDetailsSource,
        wikipediaUrl
      )
    }
  }
}

// Endpoint to poll for enrichment updates
export async function getMovieDeathInfo(req: Request, res: Response) {
  const movieId = parseInt(req.params.id, 10)
  const personIdsParam = req.query.personIds as string

  if (!movieId || isNaN(movieId)) {
    return res.status(400).json({ error: { message: "Invalid movie ID" } })
  }

  if (!personIdsParam) {
    return res.status(400).json({ error: { message: "personIds query parameter required" } })
  }

  const personIds = personIdsParam
    .split(",")
    .map((id) => parseInt(id, 10))
    .filter((id) => !isNaN(id))

  // Check if enrichment is still pending
  const isPending = pendingEnrichment.has(movieId)

  // Query database directly for the latest death info
  const dbRecords = await getDeceasedPersonsIfAvailable(personIds)

  // Return death info for requested actors
  const deathInfo: Record<
    number,
    { causeOfDeath: string | null; causeOfDeathDetails: string | null; wikipediaUrl: string | null }
  > = {}
  for (const personId of personIds) {
    const record = dbRecords.get(personId)
    if (record) {
      deathInfo[personId] = {
        causeOfDeath: record.cause_of_death,
        causeOfDeathDetails: record.cause_of_death_details,
        wikipediaUrl: record.wikipedia_url,
      }
    }
  }

  res.json({
    pending: isPending,
    deathInfo,
  })
}
