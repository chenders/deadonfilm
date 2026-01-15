import { useRef, useEffect } from "react"
import type { UnifiedSearchResult } from "@/types"
import { getYear } from "@/utils/formatDate"
import { SkullIcon, FilmReelIcon, TVIcon } from "@/components/icons"

interface SearchResultProps {
  result: UnifiedSearchResult
  isSelected: boolean
  onSelect: () => void
  searchQuery: string
}

// Estimate mortality likelihood based on movie age
function getMortalityHint(releaseDate: string): {
  level: "high" | "medium" | "low" | null
  label: string | null
} {
  const year = parseInt(releaseDate?.substring(0, 4) || "0", 10)
  if (!year) return { level: null, label: null }

  const currentYear = new Date().getFullYear()
  const age = currentYear - year

  if (age >= 50) return { level: "high", label: "High mortality likely" }
  if (age >= 30) return { level: "medium", label: "Some deaths likely" }
  return { level: null, label: null }
}

// TMDB poster thumbnail URLs using their face-cropped format.
// This is intentionally separate from the getPosterUrl utility in api.ts because:
// 1. Face-cropped format (w45_and_h67_face) shows the most recognizable part of posters
// 2. Uses TMDB's media CDN (media.themoviedb.org) which supports face-cropping
// 3. Returns srcset for retina display support (1x and 2x variants)
function getPosterUrls(posterPath: string | null): {
  src: string
  srcSet: string
} | null {
  if (!posterPath) return null
  const base = "https://media.themoviedb.org/t/p"
  return {
    src: `${base}/w45_and_h67_face${posterPath}`,
    srcSet: `${base}/w45_and_h67_face${posterPath} 1x, ${base}/w94_and_h141_face${posterPath} 2x`,
  }
}

function MediaPoster({
  posterPath,
  title,
  mediaType,
}: {
  posterPath: string | null
  title: string
  mediaType: "movie" | "tv"
}) {
  const poster = getPosterUrls(posterPath)
  const PlaceholderIcon = mediaType === "tv" ? TVIcon : FilmReelIcon

  return (
    <div className="-my-1 h-14 w-[38px] flex-shrink-0 overflow-hidden rounded bg-brown-medium/10 dark:bg-[#4a3d32]/30">
      {poster ? (
        <img
          src={poster.src}
          srcSet={poster.srcSet}
          alt={`${title} poster`}
          width={38}
          height={56}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-brown-medium/30 dark:text-[#9a8b7a]/30">
          <PlaceholderIcon size={16} />
        </div>
      )}
    </div>
  )
}

export default function SearchResult({
  result,
  isSelected,
  onSelect,
  searchQuery,
}: SearchResultProps) {
  const ref = useRef<HTMLLIElement>(null)
  const year = getYear(result.release_date)
  const mortality = getMortalityHint(result.release_date)

  // Scroll selected item into view
  useEffect(() => {
    if (isSelected && ref.current) {
      ref.current.scrollIntoView({ block: "nearest" })
    }
  }, [isSelected])

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- Keyboard navigation handled by parent combobox
    <li
      ref={ref}
      role="option"
      aria-selected={isSelected}
      data-testid="search-result"
      className={`cursor-pointer border-b border-brown-medium/10 px-4 py-2 transition-colors last:border-b-0 dark:border-[#4a3d32]/50 ${isSelected ? "bg-beige dark:bg-[#2a221c]" : "hover:bg-beige/50 dark:hover:bg-[#2a221c]/50"}`}
      onClick={onSelect}
      onMouseDown={(e) => e.preventDefault()} // Prevent input blur before click
      data-track-event="search_select"
      data-track-params={JSON.stringify({
        search_term: searchQuery,
        title: result.title,
        id: result.id,
        media_type: result.media_type,
      })}
    >
      <div className="flex items-center gap-3">
        <MediaPoster
          posterPath={result.poster_path}
          title={result.title}
          mediaType={result.media_type}
        />

        {/* Title, year, and media type badge */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-brown-dark dark:text-[#d4c8b5]">
              {result.title}
            </span>
            <span
              data-testid={`media-badge-${result.media_type}`}
              className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                result.media_type === "tv"
                  ? "bg-living/20 text-living-dark dark:bg-[#c9a227]/20 dark:text-[#c9a227]"
                  : "bg-brown-medium/10 text-brown-medium dark:bg-[#4a3d32]/30 dark:text-[#9a8b7a]"
              }`}
            >
              {result.media_type === "tv" ? "TV" : "Film"}
            </span>
          </div>
          <div className="text-sm text-text-muted dark:text-[#9a8b7a]">{year}</div>
        </div>

        {/* Mortality indicator */}
        <div
          className={`flex h-7 w-14 flex-shrink-0 items-center justify-end ${
            mortality.level === "high"
              ? "text-accent"
              : mortality.level === "medium"
                ? "text-brown-medium/60"
                : ""
          }`}
          title={mortality.label || undefined}
        >
          {mortality.level && (
            <>
              <SkullIcon size={28} />
              {mortality.level === "high" && <SkullIcon size={28} />}
            </>
          )}
        </div>
      </div>
    </li>
  )
}
