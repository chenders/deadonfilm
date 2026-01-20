import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"
import { getActorDeathDetails, getNotableDeaths } from "./death-details.js"
import * as tmdb from "../lib/tmdb.js"
import * as db from "../lib/db.js"

// Mock the modules
vi.mock("../lib/tmdb.js", () => ({
  getPersonDetails: vi.fn(),
}))

vi.mock("../lib/db.js", () => ({
  getActor: vi.fn(),
  getActorDeathCircumstancesByTmdbId: vi.fn(),
  getNotableDeaths: vi.fn(),
  hasDetailedDeathInfo: vi.fn(),
}))

vi.mock("../lib/newrelic.js", () => ({
  recordCustomEvent: vi.fn(),
}))

vi.mock("../lib/cache.js", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  CACHE_KEYS: {
    actor: (id: number) => ({
      profile: `actor:id:${id}`,
      death: `actor:id:${id}:type:death`,
    }),
  },
  buildCacheKey: vi.fn((prefix, params) => `${prefix}:${JSON.stringify(params)}`),
  CACHE_PREFIX: { DEATHS: "deaths" },
  CACHE_TTL: { WEEK: 604800 },
}))

import { recordCustomEvent } from "../lib/newrelic.js"
import { getCached, setCached } from "../lib/cache.js"

