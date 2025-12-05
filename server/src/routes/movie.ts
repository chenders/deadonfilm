import type { Request, Response } from 'express'
import { getMovieDetails, getMovieCredits, batchGetPersonDetails } from '../lib/tmdb.js'
import { getCauseOfDeath } from '../lib/wikidata.js'
import { cache, CACHE_KEYS, CACHE_TTL } from '../lib/cache.js'
import {
  getDeceasedPersons,
  batchUpsertDeceasedPersons,
  updateDeathInfo,
  type DeceasedPersonRecord,
} from '../lib/db.js'

interface DeceasedActor {
  id: number
  name: string
  character: string
  profile_path: string | null
  birthday: string | null
  deathday: string
  causeOfDeath: string | null
  wikipediaUrl: string | null
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
  }
  lastSurvivor: LivingActor | null
  cached: boolean
}

const CAST_LIMIT = 30

export async function getMovie(req: Request, res: Response) {
  const movieId = parseInt(req.params.id, 10)

  if (!movieId || isNaN(movieId)) {
    return res.status(400).json({ error: { message: 'Invalid movie ID' } })
  }

  try {
    // Check full response cache first
    const cacheKey = CACHE_KEYS.movieFull(movieId)
    const cached = cache.get<MovieResponse>(cacheKey)

    if (cached) {
      return res.json({ ...cached, cached: true })
    }

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
    const newDeceasedForDb: DeceasedPersonRecord[] = []

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
        // Use database record if available, otherwise use TMDB data
        deceased.push({
          id: person.id,
          name: person.name,
          character: castMember.character,
          profile_path: person.profile_path,
          birthday: person.birthday,
          deathday: person.deathday,
          causeOfDeath: dbRecord?.cause_of_death || null,
          wikipediaUrl: dbRecord?.wikipedia_url || null,
        })

        // Track new deceased persons to save to database
        if (!dbRecord) {
          newDeceasedForDb.push({
            tmdb_id: person.id,
            name: person.name,
            birthday: person.birthday,
            deathday: person.deathday,
            cause_of_death: null,
            wikipedia_url: null,
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
      },
      lastSurvivor,
      cached: false,
    }

    // Cache the response immediately (without cause of death)
    cache.set(cacheKey, response, CACHE_TTL.MOVIE_CREDITS)

    // Start Wikidata enrichment in background (don't await)
    enrichWithWikidata(movieId, deceased)

    res.json(response)
  } catch (error) {
    console.error('Movie fetch error:', error)
    res.status(500).json({ error: { message: 'Failed to fetch movie data' } })
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

// Store for background enrichment results
const deathInfoCache = new Map<string, DeathInfo>()

interface DeathInfo {
  causeOfDeath: string | null
  wikipediaUrl: string | null
}

function getDeathInfoCacheKey(movieId: number, personId: number): string {
  return `death:${movieId}:${personId}`
}

// Helper to safely get deceased persons from database (returns empty map if DB unavailable)
async function getDeceasedPersonsIfAvailable(
  tmdbIds: number[]
): Promise<Map<number, DeceasedPersonRecord>> {
  if (!process.env.DATABASE_URL) return new Map()
  try {
    return await getDeceasedPersons(tmdbIds)
  } catch (error) {
    console.error('Database read error:', error)
    return new Map()
  }
}

// Helper to save deceased persons to database in background
function saveDeceasedToDb(persons: DeceasedPersonRecord[]): void {
  if (!process.env.DATABASE_URL) return
  batchUpsertDeceasedPersons(persons).catch((error) => {
    console.error('Database write error:', error)
  })
}

// Helper to update death info in database
function updateDeathInfoInDb(
  tmdbId: number,
  causeOfDeath: string | null,
  wikipediaUrl: string | null
): void {
  if (!process.env.DATABASE_URL) return
  if (!causeOfDeath && !wikipediaUrl) return
  updateDeathInfo(tmdbId, causeOfDeath, wikipediaUrl).catch((error) => {
    console.error('Database update error:', error)
  })
}

async function enrichWithWikidata(movieId: number, deceased: DeceasedActor[]): Promise<void> {
  // Only enrich actors that don't already have cause of death
  const toEnrich = deceased.filter((actor) => !actor.causeOfDeath).slice(0, 15)

  if (toEnrich.length === 0) return

  // Fetch in parallel for speed
  const results = await Promise.allSettled(
    toEnrich.map((actor) => getCauseOfDeath(actor.name, actor.birthday, actor.deathday))
  )

  // Store results in dedicated cache and database
  for (let i = 0; i < toEnrich.length; i++) {
    const result = results[i]
    const actor = toEnrich[i]
    const cacheKey = getDeathInfoCacheKey(movieId, actor.id)

    if (result.status === 'fulfilled') {
      const { causeOfDeath, wikipediaUrl } = result.value

      deathInfoCache.set(cacheKey, { causeOfDeath, wikipediaUrl })

      // Save to database for permanent storage
      updateDeathInfoInDb(actor.id, causeOfDeath, wikipediaUrl)
    } else {
      // Cache negative result to avoid re-fetching
      deathInfoCache.set(cacheKey, {
        causeOfDeath: null,
        wikipediaUrl: null,
      })
    }
  }
}

// Export function to get death info for a movie's actors
export function getDeathInfo(movieId: number, personIds: number[]): Map<number, DeathInfo> {
  const results = new Map<number, DeathInfo>()

  for (const personId of personIds) {
    const cacheKey = getDeathInfoCacheKey(movieId, personId)
    const cached = deathInfoCache.get(cacheKey)
    if (cached) {
      results.set(personId, cached)
    }
  }

  return results
}
