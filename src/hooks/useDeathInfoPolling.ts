import { useEffect, useState, useCallback } from "react"
import { getDeathInfo } from "@/services/api"
import type { DeceasedActor } from "@/types"

interface DeathInfoUpdate {
  causeOfDeath: string | null
  causeOfDeathDetails: string | null
  wikipediaUrl: string | null
}

interface UseDeathInfoPollingOptions {
  movieId: number
  deceased: DeceasedActor[]
  enrichmentPending?: boolean
}

interface UseDeathInfoPollingResult {
  enrichedDeceased: DeceasedActor[]
  isPolling: boolean
}

export function useDeathInfoPolling({
  movieId,
  deceased,
  enrichmentPending = false,
}: UseDeathInfoPollingOptions): UseDeathInfoPollingResult {
  const [deathInfoUpdates, setDeathInfoUpdates] = useState<Record<number, DeathInfoUpdate>>({})
  const [isPolling, setIsPolling] = useState(enrichmentPending)

  // Get IDs of actors that need enrichment (no cause of death or wikipedia url)
  const getActorsNeedingEnrichment = useCallback(() => {
    return deceased.filter(
      (actor) =>
        !actor.causeOfDeath &&
        !actor.wikipediaUrl &&
        !deathInfoUpdates[actor.id]?.causeOfDeath &&
        !deathInfoUpdates[actor.id]?.wikipediaUrl
    )
  }, [deceased, deathInfoUpdates])

  useEffect(() => {
    if (!enrichmentPending) {
      setIsPolling(false)
      return
    }

    const actorsNeedingEnrichment = getActorsNeedingEnrichment()
    if (actorsNeedingEnrichment.length === 0) {
      setIsPolling(false)
      return
    }

    setIsPolling(true)

    let attempts = 0
    const maxAttempts = 30 // Poll for max 30 seconds (15 attempts * 2 seconds)
    const pollInterval = 2000 // 2 seconds

    const pollForUpdates = async () => {
      const personIds = actorsNeedingEnrichment.map((a) => a.id)

      try {
        const response = await getDeathInfo(movieId, personIds)

        // Check if we got any new data
        let hasNewData = false
        const newUpdates: Record<number, DeathInfoUpdate> = {}

        for (const [idStr, info] of Object.entries(response.deathInfo)) {
          const id = parseInt(idStr, 10)
          if (info.causeOfDeath || info.wikipediaUrl) {
            hasNewData = true
            newUpdates[id] = info
          }
        }

        if (hasNewData) {
          setDeathInfoUpdates((prev) => ({ ...prev, ...newUpdates }))
        }

        // Stop polling if no longer pending or we've exhausted attempts
        if (!response.pending || attempts >= maxAttempts) {
          setIsPolling(false)
          return
        }

        attempts++
      } catch (error) {
        console.error("Error polling for death info:", error)
        setIsPolling(false)
        return
      }
    }

    // Start polling
    const intervalId = setInterval(pollForUpdates, pollInterval)

    // Initial poll
    pollForUpdates()

    return () => {
      clearInterval(intervalId)
    }
  }, [movieId, enrichmentPending, getActorsNeedingEnrichment])

  // Merge updates into deceased actors
  const enrichedDeceased = deceased.map((actor) => {
    const update = deathInfoUpdates[actor.id]
    if (update) {
      return {
        ...actor,
        causeOfDeath: update.causeOfDeath ?? actor.causeOfDeath,
        causeOfDeathDetails: update.causeOfDeathDetails ?? actor.causeOfDeathDetails,
        wikipediaUrl: update.wikipediaUrl ?? actor.wikipediaUrl,
      }
    }
    return actor
  })

  return { enrichedDeceased, isPolling }
}