describe("getActorDeathDetails", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>
  let setSpy: ReturnType<typeof vi.fn>

  // Mock data with all fields the route handler needs (uses `as unknown as` casts internally)
  const mockActorRecord = {
    id: 1,
    tmdb_id: 12345,
    name: "Famous Actor",
    birthday: "1940-01-15",
    deathday: "2020-05-20",
    cause_of_death: "Heart attack",
    cause_of_death_details: "Died of a heart attack at home.",
    profile_path: "/profile.jpg",
    age_at_death: 80,
    years_lost: 5,
    // Fields accessed via `as unknown as` casts in the route handler
    death_manner: "natural",
    death_categories: ["cardiovascular"],
    strange_death: false,
  }

  const mockPerson = {
    id: 12345,
    name: "Famous Actor",
    birthday: "1940-01-15",
    deathday: "2020-05-20",
    biography: "A legendary actor.",
    profile_path: "/profile.jpg",
    place_of_birth: "New York, NY",
    imdb_id: "nm1234567",
    popularity: 50.0,
  }

  const mockCircumstances = {
    id: 1,
    actor_id: 1,
    circumstances: "He was found at his home after suffering a cardiac event.",
    circumstances_confidence: "high",
    rumored_circumstances: null,
    location_of_death: "Los Angeles, California",
    last_project: { title: "Final Film", year: 2019, tmdb_id: 999, imdb_id: null, type: "movie" },
    career_status_at_death: "active",
    posthumous_releases: [
      { title: "Released After", year: 2021, tmdb_id: 1000, imdb_id: null, type: "movie" },
    ],
    related_celebrities: [
      { name: "Co-Star Name", tmdb_id: 54321, relationship: "Frequent co-star" },
    ],
    notable_factors: ["sudden_death"],
    sources: {
      cause: [{ url: "https://example.com", archive_url: null, description: "News article" }],
    },
    additional_context: "He had been working on a new project.",
  }

  beforeEach(() => {
    vi.clearAllMocks()

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()
    setSpy = vi.fn().mockReturnThis()

    mockReq = {
      params: { id: "12345" },
    }
    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
      set: setSpy as Response["set"],
    }
  })

  it("returns 400 for invalid actor ID", async () => {
    mockReq.params = { id: "invalid" }

    await getActorDeathDetails(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Invalid actor ID" },
    })
  })

  it("returns 400 for missing actor ID", async () => {
    mockReq.params = {}

    await getActorDeathDetails(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Invalid actor ID" },
    })
  })

  it("returns 404 when actor has no detailed death info", async () => {
    vi.mocked(db.hasDetailedDeathInfo).mockResolvedValueOnce(false)

    await getActorDeathDetails(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(404)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "No detailed death information available for this actor" },
    })
  })

  it("returns 404 when actor not found in database", async () => {
    vi.mocked(db.hasDetailedDeathInfo).mockResolvedValueOnce(true)
    vi.mocked(db.getActor).mockResolvedValueOnce(null)
    vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockPerson)
    vi.mocked(db.getActorDeathCircumstancesByTmdbId).mockResolvedValueOnce(null)

    await getActorDeathDetails(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(404)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Actor not found or not deceased" },
    })
  })

  it("returns death details for actor with full circumstances", async () => {
    vi.mocked(db.hasDetailedDeathInfo).mockResolvedValueOnce(true)
    vi.mocked(db.getActor).mockResolvedValueOnce(mockActorRecord as any)
    vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockPerson)
    vi.mocked(db.getActorDeathCircumstancesByTmdbId).mockResolvedValueOnce(mockCircumstances as any)

    await getActorDeathDetails(mockReq as Request, mockRes as Response)

    expect(setSpy).toHaveBeenCalledWith("Cache-Control", "public, max-age=600")
    expect(jsonSpy).toHaveBeenCalledWith({
      actor: {
        id: 1,
        tmdbId: 12345,
        name: "Famous Actor",
        birthday: "1940-01-15",
        deathday: "2020-05-20",
        profilePath: "/profile.jpg",
        causeOfDeath: "Heart attack",
        causeOfDeathDetails: "Died of a heart attack at home.",
        ageAtDeath: 80,
        yearsLost: 5,
        deathManner: "natural",
        deathCategories: ["cardiovascular"],
        strangeDeath: false,
      },
      circumstances: {
        official: "He was found at his home after suffering a cardiac event.",
        confidence: "high",
        rumored: null,
        locationOfDeath: "Los Angeles, California",
        notableFactors: ["sudden_death"],
        additionalContext: "He had been working on a new project.",
      },
      career: {
        statusAtDeath: "active",
        lastProject: {
          title: "Final Film",
          year: 2019,
          tmdb_id: 999,
          imdb_id: null,
          type: "movie",
        },
        posthumousReleases: [
          { title: "Released After", year: 2021, tmdb_id: 1000, imdb_id: null, type: "movie" },
        ],
      },
      relatedCelebrities: [
        {
          name: "Co-Star Name",
          tmdbId: 54321,
          relationship: "Frequent co-star",
          slug: "co-star-name-54321",
        },
      ],
      sources: {
        cause: [{ url: "https://example.com", archive_url: null, description: "News article" }],
        circumstances: null,
        rumored: null,
      },
    })
  })

  it("caches the response on cache miss", async () => {
    vi.mocked(db.hasDetailedDeathInfo).mockResolvedValueOnce(true)
    vi.mocked(db.getActor).mockResolvedValueOnce(mockActorRecord as any)
    vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockPerson)
    vi.mocked(db.getActorDeathCircumstancesByTmdbId).mockResolvedValueOnce(mockCircumstances as any)

    await getActorDeathDetails(mockReq as Request, mockRes as Response)

    expect(setCached).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        actor: expect.objectContaining({ tmdbId: 12345 }),
      }),
      604800
    )
  })

  it("returns cached response without calling database on cache hit", async () => {
    const cachedResponse = {
      actor: {
        id: 1,
        tmdbId: 12345,
        name: "Cached Actor",
        birthday: "1940-01-15",
        deathday: "2020-05-20",
        profilePath: "/cached.jpg",
        causeOfDeath: "Cached cause",
        causeOfDeathDetails: null,
        ageAtDeath: 80,
        yearsLost: 5,
        deathManner: "natural",
        deathCategories: null,
        strangeDeath: false,
      },
      circumstances: {
        official: "Cached circumstances",
        confidence: "high",
        rumored: null,
        locationOfDeath: null,
        notableFactors: null,
        additionalContext: null,
      },
      career: {
        statusAtDeath: null,
        lastProject: null,
        posthumousReleases: null,
      },
      relatedCelebrities: [],
      sources: {
        cause: null,
        circumstances: null,
        rumored: null,
      },
    }
    vi.mocked(getCached).mockResolvedValueOnce(cachedResponse)

    await getActorDeathDetails(mockReq as Request, mockRes as Response)

    expect(db.hasDetailedDeathInfo).not.toHaveBeenCalled()
    expect(db.getActor).not.toHaveBeenCalled()
    expect(tmdb.getPersonDetails).not.toHaveBeenCalled()
    expect(setCached).not.toHaveBeenCalled()
    expect(jsonSpy).toHaveBeenCalledWith(cachedResponse)
    expect(recordCustomEvent).toHaveBeenCalledWith(
      "DeathDetailsView",
      expect.objectContaining({ cacheHit: true })
    )
  })

  it("records custom event on successful response", async () => {
    vi.mocked(db.hasDetailedDeathInfo).mockResolvedValueOnce(true)
    vi.mocked(db.getActor).mockResolvedValueOnce(mockActorRecord as any)
    vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockPerson)
    vi.mocked(db.getActorDeathCircumstancesByTmdbId).mockResolvedValueOnce(mockCircumstances as any)

    await getActorDeathDetails(mockReq as Request, mockRes as Response)

    expect(recordCustomEvent).toHaveBeenCalledWith(
      "DeathDetailsView",
      expect.objectContaining({
        tmdbId: 12345,
        name: "Famous Actor",
        hasCircumstances: true,
        hasRumored: false,
        confidence: "high",
        cacheHit: false,
      })
    )
  })

  it("returns 500 on database error", async () => {
    vi.mocked(db.hasDetailedDeathInfo).mockRejectedValueOnce(new Error("Database error"))

    await getActorDeathDetails(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch death details" },
    })
  })

  it("uses resolved sources with human-readable names when available", async () => {
    const circumstancesWithResolvedSources = {
      ...mockCircumstances,
      sources: {
        circumstances: {
          type: "gemini_pro",
          url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/ABC123",
          confidence: 0.85,
          rawData: {
            resolvedSources: [
              {
                originalUrl:
                  "https://vertexaisearch.cloud.google.com/grounding-api-redirect/ABC123",
                finalUrl: "https://people.com/obituary/famous-actor",
                domain: "people.com",
                sourceName: "People",
              },
              {
                originalUrl:
                  "https://vertexaisearch.cloud.google.com/grounding-api-redirect/DEF456",
                finalUrl: "https://variety.com/news/famous-actor-dies",
                domain: "variety.com",
                sourceName: "Variety",
              },
              {
                originalUrl:
                  "https://vertexaisearch.cloud.google.com/grounding-api-redirect/FAILED",
                finalUrl: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/FAILED",
                domain: "vertexaisearch.cloud.google.com",
                sourceName: "Vertexaisearch.cloud.google.com",
                error: "Timeout",
              },
            ],
          },
        },
      },
    }

    vi.mocked(db.hasDetailedDeathInfo).mockResolvedValueOnce(true)
    vi.mocked(db.getActor).mockResolvedValueOnce(mockActorRecord as any)
    vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockPerson)
    vi.mocked(db.getActorDeathCircumstancesByTmdbId).mockResolvedValueOnce(
      circumstancesWithResolvedSources as any
    )

    await getActorDeathDetails(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: expect.objectContaining({
          circumstances: [
            {
              url: "https://people.com/obituary/famous-actor",
              archive_url: null,
              description: "People",
            },
            {
              url: "https://variety.com/news/famous-actor-dies",
              archive_url: null,
              description: "Variety",
            },
            // Failed resolution should be filtered out (has error property)
          ],
        }),
      })
    )
  })

  it("falls back to parsed sources when no resolved sources available", async () => {
    const circumstancesWithParsedSources = {
      ...mockCircumstances,
      sources: {
        circumstances: {
          type: "gemini_pro",
          url: "https://example.com/article",
          confidence: 0.85,
          rawData: {
            parsed: {
              sources: ["https://news.example.com/obituary", "https://wiki.example.org/actor"],
            },
          },
        },
      },
    }

    vi.mocked(db.hasDetailedDeathInfo).mockResolvedValueOnce(true)
    vi.mocked(db.getActor).mockResolvedValueOnce(mockActorRecord as any)
    vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockPerson)
    vi.mocked(db.getActorDeathCircumstancesByTmdbId).mockResolvedValueOnce(
      circumstancesWithParsedSources as any
    )

    await getActorDeathDetails(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: expect.objectContaining({
          circumstances: [
            {
              url: "https://news.example.com/obituary",
              archive_url: null,
              description: "Source: gemini_pro",
            },
            {
              url: "https://wiki.example.org/actor",
              archive_url: null,
              description: "Source: gemini_pro",
            },
          ],
        }),
      })
    )
  })
})

