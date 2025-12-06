import type { Request, Response } from "express"
import { getDeceasedByMonthDay } from "../lib/db.js"
import { getPersonCredits, getPersonDetails } from "../lib/tmdb.js"

interface OnThisDayDeath {
  actor: {
    id: number
    name: string
    profile_path: string | null
    deathday: string
    causeOfDeath: string | null
  }
  notableFilms: Array<{
    id: number
    title: string
    year: string
  }>
}

interface OnThisDayResponse {
  date: string
  month: string
  day: string
  deaths: OnThisDayDeath[]
  message?: string
}

export async function getOnThisDay(_req: Request, res: Response) {
  const today = new Date()
  const month = today.getMonth() + 1
  const day = today.getDate()
  const dateKey = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`

  try {
    // Check if database is available
    if (!process.env.DATABASE_URL) {
      const response: OnThisDayResponse = {
        date: dateKey,
        month: today.toLocaleDateString("en-US", { month: "long" }),
        day: today.toLocaleDateString("en-US", { day: "numeric" }),
        deaths: [],
        message: "Database not configured. Browse some movies to populate the data!",
      }
      return res.json(response)
    }

    // Query database for actors who died on this day
    const deceasedOnThisDay = await getDeceasedByMonthDay(month, day)

    if (deceasedOnThisDay.length === 0) {
      const response: OnThisDayResponse = {
        date: dateKey,
        month: today.toLocaleDateString("en-US", { month: "long" }),
        day: today.toLocaleDateString("en-US", { day: "numeric" }),
        deaths: [],
        message:
          "No recorded deaths on this day yet. Browse more movies to discover who passed away on this date!",
      }
      return res.json(response)
    }

    // Fetch notable films for each actor (limit to top 10 actors to avoid too many API calls)
    const deaths: OnThisDayDeath[] = []
    const actorsToProcess = deceasedOnThisDay.slice(0, 10)

    for (const person of actorsToProcess) {
      try {
        // Get their filmography from TMDB
        const [credits, personDetails] = await Promise.all([
          getPersonCredits(person.tmdb_id).catch(() => null),
          getPersonDetails(person.tmdb_id).catch(() => null),
        ])

        // Get top 3 most popular films
        const notableFilms =
          credits?.cast
            .filter((movie) => movie.release_date && movie.title)
            .sort((a, b) => b.popularity - a.popularity)
            .slice(0, 3)
            .map((movie) => ({
              id: movie.id,
              title: movie.title,
              year: movie.release_date.split("-")[0],
            })) || []

        deaths.push({
          actor: {
            id: person.tmdb_id,
            name: person.name,
            profile_path: personDetails?.profile_path || null,
            deathday: person.deathday,
            causeOfDeath: person.cause_of_death,
          },
          notableFilms,
        })
      } catch (error) {
        console.error(`Error fetching data for ${person.name}:`, error)
        // Still include the actor even if we couldn't get their films
        deaths.push({
          actor: {
            id: person.tmdb_id,
            name: person.name,
            profile_path: null,
            deathday: person.deathday,
            causeOfDeath: person.cause_of_death,
          },
          notableFilms: [],
        })
      }
    }

    const response: OnThisDayResponse = {
      date: dateKey,
      month: today.toLocaleDateString("en-US", { month: "long" }),
      day: today.toLocaleDateString("en-US", { day: "numeric" }),
      deaths,
    }

    // Add message if there are more actors than we displayed
    if (deceasedOnThisDay.length > 10) {
      response.message = `Showing 10 of ${deceasedOnThisDay.length} actors who died on this day.`
    }

    res.json(response)
  } catch (error) {
    console.error("On This Day error:", error)
    res.status(500).json({ error: { message: "Failed to fetch On This Day data" } })
  }
}
