import type { Request, Response } from "express"
import { getSiteStats, getRecentDeaths } from "../lib/db.js"

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
