import type { Request, Response } from 'express'
import { getDeathInfo } from './movie.js'

export async function getDeathInfoRoute(req: Request, res: Response) {
  const movieId = parseInt(req.params.id, 10)
  const personIdsParam = req.query.personIds as string

  if (!movieId || isNaN(movieId)) {
    return res.status(400).json({ error: { message: 'Invalid movie ID' } })
  }

  if (!personIdsParam) {
    return res.status(400).json({ error: { message: 'personIds query parameter required' } })
  }

  const personIds = personIdsParam
    .split(',')
    .map((id) => parseInt(id, 10))
    .filter((id) => !isNaN(id))

  const deathInfo = getDeathInfo(movieId, personIds)

  // Convert Map to object for JSON response
  const result: Record<number, { causeOfDeath: string | null; wikipediaUrl: string | null }> = {}
  for (const [personId, info] of deathInfo) {
    result[personId] = info
  }

  res.json({
    movieId,
    deathInfo: result,
    found: deathInfo.size,
    requested: personIds.length,
  })
}
