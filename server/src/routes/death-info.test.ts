import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'
import { getDeathInfoRoute } from './death-info.js'

// Mock the movie module
vi.mock('./movie.js', () => ({
  getDeathInfo: vi.fn(),
}))

import { getDeathInfo } from './movie.js'

describe('getDeathInfoRoute', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()

    mockRes = {
      json: jsonSpy,
      status: statusSpy,
    }
  })

  it('returns 400 for invalid movie ID', async () => {
    mockReq = {
      params: { id: 'not-a-number' },
      query: { personIds: '123,456' },
    }

    await getDeathInfoRoute(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: 'Invalid movie ID' },
    })
  })

  it('returns 400 for missing movie ID', async () => {
    mockReq = {
      params: {},
      query: { personIds: '123,456' },
    }

    await getDeathInfoRoute(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: 'Invalid movie ID' },
    })
  })

  it('returns 400 for missing personIds', async () => {
    mockReq = {
      params: { id: '389' },
      query: {},
    }

    await getDeathInfoRoute(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: 'personIds query parameter required' },
    })
  })

  it('returns death info for valid request', async () => {
    const mockDeathInfo = new Map([
      [123, { causeOfDeath: 'lung cancer', wikipediaUrl: 'https://en.wikipedia.org/wiki/Actor1' }],
      [456, { causeOfDeath: 'heart attack', wikipediaUrl: null }],
    ])

    vi.mocked(getDeathInfo).mockReturnValue(mockDeathInfo)

    mockReq = {
      params: { id: '389' },
      query: { personIds: '123,456' },
    }

    await getDeathInfoRoute(mockReq as Request, mockRes as Response)

    expect(getDeathInfo).toHaveBeenCalledWith(389, [123, 456])
    expect(jsonSpy).toHaveBeenCalledWith({
      movieId: 389,
      deathInfo: {
        123: { causeOfDeath: 'lung cancer', wikipediaUrl: 'https://en.wikipedia.org/wiki/Actor1' },
        456: { causeOfDeath: 'heart attack', wikipediaUrl: null },
      },
      found: 2,
      requested: 2,
    })
  })

  it('handles empty results', async () => {
    vi.mocked(getDeathInfo).mockReturnValue(new Map())

    mockReq = {
      params: { id: '389' },
      query: { personIds: '999,888' },
    }

    await getDeathInfoRoute(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith({
      movieId: 389,
      deathInfo: {},
      found: 0,
      requested: 2,
    })
  })

  it('filters out invalid person IDs', async () => {
    vi.mocked(getDeathInfo).mockReturnValue(new Map())

    mockReq = {
      params: { id: '389' },
      query: { personIds: '123,invalid,456,abc' },
    }

    await getDeathInfoRoute(mockReq as Request, mockRes as Response)

    expect(getDeathInfo).toHaveBeenCalledWith(389, [123, 456])
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        requested: 2, // Only valid IDs counted
      })
    )
  })

  it('handles single person ID', async () => {
    const mockDeathInfo = new Map([[123, { causeOfDeath: 'stroke', wikipediaUrl: null }]])

    vi.mocked(getDeathInfo).mockReturnValue(mockDeathInfo)

    mockReq = {
      params: { id: '100' },
      query: { personIds: '123' },
    }

    await getDeathInfoRoute(mockReq as Request, mockRes as Response)

    expect(getDeathInfo).toHaveBeenCalledWith(100, [123])
    expect(jsonSpy).toHaveBeenCalledWith({
      movieId: 100,
      deathInfo: {
        123: { causeOfDeath: 'stroke', wikipediaUrl: null },
      },
      found: 1,
      requested: 1,
    })
  })

  it('handles partial results (some IDs found, some not)', async () => {
    const mockDeathInfo = new Map([
      [123, { causeOfDeath: 'cancer', wikipediaUrl: 'https://example.com' }],
      // 456 not found
    ])

    vi.mocked(getDeathInfo).mockReturnValue(mockDeathInfo)

    mockReq = {
      params: { id: '200' },
      query: { personIds: '123,456,789' },
    }

    await getDeathInfoRoute(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith({
      movieId: 200,
      deathInfo: {
        123: { causeOfDeath: 'cancer', wikipediaUrl: 'https://example.com' },
      },
      found: 1,
      requested: 3,
    })
  })
})
