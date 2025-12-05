import type { Request, Response } from 'express'
import { cache, CACHE_KEYS, CACHE_TTL } from '../lib/cache.js'

interface OnThisDayResponse {
  date: string
  month: string
  day: string
  deaths: Array<{
    actor: {
      id: number
      name: string
      profile_path: string | null
      deathday: string
    }
    notableFilms: Array<{
      id: number
      title: string
      year: string
    }>
  }>
  message?: string
}

export async function getOnThisDay(_req: Request, res: Response) {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  const dateKey = `${month}-${day}`

  try {
    const cacheKey = CACHE_KEYS.onThisDay(dateKey)
    const cached = cache.get<OnThisDayResponse>(cacheKey)

    if (cached) {
      return res.json(cached)
    }

    // For now, return an informative response
    const response: OnThisDayResponse = {
      date: dateKey,
      month: today.toLocaleDateString('en-US', { month: 'long' }),
      day: today.toLocaleDateString('en-US', { day: 'numeric' }),
      deaths: [],
      message: 'The "On This Day" feature is being populated. Check back soon!',
    }

    cache.set(cacheKey, response, CACHE_TTL.ON_THIS_DAY)

    res.json(response)
  } catch (error) {
    console.error('On This Day error:', error)
    res.status(500).json({ error: { message: 'Failed to fetch On This Day data' } })
  }
}
