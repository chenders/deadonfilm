import type { Request, Response } from "express"
import type { TMDBSearchResponse } from "../lib/tmdb.js"
import { getHighMortalityMovies, getMaxValidMinDeaths } from "../lib/db.js"

const TMDB_BASE_URL = "https://api.themoviedb.org/3"

interface DiscoverMovieResponse {
  id: number
  title: string
  release_date: string
}

type DiscoverType = "classic" | "high-mortality"

async function discoverClassicMovie(): Promise<DiscoverMovieResponse | null> {
  const token = process.env.TMDB_API_TOKEN
  if (!token) {
    throw new Error("TMDB_API_TOKEN environment variable is not set")
  }

  // Classic films: 1930-1970, popular
  const randomYear = Math.floor(Math.random() * (1970 - 1930 + 1)) + 1930
  const randomPage = Math.floor(Math.random() * 5) + 1 // Fewer pages for older films
  const url =
    `${TMDB_BASE_URL}/discover/movie?` +
    `primary_release_year=${randomYear}&` +
    `sort_by=vote_count.desc&` +
    `vote_count.gte=100&` +
    `include_adult=false&` +
    `language=en-US&` +
    `page=${randomPage}`

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.status}`)
  }

  const data = (await response.json()) as TMDBSearchResponse

  if (data.results.length === 0) {
    return null
  }

  // Pick a random movie from the results
  const randomIndex = Math.floor(Math.random() * data.results.length)
  const movie = data.results[randomIndex]

  return {
    id: movie.id,
    title: movie.title,
    release_date: movie.release_date,
  }
}

async function discoverHighMortalityMovie(): Promise<DiscoverMovieResponse | null> {
  // Get movies with highest mortality surprise scores from our database
  const { movies } = await getHighMortalityMovies({ limit: 50 })

  if (movies.length === 0) {
    // Fallback to classic movie discovery if no mortality data exists yet
    console.log("No high-mortality movies in database, falling back to classic discovery")
    return discoverClassicMovie()
  }

  // Pick a random movie from the top 50
  const randomIndex = Math.floor(Math.random() * movies.length)
  const movie = movies[randomIndex]

  return {
    id: movie.tmdb_id,
    title: movie.title,
    release_date: movie.release_date || "",
  }
}

export async function getDiscoverMovie(req: Request, res: Response) {
  const type = req.query.type as DiscoverType

  if (!type || !["classic", "high-mortality"].includes(type)) {
    return res
      .status(400)
      .json({ error: { message: "Invalid type. Use 'classic' or 'high-mortality'" } })
  }

  try {
    let movie: DiscoverMovieResponse | null = null

    if (type === "high-mortality") {
      // Use database with actual mortality surprise scores
      movie = await discoverHighMortalityMovie()
    } else {
      // Retry up to 3 times for classic movies (TMDB API)
      let attempts = 3
      while (attempts-- > 0) {
        movie = await discoverClassicMovie()
        if (movie) break
      }
    }

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

    // Convert decades to year ranges
    const fromYear = fromDecade || undefined
    const toYear = toDecade ? toDecade + 9 : undefined

    const { movies, totalCount } = await getHighMortalityMovies({
      limit: pageSize,
      offset,
      fromYear,
      toYear,
      minDeadActors,
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
