/**
 * Reusable stat display card for analytics metrics.
 */

interface StatCardProps {
  label: string
  value: string | number
  change?: number
  icon?: React.ReactNode
}

export default function StatCard({ label, value, change, icon }: StatCardProps) {
  const formattedChange =
    change !== undefined ? `${change > 0 ? "+" : ""}${change.toFixed(1)}%` : null

  const changeColor =
    change === undefined || change === 0
      ? "text-gray-400"
      : change > 0
        ? "text-green-400"
        : "text-red-400"

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-400">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
          {formattedChange && (
            <p className={`mt-2 text-sm font-medium ${changeColor}`}>{formattedChange}</p>
          )}
        </div>
        {icon && <div className="text-gray-400">{icon}</div>}
      </div>
    </div>
  )
}
