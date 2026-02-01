/**
 * Editable field component for the actor editor.
 * Supports different field types and shows revert button when there's history.
 */

import { useState } from "react"
import type { FieldChange } from "../../../hooks/admin/useActorEditor"

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
}: EditableFieldProps) {
  const [showHistory, setShowHistory] = useState(false)

  const lastChange = history.length > 0 ? history[0] : null
  const hasHistory = history.length > 0

  const handleRevert = () => {
    if (lastChange && onRevert) {
      onRevert(lastChange.old_value)
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
              onClick={() => setShowHistory(!showHistory)}
              className="text-xs text-admin-text-muted hover:text-admin-text-primary"
              title="View history"
            >
              {showHistory ? "Hide history" : "Show history"}
            </button>
            {onRevert && (
              <button
                type="button"
                onClick={handleRevert}
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

      {lastChange && !showHistory && (
        <p className="text-xs text-admin-text-muted">
          Last changed: {new Date(lastChange.created_at).toLocaleDateString()} by{" "}
          {lastChange.source}
        </p>
      )}

      {showHistory && history.length > 0 && (
        <div className="bg-admin-surface-raised mt-2 rounded border border-admin-border p-2">
          <h4 className="mb-2 text-xs font-medium text-admin-text-primary">Change History</h4>
          <ul className="space-y-1 text-xs">
            {history.slice(0, 5).map((change, idx) => (
              <li key={idx} className="flex items-start gap-2 text-admin-text-muted">
                <span className="shrink-0 text-admin-text-primary">
                  {new Date(change.created_at).toLocaleDateString()}
                </span>
                <span className="shrink-0 rounded bg-admin-surface-inset px-1">
                  {change.source}
                </span>
                <span className="truncate">
                  <span className="line-through">{change.old_value || "(empty)"}</span>
                  {" → "}
                  <span>{change.new_value || "(empty)"}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
