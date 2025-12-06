import type { Request, Response } from "express"
import type { TMDBSearchResponse } from "../lib/tmdb.js"

const TMDB_BASE_URL = "https://api.themoviedb.org/3"

interface RandomMovieResponse {
  id: number
  title: string
  release_date: string
}

async function discoverRandomMovie(): Promise<RandomMovieResponse | null> {
  const token = process.env.TMDB_API_TOKEN
  if (!token) {
    throw new Error("TMDB_API_TOKEN environment variable is not set")
  }

  // Pick a random year between 1950 and current year
  const currentYear = new Date().getFullYear()
  const randomYear = Math.floor(Math.random() * (currentYear - 1950 + 1)) + 1950

  // Pick a random page (1-20 to stay within TMDB limits for most years)
  const randomPage = Math.floor(Math.random() * 20) + 1

  const url =
    `${TMDB_BASE_URL}/discover/movie?` +
    `primary_release_year=${randomYear}&` +
    `sort_by=popularity.desc&` +
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

export async function getRandomMovie(_req: Request, res: Response) {
  try {
    const movie = await discoverRandomMovie()

    if (!movie) {
      return res.status(404).json({ error: { message: "No random movie found" } })
    }

    res.json(movie)
  } catch (error) {
    console.error("Random movie error:", error)
    res.status(500).json({ error: { message: "Failed to fetch random movie" } })
  }
}
