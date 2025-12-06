import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Request, Response } from 'express'
import { getDeathInfoRoute } from './death-info.js'

// Mock the db module
vi.mock('../lib/db.js', () => ({
  getDeceasedPersons: vi.fn(),
}))

import { getDeceasedPersons } from '../lib/db.js'

describe('getDeathInfoRoute', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>
  const originalEnv = process.env.DATABASE_URL

  beforeEach(() => {
    vi.clearAllMocks()
    // Set DATABASE_URL so getDeceasedPersonsIfAvailable calls the mocked function
    process.env.DATABASE_URL = 'postgresql://test'

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()

    mockRes = {
      json: jsonSpy as Response['json'],
      status: statusSpy as Response['status'],
    }
  })

  afterEach(() => {
    // Restore original env
    if (originalEnv) {
      process.env.DATABASE_URL = originalEnv
    } else {
      delete process.env.DATABASE_URL
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
    const mockDbRecords = new Map([
      [
        123,
        {
          tmdb_id: 123,
          name: 'Actor1',
          cause_of_death: 'lung cancer',
          wikipedia_url: 'https://en.wikipedia.org/wiki/Actor1',
        },
      ],
      [456, { tmdb_id: 456, name: 'Actor2', cause_of_death: 'heart attack', wikipedia_url: null }],
    ])

    vi.mocked(getDeceasedPersons).mockResolvedValue(mockDbRecords as any)

    mockReq = {
      params: { id: '389' },
      query: { personIds: '123,456' },
    }

    await getDeathInfoRoute(mockReq as Request, mockRes as Response)

    expect(getDeceasedPersons).toHaveBeenCalledWith([123, 456])
    expect(jsonSpy).toHaveBeenCalledWith({
      pending: false,
      deathInfo: {
        123: { causeOfDeath: 'lung cancer', wikipediaUrl: 'https://en.wikipedia.org/wiki/Actor1' },
        456: { causeOfDeath: 'heart attack', wikipediaUrl: null },
      },
    })
  })

  it('handles empty results', async () => {
    vi.mocked(getDeceasedPersons).mockResolvedValue(new Map())

    mockReq = {
      params: { id: '389' },
      query: { personIds: '999,888' },
    }

    await getDeathInfoRoute(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith({
      pending: false,
      deathInfo: {},
    })
  })

  it('filters out invalid person IDs', async () => {
    vi.mocked(getDeceasedPersons).mockResolvedValue(new Map())

    mockReq = {
      params: { id: '389' },
      query: { personIds: '123,invalid,456,abc' },
    }

    await getDeathInfoRoute(mockReq as Request, mockRes as Response)

    expect(getDeceasedPersons).toHaveBeenCalledWith([123, 456])
  })

  it('handles single person ID', async () => {
    const mockDbRecords = new Map([
      [123, { tmdb_id: 123, name: 'Actor', cause_of_death: 'stroke', wikipedia_url: null }],
    ])

    vi.mocked(getDeceasedPersons).mockResolvedValue(mockDbRecords as any)

    mockReq = {
      params: { id: '100' },
      query: { personIds: '123' },
    }

    await getDeathInfoRoute(mockReq as Request, mockRes as Response)

    expect(getDeceasedPersons).toHaveBeenCalledWith([123])
    expect(jsonSpy).toHaveBeenCalledWith({
      pending: false,
      deathInfo: {
        123: { causeOfDeath: 'stroke', wikipediaUrl: null },
      },
    })
  })

  it('handles partial results (some IDs found, some not)', async () => {
    const mockDbRecords = new Map([
      [
        123,
        {
          tmdb_id: 123,
          name: 'Actor',
          cause_of_death: 'cancer',
          wikipedia_url: 'https://example.com',
        },
      ],
      // 456 and 789 not found
    ])

    vi.mocked(getDeceasedPersons).mockResolvedValue(mockDbRecords as any)

    mockReq = {
      params: { id: '200' },
      query: { personIds: '123,456,789' },
    }

    await getDeathInfoRoute(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith({
      pending: false,
      deathInfo: {
        123: { causeOfDeath: 'cancer', wikipediaUrl: 'https://example.com' },
      },
    })
  })
})
