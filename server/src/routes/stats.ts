import type { Request, Response } from "express"
import {
  getSiteStats,
  getRecentDeaths,
  getCovidDeaths,
  getViolentDeaths,
  getMostCursedMovie,
  getTrivia,
  getDeathsThisWeekSimple,
  getPopularMovies,
} from "../lib/db.js"

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

export async function getViolentDeathsHandler(req: Request, res: Response) {
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

    const { persons, totalCount } = await getViolentDeaths({ limit: pageSize, offset })

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
    console.error("Violent deaths error:", error)
    res.status(500).json({ error: { message: "Failed to fetch violent deaths" } })
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

export async function getTriviaHandler(_req: Request, res: Response) {
  try {
    // Check if database is available
    if (!process.env.DATABASE_URL) {
      return res.json({ facts: [] })
    }

    const facts = await getTrivia()
    res.json({ facts })
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

    res.json({
      movies: movies.map((m) => ({
        id: m.tmdb_id,
        title: m.title,
        releaseYear: m.release_year,
        posterPath: m.poster_path,
        deceasedCount: m.deceased_count,
        castCount: m.cast_count,
        popularity: m.popularity,
      })),
    })
  } catch (error) {
    console.error("Popular movies error:", error)
    res.status(500).json({ error: { message: "Failed to fetch popular movies" } })
  }
}
