import { useState, useMemo } from "react"
import { Link } from "react-router-dom"
import { getProfileUrl } from "@/services/api"
import { createActorSlug } from "@/utils/slugify"
import { formatDate } from "@/utils/formatDate"
import { toTitleCase } from "@/utils/formatText"
import { PersonIcon, InfoIcon } from "@/components/icons"
import type { DeceasedActor } from "@/types"

interface MiniTimelineProps {
  releaseYear: number
  deceased: DeceasedActor[]
}

export default function MiniTimeline({ releaseYear, deceased }: MiniTimelineProps) {
  const [expandedYear, setExpandedYear] = useState<number | null>(null)
  const [hoveredActorId, setHoveredActorId] = useState<number | null>(null)

  const currentYear = new Date().getFullYear()
  const totalYears = currentYear - releaseYear

  // Memoize timeline data calculations to avoid recalculating on every render
  const deathYearData = useMemo(() => {
    // Group deaths by year
    const deathsByYear = deceased.reduce(
      (acc, actor) => {
        const year = new Date(actor.deathday).getFullYear()
        if (!acc[year]) acc[year] = []
        acc[year].push(actor)
        return acc
      },
      {} as Record<number, DeceasedActor[]>
    )

    return Object.entries(deathsByYear)
      .map(([yearStr, actors]) => {
        const year = parseInt(yearStr, 10)
        const yearOffset = year - releaseYear
        const position = totalYears > 0 ? (yearOffset / totalYears) * 100 : 0
        return { year, count: actors.length, actors, position }
      })
      .sort((a, b) => a.year - b.year)
  }, [deceased, releaseYear, totalYears])

  if (deceased.length === 0) {
    return null
  }

  const toggleYear = (year: number) => {
    setExpandedYear(expandedYear === year ? null : year)
  }

  return (
    <div data-testid="mini-timeline" className="space-y-4">
      {/* Header */}
      <h2 className="font-display text-xl text-brown-dark">Deaths Over Time</h2>

      {/* Vertical Timeline */}
      <div className="rounded-lg border border-brown-medium/20 bg-white p-4">
        <div className="relative pl-4">
          {/* Vertical timeline line */}
          <div className="absolute bottom-2 left-[7px] top-2 w-0.5 bg-brown-medium/20" />

          {/* Timeline events */}
          <div className="space-y-4">
            {/* Release year event */}
            <div className="relative">
              <div className="absolute -left-4 top-1 h-3 w-3 rounded-full border-2 border-living bg-living-bg" />
              <div className="ml-4 flex items-center gap-2 text-sm">
                <span className="font-semibold text-living-dark">{releaseYear}</span>
                <span className="text-text-muted">Movie Released</span>
              </div>
            </div>

            {/* Death year events */}
            {deathYearData.map((yearData) => (
              <div key={yearData.year} className="relative">
                <div className="absolute -left-4 top-1 h-3 w-3 rounded-full border-2 border-accent bg-cream" />
                <div className="ml-4">
                  <button
                    onClick={() => toggleYear(yearData.year)}
                    className="flex w-full items-center gap-2 text-left text-sm transition-colors hover:text-accent"
                    data-testid={`timeline-year-${yearData.year}`}
                    aria-expanded={expandedYear === yearData.year}
                    aria-controls={`timeline-content-${yearData.year}`}
                  >
                    <span className="font-semibold text-accent">{yearData.year}</span>
                    <span className="text-text-muted">
                      {yearData.count} death{yearData.count !== 1 ? "s" : ""}
                    </span>
                    <svg
                      className={`ml-auto h-4 w-4 text-brown-medium/50 transition-transform duration-300 ${
                        expandedYear === yearData.year ? "rotate-180" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {/* Expanded actor list with animation */}
                  <div
                    id={`timeline-content-${yearData.year}`}
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      expandedYear === yearData.year
                        ? "mt-3 max-h-[1000px] opacity-100"
                        : "max-h-0 opacity-0"
                    }`}
                  >
                    <div className="space-y-3 border-l-2 border-accent/20 pl-3">
                      {yearData.actors.map((actor) => (
                        <div
                          key={actor.id}
                          className="relative rounded-lg bg-beige/30 p-3 transition-colors hover:bg-beige/50"
                          data-testid={`timeline-actor-${actor.id}`}
                        >
                          <div className="flex items-start gap-3">
                            <Link
                              to={`/actor/${createActorSlug(actor.name, actor.id)}`}
                              className="flex-shrink-0"
                            >
                              {actor.profile_path ? (
                                <img
                                  src={getProfileUrl(actor.profile_path, "w185") || ""}
                                  alt={actor.name}
                                  className="h-16 w-12 rounded object-cover transition-transform hover:scale-105"
                                />
                              ) : (
                                <div
                                  className="flex h-16 w-12 items-center justify-center rounded bg-beige text-text-muted"
                                  aria-hidden="true"
                                >
                                  <PersonIcon size={24} />
                                </div>
                              )}
                            </Link>
                            <div className="min-w-0 flex-1">
                              <Link
                                to={`/actor/${createActorSlug(actor.name, actor.id)}`}
                                className="font-medium text-brown-dark hover:text-accent hover:underline"
                              >
                                {actor.name}
                              </Link>
                              {actor.character && (
                                <p className="text-xs italic text-text-muted">
                                  as {actor.character}
                                </p>
                              )}
                              <p className="mt-1 text-sm text-text-muted">
                                {formatDate(actor.deathday)}
                                {actor.ageAtDeath && ` · Age ${actor.ageAtDeath}`}
                              </p>
                              {actor.causeOfDeath && (
                                <div className="mt-1 flex items-center gap-1 text-sm text-accent">
                                  <span>{toTitleCase(actor.causeOfDeath)}</span>
                                  {actor.causeOfDeathDetails && (
                                    <span
                                      className="relative cursor-help"
                                      onMouseEnter={() => setHoveredActorId(actor.id)}
                                      onMouseLeave={() => setHoveredActorId(null)}
                                    >
                                      <InfoIcon
                                        size={14}
                                        className="text-brown-medium hover:text-brown-dark"
                                      />
                                      {/* Tooltip for cause of death details */}
                                      {hoveredActorId === actor.id && (
                                        <div
                                          className="absolute bottom-full left-0 z-20 mb-2 w-72 rounded-lg border border-brown-medium/30 bg-white p-3 text-left text-xs text-brown-dark shadow-lg"
                                          data-testid="cause-details-tooltip-expanded"
                                        >
                                          <span className="leading-relaxed">
                                            {actor.causeOfDeathDetails}
                                          </span>
                                        </div>
                                      )}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Compact actor cards when collapsed - uses full width */}
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      expandedYear !== yearData.year && yearData.actors.length > 0
                        ? "mt-3 max-h-[500px] opacity-100"
                        : "max-h-0 opacity-0"
                    }`}
                  >
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {yearData.actors.map((actor) => (
                        <div
                          key={actor.id}
                          className="flex items-center gap-2 rounded-lg bg-beige/30 p-2 transition-colors hover:bg-beige/50"
                        >
                          <Link
                            to={`/actor/${createActorSlug(actor.name, actor.id)}`}
                            className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full"
                          >
                            {actor.profile_path ? (
                              <img
                                src={getProfileUrl(actor.profile_path, "w45") || ""}
                                alt={actor.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div
                                className="flex h-full w-full items-center justify-center bg-beige text-text-muted"
                                aria-hidden="true"
                              >
                                <PersonIcon size={18} />
                              </div>
                            )}
                          </Link>
                          <div className="min-w-0 flex-1">
                            <Link
                              to={`/actor/${createActorSlug(actor.name, actor.id)}`}
                              className="block truncate text-sm font-medium text-brown-dark hover:text-accent hover:underline"
                            >
                              {actor.name}
                            </Link>
                            {actor.causeOfDeath ? (
                              <div className="flex items-center gap-1 text-xs text-accent">
                                <span className="truncate">{toTitleCase(actor.causeOfDeath)}</span>
                                {actor.causeOfDeathDetails && (
                                  <span
                                    className="relative flex-shrink-0 cursor-help"
                                    onMouseEnter={() => setHoveredActorId(actor.id)}
                                    onMouseLeave={() => setHoveredActorId(null)}
                                  >
                                    <InfoIcon
                                      size={12}
                                      className="text-brown-medium hover:text-brown-dark"
                                    />
                                    {hoveredActorId === actor.id && (
                                      <div
                                        className="absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 rounded-lg border border-brown-medium/30 bg-white p-3 text-left text-xs text-brown-dark shadow-lg"
                                        data-testid="cause-details-tooltip"
                                      >
                                        <span className="leading-relaxed">
                                          {actor.causeOfDeathDetails}
                                        </span>
                                      </div>
                                    )}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="truncate text-xs text-text-muted">
                                {actor.character
                                  ? `as ${actor.character}`
                                  : formatDate(actor.deathday)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Current year event */}
            <div className="relative">
              <div className="absolute -left-4 top-1 h-3 w-3 rounded-full border-2 border-brown-medium bg-beige" />
              <div className="ml-4 flex items-center gap-2 text-sm">
                <span className="font-semibold text-brown-dark">{currentYear}</span>
                <span className="text-text-muted">Now</span>
              </div>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="mt-4 border-t border-brown-medium/10 pt-3 text-center text-sm text-text-muted">
          {deceased.length} death{deceased.length !== 1 ? "s" : ""} over {totalYears} years since
          release
        </div>
      </div>
    </div>
  )
}
