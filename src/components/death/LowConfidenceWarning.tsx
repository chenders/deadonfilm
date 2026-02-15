/**
 * Warning banner for low confidence or disputed death information.
 */

interface LowConfidenceWarningProps {
  level: string | null
}

export default function LowConfidenceWarning({ level }: LowConfidenceWarningProps) {
  if (!level || (level !== "low" && level !== "disputed")) return null

  const isDisputed = level === "disputed"

  return (
    <div
      className="mb-6 rounded-lg border-2 border-warning-border bg-warning-bg p-4"
      data-testid="low-confidence-warning"
    >
      <div className="flex items-start gap-3">
        <svg
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning-icon"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div>
          <h3 className="font-medium text-warning-text-strong">
            {isDisputed ? "Information Disputed" : "Unverified Information"}
          </h3>
          <p className="mt-1 text-sm text-warning-text">
            {isDisputed
              ? "The circumstances of this death are disputed. Multiple conflicting accounts exist, and the information below may not be accurate."
              : "The information below could not be fully verified. The death date or circumstances may contain inaccuracies."}
          </p>
        </div>
      </div>
    </div>
  )
}
