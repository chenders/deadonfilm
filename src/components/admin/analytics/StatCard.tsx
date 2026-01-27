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
      ? "text-admin-text-muted"
      : change > 0
        ? "text-admin-success"
        : "text-admin-danger"

  return (
    <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-admin-text-muted">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-admin-text-primary md:text-3xl">{value}</p>
          {formattedChange && (
            <p className={`mt-2 text-sm font-medium ${changeColor}`}>{formattedChange}</p>
          )}
        </div>
        {icon && <div className="text-admin-text-muted">{icon}</div>}
      </div>
    </div>
  )
}
