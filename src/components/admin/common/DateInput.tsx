/**
 * Reusable date input component with accessibility and clear functionality.
 * Uses react-datepicker for consistent cross-browser experience.
 */

import ReactDatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"
import "./DateInput.css"

interface DateInputProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  helpText?: string
  error?: string
  showClearButton?: boolean
  className?: string
}

export default function DateInput({
  id,
  label,
  value,
  onChange,
  helpText = "Format: YYYY-MM-DD",
  error,
  showClearButton = true,
  className = "",
}: DateInputProps) {
  // Only include help text ID in aria-describedby when it's actually rendered (not when error is present)
  const describedById = helpText && !error ? `${id}-help` : undefined
  const errorId = error ? `${id}-error` : undefined

  // Convert ISO date string to Date object
  const selectedDate = value ? new Date(value + "T00:00:00") : null

  // Handle date change from react-datepicker
  const handleDateChange = (date: Date | null) => {
    if (date) {
      // Format as YYYY-MM-DD
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, "0")
      const day = String(date.getDate()).padStart(2, "0")
      onChange(`${year}-${month}-${day}`)
    } else {
      onChange("")
    }
  }

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm text-admin-text-muted">
        {label}
      </label>
      <div className="relative">
        <ReactDatePicker
          id={id}
          selected={selectedDate}
          onChange={handleDateChange}
          dateFormat="yyyy-MM-dd"
          placeholderText="YYYY-MM-DD"
          isClearable={showClearButton}
          className={`w-full rounded border bg-admin-surface-inset px-3 py-2 text-admin-text-primary focus:outline-none focus:ring-1 ${
            error
              ? "border-admin-danger focus:border-admin-danger focus:ring-admin-danger"
              : "border-admin-border focus:border-admin-interactive focus:ring-admin-interactive"
          }`}
          calendarClassName="admin-datepicker"
          wrapperClassName="w-full"
          aria-label={label}
          aria-describedby={[describedById, errorId].filter(Boolean).join(" ") || undefined}
          aria-invalid={error ? "true" : undefined}
        />
      </div>
      {helpText && !error && (
        <p id={describedById} className="mt-1 text-xs text-admin-text-muted">
          {helpText}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-admin-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
