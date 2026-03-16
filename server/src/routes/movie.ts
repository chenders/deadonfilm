import type { Request, Response } from "express"
import { getMovieDetails, getMovieCredits, batchGetPersonDetails } from "../lib/tmdb.js"
import { getCauseOfDeath, type DeathInfoSource } from "../lib/wikidata.js"
import newrelic from "newrelic"
import {
  batchUpsertActors,
  updateDeathInfoByActorId,
  upsertMovie,
  batchUpsertActorMovieAppearances,
  getMovie as getMovieFromDb,
  getMovieWithCast,
  type ActorInput,
  type ActorMovieAppearanceRecord,
  type MovieCastRow,
} from "../lib/db.js"
import { getActorsByInternalIds, getActorsIfAvailable } from "../lib/db-helpers.js"
import { calculateAge } from "../lib/date-utils.js"
import { calculateMovieMortality, type ActorForMortality } from "../lib/mortality-stats.js"
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
  // Aggregate rating score (Dead on Film Score)
  aggregateScore?: number | null
  aggregateConfidence?: number | null
}

const CAST_LIMIT = 30

export async function getMovie(req: Request, res: Response) {
  const movieId = parseInt(req.params.id, 10)

  if (!movieId || isNaN(movieId)) {
    return res.status(400).json({ error: { message: "Invalid movie ID" } })
  }

  try {
    const startTime = Date.now()

    // Fetch movie details from TMDB (for overview/runtime not stored in DB),
    // and try DB for cast + movie record, all in parallel
    const [movie, dbMovie, dbCast] = await Promise.all([
      getMovieDetails(movieId),
      getMovieFromDb(movieId).catch(() => null),
      getMovieWithCast(movieId).catch(() => []),
    ])

    const deceased: DeceasedActor[] = []
    const living: LivingActor[] = []
    // TMDB-specific data for background caching (only used in TMDB fallback path)
    let tmdbCacheData: CacheMovieParams | null = null

    if (dbCast.length > 0) {
      // ── DB-first path: build cast from database (internal actor IDs) ──
      // All actor data including death info comes from a single SQL JOIN.
      // No TMDB credits or person detail calls needed.
      buildCastFromDbRows(dbCast, deceased, living)
    } else {
      // ── TMDB fallback path: fetch credits + person details, seed to DB ──
      const credits = await getMovieCredits(movieId)
      const mainCast = credits.cast.slice(0, CAST_LIMIT)
      const personIds = mainCast.map((c) => c.id)
      const personDetails = await batchGetPersonDetails(personIds)

      // Upsert actors to get TMDB ID → internal ID mapping (await before response)
      const actorInputs: ActorInput[] = mainCast.map((castMember) => {
        const person = personDetails.get(castMember.id)
        return {
          tmdb_id: castMember.id,
          name: castMember.name,
          birthday: person?.birthday ?? null,
          deathday: person?.deathday ?? null,
          profile_path: person?.profile_path ?? null,
          known_for_department: castMember.known_for_department ?? null,
        }
      })

      let tmdbToActorId = new Map<number, number>()
      try {
        tmdbToActorId = await batchUpsertActors(actorInputs)
      } catch (error) {
        console.error("Actor upsert error in TMDB fallback:", error)
      }

      // Check database for existing death info
      const dbRecords = await getActorsIfAvailable(personIds)

      for (const castMember of mainCast) {
        const person = personDetails.get(castMember.id)
        const dbRecord = dbRecords.get(castMember.id)
        const actorId = tmdbToActorId.get(castMember.id) ?? castMember.id

        if (!person) {
          living.push({
            id: actorId,
            name: castMember.name,
            character: castMember.character,
            profile_path: castMember.profile_path,
            birthday: null,
            age: null,
          })
          continue
        }

        if (person.deathday) {
          const tmdbUrl = `https://www.themoviedb.org/person/${person.id}`
          deceased.push({
            id: actorId,
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
            ageAtDeath: dbRecord?.age_at_death ?? null,
            yearsLost: dbRecord?.years_lost ?? null,
          })
        } else {
          living.push({
            id: actorId,
            name: person.name,
            character: castMember.character,
            profile_path: person.profile_path,
            birthday: person.birthday,
            age: calculateAge(person.birthday),
          })
        }
      }

      // Prepare caching data (will be fired after mortality stats are calculated)
      tmdbCacheData = {
        movie,
        deceased,
        living,
        expectedDeaths: 0,
        mortalitySurpriseScore: 0,
        personDetails,
        mainCast,
      }
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
      // Include aggregate score if available from database
      aggregateScore: dbMovie?.aggregate_score ?? null,
      aggregateConfidence: dbMovie?.aggregate_confidence ?? null,
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

    // Cache movie and actor appearances in background (TMDB fallback path only)
    if (tmdbCacheData) {
      tmdbCacheData.expectedDeaths = expectedDeaths
      tmdbCacheData.mortalitySurpriseScore = mortalitySurpriseScore
      cacheMovieInBackground(tmdbCacheData)
    }

    newrelic.recordCustomEvent("MovieView", {
      tmdbId: movie.id,
      title: movie.title,
      releaseYear: releaseYear ?? 0,
      deceasedCount,
      livingCount,
      expectedDeaths,
      curseScore: mortalitySurpriseScore,
      dbFirst: dbCast.length > 0,
      responseTimeMs: Date.now() - startTime,
    })

    res.json(response)
  } catch (error) {
    console.error("Movie fetch error:", error)
    res.status(500).json({ error: { message: "Failed to fetch movie data" } })
  }
}

// ── DB-first path: build cast from database rows ──

function buildCastFromDbRows(
  dbCast: MovieCastRow[],
  deceased: DeceasedActor[],
  living: LivingActor[]
): void {
  for (const row of dbCast) {
    const tmdbUrl = row.actor_tmdb_id
      ? `https://www.themoviedb.org/person/${row.actor_tmdb_id}`
      : ""

    if (row.deathday) {
      deceased.push({
        id: row.actor_id,
        name: row.name,
        character: row.character_name || "Unknown",
        profile_path: row.profile_path,
        birthday: row.birthday,
        deathday: row.deathday,
        causeOfDeath: row.cause_of_death,
        causeOfDeathSource: row.cause_of_death_source,
        causeOfDeathDetails: row.cause_of_death_details,
        causeOfDeathDetailsSource: row.cause_of_death_details_source,
        wikipediaUrl: row.wikipedia_url,
        tmdbUrl,
        ageAtDeath: row.age_at_death,
        yearsLost: row.years_lost,
      })
    } else {
      living.push({
        id: row.actor_id,
        name: row.name,
        character: row.character_name || "Unknown",
        profile_path: row.profile_path,
        birthday: row.birthday,
        age: calculateAge(row.birthday),
      })
    }
  }
}

// Track movies with pending enrichment
const pendingEnrichment = new Map<number, Promise<void>>()

// ── Background caching (TMDB fallback only) ──

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
  mainCast: Array<{
    id: number
    name: string
    character: string | null
    known_for_department?: string
  }>
}

