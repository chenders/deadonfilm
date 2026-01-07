/**
 * Episode route handlers.
 *
 * Handles fetching episode details and season episodes list.
 */

import type { Request, Response } from "express"
import {
  getTVShowDetails,
  getSeasonDetails,
  getEpisodeDetails,
  getEpisodeCredits,
  batchGetPersonDetails,
} from "../../lib/tmdb.js"
import { getActorsIfAvailable } from "../../lib/db-helpers.js"
import { calculateAge } from "../../lib/date-utils.js"
import { calculateMovieMortality, type ActorForMortality } from "../../lib/mortality-stats.js"
import type { DeceasedActor, LivingActor } from "./types.js"

// Get episode details with cast
export async function getEpisode(req: Request, res: Response) {
  const showId = parseInt(req.params.showId, 10)
  const seasonNumber = parseInt(req.params.season, 10)
  const episodeNumber = parseInt(req.params.episode, 10)

  if (!showId || isNaN(showId)) {
    return res.status(400).json({ error: { message: "Invalid show ID" } })
  }
  if (!seasonNumber || isNaN(seasonNumber)) {
    return res.status(400).json({ error: { message: "Invalid season number" } })
  }
  if (!episodeNumber || isNaN(episodeNumber)) {
    return res.status(400).json({ error: { message: "Invalid episode number" } })
  }

  try {
    // Fetch show details, episode details, and episode credits in parallel
    const [show, episode, credits] = await Promise.all([
      getTVShowDetails(showId),
      getEpisodeDetails(showId, seasonNumber, episodeNumber),
      getEpisodeCredits(showId, seasonNumber, episodeNumber),
    ])

    // Filter to English-language US shows
    if (show.original_language !== "en" || !show.origin_country.includes("US")) {
      return res.status(404).json({ error: { message: "Show not available" } })
    }

    // Combine cast and guest stars
    const allCast = [
      ...credits.cast.map((c) => ({ ...c, isGuestStar: false })),
      ...credits.guest_stars.map((c) => ({ ...c, isGuestStar: true })),
    ]

    // Batch fetch person details
    const personIds = allCast.map((c) => c.id)
    const personDetails = await batchGetPersonDetails(personIds)

    // Check database for existing death info
    const dbRecords = await getActorsIfAvailable(personIds)

    // Separate deceased and living
    const deceased: DeceasedActor[] = []
    const living: LivingActor[] = []

    for (const castMember of allCast) {
      const person = personDetails.get(castMember.id)
      const dbRecord = dbRecords.get(castMember.id)

      if (!person) {
        living.push({
          id: castMember.id,
          name: castMember.name,
          character: castMember.character || "Unknown",
          profile_path: castMember.profile_path,
          birthday: null,
          age: null,
          totalEpisodes: 1,
          episodes: [],
        })
        continue
      }

      if (person.deathday) {
        const tmdbUrl = `https://www.themoviedb.org/person/${person.id}`

        deceased.push({
          id: person.id,
          name: person.name,
          character: castMember.character || "Unknown",
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
          totalEpisodes: 1,
          episodes: [],
        })
      } else {
        living.push({
          id: person.id,
          name: person.name,
          character: castMember.character || "Unknown",
          profile_path: person.profile_path,
          birthday: person.birthday,
          age: calculateAge(person.birthday),
          totalEpisodes: 1,
          episodes: [],
        })
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

    // Calculate mortality statistics using episode air date as release year
    let expectedDeaths = 0
    let mortalitySurpriseScore = 0
    const airYear = episode.air_date ? parseInt(episode.air_date.split("-")[0]) : null

    if (airYear && totalCast > 0) {
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
        const mortalityResult = await calculateMovieMortality(airYear, allActors)
        expectedDeaths = mortalityResult.expectedDeaths
        mortalitySurpriseScore = mortalityResult.mortalitySurpriseScore

        // Update deceased actors with age at death and years lost
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
        console.error("Error calculating episode mortality stats:", error)
      }
    }

    res.json({
      show: {
        id: show.id,
        name: show.name,
        posterPath: show.poster_path,
        firstAirDate: show.first_air_date,
      },
      episode: {
        id: episode.id,
        seasonNumber: episode.season_number,
        episodeNumber: episode.episode_number,
        name: episode.name,
        overview: episode.overview,
        airDate: episode.air_date,
        runtime: episode.runtime,
        stillPath: episode.still_path,
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
    })
  } catch (error) {
    console.error("Episode fetch error:", error)
    res.status(500).json({ error: { message: "Failed to fetch episode data" } })
  }
}

// Get episodes for a specific season (lightweight endpoint for episode browser)
export async function getSeasonEpisodes(req: Request, res: Response) {
  const showId = parseInt(req.params.id, 10)
  const seasonNumber = parseInt(req.params.seasonNumber, 10)

  if (!showId || isNaN(showId)) {
    return res.status(400).json({ error: { message: "Invalid show ID" } })
  }
  if (!seasonNumber || isNaN(seasonNumber) || seasonNumber < 1) {
    return res.status(400).json({ error: { message: "Invalid season number" } })
  }

  try {
    const season = await getSeasonDetails(showId, seasonNumber)

    const episodes = season.episodes.map((ep) => ({
      episodeNumber: ep.episode_number,
      seasonNumber: ep.season_number,
      name: ep.name,
      airDate: ep.air_date,
    }))

    res.json({ episodes })
  } catch (error) {
    console.error("Season episodes fetch error:", error)
    res.status(500).json({ error: { message: "Failed to fetch season episodes" } })
  }
}
