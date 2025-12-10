import type { Request, Response } from "express"
import { getCursedActors } from "../lib/db.js"

// Get list of cursed actors (actors whose co-stars have died at unusually high rates)
// Supports pagination and filtering by actor status, decade range, and minimum movies
export async function getCursedActorsRoute(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(parseInt(req.query.limit as string) || 50, 100)
    const offset = (page - 1) * pageSize

    // Parse filter parameters
    const fromDecade = req.query.from ? parseInt(req.query.from as string) : undefined
    const toDecade = req.query.to ? parseInt(req.query.to as string) : undefined
    const minMovies = req.query.minMovies ? parseInt(req.query.minMovies as string) : 2
    const status = req.query.status as "living" | "deceased" | "all" | undefined

    // Validate status parameter
    const actorStatus = status && ["living", "deceased", "all"].includes(status) ? status : "all"

    // Convert decades to year ranges
    const fromYear = fromDecade || undefined
    const toYear = toDecade ? toDecade + 9 : undefined

    const { actors, totalCount } = await getCursedActors({
      limit: pageSize,
      offset,
      minMovies,
      actorStatus,
      fromYear,
      toYear,
    })

    // Calculate rank based on global position (page offset + index)
    const result = actors.map((actor, index) => ({
      rank: offset + index + 1,
      id: actor.actor_tmdb_id,
      name: actor.actor_name,
      isDeceased: actor.is_deceased,
      totalMovies: actor.total_movies,
      totalActualDeaths: actor.total_actual_deaths,
      totalExpectedDeaths: actor.total_expected_deaths,
      curseScore: actor.curse_score,
    }))

    // Enforce max 20 pages
    const totalPages = Math.min(Math.ceil(totalCount / pageSize), 20)

    res.json({
      actors: result,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
      },
    })
  } catch (error) {
    console.error("Cursed actors error:", error)
    res.status(500).json({ error: { message: "Failed to fetch cursed actors" } })
  }
}
