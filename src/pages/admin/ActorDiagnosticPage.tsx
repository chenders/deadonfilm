import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import AdminLayout from "../../components/admin/AdminLayout"
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

export default function ActorDiagnosticPage() {
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
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">Actor Diagnostic Tool</h1>
          <p className="mt-2 text-gray-400">
            Quick lookup for troubleshooting actor URLs, cache status, and redirect patterns
          </p>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="rounded-lg bg-gray-800 p-6">
          <label htmlFor="actorId" className="mb-2 block text-sm font-medium text-gray-300">
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
              className="flex-1 rounded-md border border-gray-600 bg-gray-700 px-4 py-2 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={!actorId}
              className="rounded-md bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Lookup
            </button>
          </div>
        </form>

        {/* Loading State */}
        {isLoading && (
          <div className="rounded-lg bg-gray-800 p-12 text-center">
            <div className="text-gray-400">Loading actor diagnostic data...</div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="rounded-lg border border-red-700 bg-red-900/20 p-6">
            <div className="text-red-400">
              {error instanceof Error ? error.message : "An error occurred"}
            </div>
          </div>
        )}

        {/* Results */}
        {data && !isLoading && !error && (
          <div className="space-y-6">
            {/* Actor Info */}
            <div className="rounded-lg bg-gray-800 p-6">
              <h3 className="mb-4 text-xl font-semibold text-white">Actor Information</h3>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-gray-400">Name</dt>
                  <dd className="mt-1 text-lg font-semibold text-white">{data.actor.name}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-400">Internal ID</dt>
                  <dd className="mt-1 font-mono text-lg text-blue-400">{data.actor.id}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-400">TMDB ID</dt>
                  <dd className="mt-1 font-mono text-lg text-blue-400">
                    {data.actor.tmdbId ?? "N/A"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-400">Status</dt>
                  <dd className="mt-1">
                    {data.actor.deathday ? (
                      <span className="text-gray-300">
                        Deceased ({formatDate(data.actor.deathday)})
                      </span>
                    ) : (
                      <span className="text-green-400">Living</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-400">Popularity</dt>
                  <dd className="mt-1 text-lg text-white">
                    {data.actor.popularity?.toFixed(1) ?? "N/A"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-400">ID Conflict</dt>
                  <dd className="mt-1">
                    {data.idConflict.hasConflict ? (
                      <div className="text-yellow-400">
                        ⚠️ Conflict with actor #{data.idConflict.conflictingActor?.id}
                        <div className="mt-1 text-sm text-gray-400">
                          {data.idConflict.conflictingActor?.name} (pop:{" "}
                          {data.idConflict.conflictingActor?.popularity?.toFixed(1)})
                        </div>
                      </div>
                    ) : (
                      <span className="text-green-400">✓ No conflict (IDs match)</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            {/* URLs */}
            <div className="rounded-lg bg-gray-800 p-6">
              <h3 className="mb-4 text-xl font-semibold text-white">URLs</h3>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm font-medium text-gray-400">Canonical URL</dt>
                  <dd className="mt-1 font-mono text-blue-400">{data.urls.canonical}</dd>
                </div>
                {data.urls.legacy && (
                  <div>
                    <dt className="text-sm font-medium text-gray-400">Legacy URL</dt>
                    <dd className="mt-1">
                      <span className="font-mono text-gray-400">{data.urls.legacy}</span>
                      <span className="ml-2 text-green-400">→ redirects ✓</span>
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Cache Status */}
            <div className="rounded-lg bg-gray-800 p-6">
              <h3 className="mb-4 text-xl font-semibold text-white">Cache Status</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg bg-gray-700 p-4">
                  <div className="mb-2 text-sm font-medium text-gray-400">Profile Cache</div>
                  {data.cache.profile.cached ? (
                    <div>
                      <div className="text-green-400">✓ Cached</div>
                      <div className="mt-1 text-sm text-gray-400">
                        TTL: {formatTTL(data.cache.profile.ttl)}
                      </div>
                    </div>
                  ) : (
                    <div className="text-yellow-400">Not cached</div>
                  )}
                </div>
                <div className="rounded-lg bg-gray-700 p-4">
                  <div className="mb-2 text-sm font-medium text-gray-400">Death Cache</div>
                  {data.cache.death.cached ? (
                    <div>
                      <div className="text-green-400">✓ Cached</div>
                      <div className="mt-1 text-sm text-gray-400">
                        TTL: {formatTTL(data.cache.death.ttl)}
                      </div>
                    </div>
                  ) : (
                    <div className="text-yellow-400">Not cached</div>
                  )}
                </div>
              </div>
            </div>

            {/* Redirect Statistics */}
            <div className="rounded-lg bg-gray-800 p-6">
              <h3 className="mb-4 text-xl font-semibold text-white">Recent Redirects</h3>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-sm font-medium text-gray-400">Last 7 Days</dt>
                  <dd className="mt-1 text-2xl font-bold text-white">
                    {data.redirectStats.last7Days.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-400">Last 30 Days</dt>
                  <dd className="mt-1 text-2xl font-bold text-white">
                    {data.redirectStats.last30Days.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-400">Top Referer</dt>
                  <dd className="mt-1 text-lg text-white">
                    {data.redirectStats.topReferer ? (
                      <span className="font-mono text-sm text-blue-400">
                        {data.redirectStats.topReferer}
                      </span>
                    ) : (
                      <span className="text-gray-500">N/A</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
