import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'
import { searchMovies } from './search.js'

// Mock the dependencies
vi.mock('../lib/tmdb.js', () => ({
  searchMovies: vi.fn(),
}))

vi.mock('../lib/cache.js', () => ({
  getCachedOrFetch: vi.fn((key, ttl, fetchFn) => fetchFn()),
  CACHE_KEYS: {
    search: (query: string) => `search:${query.toLowerCase().trim()}`,
  },
  CACHE_TTL: {
    SEARCH: 86400,
  },
}))

import { searchMovies as tmdbSearch } from '../lib/tmdb.js'

describe('searchMovies route', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()

    mockRes = {
      json: jsonSpy as Response['json'],
      status: statusSpy as Response['status'],
    }
  })

  it('returns empty results for empty query', async () => {
    mockReq = { query: { q: '' } }

    await searchMovies(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith({
      results: [],
      page: 1,
      total_pages: 0,
      total_results: 0,
    })
  })

  it('returns empty results for short query', async () => {
    mockReq = { query: { q: 'a' } }

    await searchMovies(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith({
      results: [],
      page: 1,
      total_pages: 0,
      total_results: 0,
    })
  })

  it('returns empty results for missing query', async () => {
    mockReq = { query: {} }

    await searchMovies(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith({
      results: [],
      page: 1,
      total_pages: 0,
      total_results: 0,
    })
  })

  it('returns search results sorted by popularity', async () => {
    const mockTmdbResponse = {
      page: 1,
      results: [
        {
          id: 1,
          title: 'Low Pop',
          popularity: 10,
          release_date: '2020-01-01',
          poster_path: null,
          overview: '',
          genre_ids: [],
        },
        {
          id: 2,
          title: 'High Pop',
          popularity: 100,
          release_date: '2020-01-01',
          poster_path: null,
          overview: '',
          genre_ids: [],
        },
        {
          id: 3,
          title: 'Mid Pop',
          popularity: 50,
          release_date: '2020-01-01',
          poster_path: null,
          overview: '',
          genre_ids: [],
        },
      ],
      total_pages: 1,
      total_results: 3,
    }

    vi.mocked(tmdbSearch).mockResolvedValue(mockTmdbResponse)
    mockReq = { query: { q: 'test' } }

    await searchMovies(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        results: expect.arrayContaining([
          expect.objectContaining({ id: 2, title: 'High Pop' }),
          expect.objectContaining({ id: 3, title: 'Mid Pop' }),
          expect.objectContaining({ id: 1, title: 'Low Pop' }),
        ]),
      })
    )

    // Verify order
    const calledWith = jsonSpy.mock.calls[0][0]
    expect(calledWith.results[0].id).toBe(2)
    expect(calledWith.results[1].id).toBe(3)
    expect(calledWith.results[2].id).toBe(1)
  })

  it('limits results to 10', async () => {
    const mockTmdbResponse = {
      page: 1,
      results: Array.from({ length: 20 }, (_, i) => ({
        id: i,
        title: `Movie ${i}`,
        popularity: 20 - i,
        release_date: '2020-01-01',
        poster_path: null,
        overview: '',
        genre_ids: [],
      })),
      total_pages: 1,
      total_results: 20,
    }

    vi.mocked(tmdbSearch).mockResolvedValue(mockTmdbResponse)
    mockReq = { query: { q: 'test' } }

    await searchMovies(mockReq as Request, mockRes as Response)

    const calledWith = jsonSpy.mock.calls[0][0]
    expect(calledWith.results.length).toBe(10)
  })

  it('returns only necessary fields', async () => {
    const mockTmdbResponse = {
      page: 1,
      results: [
        {
          id: 123,
          title: 'Test Movie',
          release_date: '2020-05-15',
          poster_path: '/abc123.jpg',
          overview: 'A great movie',
          popularity: 50,
          genre_ids: [28, 12],
          extra_field: 'should not appear',
        },
      ],
      total_pages: 1,
      total_results: 1,
    }

    vi.mocked(tmdbSearch).mockResolvedValue(mockTmdbResponse as any)
    mockReq = { query: { q: 'test' } }

    await searchMovies(mockReq as Request, mockRes as Response)

    const calledWith = jsonSpy.mock.calls[0][0]
    expect(calledWith.results[0]).toEqual({
      id: 123,
      title: 'Test Movie',
      release_date: '2020-05-15',
      poster_path: '/abc123.jpg',
      overview: 'A great movie',
    })
    expect(calledWith.results[0]).not.toHaveProperty('popularity')
    expect(calledWith.results[0]).not.toHaveProperty('genre_ids')
    expect(calledWith.results[0]).not.toHaveProperty('extra_field')
  })

  it('handles TMDB API errors', async () => {
    vi.mocked(tmdbSearch).mockRejectedValue(new Error('API error'))
    mockReq = { query: { q: 'test' } }

    await searchMovies(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: 'Failed to search movies' },
    })
  })

  it('handles movies with null popularity', async () => {
    const mockTmdbResponse = {
      page: 1,
      results: [
        {
          id: 1,
          title: 'No Pop',
          popularity: null,
          release_date: '2020-01-01',
          poster_path: null,
          overview: '',
        },
        {
          id: 2,
          title: 'Has Pop',
          popularity: 50,
          release_date: '2020-01-01',
          poster_path: null,
          overview: '',
        },
      ],
      total_pages: 1,
      total_results: 2,
    }

    vi.mocked(tmdbSearch).mockResolvedValue(mockTmdbResponse as any)
    mockReq = { query: { q: 'test' } }

    await searchMovies(mockReq as Request, mockRes as Response)

    // Should not throw, null popularity treated as 0
    expect(jsonSpy).toHaveBeenCalled()
    const calledWith = jsonSpy.mock.calls[0][0]
    expect(calledWith.results[0].id).toBe(2) // Higher popularity first
  })
})