describe("getNotableDeaths", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>
  let setSpy: ReturnType<typeof vi.fn>

  const mockNotableDeathsResponse = {
    actors: [
      {
        id: 1,
        tmdbId: 12345,
        name: "Notable Actor",
        profilePath: "/profile.jpg",
        deathday: "2020-05-20",
        ageAtDeath: 80,
        causeOfDeath: "Heart attack",
        deathManner: "natural",
        strangeDeath: false,
        notableFactors: ["sudden_death"],
        circumstancesConfidence: "high",
        slug: "notable-actor-12345",
      },
    ],
    pagination: {
      page: 1,
      pageSize: 50,
      totalCount: 1,
      totalPages: 1,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()
    setSpy = vi.fn().mockReturnThis()

    mockReq = {
      query: {},
    }
    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
      set: setSpy as Response["set"],
    }
  })

  it("returns notable deaths with default pagination", async () => {
    vi.mocked(db.getNotableDeaths).mockResolvedValueOnce(mockNotableDeathsResponse)

    await getNotableDeaths(mockReq as Request, mockRes as Response)

    expect(db.getNotableDeaths).toHaveBeenCalledWith({
      page: 1,
      pageSize: 50,
      filter: "all",
      includeObscure: false,
    })
    expect(setSpy).toHaveBeenCalledWith("Cache-Control", "public, max-age=300")
    expect(jsonSpy).toHaveBeenCalledWith(mockNotableDeathsResponse)
  })

  it("respects page and pageSize query params", async () => {
    mockReq.query = { page: "2", pageSize: "25" }
    vi.mocked(db.getNotableDeaths).mockResolvedValueOnce({
      ...mockNotableDeathsResponse,
      pagination: { ...mockNotableDeathsResponse.pagination, page: 2, pageSize: 25 },
    })

    await getNotableDeaths(mockReq as Request, mockRes as Response)

    expect(db.getNotableDeaths).toHaveBeenCalledWith({
      page: 2,
      pageSize: 25,
      filter: "all",
      includeObscure: false,
    })
  })

  it("respects filter query param", async () => {
    mockReq.query = { filter: "strange" }
    vi.mocked(db.getNotableDeaths).mockResolvedValueOnce(mockNotableDeathsResponse)

    await getNotableDeaths(mockReq as Request, mockRes as Response)

    expect(db.getNotableDeaths).toHaveBeenCalledWith({
      page: 1,
      pageSize: 50,
      filter: "strange",
      includeObscure: false,
    })
  })

  it("respects includeObscure query param", async () => {
    mockReq.query = { includeObscure: "true" }
    vi.mocked(db.getNotableDeaths).mockResolvedValueOnce(mockNotableDeathsResponse)

    await getNotableDeaths(mockReq as Request, mockRes as Response)

    expect(db.getNotableDeaths).toHaveBeenCalledWith({
      page: 1,
      pageSize: 50,
      filter: "all",
      includeObscure: true,
    })
  })

  it("returns 400 for invalid filter value", async () => {
    mockReq.query = { filter: "invalid" }

    await getNotableDeaths(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Invalid filter value" },
    })
  })

  it("enforces minimum page of 1", async () => {
    mockReq.query = { page: "-5" }
    vi.mocked(db.getNotableDeaths).mockResolvedValueOnce(mockNotableDeathsResponse)

    await getNotableDeaths(mockReq as Request, mockRes as Response)

    expect(db.getNotableDeaths).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }))
  })

  it("enforces maximum pageSize of 100", async () => {
    mockReq.query = { pageSize: "500" }
    vi.mocked(db.getNotableDeaths).mockResolvedValueOnce(mockNotableDeathsResponse)

    await getNotableDeaths(mockReq as Request, mockRes as Response)

    expect(db.getNotableDeaths).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 100 }))
  })

  it("caches the response on cache miss", async () => {
    vi.mocked(db.getNotableDeaths).mockResolvedValueOnce(mockNotableDeathsResponse)

    await getNotableDeaths(mockReq as Request, mockRes as Response)

    expect(setCached).toHaveBeenCalledWith(expect.any(String), mockNotableDeathsResponse, 604800)
  })

  it("returns cached response without calling database on cache hit", async () => {
    vi.mocked(getCached).mockResolvedValueOnce(mockNotableDeathsResponse)

    await getNotableDeaths(mockReq as Request, mockRes as Response)

    expect(db.getNotableDeaths).not.toHaveBeenCalled()
    expect(setCached).not.toHaveBeenCalled()
    expect(jsonSpy).toHaveBeenCalledWith(mockNotableDeathsResponse)
    expect(recordCustomEvent).toHaveBeenCalledWith(
      "NotableDeathsView",
      expect.objectContaining({ cacheHit: true })
    )
  })

  it("records custom event on successful response", async () => {
    vi.mocked(db.getNotableDeaths).mockResolvedValueOnce(mockNotableDeathsResponse)

    await getNotableDeaths(mockReq as Request, mockRes as Response)

    expect(recordCustomEvent).toHaveBeenCalledWith(
      "NotableDeathsView",
      expect.objectContaining({
        filter: "all",
        page: 1,
        totalCount: 1,
        cacheHit: false,
      })
    )
  })

  it("returns 500 on database error", async () => {
    vi.mocked(db.getNotableDeaths).mockRejectedValueOnce(new Error("Database error"))

    await getNotableDeaths(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch notable deaths" },
    })
  })
})
