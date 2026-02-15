import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { adminApi } from "@/services/api"
import { formatDate } from "@/utils/formatDate"

interface ActorDiagnosticData {
  actor: {
    id: number
    tmdbId: number | null
    name: string
    deathday: string | null
    popularity: number | null
  }
  idConflict: {
    hasConflict: boolean
    conflictingActor?: {
      id: number
      name: string
      popularity: number | null
    }
  }
  urls: {
    canonical: string
    legacy: string | null
  }
  cache: {
    profile: { cached: boolean; ttl: number | null }
    death: { cached: boolean; ttl: number | null }
  }
  redirectStats: {
    last7Days: number
    last30Days: number
    topReferer: string | null
  }
}

export default function ActorDiagnosticTab() {
  const [actorId, setActorId] = useState("")
  const [searchTriggered, setSearchTriggered] = useState(false)

  const { data, isLoading, error } = useQuery<ActorDiagnosticData>({
    queryKey: ["actor-diagnostic", actorId],
    queryFn: async () => {
      const response = await fetch(adminApi(`/actors/${actorId}/diagnostic`))
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Actor not found")
        }
        throw new Error("Failed to fetch diagnostic data")
      }
      return response.json()
    },
    enabled: searchTriggered && actorId.length > 0,
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearchTriggered(true)
  }

  const formatTTL = (seconds: number | null): string => {
    if (!seconds) return "N/A"
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}h ${minutes}m`
  }

  return (
    <div className="space-y-8">
      {/* Search Form */}
      <form
        onSubmit={handleSearch}
        className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6"
      >
        <label
          htmlFor="actorId"
          className="mb-2 block text-sm font-medium text-admin-text-secondary"
        >
          Enter Actor ID (internal actor.id or TMDB ID):
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            id="actorId"
            value={actorId}
            onChange={(e) => {
              setActorId(e.target.value)
              setSearchTriggered(false)
            }}
            placeholder="e.g. 4165 or 31"
            className="flex-1 rounded-md border border-admin-border bg-admin-surface-overlay px-4 py-2 text-admin-text-primary placeholder-admin-text-muted focus:border-admin-interactive focus:outline-none focus:ring-2 focus:ring-admin-interactive"
          />
          <button
            type="submit"
            disabled={!actorId}
            className="rounded-md bg-admin-interactive px-6 py-2 font-semibold text-admin-text-primary hover:bg-admin-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Lookup
          </button>
        </div>
      </form>

      {/* Loading State */}
      {isLoading && (
        <div className="rounded-lg bg-admin-surface-elevated p-12 text-center shadow-admin-sm">
          <div className="text-admin-text-muted">Loading actor diagnostic data...</div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="border-admin-danger/50 bg-admin-danger/20 rounded-lg border p-4 shadow-admin-sm md:p-6">
          <div className="text-admin-danger">
            {error instanceof Error ? error.message : "An error occurred"}
          </div>
        </div>
      )}

      {/* Results */}
      {data && !isLoading && !error && (
        <div className="space-y-6">
          {/* Actor Info */}
          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h3 className="mb-4 text-xl font-semibold text-admin-text-primary">
              Actor Information
            </h3>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-admin-text-muted">Name</dt>
                <dd className="mt-1 text-lg font-semibold text-admin-text-primary">
                  {data.actor.name}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-admin-text-muted">Internal ID</dt>
                <dd className="mt-1 font-mono text-lg text-admin-interactive">{data.actor.id}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-admin-text-muted">TMDB ID</dt>
                <dd className="mt-1 font-mono text-lg text-admin-interactive">
                  {data.actor.tmdbId ?? "N/A"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-admin-text-muted">Status</dt>
                <dd className="mt-1">
                  {data.actor.deathday ? (
                    <span className="text-admin-text-secondary">
                      Deceased ({formatDate(data.actor.deathday)})
                    </span>
                  ) : (
                    <span className="text-admin-success">Living</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-admin-text-muted">Popularity</dt>
                <dd className="mt-1 text-lg text-admin-text-primary">
                  {data.actor.popularity?.toFixed(1) ?? "N/A"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-admin-text-muted">ID Conflict</dt>
                <dd className="mt-1">
                  {data.idConflict.hasConflict ? (
                    <div className="text-admin-warning">
                      Warning: Conflict with actor #{data.idConflict.conflictingActor?.id}
                      <div className="mt-1 text-sm text-admin-text-muted">
                        {data.idConflict.conflictingActor?.name} (pop:{" "}
                        {data.idConflict.conflictingActor?.popularity?.toFixed(1)})
                      </div>
                    </div>
                  ) : (
                    <span className="text-admin-success">✓ No conflict (IDs match)</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          {/* URLs */}
          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h3 className="mb-4 text-xl font-semibold text-admin-text-primary">URLs</h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-admin-text-muted">Canonical URL</dt>
                <dd className="mt-1 font-mono text-admin-interactive">{data.urls.canonical}</dd>
              </div>
              {data.urls.legacy && (
                <div>
                  <dt className="text-sm font-medium text-admin-text-muted">Legacy URL</dt>
                  <dd className="mt-1">
                    <span className="font-mono text-admin-text-muted">{data.urls.legacy}</span>
                    <span className="ml-2 text-admin-success">→ redirects ✓</span>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Cache Status */}
          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h3 className="mb-4 text-xl font-semibold text-admin-text-primary">Cache Status</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-admin-surface-overlay p-4">
                <div className="mb-2 text-sm font-medium text-admin-text-muted">Profile Cache</div>
                {data.cache.profile.cached ? (
                  <div>
                    <div className="text-admin-success">✓ Cached</div>
                    <div className="mt-1 text-sm text-admin-text-muted">
                      TTL: {formatTTL(data.cache.profile.ttl)}
                    </div>
                  </div>
                ) : (
                  <div className="text-admin-warning">Not cached</div>
                )}
              </div>
              <div className="rounded-lg bg-admin-surface-overlay p-4">
                <div className="mb-2 text-sm font-medium text-admin-text-muted">Death Cache</div>
                {data.cache.death.cached ? (
                  <div>
                    <div className="text-admin-success">✓ Cached</div>
                    <div className="mt-1 text-sm text-admin-text-muted">
                      TTL: {formatTTL(data.cache.death.ttl)}
                    </div>
                  </div>
                ) : (
                  <div className="text-admin-warning">Not cached</div>
                )}
              </div>
            </div>
          </div>

          {/* Redirect Statistics */}
          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h3 className="mb-4 text-xl font-semibold text-admin-text-primary">Recent Redirects</h3>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-sm font-medium text-admin-text-muted">Last 7 Days</dt>
                <dd className="mt-1 text-2xl font-bold text-admin-text-primary">
                  {data.redirectStats.last7Days.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-admin-text-muted">Last 30 Days</dt>
                <dd className="mt-1 text-2xl font-bold text-admin-text-primary">
                  {data.redirectStats.last30Days.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-admin-text-muted">Top Referer</dt>
                <dd className="mt-1 text-lg text-admin-text-primary">
                  {data.redirectStats.topReferer ? (
                    <span className="font-mono text-sm text-admin-interactive">
                      {data.redirectStats.topReferer}
                    </span>
                  ) : (
                    <span className="text-admin-text-muted">N/A</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  )
}
