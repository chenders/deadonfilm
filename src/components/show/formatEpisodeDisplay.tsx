import { Link } from "react-router-dom"
import { createEpisodeSlug } from "@/utils/slugify"

interface EpisodeAppearance {
  seasonNumber: number
  episodeNumber: number
  episodeName: string
}

interface ActorWithEpisodes {
  totalEpisodes: number
  episodes: EpisodeAppearance[]
}

/**
 * Format episode appearances for display, with links to episode pages.
 * Shared by ShowDeceasedList and ShowLivingList components.
 *
 * @param actor - Actor with episode information
 * @param showId - Show TMDB ID (optional, needed for links)
 * @param showName - Show name (optional, needed for links)
 * @param hoverColorClass - Tailwind hover color class (e.g., "hover:text-accent")
 */
export function formatEpisodeDisplay(
  actor: ActorWithEpisodes,
  showId?: number,
  showName?: string,
  hoverColorClass: string = "hover:text-accent"
): React.ReactNode {
  const count = actor.totalEpisodes

  if (actor.episodes.length === 0) {
    // No episode-level data available, just show count
    return `${count} episode${count !== 1 ? "s" : ""}`
  }

  // Helper to create episode link
  const createEpisodeLink = (ep: EpisodeAppearance) => {
    if (showId && showName) {
      const slug = createEpisodeSlug(
        showName,
        ep.episodeName,
        ep.seasonNumber,
        ep.episodeNumber,
        showId
      )
      return (
        <Link
          key={`${ep.seasonNumber}-${ep.episodeNumber}`}
          to={`/episode/${slug}`}
          className={`${hoverColorClass} hover:underline`}
        >
          "{ep.episodeName}"
        </Link>
      )
    }
    return `"${ep.episodeName}"`
  }

  if (actor.episodes.length === 1) {
    const ep = actor.episodes[0]
    return (
      <>
        S{ep.seasonNumber}E{ep.episodeNumber}: {createEpisodeLink(ep)}
      </>
    )
  }

  if (actor.episodes.length <= 3) {
    return actor.episodes.map((ep, i) => (
      <span key={`${ep.seasonNumber}-${ep.episodeNumber}`}>
        {i > 0 && ", "}
        {createEpisodeLink(ep)}
      </span>
    ))
  }

  // For many episodes, show count and first episode
  const firstEp = actor.episodes[0]
  return (
    <>
      {count} episodes (first: {createEpisodeLink(firstEp)})
    </>
  )
}
