import { Link } from "react-router-dom"
import { useSiteStats } from "@/hooks/useSiteStats"
import { SkullIcon, FilmReelIcon } from "@/components/icons"
import HoverTooltip from "@/components/common/HoverTooltip"

function StatCard({
  icon,
  value,
  label,
  tooltip,
  to,
  testId,
}: {
  icon: React.ReactNode
  value: string | number
  label: string
  tooltip?: string
  to?: string
  testId?: string
}) {
  const content = (
    <div className="flex items-center gap-2 text-text-muted">
      <span className="text-brown-medium/60">{icon}</span>
      <span className="text-sm">
        <span className="font-medium text-brown-dark">{value}</span>{" "}
        <span className="text-xs">{label}</span>
      </span>
    </div>
  )

  const wrappedContent = to ? (
    <Link to={to} data-testid={testId} className="transition-opacity hover:opacity-70">
      {content}
    </Link>
  ) : (
    content
  )

  if (tooltip) {
    return (
      <HoverTooltip content={tooltip} testId="causes-known-tooltip">
        {wrappedContent}
      </HoverTooltip>
    )
  }

  return wrappedContent
}

export default function SiteStats() {
  const { data, isLoading, error } = useSiteStats()

  // Don't show anything if no data yet or error
  if (isLoading || error || !data) {
    return null
  }

  // Don't show if there's no meaningful data
  if (data.totalActors === 0 && data.totalMoviesAnalyzed === 0) {
    return null
  }

  return (
    <section data-testid="site-stats" className="mt-10">
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        <StatCard
          icon={<span className="text-xs">👤</span>}
          value={data.totalActors.toLocaleString()}
          label="actors tracked"
        />
        <StatCard
          icon={<SkullIcon size={14} />}
          value={data.totalDeceasedActors.toLocaleString()}
          label="known dead"
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
        {data.causeOfDeathPercentage !== null && data.actorsWithCauseKnown !== null && (
          <StatCard
            icon={<span className="text-xs">?</span>}
            value={`${data.causeOfDeathPercentage}%`}
            label="causes known"
            tooltip={`${data.actorsWithCauseKnown.toLocaleString()} of ${data.totalDeceasedActors.toLocaleString()} deceased actors`}
            to="/causes-of-death"
            testId="causes-known-link"
          />
        )}
        {data.topCauseOfDeath && data.topCauseOfDeathCategorySlug && (
          <StatCard
            icon={<span className="text-xs">†</span>}
            value={data.topCauseOfDeath}
            label="leading cause"
            to={`/causes-of-death/${data.topCauseOfDeathCategorySlug}`}
            testId="leading-cause-link"
          />
        )}
      </div>
    </section>
  )
}
