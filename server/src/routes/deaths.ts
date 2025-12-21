import type { Request, Response } from "express"
import {
  getCauseCategories,
  getDeathsByCause,
  getCauseFromSlug,
  getDecadeCategories,
  getDeathsByDecade,
  getAllDeaths,
} from "../lib/db.js"

export async function getCauseCategoriesHandler(_req: Request, res: Response) {
  try {
    if (!process.env.DATABASE_URL) {
      return res.json({ causes: [] })
    }

    const causes = await getCauseCategories()
    res.json({ causes })
  } catch (error) {
    console.error("Cause categories error:", error)
    res.status(500).json({ error: { message: "Failed to fetch cause categories" } })
  }
}

export async function getDeathsByCauseHandler(req: Request, res: Response) {
  try {
    if (!process.env.DATABASE_URL) {
      return res.json({
        cause: null,
        deaths: [],
        pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
      })
    }

    const slug = req.params.cause
    if (!slug) {
      return res.status(400).json({ error: { message: "Cause slug is required" } })
    }

    // Find the original cause name from the slug
    const cause = await getCauseFromSlug(slug)
    if (!cause) {
      return res.status(404).json({ error: { message: "Cause not found" } })
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = 50
    const offset = (page - 1) * pageSize

    const { deaths, totalCount } = await getDeathsByCause(cause, { limit: pageSize, offset })

    res.json({
      cause,
      slug,
      deaths: deaths.map((d) => ({
        id: d.tmdb_id,
        name: d.name,
        deathday: d.deathday,
        profilePath: d.profile_path,
        causeOfDeath: d.cause_of_death,
        causeOfDeathDetails: d.cause_of_death_details,
        ageAtDeath: d.age_at_death,
        yearsLost: d.years_lost,
      })),
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    })
  } catch (error) {
    console.error("Deaths by cause error:", error)
    res.status(500).json({ error: { message: "Failed to fetch deaths by cause" } })
  }
}

export async function getDecadeCategoriesHandler(_req: Request, res: Response) {
  try {
    if (!process.env.DATABASE_URL) {
      return res.json({ decades: [] })
    }

    const decades = await getDecadeCategories()
    res.json({ decades })
  } catch (error) {
    console.error("Decade categories error:", error)
    res.status(500).json({ error: { message: "Failed to fetch decade categories" } })
  }
}

export async function getDeathsByDecadeHandler(req: Request, res: Response) {
  try {
    if (!process.env.DATABASE_URL) {
      return res.json({
        decade: null,
        deaths: [],
        pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
      })
    }

    const decadeParam = req.params.decade
    // Parse decade from "1950s" format
    const decadeMatch = decadeParam?.match(/^(\d{4})s?$/)
    if (!decadeMatch) {
      return res
        .status(400)
        .json({ error: { message: "Invalid decade format. Use format like '1950s' or '1950'" } })
    }

    const decade = parseInt(decadeMatch[1], 10)
    if (decade < 1900 || decade > 2020 || decade % 10 !== 0) {
      return res.status(400).json({
        error: { message: "Invalid decade. Must be a valid decade like 1950, 1960, etc." },
      })
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = 50
    const offset = (page - 1) * pageSize

    const { deaths, totalCount } = await getDeathsByDecade(decade, { limit: pageSize, offset })

    res.json({
      decade,
      decadeLabel: `${decade}s`,
      deaths: deaths.map((d) => ({
        id: d.tmdb_id,
        name: d.name,
        deathday: d.deathday,
        profilePath: d.profile_path,
        causeOfDeath: d.cause_of_death,
        ageAtDeath: d.age_at_death,
        yearsLost: d.years_lost,
      })),
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    })
  } catch (error) {
    console.error("Deaths by decade error:", error)
    res.status(500).json({ error: { message: "Failed to fetch deaths by decade" } })
  }
}

export async function getAllDeathsHandler(req: Request, res: Response) {
  try {
    if (!process.env.DATABASE_URL) {
      return res.json({
        deaths: [],
        pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
      })
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = 50
    const offset = (page - 1) * pageSize

    const { persons, totalCount } = await getAllDeaths({ limit: pageSize, offset })

    res.json({
      deaths: persons.map((p, i) => ({
        rank: offset + i + 1,
        id: p.tmdb_id,
        name: p.name,
        deathday: p.deathday,
        profilePath: p.profile_path,
        causeOfDeath: p.cause_of_death,
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
    console.error("All deaths error:", error)
    res.status(500).json({ error: { message: "Failed to fetch all deaths" } })
  }
}
