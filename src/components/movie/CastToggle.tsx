import { ListIcon, TimelineIcon } from "@/components/icons"
import type { ViewMode } from "@/types"

interface CastToggleProps {
  showLiving: boolean
  onToggle: (showLiving: boolean) => void
  deceasedCount: number
  livingCount: number
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

export default function CastToggle({
  showLiving,
  onToggle,
  deceasedCount,
  livingCount,
  viewMode,
  onViewModeChange,
}: CastToggleProps) {
  const deceasedDisabled = deceasedCount === 0
  const livingDisabled = livingCount === 0

  return (
    <div
      data-testid="cast-toggle"
      className="mb-6 flex flex-wrap items-center justify-center gap-3"
    >
      {/* Deceased/Living toggle */}
      <div className="inline-flex overflow-hidden rounded-lg border border-brown-medium/30 bg-surface-elevated">
        <button
          data-testid="deceased-toggle-btn"
          aria-pressed={!showLiving}
          onClick={() => !deceasedDisabled && onToggle(false)}
          disabled={deceasedDisabled}
          className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ${
            deceasedDisabled
              ? "cursor-not-allowed bg-disabled text-disabled-text"
              : !showLiving
                ? "bg-accent text-white"
                : "bg-surface-elevated text-brown-dark hover:bg-beige"
          }`}
        >
          Deceased ({deceasedCount.toLocaleString()})
        </button>
        <button
          data-testid="living-toggle-btn"
          aria-pressed={showLiving}
          onClick={() => !livingDisabled && onToggle(true)}
          disabled={livingDisabled}
          className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ${
            livingDisabled
              ? "cursor-not-allowed bg-disabled text-disabled-text"
              : showLiving
                ? "bg-living text-white"
                : "bg-surface-elevated text-brown-dark hover:bg-beige"
          }`}
        >
          Living ({livingCount.toLocaleString()})
        </button>
      </div>

      {/* List/Timeline toggle - only show when viewing deceased */}
      {!showLiving && deceasedCount > 0 && (
        <div className="inline-flex items-center gap-1 rounded-lg border border-brown-medium/30 bg-surface-elevated p-1">
          <button
            data-testid="list-view-btn"
            aria-pressed={viewMode === "list"}
            aria-label="List view"
            onClick={() => onViewModeChange("list")}
            className={`rounded-md p-1.5 transition-colors duration-200 ${
              viewMode === "list"
                ? "bg-beige text-brown-dark"
                : "text-text-muted hover:bg-beige/50 hover:text-brown-dark"
            }`}
            title="List view"
          >
            <ListIcon size={18} />
          </button>
          <button
            data-testid="timeline-view-btn"
            aria-pressed={viewMode === "timeline"}
            aria-label="Timeline view"
            onClick={() => onViewModeChange("timeline")}
            className={`rounded-md p-1.5 transition-colors duration-200 ${
              viewMode === "timeline"
                ? "bg-beige text-brown-dark"
                : "text-text-muted hover:bg-beige/50 hover:text-brown-dark"
            }`}
            title="Timeline view"
          >
            <TimelineIcon size={18} />
          </button>
        </div>
      )}
    </div>
  )
}
