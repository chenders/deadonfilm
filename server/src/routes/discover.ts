import type { Request, Response } from "express"
import { getHighMortalityMovies, getMaxValidMinDeaths, getForeverYoungMovies } from "../lib/db.js"

interface DiscoverMovieResponse {
  id: number
  title: string
  release_date: string
}

async function discoverForeverYoungMovie(): Promise<DiscoverMovieResponse | null> {
  // Get movies featuring leading actors who died abnormally young
  const movies = await getForeverYoungMovies(100)

  if (movies.length === 0) {
    return null
  }

  // Pick a random movie from the results
  const randomIndex = Math.floor(Math.random() * movies.length)
  const movie = movies[randomIndex]

  return {
    id: movie.tmdb_id,
    title: movie.title,
    release_date: movie.release_date || "",
  }
}

export async function getDiscoverMovie(req: Request, res: Response) {
  const type = req.params.type

  if (type !== "forever-young") {
    return res.status(400).json({ error: { message: "Invalid type. Use 'forever-young'" } })
  }

  try {
    const movie = await discoverForeverYoungMovie()

    if (movie) {
      return res.json(movie)
    }

    return res.status(404).json({ error: { message: "No movie found" } })
  } catch (error) {
    console.error("Discover movie error:", error)
    res.status(500).json({ error: { message: "Failed to fetch movie" } })
  }
}

// Get list of high-mortality movies for leaderboard page
// Supports pagination and filtering by decade range and minimum deaths
export async function getCursedMovies(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(parseInt(req.query.limit as string) || 50, 100)
    const offset = (page - 1) * pageSize

    // Parse filter parameters
    const fromDecade = req.query.from ? parseInt(req.query.from as string) : undefined
    const toDecade = req.query.to ? parseInt(req.query.to as string) : undefined
    const minDeadActors = req.query.minDeaths ? parseInt(req.query.minDeaths as string) : 3
    const includeObscure = req.query.includeObscure === "true"

    // Convert decades to year ranges
    const fromYear = fromDecade || undefined
    const toYear = toDecade ? toDecade + 9 : undefined

    const { movies, totalCount } = await getHighMortalityMovies({
      limit: pageSize,
      offset,
      fromYear,
      toYear,
      minDeadActors,
      includeObscure,
    })

    // Calculate rank based on global position (page offset + index)
    const result = movies.map((movie, index) => ({
      rank: offset + index + 1,
      id: movie.tmdb_id,
      title: movie.title,
      releaseYear: movie.release_year,
      posterPath: movie.poster_path,
      deceasedCount: movie.deceased_count,
      castCount: movie.cast_count,
      expectedDeaths: movie.expected_deaths,
      mortalitySurpriseScore: movie.mortality_surprise_score,
    }))

    // Enforce max 20 pages
    const totalPages = Math.min(Math.ceil(totalCount / pageSize), 20)

    res.json({
      movies: result,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
      },
    })
  } catch (error) {
    console.error("Cursed movies error:", error)
    res.status(500).json({ error: { message: "Failed to fetch cursed movies" } })
  }
}

// Get filter options for cursed movies page
export async function getCursedMoviesFilters(_req: Request, res: Response) {
  try {
    // Check if database is available
    if (!process.env.DATABASE_URL) {
      return res.json({ maxMinDeaths: 3 })
    }

    const maxMinDeaths = await getMaxValidMinDeaths()
    res.json({ maxMinDeaths })
  } catch (error) {
    console.error("Cursed movies filters error:", error)
    // Return default on error
    res.json({ maxMinDeaths: 3 })
  }
}
