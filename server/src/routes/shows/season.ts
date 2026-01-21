/**
 * Season route handlers.
 *
 * Handles fetching season details and season episodes list.
 */

import type { Request, Response } from "express"
import { getTVShowDetails, getSeasonDetails, batchGetPersonDetails } from "../../lib/tmdb.js"
import { getSeasons as getSeasonsFromDb } from "../../lib/db.js"
import { getActorsIfAvailable } from "../../lib/db-helpers.js"
import { calculateMovieMortality, type ActorForMortality } from "../../lib/mortality-stats.js"
import newrelic from "newrelic"

// Get seasons for a show from database (for cached shows)
export async function getShowSeasons(req: Request, res: Response) {
  const showId = parseInt(req.params.id, 10)

  if (!showId || isNaN(showId)) {
    return res.status(400).json({ error: { message: "Invalid show ID" } })
  }

  try {
    for (const [key, value] of Object.entries({
      "query.entity": "season",
      "query.operation": "list",
      "query.showId": showId,
    })) {
      newrelic.addCustomAttribute(key, value)
    }

    const seasons = await getSeasonsFromDb(showId)
    res.json({ seasons })
  } catch (error) {
    console.error("Error getting seasons:", error)
    res.status(500).json({ error: { message: "Failed to load seasons" } })
  }
}

// Get full season details with episode descriptions and death stats (for season page)
export async function getSeason(req: Request, res: Response) {
  const showId = parseInt(req.params.id, 10)
  const seasonNumber = parseInt(req.params.seasonNumber, 10)

  if (!showId || isNaN(showId)) {
    return res.status(400).json({ error: { message: "Invalid show ID" } })
  }
  if (!seasonNumber || isNaN(seasonNumber) || seasonNumber < 1) {
    return res.status(400).json({ error: { message: "Invalid season number" } })
  }

  try {
    for (const [key, value] of Object.entries({
      "query.entity": "season",
      "query.operation": "fetch",
      "query.showId": showId,
      "query.seasonNumber": seasonNumber,
    })) {
      newrelic.addCustomAttribute(key, value)
    }

    // Fetch show details and season details in parallel
    const [show, season] = await Promise.all([
      getTVShowDetails(showId),
      getSeasonDetails(showId, seasonNumber),
    ])

    // Filter to English-language US shows
    if (show.original_language !== "en" || !show.origin_country.includes("US")) {
      return res.status(404).json({ error: { message: "Show not available" } })
    }

    // Collect all guest stars from all episodes
    const allGuestStarIds = new Set<number>()
    for (const ep of season.episodes) {
      for (const gs of ep.guest_stars || []) {
        allGuestStarIds.add(gs.id)
      }
    }

    // Batch fetch person details for guest stars
    const personDetails = await batchGetPersonDetails([...allGuestStarIds])

    // Check database for existing death info
    const dbRecords = await getActorsIfAvailable([...allGuestStarIds])

    // Count deceased guest stars per episode
    // Track unique guest stars (same actor can appear in multiple episodes)
    // Also collect actor info for mortality calculation
    const seenGuestStars = new Set<number>()
    const seenDeceased = new Set<number>()
    const uniqueActors: ActorForMortality[] = []

    const episodes = season.episodes.map((ep) => {
      const guestStars = ep.guest_stars || []
      let episodeDeceasedCount = 0

      for (const gs of guestStars) {
        const dbRecord = dbRecords.get(gs.id)
        const person = personDetails.get(gs.id)
        // Check both database and TMDB for death info
        const isDeceased = dbRecord?.deathday || person?.deathday
        if (isDeceased) {
          episodeDeceasedCount++
          seenDeceased.add(gs.id)
        }

        // Add to unique actors list if not already seen
        if (!seenGuestStars.has(gs.id)) {
          seenGuestStars.add(gs.id)
          uniqueActors.push({
            tmdbId: gs.id,
            name: person?.name || gs.name,
            birthday: person?.birthday || dbRecord?.birthday || null,
            deathday: person?.deathday || dbRecord?.deathday || null,
          })
        }
      }

      return {
        episodeNumber: ep.episode_number,
        seasonNumber: ep.season_number,
        name: ep.name,
        airDate: ep.air_date,
        runtime: ep.runtime,
        guestStarCount: guestStars.length,
        deceasedCount: episodeDeceasedCount,
      }
    })

    // Find the season info from show details
    const seasonInfo = show.seasons.find((s) => s.season_number === seasonNumber)

    // Calculate mortality statistics using season air date as release year
    let expectedDeaths = 0
    let mortalitySurpriseScore = 0
    const seasonAirDate = seasonInfo?.air_date || season.episodes[0]?.air_date
    const airYear = seasonAirDate ? parseInt(seasonAirDate.split("-")[0]) : null

    if (airYear && uniqueActors.length > 0) {
      try {
        const mortalityResult = await calculateMovieMortality(airYear, uniqueActors)
        expectedDeaths = mortalityResult.expectedDeaths
        mortalitySurpriseScore = mortalityResult.mortalitySurpriseScore
      } catch (error) {
        console.error("Error calculating season mortality stats:", error)
      }
    }

    res.json({
      show: {
        id: show.id,
        name: show.name,
        posterPath: show.poster_path,
        firstAirDate: show.first_air_date,
      },
      season: {
        seasonNumber,
        name: seasonInfo?.name || `Season ${seasonNumber}`,
        airDate: seasonInfo?.air_date || null,
        posterPath: seasonInfo?.poster_path || null,
        episodeCount: season.episodes.length,
      },
      episodes,
      stats: {
        totalEpisodes: episodes.length,
        uniqueGuestStars: seenGuestStars.size,
        uniqueDeceasedGuestStars: seenDeceased.size,
        expectedDeaths,
        mortalitySurpriseScore,
      },
    })
  } catch (error) {
    console.error("Season fetch error:", error)
    res.status(500).json({ error: { message: "Failed to fetch season data" } })
  }
}
