import type { Request, Response } from "express"
import type { TMDBSearchResponse } from "../lib/tmdb.js"

const TMDB_BASE_URL = "https://api.themoviedb.org/3"

interface DiscoverMovieResponse {
  id: number
  title: string
  release_date: string
}

type DiscoverType = "classic" | "high-mortality"

async function discoverMovie(type: DiscoverType): Promise<DiscoverMovieResponse | null> {
  const token = process.env.TMDB_API_TOKEN
  if (!token) {
    throw new Error("TMDB_API_TOKEN environment variable is not set")
  }

  let url: string

  if (type === "classic") {
    // Classic films: 1930-1970, popular
    const randomYear = Math.floor(Math.random() * (1970 - 1930 + 1)) + 1930
    const randomPage = Math.floor(Math.random() * 5) + 1 // Fewer pages for older films
    url =
      `${TMDB_BASE_URL}/discover/movie?` +
      `primary_release_year=${randomYear}&` +
      `sort_by=vote_count.desc&` +
      `vote_count.gte=100&` +
      `include_adult=false&` +
      `language=en-US&` +
      `page=${randomPage}`
  } else {
    // High mortality: older films (1940-1980) with larger casts tend to have higher mortality
    const randomYear = Math.floor(Math.random() * (1980 - 1940 + 1)) + 1940
    const randomPage = Math.floor(Math.random() * 10) + 1
    url =
      `${TMDB_BASE_URL}/discover/movie?` +
      `primary_release_year=${randomYear}&` +
      `sort_by=popularity.desc&` +
      `include_adult=false&` +
      `language=en-US&` +
      `page=${randomPage}`
  }

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

export async function getDiscoverMovie(req: Request, res: Response) {
  const type = req.query.type as DiscoverType

  if (!type || !["classic", "high-mortality"].includes(type)) {
    return res.status(400).json({ error: { message: "Invalid type. Use 'classic' or 'high-mortality'" } })
  }

  try {
    // Retry up to 3 times in case a random year/page combination has no results
    let movie: DiscoverMovieResponse | null = null
    let attempts = 3
    while (attempts-- > 0) {
      movie = await discoverMovie(type)
      if (movie) {
        return res.json(movie)
      }
    }

    return res.status(404).json({ error: { message: "No movie found" } })
  } catch (error) {
    console.error("Discover movie error:", error)
    res.status(500).json({ error: { message: "Failed to fetch movie" } })
  }
}
