import type { Request, Response } from "express"
import {
  getSiteStats,
  getRecentDeaths,
  getCovidDeaths,
  getUnnaturalDeaths,
  getMostCursedMovie,
  getTrivia,
  getDeathsThisWeekSimple,
  getPopularMovies,
  UNNATURAL_DEATH_CATEGORIES,
  type UnnaturalDeathCategory,
} from "../lib/db.js"
import { sendWithETag } from "../lib/etag.js"
import { recordCustomEvent } from "../lib/newrelic.js"

export async function getStats(req: Request, res: Response) {
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
    sendWithETag(req, res, stats, 3600) // 1 hour cache
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
    const startTime = Date.now()

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
    const includeObscure = req.query.includeObscure === "true"

    const { persons, totalCount } = await getCovidDeaths({
      limit: pageSize,
      offset,
      includeObscure,
    })

    const response = {
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
    }

    recordCustomEvent("CovidDeathsQuery", {
      page,
      includeObscure,
      resultCount: persons.length,
      totalCount,
      responseTimeMs: Date.now() - startTime,
    })

    sendWithETag(req, res, response, 300) // 5 min cache
  } catch (error) {
    console.error("COVID deaths error:", error)
    res.status(500).json({ error: { message: "Failed to fetch COVID deaths" } })
  }
}

export async function getFeaturedMovieHandler(_req: Request, res: Response) {
  try {
    // Check if database is available
    if (!process.env.DATABASE_URL) {
      return res.json({ movie: null })
    }

    const movie = await getMostCursedMovie()

    if (!movie) {
      return res.json({ movie: null })
    }

    res.json({
      movie: {
        tmdbId: movie.tmdb_id,
        title: movie.title,
        releaseYear: movie.release_year,
        posterPath: movie.poster_path,
        deceasedCount: movie.deceased_count,
        castCount: movie.cast_count,
        expectedDeaths: parseFloat(String(movie.expected_deaths)),
        mortalitySurpriseScore: parseFloat(String(movie.mortality_surprise_score)),
      },
    })
  } catch (error) {
    console.error("Featured movie error:", error)
    res.status(500).json({ error: { message: "Failed to fetch featured movie" } })
  }
}

export async function getTriviaHandler(req: Request, res: Response) {
  try {
    // Check if database is available
    if (!process.env.DATABASE_URL) {
      return res.json({ facts: [] })
    }

    const facts = await getTrivia()
    sendWithETag(req, res, { facts }, 3600) // 1 hour cache
  } catch (error) {
    console.error("Trivia error:", error)
    res.status(500).json({ error: { message: "Failed to fetch trivia" } })
  }
}

export async function getThisWeekDeathsHandler(_req: Request, res: Response) {
  try {
    // Check if database is available
    if (!process.env.DATABASE_URL) {
      return res.json({ deaths: [], weekRange: { start: "", end: "" } })
    }

    const deaths = await getDeathsThisWeekSimple()

    // Calculate week range for display
    const now = new Date()
    const dayOfWeek = now.getDay() // 0 = Sunday
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - dayOfWeek)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)

    res.json({
      deaths: deaths.map((d) => ({
        id: d.tmdb_id,
        name: d.name,
        deathday: d.deathday,
        profilePath: d.profile_path,
        causeOfDeath: d.cause_of_death,
        ageAtDeath: d.age_at_death,
        yearOfDeath: d.year_of_death,
      })),
      weekRange: {
        start: `${weekStart.toLocaleString("en-US", { month: "short" })} ${weekStart.getDate()}`,
        end: `${weekEnd.toLocaleString("en-US", { month: "short" })} ${weekEnd.getDate()}`,
      },
    })
  } catch (error) {
    console.error("This week deaths error:", error)
    res.status(500).json({ error: { message: "Failed to fetch this week deaths" } })
  }
}

export async function getPopularMoviesHandler(req: Request, res: Response) {
  try {
    // Check if database is available
    if (!process.env.DATABASE_URL) {
      return res.json({ movies: [] })
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 10, 1), 20)
    const movies = await getPopularMovies(limit)

    const response = {
      movies: movies.map((m) => ({
        id: m.tmdb_id,
        title: m.title,
        releaseYear: m.release_year,
        posterPath: m.poster_path,
        deceasedCount: m.deceased_count,
        castCount: m.cast_count,
        popularity: m.popularity,
      })),
    }
    sendWithETag(req, res, response, 300) // 5 min cache
  } catch (error) {
    console.error("Popular movies error:", error)
    res.status(500).json({ error: { message: "Failed to fetch popular movies" } })
  }
}

const validCategories = Object.keys(UNNATURAL_DEATH_CATEGORIES) as UnnaturalDeathCategory[]

export async function getUnnaturalDeathsHandler(req: Request, res: Response) {
  try {
    // Check if database is available
    if (!process.env.DATABASE_URL) {
      return res.json({
        persons: [],
        pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
        categories: [],
        categoryCounts: {},
      })
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = 50
    const offset = (page - 1) * pageSize
    const includeObscure = req.query.includeObscure === "true"

    // Validate category parameter
    const categoryParam = req.query.category as string | undefined
    let category: UnnaturalDeathCategory | "all" = "all"
    if (categoryParam && validCategories.includes(categoryParam as UnnaturalDeathCategory)) {
      category = categoryParam as UnnaturalDeathCategory
    }

    // Parse showSelfInflicted parameter (defaults to false, meaning suicides are hidden)
    // New param:  showSelfInflicted=true  => show suicides
    // Legacy param: hideSuicides=false    => show suicides
    const showSelfInflicted =
      req.query.showSelfInflicted === "true" || req.query.hideSuicides === "false"

    const { persons, totalCount, categoryCounts } = await getUnnaturalDeaths({
      limit: pageSize,
      offset,
      category,
      showSelfInflicted,
      includeObscure,
    })

    // Build categories array with labels and counts
    const categories = validCategories.map((key) => ({
      id: key,
      label: UNNATURAL_DEATH_CATEGORIES[key].label,
      count: categoryCounts[key],
    }))

    const response = {
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
      categories,
      selectedCategory: category,
      showSelfInflicted,
    }
    sendWithETag(req, res, response, 300) // 5 min cache
  } catch (error) {
    console.error("Unnatural deaths error:", error)
    res.status(500).json({ error: { message: "Failed to fetch unnatural deaths" } })
  }
}
