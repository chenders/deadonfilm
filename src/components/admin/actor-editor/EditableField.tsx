/**
 * Editable field component for the actor editor.
 * Supports different field types and shows revert button when there's history.
 */

import { useState } from "react"
import type { FieldChange } from "../../../hooks/admin/useActorEditor"
import { useFieldHistory } from "../../../hooks/admin/useFieldHistory"

export type FieldType = "text" | "textarea" | "date" | "boolean" | "select" | "array"

interface EditableFieldProps {
  name: string
  label: string
  value: unknown
  onChange: (value: unknown) => void
  type?: FieldType
  options?: { value: string; label: string }[]
  placeholder?: string
  helpText?: string
  disabled?: boolean
  history?: FieldChange[]
  onRevert?: (previousValue: string | null) => void
  className?: string
  actorId?: number
}

export default function EditableField({
  name,
  label,
  value,
  onChange,
  type = "text",
  options,
  placeholder,
  helpText,
  disabled = false,
  history = [],
  onRevert,
  className = "",
  actorId,
}: EditableFieldProps) {
  const [showFullHistory, setShowFullHistory] = useState(false)

  const { history: fullHistory, isLoading: isLoadingHistory } = useFieldHistory(
    actorId,
    name,
    showFullHistory
  )

  const lastChange = history.length > 0 ? history[0] : null
  const hasHistory = history.length > 0

  const displayHistory = showFullHistory ? fullHistory : history.slice(0, 5)

  const handleRevert = (oldValue: string | null) => {
    if (onRevert) {
      onRevert(oldValue)
    }
  }

  const renderInput = () => {
    const baseInputClass =
      "w-full rounded border bg-admin-surface-inset px-3 py-2 text-admin-text-primary focus:outline-none focus:ring-1 border-admin-border focus:border-admin-interactive focus:ring-admin-interactive disabled:opacity-50 disabled:cursor-not-allowed"

    switch (type) {
      case "textarea":
        return (
          <textarea
            id={name}
            name={name}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder={placeholder}
            disabled={disabled}
            className={`${baseInputClass} min-h-[100px] resize-y`}
            rows={4}
          />
        )

      case "date":
        return (
          <input
            type="date"
            id={name}
            name={name}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={disabled}
            className={baseInputClass}
          />
        )

      case "boolean":
        return (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={name}
              name={name}
              checked={(value as boolean) ?? false}
              onChange={(e) => onChange(e.target.checked)}
              disabled={disabled}
              className="h-4 w-4 rounded border-admin-border bg-admin-surface-inset text-admin-interactive focus:ring-admin-interactive"
            />
            <span className="text-sm text-admin-text-muted">{value ? "Yes" : "No"}</span>
          </div>
        )

      case "select":
        return (
          <select
            id={name}
            name={name}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={disabled}
            className={baseInputClass}
          >
            <option value="">-- Select --</option>
            {options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )

      case "array": {
        // For arrays, we'll show as comma-separated values
        const arrayValue = Array.isArray(value) ? value.join(", ") : ""
        return (
          <input
            type="text"
            id={name}
            name={name}
            value={arrayValue}
            onChange={(e) => {
              const newValue = e.target.value
                ? e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                : null
              onChange(newValue)
            }}
            placeholder={placeholder || "Enter values separated by commas"}
            disabled={disabled}
            className={baseInputClass}
          />
        )
      }

      default:
        return (
          <input
            type="text"
            id={name}
            name={name}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder={placeholder}
            disabled={disabled}
            className={baseInputClass}
          />
        )
    }
  }

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-center justify-between">
        <label htmlFor={name} className="block text-sm font-medium text-admin-text-primary">
          {label}
        </label>
        {hasHistory && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFullHistory(!showFullHistory)}
              className="text-xs text-admin-text-muted hover:text-admin-text-primary"
              title="View history"
            >
              {showFullHistory ? "Hide history" : "Show history"}
            </button>
            {!showFullHistory && onRevert && lastChange && (
              <button
                type="button"
                onClick={() => handleRevert(lastChange.old_value)}
                className="bg-admin-surface-raised flex items-center gap-1 rounded px-2 py-1 text-xs text-admin-text-muted hover:bg-admin-surface-inset hover:text-admin-text-primary"
                title={`Revert to: ${lastChange?.old_value ?? "(empty)"}`}
              >
                <span aria-hidden="true">&#8617;</span>
                Revert
              </button>
            )}
          </div>
        )}
      </div>

      {renderInput()}

      {helpText && <p className="text-xs text-admin-text-muted">{helpText}</p>}

      {lastChange && !showFullHistory && (
        <p className="text-xs text-admin-text-muted">
          Last changed: {new Date(lastChange.created_at).toLocaleDateString()} by{" "}
          {lastChange.source}
        </p>
      )}

      {showFullHistory && (
        <div className="bg-admin-surface-raised mt-2 max-h-[200px] overflow-y-auto rounded border border-admin-border p-2">
          <h4 className="mb-2 text-xs font-medium text-admin-text-primary">Change History</h4>
          {isLoadingHistory ? (
            <p className="text-xs text-admin-text-muted">Loading history...</p>
          ) : displayHistory.length === 0 ? (
            <p className="text-xs text-admin-text-muted">No history available</p>
          ) : (
            <ul className="space-y-2">
              {displayHistory.map((change, idx) => (
                <li
                  key={"id" in change ? change.id : idx}
                  className="flex items-start justify-between gap-2 rounded bg-admin-surface-inset p-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-admin-text-muted">
                      <span>{new Date(change.created_at).toLocaleDateString()}</span>
                      <span className="rounded bg-admin-surface-overlay px-1">{change.source}</span>
                    </div>
                    <div className="mt-1 truncate text-admin-text-primary">
                      <span className="text-admin-text-muted line-through">
                        {change.old_value || "(empty)"}
                      </span>
                      {" → "}
                      <span>{change.new_value || "(empty)"}</span>
                    </div>
                  </div>
                  {onRevert && (
                    <button
                      type="button"
                      onClick={() => handleRevert(change.old_value)}
                      className="hover:bg-admin-surface-raised shrink-0 rounded bg-admin-surface-overlay px-2 py-1 text-admin-text-muted hover:text-admin-text-primary"
                      title={`Revert to: ${change.old_value ?? "(empty)"}`}
                    >
                      Revert
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
