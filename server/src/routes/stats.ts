import type { Request, Response } from "express"
import { getSiteStats, getRecentDeaths, getCovidDeaths } from "../lib/db.js"

export async function getStats(_req: Request, res: Response) {
  try {
    // Check if database is available
    if (!process.env.DATABASE_URL) {
      return res.json({
        totalDeceasedActors: 0,
        totalMoviesAnalyzed: 0,
        topCauseOfDeath: null,
        avgMortalityPercentage: null,
      })
    }

    const stats = await getSiteStats()
    res.json(stats)
  } catch (error) {
    console.error("Stats error:", error)
    res.status(500).json({ error: { message: "Failed to fetch site statistics" } })
  }
}

export async function getRecentDeathsHandler(req: Request, res: Response) {
  try {
    // Check if database is available
    if (!process.env.DATABASE_URL) {
      return res.json({ deaths: [] })
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 5, 1), 20)
    const deaths = await getRecentDeaths(limit)
    res.json({ deaths })
  } catch (error) {
    console.error("Recent deaths error:", error)
    res.status(500).json({ error: { message: "Failed to fetch recent deaths" } })
  }
}

export async function getCovidDeathsHandler(req: Request, res: Response) {
  try {
    // Check if database is available
    if (!process.env.DATABASE_URL) {
      return res.json({
        persons: [],
        pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
      })
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = 50
    const offset = (page - 1) * pageSize

    const { persons, totalCount } = await getCovidDeaths({ limit: pageSize, offset })

    res.json({
      persons: persons.map((p, i) => ({
        rank: offset + i + 1,
        id: p.tmdb_id,
        name: p.name,
        deathday: p.deathday,
        causeOfDeath: p.cause_of_death,
        causeOfDeathDetails: p.cause_of_death_details,
        profilePath: p.profile_path,
        ageAtDeath: p.age_at_death,
      })),
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    })
  } catch (error) {
    console.error("COVID deaths error:", error)
    res.status(500).json({ error: { message: "Failed to fetch COVID deaths" } })
  }
}
