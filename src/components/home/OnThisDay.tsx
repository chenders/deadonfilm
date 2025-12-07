import { useOnThisDay } from "@/hooks/useOnThisDay"
import { getProfileUrl } from "@/services/api"
import { Link } from "react-router-dom"
import { createMovieSlug } from "@/utils/slugify"

export default function OnThisDay() {
  const { data, isLoading, error } = useOnThisDay()

  if (isLoading) {
    return (
      <div className="mt-12 p-6 bg-beige rounded-lg">
        <div className="animate-pulse">
          <div className="h-6 w-32 bg-brown-medium/20 rounded mb-4" />
          <div className="h-4 w-48 bg-brown-medium/20 rounded" />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return null // Silently fail - this is an enhancement feature
  }

  const { month, day, deaths, message } = data

  return (
    <section data-testid="on-this-day" className="mt-12">
      <h2
        data-testid="on-this-day-title"
        className="font-display text-2xl text-brown-dark mb-4 text-center"
      >
        On This Day: {month} {day}
      </h2>

      {deaths.length === 0 ? (
        <div data-testid="on-this-day-empty" className="p-6 bg-beige rounded-lg text-center">
          <p className="text-text-muted">
            {message || "No notable deaths recorded for this date."}
          </p>
        </div>
      ) : (
        <div data-testid="on-this-day-list" className="space-y-4">
          {deaths.map((death) => (
            <div
              data-testid="on-this-day-card"
              key={death.actor.id}
              className="p-4 bg-beige rounded-lg flex items-center gap-4"
            >
              {death.actor.profile_path ? (
                <img
                  src={getProfileUrl(death.actor.profile_path, "w185")!}
                  alt={death.actor.name}
                  className="w-16 h-20 rounded object-cover"
                />
              ) : (
                <div className="w-16 h-20 rounded bg-brown-medium/20 flex items-center justify-center">
                  <span className="text-2xl">👤</span>
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
                        className="text-xs px-2 py-1 bg-white rounded hover:bg-cream"
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
