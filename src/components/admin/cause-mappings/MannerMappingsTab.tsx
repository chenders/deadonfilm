import { useState } from "react"
import { useMannerMappings, useUpdateMannerMapping } from "../../../hooks/admin/useCauseMappings"

const MANNER_OPTIONS = ["natural", "accident", "suicide", "homicide", "undetermined"] as const

const MANNER_COLORS: Record<string, string> = {
  natural: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  accident: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  suicide: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  homicide: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  undetermined: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
}

export default function MannerMappingsTab() {
  const [search, setSearch] = useState("")
  const [mannerFilter, setMannerFilter] = useState("")
  const { data, isLoading, error } = useMannerMappings(
    search || undefined,
    mannerFilter || undefined
  )
  const updateManner = useUpdateMannerMapping()

  const handleMannerChange = (cause: string, manner: string) => {
    updateManner.mutate({ cause, manner })
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4 text-red-700 dark:bg-red-900/20 dark:text-red-300">
        Failed to load manner mappings
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      {data && (
        <div className="flex gap-4 text-sm text-admin-text-muted">
          <span>{data.totalMapped} mapped</span>
          <span>{data.totalUnmapped} unmapped</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search causes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-admin-border bg-admin-surface-base px-3 py-2 text-sm text-admin-text-primary placeholder-admin-text-muted focus:border-admin-interactive focus:outline-none"
          data-testid="manner-search"
        />
        <select
          value={mannerFilter}
          onChange={(e) => setMannerFilter(e.target.value)}
          className="rounded-md border border-admin-border bg-admin-surface-base px-3 py-2 text-sm text-admin-text-primary focus:border-admin-interactive focus:outline-none"
          data-testid="manner-filter"
        >
          <option value="">All manners</option>
          {MANNER_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-8 text-center text-admin-text-muted">Loading...</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-admin-border">
          <table className="min-w-full divide-y divide-admin-border">
            <thead className="bg-admin-surface-overlay">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                  Normalized Cause
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                  Manner
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                  Source
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                  Actors
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-admin-border bg-admin-surface-elevated">
              {data?.mappings.map((mapping) => (
                <tr key={mapping.normalizedCause} className="hover:bg-admin-surface-overlay/50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-admin-text-primary">
                    {mapping.normalizedCause}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={mapping.manner}
                      onChange={(e) => handleMannerChange(mapping.normalizedCause, e.target.value)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${MANNER_COLORS[mapping.manner] || ""}`}
                      data-testid={`manner-select-${mapping.normalizedCause}`}
                    >
                      {MANNER_OPTIONS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-admin-text-muted">
                    {mapping.source}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-admin-text-secondary">
                    {mapping.actorCount}
                  </td>
                </tr>
              ))}
              {data?.mappings.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-admin-text-muted">
                    No mappings found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
