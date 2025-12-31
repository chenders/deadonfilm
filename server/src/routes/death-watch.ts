import type { Request, Response } from "express"
import { getDeathWatchActors } from "../lib/db.js"
import {
  calculateCumulativeDeathProbability,
  getCohortLifeExpectancy,
} from "../lib/mortality-stats.js"

interface DeathWatchActorResponse {
  rank: number
  id: number
  name: string
  age: number
  birthday: string
  profilePath: string | null
  deathProbability: number // 0-1, probability of dying in next year
  yearsRemaining: number | null // Life expectancy - current age
  totalMovies: number
  totalEpisodes: number
}

export async function getDeathWatchHandler(req: Request, res: Response) {
  try {
    // Check if database is available
    if (!process.env.DATABASE_URL) {
      return res.json({
        actors: [],
        pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
      })
    }

    // Parse query parameters
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50))
    const offset = (page - 1) * pageSize
    const minAge = req.query.minAge ? parseInt(req.query.minAge as string) : undefined
    const includeObscure = req.query.includeObscure === "true"
    const search = (req.query.search as string) || undefined

    // Fetch actors from database
    const { actors, totalCount } = await getDeathWatchActors({
      limit: pageSize,
      offset,
      minAge,
      includeObscure,
      search,
    })

    // Calculate death probabilities and years remaining for each actor
    const enrichedActors: DeathWatchActorResponse[] = await Promise.all(
      actors.map(async (actor, index) => {
        const birthYear = new Date(actor.birthday).getFullYear()

        // Calculate 1-year death probability
        const deathProbability = await calculateCumulativeDeathProbability(
          actor.age,
          actor.age + 1,
          "combined"
        )

        // Calculate years remaining based on cohort life expectancy
        let yearsRemaining: number | null = null
        try {
          const lifeExpectancy = await getCohortLifeExpectancy(birthYear, "combined")
          yearsRemaining = Math.max(0, Math.round((lifeExpectancy - actor.age) * 10) / 10)
        } catch (err) {
          // Cohort data may not be available for all birth years
          // Log unexpected errors for debugging
          if (err instanceof Error && !err.message.includes("not found")) {
            console.error(
              `Error calculating yearsRemaining for ${actor.actor_name} (birthYear: ${birthYear}):`,
              err
            )
          }
        }

        return {
          rank: offset + index + 1,
          id: actor.actor_id,
          name: actor.actor_name,
          age: actor.age,
          birthday: actor.birthday,
          profilePath: actor.profile_path,
          deathProbability: Math.round(deathProbability * 10000) / 10000, // 4 decimal precision
          yearsRemaining,
          totalMovies: actor.total_movies,
          totalEpisodes: actor.total_episodes,
        }
      })
    )

    res.json({
      actors: enrichedActors,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    })
  } catch (error) {
    console.error("Death Watch error:", error)
    res.status(500).json({ error: { message: "Failed to fetch Death Watch data" } })
  }
}
