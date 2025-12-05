import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cache, CACHE_KEYS, CACHE_TTL, getCachedOrFetch } from './cache.js'

describe('MemoryCache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('get and set', () => {
    it('returns null for missing key', () => {
      expect(cache.get('nonexistent')).toBe(null)
    })

    it('stores and retrieves value', () => {
      cache.set('test-key', { data: 'hello' }, 3600)
      expect(cache.get('test-key')).toEqual({ data: 'hello' })
    })

    it('stores different types', () => {
      cache.set('string', 'hello', 3600)
      cache.set('number', 42, 3600)
      cache.set('array', [1, 2, 3], 3600)
      cache.set('object', { foo: 'bar' }, 3600)

      expect(cache.get('string')).toBe('hello')
      expect(cache.get('number')).toBe(42)
      expect(cache.get('array')).toEqual([1, 2, 3])
      expect(cache.get('object')).toEqual({ foo: 'bar' })
    })

    it('overwrites existing value', () => {
      cache.set('key', 'first', 3600)
      cache.set('key', 'second', 3600)

      expect(cache.get('key')).toBe('second')
    })
  })

  describe('TTL expiration', () => {
    it('returns value before TTL expires', () => {
      cache.set('expiring', 'value', 10) // 10 seconds

      // Advance 5 seconds
      vi.advanceTimersByTime(5000)

      expect(cache.get('expiring')).toBe('value')
    })

    it('returns null after TTL expires', () => {
      cache.set('expiring', 'value', 10) // 10 seconds

      // Advance 11 seconds
      vi.advanceTimersByTime(11000)

      expect(cache.get('expiring')).toBe(null)
    })

    it('returns null exactly at TTL boundary', () => {
      cache.set('boundary', 'value', 10)

      // Advance exactly 10 seconds plus 1ms
      vi.advanceTimersByTime(10001)

      expect(cache.get('boundary')).toBe(null)
    })
  })
})

describe('CACHE_KEYS', () => {
  it('generates search key', () => {
    expect(CACHE_KEYS.search('Star Wars')).toBe('search:star wars')
    expect(CACHE_KEYS.search('  JAWS  ')).toBe('search:jaws')
  })

  it('generates movie credits key', () => {
    expect(CACHE_KEYS.movieCredits(12345)).toBe('credits:12345')
  })

  it('generates person key', () => {
    expect(CACHE_KEYS.person(67890)).toBe('person:67890')
  })

  it('generates wikidata key', () => {
    expect(CACHE_KEYS.wikidata(11111)).toBe('wikidata:11111')
  })

  it('generates movie full key', () => {
    expect(CACHE_KEYS.movieFull(22222)).toBe('movie:22222')
  })

  it('generates on this day key', () => {
    expect(CACHE_KEYS.onThisDay('12-25')).toBe('otd:12-25')
  })
})

describe('CACHE_TTL', () => {
  it('has correct TTL values in seconds', () => {
    expect(CACHE_TTL.SEARCH).toBe(60 * 60 * 24) // 24 hours
    expect(CACHE_TTL.MOVIE_CREDITS).toBe(60 * 60 * 24 * 7) // 7 days
    expect(CACHE_TTL.PERSON_ALIVE).toBe(60 * 60 * 24) // 24 hours
    expect(CACHE_TTL.PERSON_DECEASED).toBe(60 * 60 * 24 * 30) // 30 days
    expect(CACHE_TTL.WIKIDATA).toBe(60 * 60 * 24 * 90) // 90 days
    expect(CACHE_TTL.ON_THIS_DAY).toBe(60 * 60 * 24) // 24 hours
  })
})

describe('getCachedOrFetch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns cached value if exists', async () => {
    cache.set('cached-key', 'cached-value', 3600)

    const fetchFn = vi.fn().mockResolvedValue('fresh-value')
    const result = await getCachedOrFetch('cached-key', 3600, fetchFn)

    expect(result).toBe('cached-value')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('fetches and caches when not in cache', async () => {
    const fetchFn = vi.fn().mockResolvedValue('fresh-value')
    const result = await getCachedOrFetch('new-key', 3600, fetchFn)

    expect(result).toBe('fresh-value')
    expect(fetchFn).toHaveBeenCalledTimes(1)

    // Verify it was cached
    expect(cache.get('new-key')).toBe('fresh-value')
  })

  it('fetches again after cache expires', async () => {
    const fetchFn = vi.fn().mockResolvedValue('fresh-value')

    // First call
    await getCachedOrFetch('expiring-key', 10, fetchFn)
    expect(fetchFn).toHaveBeenCalledTimes(1)

    // Advance time past TTL
    vi.advanceTimersByTime(11000)

    // Second call should fetch again
    await getCachedOrFetch('expiring-key', 10, fetchFn)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('handles fetch function throwing error', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('Network error'))

    await expect(getCachedOrFetch('error-key', 3600, fetchFn)).rejects.toThrow('Network error')
  })

  it('caches complex objects', async () => {
    const complexData = {
      id: 1,
      name: 'Test',
      nested: { foo: 'bar' },
      array: [1, 2, 3],
    }

    const fetchFn = vi.fn().mockResolvedValue(complexData)
    const result = await getCachedOrFetch('complex-key', 3600, fetchFn)

    expect(result).toEqual(complexData)
    expect(cache.get('complex-key')).toEqual(complexData)
  })
})
