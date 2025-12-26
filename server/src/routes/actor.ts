import type { Request, Response } from "express"
import { getPersonDetails } from "../lib/tmdb.js"
import { getActorFilmography, getActor as getActorRecord } from "../lib/db.js"
import { recordCustomEvent } from "../lib/newrelic.js"

interface ActorProfileResponse {
  actor: {
    id: number
    name: string
    birthday: string | null
    deathday: string | null
    biography: string
    profilePath: string | null
    placeOfBirth: string | null
  }
  analyzedFilmography: Array<{
    movieId: number
    title: string
    releaseYear: number | null
    character: string | null
    posterPath: string | null
    deceasedCount: number
    castCount: number
  }>
  deathInfo: {
    causeOfDeath: string | null
    causeOfDeathDetails: string | null
    wikipediaUrl: string | null
    ageAtDeath: number | null
    yearsLost: number | null
  } | null
}

export async function getActor(req: Request, res: Response) {
  const actorId = parseInt(req.params.id, 10)

  if (!actorId || isNaN(actorId)) {
    return res.status(400).json({ error: { message: "Invalid actor ID" } })
  }

  try {
    const startTime = Date.now()

    // Fetch actor details from TMDB
    const person = await getPersonDetails(actorId)

    // Query our database for filmography
    const filmography = await getActorFilmography(actorId)

    // Get death info if deceased
    let deathInfo: ActorProfileResponse["deathInfo"] = null
    if (person.deathday) {
      const deceasedRecord = await getActorRecord(actorId)
      if (deceasedRecord) {
        deathInfo = {
          causeOfDeath: deceasedRecord.cause_of_death,
          causeOfDeathDetails: deceasedRecord.cause_of_death_details,
          wikipediaUrl: deceasedRecord.wikipedia_url,
          ageAtDeath: deceasedRecord.age_at_death,
          yearsLost: deceasedRecord.years_lost,
        }
      } else {
        // Basic death info from TMDB only
        deathInfo = {
          causeOfDeath: null,
          causeOfDeathDetails: null,
          wikipediaUrl: null,
          ageAtDeath: calculateAge(person.birthday, person.deathday),
          yearsLost: null,
        }
      }
    }

    const response: ActorProfileResponse = {
      actor: {
        id: person.id,
        name: person.name,
        birthday: person.birthday,
        deathday: person.deathday,
        biography: person.biography,
        profilePath: person.profile_path,
        placeOfBirth: person.place_of_birth,
      },
      analyzedFilmography: filmography,
      deathInfo,
    }

    recordCustomEvent("ActorView", {
      tmdbId: actorId,
      name: person.name,
      isDeceased: !!person.deathday,
      filmographyCount: filmography.length,
      hasCauseOfDeath: !!deathInfo?.causeOfDeath,
      responseTimeMs: Date.now() - startTime,
    })

    res.json(response)
  } catch (error) {
    console.error("Actor fetch error:", error)
    res.status(500).json({ error: { message: "Failed to fetch actor data" } })
  }
}

function calculateAge(birthday: string | null, deathday: string | null): number | null {
  if (!birthday || !deathday) return null

  const birth = new Date(birthday)
  const death = new Date(deathday)
  let age = death.getFullYear() - birth.getFullYear()
  const monthDiff = death.getMonth() - birth.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && death.getDate() < birth.getDate())) {
    age--
  }

  return age
}
