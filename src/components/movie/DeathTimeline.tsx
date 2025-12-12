import { useState } from "react"
import { Link } from "react-router-dom"
import { getProfileUrl } from "@/services/api"
import type { DeceasedActor } from "@/types"

interface DeathTimelineProps {
  movieReleaseDate: string
  deceased: DeceasedActor[]
  livingCount: number
}

interface TimelineEvent {
  year: number
  type: "release" | "death" | "present"
  actors?: DeceasedActor[]
}

export default function DeathTimeline({
  movieReleaseDate,
  deceased,
  livingCount,
}: DeathTimelineProps) {
  const [expandedYear, setExpandedYear] = useState<number | null>(null)

  // Don't render if no deceased actors
  if (deceased.length === 0) {
    return null
  }

  const releaseYear = new Date(movieReleaseDate).getFullYear()
  const currentYear = new Date().getFullYear()

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

  // Build timeline events
  const events: TimelineEvent[] = []

  // Add release year
  events.push({ year: releaseYear, type: "release" })

  // Add death years (sorted)
  const deathYears = Object.keys(deathsByYear)
    .map(Number)
    .sort((a, b) => a - b)

  for (const year of deathYears) {
    events.push({ year, type: "death", actors: deathsByYear[year] })
  }

  // Add present year if different from last death
  const lastDeathYear = deathYears[deathYears.length - 1]
  if (currentYear > lastDeathYear) {
    events.push({ year: currentYear, type: "present" })
  }

  const toggleYear = (year: number) => {
    setExpandedYear(expandedYear === year ? null : year)
  }

  return (
    <div
      data-testid="death-timeline"
      className="rounded-lg border border-brown-medium/20 bg-white p-4"
    >
      <h3 className="mb-4 font-display text-lg text-brown-dark">Cast Deaths Over Time</h3>

      <div className="relative pl-4">
        {/* Vertical timeline line */}
        <div className="absolute bottom-2 left-[7px] top-2 w-0.5 bg-brown-medium/20" />

        {/* Timeline events */}
        <div className="space-y-4">
          {events.map((event, index) => (
            <div
              key={`${event.type}-${event.year}`}
              className="relative"
              style={{
                animationDelay: `${index * 100}ms`,
              }}
            >
              {/* Timeline dot */}
              <div
                className={`absolute -left-4 top-1 h-3 w-3 rounded-full border-2 ${
                  event.type === "release"
                    ? "border-living bg-living-bg"
                    : event.type === "death"
                      ? "border-accent bg-cream"
                      : "border-brown-medium bg-beige"
                }`}
              />

              {/* Event content */}
              <div className="ml-4">
                {event.type === "release" && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-living-dark">{event.year}</span>
                    <span className="text-text-muted">Movie Released</span>
                  </div>
                )}

                {event.type === "death" && event.actors && (
                  <div>
                    <button
                      onClick={() => toggleYear(event.year)}
                      className="flex w-full items-center gap-2 text-left text-sm transition-colors hover:text-accent"
                      data-testid={`timeline-year-${event.year}`}
                    >
                      <span className="font-semibold text-accent">{event.year}</span>
                      <span className="text-text-muted">
                        {event.actors.length} death{event.actors.length !== 1 ? "s" : ""}
                      </span>
                      <svg
                        className={`ml-auto h-4 w-4 text-brown-medium/50 transition-transform ${
                          expandedYear === event.year ? "rotate-180" : ""
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>

                    {/* Expanded actor list */}
                    {expandedYear === event.year && (
                      <div className="mt-2 space-y-2 border-l-2 border-accent/20 pl-3">
                        {event.actors.map((actor) => (
                          <Link
                            key={actor.id}
                            to={`/actor/${actor.id}`}
                            className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-beige/50"
                            data-testid={`timeline-actor-${actor.id}`}
                          >
                            {actor.profile_path ? (
                              <img
                                src={getProfileUrl(actor.profile_path, "w45") || ""}
                                alt={actor.name}
                                className="h-10 w-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-beige text-text-muted">
                                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                                  <path
                                    fillRule="evenodd"
                                    d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-brown-dark">{actor.name}</p>
                              <p className="truncate text-xs text-text-muted">
                                {actor.ageAtDeath && `Age ${actor.ageAtDeath}`}
                                {actor.ageAtDeath && actor.causeOfDeath && " • "}
                                {actor.causeOfDeath}
                              </p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}

                    {/* Compact actor thumbnails when collapsed */}
                    {expandedYear !== event.year && event.actors.length > 0 && (
                      <div className="mt-1 flex -space-x-2">
                        {event.actors.slice(0, 5).map((actor) => (
                          <div
                            key={actor.id}
                            className="relative h-6 w-6 rounded-full border-2 border-white"
                            title={actor.name}
                          >
                            {actor.profile_path ? (
                              <img
                                src={getProfileUrl(actor.profile_path, "w45") || ""}
                                alt={actor.name}
                                className="h-full w-full rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center rounded-full bg-beige text-text-muted">
                                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path
                                    fillRule="evenodd"
                                    d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </div>
                            )}
                          </div>
                        ))}
                        {event.actors.length > 5 && (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-brown-medium/10 text-xs font-medium text-brown-dark">
                            +{event.actors.length - 5}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {event.type === "present" && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-brown-dark">{event.year}</span>
                    <span className="text-text-muted">
                      Now • {livingCount} living cast member{livingCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="mt-4 border-t border-brown-medium/10 pt-3 text-center text-xs text-text-muted">
        {deceased.length} death{deceased.length !== 1 ? "s" : ""} over {currentYear - releaseYear}{" "}
        years since release
      </div>
    </div>
  )
}
