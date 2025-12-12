import { useOnThisDay } from "@/hooks/useOnThisDay"
import { getProfileUrl } from "@/services/api"
import { Link } from "react-router-dom"
import { createMovieSlug } from "@/utils/slugify"
import { PersonIcon } from "@/components/icons"
import EmptyStateCard from "@/components/common/EmptyStateCard"

export default function OnThisDay() {
  const { data, isLoading, error } = useOnThisDay()

  if (isLoading) {
    return (
      <div className="mt-12 rounded-lg bg-beige p-6">
        <div className="animate-pulse">
          <div className="mb-4 h-6 w-32 rounded bg-brown-medium/20" />
          <div className="h-4 w-48 rounded bg-brown-medium/20" />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return null // Silently fail - this is an enhancement feature
  }

  const { month, day, deaths } = data

  return (
    <section data-testid="on-this-day" className="mt-12">
      <h2
        data-testid="on-this-day-title"
        className="mb-4 text-center font-display text-2xl text-brown-dark"
      >
        Died On This Day: {month} {day}
      </h2>

      {deaths.length === 0 ? (
        <div data-testid="on-this-day-empty">
          <EmptyStateCard type="quiet-day" />
        </div>
      ) : (
        <div data-testid="on-this-day-list" className="space-y-4">
          {deaths.map((death, index) => (
            <div
              data-testid="on-this-day-card"
              key={death.actor.id}
              className="animate-fade-slide-in flex items-center gap-4 rounded-lg bg-beige p-4"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {death.actor.profile_path ? (
                <img
                  src={getProfileUrl(death.actor.profile_path, "w185")!}
                  alt={death.actor.name}
                  width={64}
                  height={80}
                  loading="lazy"
                  className="h-20 w-16 rounded object-cover"
                />
              ) : (
                <div className="flex h-20 w-16 items-center justify-center rounded bg-brown-medium/20">
                  <PersonIcon size={32} className="text-text-muted" />
                </div>
              )}

              <div className="flex-1">
                <h3 className="font-semibold text-brown-dark">{death.actor.name}</h3>
                <p className="text-sm text-accent">Died {death.actor.deathday}</p>

                {death.notableFilms.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {death.notableFilms.slice(0, 3).map((film) => (
                      <Link
                        key={film.id}
                        to={`/movie/${createMovieSlug(film.title, film.year + "-01-01", film.id)}`}
                        className="rounded bg-white px-2 py-1 text-xs hover:bg-cream"
                      >
                        {film.title} ({film.year})
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