async function cacheMovieInBackground(params: CacheMovieParams): Promise<void> {
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

  try {
    // Build movie record using extracted utility
    const movieRecord = buildMovieRecord({
      movie,
      deceasedCount: deceased.length,
      livingCount: living.length,
      expectedDeaths,
      mortalitySurpriseScore,
    })

    // Build actor input records
    const actorInputs: ActorInput[] = mainCast.map((castMember) => {
      const person = personDetails.get(castMember.id)
      return {
        tmdb_id: castMember.id,
        name: castMember.name,
        birthday: person?.birthday ?? null,
        deathday: person?.deathday ?? null,
        profile_path: null, // Not available from credits
        known_for_department: castMember.known_for_department ?? null,
      }
    })

    // Upsert actors and get tmdb_id -> actor_id mapping
    const tmdbToActorId = await batchUpsertActors(actorInputs)

    // Build actor appearance records using the actor_id
    const appearances: ActorMovieAppearanceRecord[] = mainCast
      .map((castMember, index) => {
        const actorId = tmdbToActorId.get(castMember.id)
        if (!actorId) return null
        const person = personDetails.get(castMember.id)
        return buildActorMovieAppearanceRecord({
          actorId,
          character: castMember.character,
          movieId: movie.id,
          billingOrder: index,
          releaseYear,
          birthday: person?.birthday ?? null,
        })
      })
      .filter((a): a is ActorMovieAppearanceRecord => a !== null)

    // Save movie and appearances
    await Promise.all([upsertMovie(movieRecord), batchUpsertActorMovieAppearances(appearances)])
  } catch (error) {
    console.error("Movie cache error:", error)
  }
}

// ── Wikidata enrichment helpers ──

/** Store death info in database using internal actor ID */
function updateDeathInfoInDb(
  actorId: number,
  causeOfDeath: string | null,
  causeOfDeathSource: DeathInfoSource,
  causeOfDeathDetails: string | null,
  causeOfDeathDetailsSource: DeathInfoSource,
  wikipediaUrl: string | null
): void {
  if (!process.env.DATABASE_URL) return
  if (!causeOfDeath && !wikipediaUrl) return
  updateDeathInfoByActorId(
    actorId,
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

  // Fetch with limited concurrency to avoid overwhelming Wikidata
  const CONCURRENCY = 3
  const results: PromiseSettledResult<Awaited<ReturnType<typeof getCauseOfDeath>>>[] = []
  for (let i = 0; i < toEnrich.length; i += CONCURRENCY) {
    const batch = toEnrich.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.allSettled(
      batch.map((actor) => getCauseOfDeath(actor.name, actor.birthday, actor.deathday))
    )
    results.push(...batchResults)
  }

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

      // Save to database using internal actor ID
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

// ── Death info polling endpoint ──

/**
 * Endpoint to poll for enrichment updates.
 * Accepts internal actor IDs in the personIds query parameter.
 */
export async function getMovieDeathInfo(req: Request, res: Response) {
  const movieId = parseInt(req.params.id, 10)
  const personIdsParam = req.query.personIds as string

  if (!movieId || isNaN(movieId)) {
    return res.status(400).json({ error: { message: "Invalid movie ID" } })
  }

  if (!personIdsParam) {
    return res.status(400).json({ error: { message: "personIds query parameter required" } })
  }

  const actorIds = personIdsParam
    .split(",")
    .map((id) => parseInt(id, 10))
    .filter((id) => !isNaN(id))

  // Check if enrichment is still pending
  const isPending = pendingEnrichment.has(movieId)

  // Query database by internal actor IDs (frontend now sends internal IDs)
  const dbRecords = await getActorsByInternalIds(actorIds)

  // Return death info keyed by internal actor ID
  const deathInfo: Record<
    number,
    { causeOfDeath: string | null; causeOfDeathDetails: string | null; wikipediaUrl: string | null }
  > = {}
  for (const actorId of actorIds) {
    const record = dbRecords.get(actorId)
    if (record) {
      deathInfo[actorId] = {
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
