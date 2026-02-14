import { useState } from "react"
import { useCategoryPreview } from "../../../hooks/admin/useCauseMappings"

const CATEGORY_COLORS: Record<string, string> = {
  suicide: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  homicide: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  accident: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  overdose: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  cancer: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  "heart-disease": "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${CATEGORY_COLORS[category] || CATEGORY_COLORS.other}`}
    >
      {category}
    </span>
  )
}

export default function CategoryPreviewTab() {
  const [changesOnly, setChangesOnly] = useState(true)
  const { data, isLoading, error } = useCategoryPreview(changesOnly)

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4 text-red-700 dark:bg-red-900/20 dark:text-red-300">
        Failed to load category preview
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      {data && (
        <div className="rounded-lg border border-admin-border bg-admin-surface-overlay p-4">
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-admin-text-muted">Total causes: </span>
              <span className="font-medium text-admin-text-primary">
                {data.summary.totalCauses}
              </span>
            </div>
            <div>
              <span className="text-admin-text-muted">Changed: </span>
              <span className="font-medium text-admin-text-primary">
                {data.summary.changedCauses}
              </span>
            </div>
            <div>
              <span className="text-admin-text-muted">Actors affected: </span>
              <span className="font-medium text-admin-text-primary">
                {data.summary.totalActorsAffected}
              </span>
            </div>
          </div>
          {Object.keys(data.summary.movements).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(data.summary.movements).map(([movement, count]) => (
                <span
                  key={movement}
                  className="rounded-md bg-admin-surface-base px-2 py-1 text-xs text-admin-text-secondary"
                >
                  {movement}: {count}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filter */}
      <label className="flex items-center gap-2 text-sm text-admin-text-secondary">
        <input
          type="checkbox"
          checked={changesOnly}
          onChange={(e) => setChangesOnly(e.target.checked)}
          className="rounded border-admin-border"
          data-testid="changes-only-toggle"
        />
        Show changes only
      </label>

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
                  Current Category
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                  Proposed Category
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                  Actors
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-admin-border bg-admin-surface-elevated">
              {data?.entries.map((entry) => (
                <tr
                  key={entry.normalizedCause}
                  className={`hover:bg-admin-surface-overlay/50 ${entry.changed ? "bg-yellow-50/50 dark:bg-yellow-900/10" : ""}`}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-admin-text-primary">
                    {entry.normalizedCause}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-admin-text-muted">
                    {entry.manner || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <CategoryBadge category={entry.currentCategory} />
                  </td>
                  <td className="px-4 py-3">
                    <CategoryBadge category={entry.proposedCategory} />
                    {entry.changed && (
                      <span className="ml-2 text-xs text-yellow-600 dark:text-yellow-400">
                        changed
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-admin-text-secondary">
                    {entry.actorCount}
                  </td>
                </tr>
              ))}
              {data?.entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-admin-text-muted">
                    {changesOnly ? "No category changes detected" : "No entries found"}
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
