// Simple in-memory cache with TTL support
// Note: This resets when the container restarts

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>()
  private cleanupInterval: NodeJS.Timeout

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000)
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined

    if (!entry) {
      return null
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    return entry.value
  }

  set<T>(key: string, value: T, ttlSeconds: number): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    })
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
      }
    }
  }

  // For graceful shutdown
  destroy(): void {
    clearInterval(this.cleanupInterval)
    this.cache.clear()
  }
}

// Singleton instance
export const cache = new MemoryCache()

// Cache TTLs in seconds
export const CACHE_TTL = {
  SEARCH: 60 * 60 * 24, // 24 hours
  MOVIE_CREDITS: 60 * 60 * 24 * 7, // 7 days
  PERSON_ALIVE: 60 * 60 * 24, // 24 hours
  PERSON_DECEASED: 60 * 60 * 24 * 30, // 30 days
  WIKIDATA: 60 * 60 * 24 * 90, // 90 days
  ON_THIS_DAY: 60 * 60 * 24, // 24 hours
}

export const CACHE_KEYS = {
  search: (query: string) => `search:${query.toLowerCase().trim()}`,
  movieCredits: (movieId: number) => `credits:${movieId}`,
  person: (personId: number) => `person:${personId}`,
  wikidata: (personId: number) => `wikidata:${personId}`,
  movieFull: (movieId: number) => `movie:${movieId}`,
  onThisDay: (date: string) => `otd:${date}`,
}

export async function getCachedOrFetch<T>(
  key: string,
  ttl: number,
  fetchFn: () => Promise<T>
): Promise<T> {
  const cached = cache.get<T>(key)
  if (cached !== null) {
    return cached
  }

  const fresh = await fetchFn()
  cache.set(key, fresh, ttl)
  return fresh
}
