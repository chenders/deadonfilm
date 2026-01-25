/**
 * Reusable date input component with accessibility and clear functionality.
 */

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
  const describedById = helpText ? `${id}-help` : undefined
  const errorId = error ? `${id}-error` : undefined

  return (
    <div className={className}>
      <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(0.8) brightness(1.2);
          cursor: pointer;
        }
      `}</style>
      <label htmlFor={id} className="mb-1 block text-sm text-gray-400">
        {label}
      </label>
      <div className="relative">
        <input
          type="date"
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded border bg-gray-900 px-3 py-2 text-white [color-scheme:dark] focus:outline-none focus:ring-1 ${
            error
              ? "border-red-500 focus:border-red-500 focus:ring-red-500"
              : "border-gray-700 focus:border-blue-500 focus:ring-blue-500"
          }`}
          style={{
            colorScheme: "dark",
          }}
          aria-label={label}
          aria-describedby={[describedById, errorId].filter(Boolean).join(" ") || undefined}
          aria-invalid={error ? "true" : undefined}
        />
        {showClearButton && value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-white"
            aria-label={`Clear ${label}`}
          >
            ✕
          </button>
        )}
      </div>
      {helpText && !error && (
        <p id={describedById} className="mt-1 text-xs text-gray-500">
          {helpText}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
