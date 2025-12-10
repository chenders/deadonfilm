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
    <div className="flex flex-col items-center gap-1 rounded-lg bg-white px-4 py-3">
      <div className="text-brown-medium">{icon}</div>
      <span className="font-display text-xl text-brown-dark">{value}</span>
      <span className="text-xs text-text-muted">{label}</span>
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
    <section data-testid="site-stats" className="mt-8">
      <div className="rounded-lg bg-beige p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={<SkullIcon size={20} />}
            value={data.totalDeceasedActors.toLocaleString()}
            label="Actors Tracked"
          />
          <StatCard
            icon={<FilmReelIcon size={20} />}
            value={data.totalMoviesAnalyzed.toLocaleString()}
            label="Movies Analyzed"
          />
          {data.avgMortalityPercentage !== null && (
            <StatCard icon={<span>%</span>} value={`${data.avgMortalityPercentage}%`} label="Avg. Mortality" />
          )}
          {data.topCauseOfDeath && (
            <StatCard
              icon={<span className="text-sm">RIP</span>}
              value={data.topCauseOfDeath}
              label="Top Cause of Death"
            />
          )}
        </div>
      </div>
    </section>
  )
}
