import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"

// Mock dependencies before importing
vi.mock("../lib/db/movies.js", () => ({
  getMovie: vi.fn(),
}))

vi.mock("../lib/db/actors.js", () => ({
  getActor: vi.fn(),
}))

vi.mock("../lib/db/shows.js", () => ({
  getShow: vi.fn(),
}))

vi.mock("../lib/cache.js", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  buildCacheKey: vi.fn((...args: unknown[]) => args.join(":")),
  CACHE_PREFIX: { OG_IMAGE: "og-image" },
  CACHE_TTL: { WEEK: 604800 },
}))

vi.mock("../lib/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock("../lib/og-image/generator.js", () => ({
  generateMovieOgImage: vi.fn().mockResolvedValue(Buffer.from("fake-png")),
  generateActorOgImage: vi.fn().mockResolvedValue(Buffer.from("fake-png")),
  generateShowOgImage: vi.fn().mockResolvedValue(Buffer.from("fake-png")),
  fetchImageAsBase64: vi.fn().mockResolvedValue(null),
}))

import { ogImageHandler } from "./og-image.js"
import { getMovie } from "../lib/db/movies.js"
import { getActor } from "../lib/db/actors.js"
import { getShow } from "../lib/db/shows.js"
import { getCached } from "../lib/cache.js"
import {
  generateMovieOgImage,
  generateActorOgImage,
  generateShowOgImage,
  fetchImageAsBase64,
} from "../lib/og-image/generator.js"

describe("ogImageHandler", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>
  let sendSpy: ReturnType<typeof vi.fn>
  let setSpy: ReturnType<typeof vi.fn>
  let redirectSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetAllMocks()

    // Re-apply default mock implementations after reset
    vi.mocked(getCached).mockResolvedValue(null)
    vi.mocked(generateMovieOgImage).mockResolvedValue(Buffer.from("fake-png"))
    vi.mocked(generateActorOgImage).mockResolvedValue(Buffer.from("fake-png"))
    vi.mocked(generateShowOgImage).mockResolvedValue(Buffer.from("fake-png"))
    vi.mocked(fetchImageAsBase64).mockResolvedValue(null)

    jsonSpy = vi.fn()
    sendSpy = vi.fn()
    setSpy = vi.fn().mockReturnThis()
    redirectSpy = vi.fn()
    statusSpy = vi.fn().mockReturnValue({ json: jsonSpy })

    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
      send: sendSpy as Response["send"],
      set: setSpy as Response["set"],
      redirect: redirectSpy as Response["redirect"],
    }
  })

  it("returns 400 for invalid type", async () => {
    mockReq = { params: { type: "invalid", id: "123" } }
    await ogImageHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Invalid type. Must be movie, actor, or show." },
    })
  })

  it("returns 400 for non-numeric ID", async () => {
    mockReq = { params: { type: "movie", id: "abc" } }
    await ogImageHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({ error: { message: "Invalid ID." } })
  })

  it("returns 400 for negative ID", async () => {
    mockReq = { params: { type: "movie", id: "-1" } }
    await ogImageHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
  })

  it("returns 404 for missing movie", async () => {
    vi.mocked(getMovie).mockResolvedValue(null)
    mockReq = { params: { type: "movie", id: "99999" } }
    await ogImageHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(404)
    expect(jsonSpy).toHaveBeenCalledWith({ error: { message: "Movie not found." } })
  })

  it("returns 404 for missing actor", async () => {
    vi.mocked(getActor).mockResolvedValue(null)
    mockReq = { params: { type: "actor", id: "99999" } }
    await ogImageHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(404)
    expect(jsonSpy).toHaveBeenCalledWith({ error: { message: "Actor not found." } })
  })

  it("returns 404 for missing show", async () => {
    vi.mocked(getShow).mockResolvedValue(null)
    mockReq = { params: { type: "show", id: "99999" } }
    await ogImageHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(404)
    expect(jsonSpy).toHaveBeenCalledWith({ error: { message: "Show not found." } })
  })

  it("generates movie OG image", async () => {
    vi.mocked(getMovie).mockResolvedValue({
      tmdb_id: 238,
      title: "The Godfather",
      release_year: 1972,
      poster_path: "/poster.jpg",
      deceased_count: 8,
      cast_count: 15,
      release_date: "1972-03-15",
      genres: [],
      original_language: "en",
      production_countries: null,
      tmdb_popularity: null,
      tmdb_vote_average: null,
      living_count: 7,
      expected_deaths: 5,
      mortality_surprise_score: null,
    })

    mockReq = { params: { type: "movie", id: "238" } }
    await ogImageHandler(mockReq as Request, mockRes as Response)

    expect(generateMovieOgImage).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "The Godfather",
        year: 1972,
        deceasedCount: 8,
        totalCast: 15,
      })
    )

    expect(setSpy).toHaveBeenCalledWith("Content-Type", "image/png")
    expect(setSpy).toHaveBeenCalledWith("Cache-Control", "public, max-age=86400")
    expect(sendSpy).toHaveBeenCalledWith(Buffer.from("fake-png"))
  })

  it("serves cached image on cache hit", async () => {
    const fakeBase64 = Buffer.from("cached-png").toString("base64")
    vi.mocked(getCached).mockResolvedValue(fakeBase64)

    mockReq = { params: { type: "movie", id: "238" } }
    await ogImageHandler(mockReq as Request, mockRes as Response)

    // Should NOT call generate functions
    expect(generateMovieOgImage).not.toHaveBeenCalled()

    // Should serve from cache
    expect(setSpy).toHaveBeenCalledWith("Content-Type", "image/png")
    expect(sendSpy).toHaveBeenCalledWith(Buffer.from("cached-png"))
  })

  it("parses numeric ID from params", async () => {
    vi.mocked(getMovie).mockResolvedValue({
      tmdb_id: 238,
      title: "The Godfather",
      release_year: 1972,
      poster_path: null,
      deceased_count: 0,
      cast_count: 0,
      release_date: null,
      genres: [],
      original_language: null,
      production_countries: null,
      tmdb_popularity: null,
      tmdb_vote_average: null,
      living_count: 0,
      expected_deaths: null,
      mortality_surprise_score: null,
    })

    mockReq = { params: { type: "movie", id: "238" } }
    await ogImageHandler(mockReq as Request, mockRes as Response)

    expect(getMovie).toHaveBeenCalledWith(238)
  })

  it("redirects to TMDB on generation failure", async () => {
    vi.mocked(getMovie).mockResolvedValue({
      tmdb_id: 238,
      title: "The Godfather",
      release_year: 1972,
      poster_path: "/poster.jpg",
      deceased_count: 0,
      cast_count: 0,
      release_date: null,
      genres: [],
      original_language: null,
      production_countries: null,
      tmdb_popularity: null,
      tmdb_vote_average: null,
      living_count: 0,
      expected_deaths: null,
      mortality_surprise_score: null,
    })

    // Make generation fail
    vi.mocked(generateMovieOgImage).mockRejectedValue(new Error("Generation failed"))

    mockReq = { params: { type: "movie", id: "238" } }
    await ogImageHandler(mockReq as Request, mockRes as Response)

    expect(redirectSpy).toHaveBeenCalledWith(302, "https://image.tmdb.org/t/p/w500/poster.jpg")
  })
})
