import { useSiteStats } from "@/hooks/useSiteStats"
import { SkullIcon, FilmReelIcon } from "@/components/icons"

function StatCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode
  value: string | number
  label: string
}) {
  return (
    <div className="flex items-center gap-2 text-text-muted">
      <span className="text-brown-medium/60">{icon}</span>
      <span className="text-sm">
        <span className="font-medium text-brown-dark">{value}</span>{" "}
        <span className="text-xs">{label}</span>
      </span>
    </div>
  )
}

export default function SiteStats() {
  const { data, isLoading, error } = useSiteStats()

  // Don't show anything if no data yet or error
  if (isLoading || error || !data) {
    return null
  }

  // Don't show if there's no meaningful data
  if (data.totalDeceasedActors === 0 && data.totalMoviesAnalyzed === 0) {
    return null
  }

  return (
    <section data-testid="site-stats" className="mt-10">
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        <StatCard
          icon={<SkullIcon size={14} />}
          value={data.totalDeceasedActors.toLocaleString()}
          label="actors tracked"
        />
        <StatCard
          icon={<FilmReelIcon size={14} />}
          value={data.totalMoviesAnalyzed.toLocaleString()}
          label="movies analyzed"
        />
        {data.avgMortalityPercentage !== null && (
          <StatCard
            icon={<span className="text-xs">%</span>}
            value={`${data.avgMortalityPercentage}%`}
            label="avg. mortality"
          />
        )}
      </div>
    </section>
  )
}
