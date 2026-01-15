import type { DecadeBreakdown } from "@/types"

interface DecadeChartProps {
  breakdown: DecadeBreakdown[]
}

export default function DecadeChart({ breakdown }: DecadeChartProps) {
  if (breakdown.length === 0) return null

  const maxCount = Math.max(...breakdown.map((d) => d.count))

  return (
    <div className="space-y-2">
      {breakdown.map((item) => (
        <div key={item.decade} className="flex items-center gap-2">
          <span className="w-12 text-xs text-foreground-muted">{item.decade}</span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-surface-muted">
            <div
              className="h-full rounded bg-accent transition-all"
              style={{ width: `${(item.count / maxCount) * 100}%` }}
            />
          </div>
          <span className="w-10 text-right text-xs text-foreground-muted">{item.count}</span>
        </div>
      ))}
    </div>
  )
}
