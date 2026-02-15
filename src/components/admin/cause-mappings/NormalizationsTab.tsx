import { useState } from "react"
import { useNormalizations, useUpdateNormalization } from "../../../hooks/admin/useCauseMappings"
import { useDebouncedValue } from "../../../hooks/useDebouncedValue"

export default function NormalizationsTab() {
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search, 300)
  const [editingCause, setEditingCause] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const { data, isLoading, error } = useNormalizations(debouncedSearch || undefined)
  const updateNormalization = useUpdateNormalization()

  const handleEdit = (originalCause: string, normalizedCause: string) => {
    setEditingCause(originalCause)
    setEditValue(normalizedCause)
  }

  const handleSave = (originalCause: string) => {
    updateNormalization.mutate(
      { originalCause, normalizedCause: editValue },
      { onSuccess: () => setEditingCause(null) }
    )
  }

  const handleCancel = () => {
    setEditingCause(null)
    setEditValue("")
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4 text-red-700 dark:bg-red-900/20 dark:text-red-300">
        Failed to load normalizations
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {data && <div className="text-sm text-admin-text-muted">{data.total} normalizations</div>}

      <input
        type="text"
        placeholder="Search original or normalized causes..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="rounded-md border border-admin-border bg-admin-surface-base px-3 py-2 text-sm text-admin-text-primary placeholder-admin-text-muted focus:border-admin-interactive focus:outline-none"
        data-testid="normalization-search"
      />

      {isLoading ? (
        <div className="py-8 text-center text-admin-text-muted">Loading...</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-admin-border">
          <table className="min-w-full divide-y divide-admin-border">
            <thead className="bg-admin-surface-overlay">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                  Original Cause
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                  Normalized Cause
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-admin-text-muted">
                  Actors
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-admin-border bg-admin-surface-elevated">
              {data?.normalizations.map((norm) => (
                <tr key={norm.originalCause} className="hover:bg-admin-surface-overlay/50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-admin-text-primary">
                    {norm.originalCause}
                  </td>
                  <td className="px-4 py-3">
                    {editingCause === norm.originalCause ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="rounded-md border border-admin-border bg-admin-surface-base px-2 py-1 text-sm text-admin-text-primary focus:border-admin-interactive focus:outline-none"
                          data-testid={`normalization-edit-${norm.originalCause}`}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSave(norm.originalCause)
                            if (e.key === "Escape") handleCancel()
                          }}
                        />
                        <button
                          onClick={() => handleSave(norm.originalCause)}
                          className="rounded px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20"
                          disabled={updateNormalization.isPending || !editValue.trim()}
                        >
                          Save
                        </button>
                        <button
                          onClick={handleCancel}
                          className="rounded px-2 py-1 text-xs font-medium text-admin-text-muted hover:bg-admin-surface-overlay"
                        >
                          Cancel
                        </button>
                        {updateNormalization.isError && (
                          <span className="text-xs text-red-600 dark:text-red-400">
                            Save failed
                          </span>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEdit(norm.originalCause, norm.normalizedCause)}
                        className="text-sm text-admin-text-secondary hover:text-admin-text-primary hover:underline"
                        title="Click to edit"
                      >
                        {norm.normalizedCause}
                      </button>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-admin-text-secondary">
                    {norm.actorCount}
                  </td>
                </tr>
              ))}
              {data?.normalizations.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-admin-text-muted">
                    No normalizations found
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
