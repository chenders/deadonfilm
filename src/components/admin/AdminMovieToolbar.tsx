import { useOptionalAdminAuth } from "@/hooks/useAdminAuth"
import {
  useMovieEnrichmentStatus,
  useMovieBatchEnrichBios,
  useMovieBatchEnrichDeaths,
} from "@/hooks/admin/useMovieEnrichmentActions"
import AdminActionButton from "./AdminActionButton"
import { RefreshIcon } from "@/components/icons"

interface AdminMovieToolbarProps {
  movieTmdbId: number
  deceasedTmdbIds: number[]
}

/**
 * Outer guard: uses optional hooks so it's safe outside provider tree.
 * Returns null immediately when not authenticated, before calling hooks
 * that require ToastProvider or other providers.
 */
export default function AdminMovieToolbar({
  movieTmdbId,
  deceasedTmdbIds,
}: AdminMovieToolbarProps) {
  const { isAuthenticated } = useOptionalAdminAuth()

  if (!isAuthenticated) return null

  return <AdminMovieToolbarInner movieTmdbId={movieTmdbId} deceasedTmdbIds={deceasedTmdbIds} />
}

/** Inner component: only rendered when authenticated, safe to use all hooks */
function AdminMovieToolbarInner({ movieTmdbId, deceasedTmdbIds }: AdminMovieToolbarProps) {
  const status = useMovieEnrichmentStatus(movieTmdbId, deceasedTmdbIds)
  const enrichBios = useMovieBatchEnrichBios(movieTmdbId, deceasedTmdbIds)
  const enrichDeaths = useMovieBatchEnrichDeaths(movieTmdbId, deceasedTmdbIds)

  const bioCount = status.data?.needsBioEnrichment.length ?? 0
  const deathCount = status.data?.needsDeathEnrichment.length ?? 0

  return (
    <div className="mb-2 flex items-center justify-end gap-1.5" data-testid="admin-movie-toolbar">
      <AdminActionButton
        icon={<RefreshIcon size={14} />}
        label={`Enrich bios${bioCount > 0 ? ` (${bioCount})` : ""}`}
        title={`Enrich biographies for ${bioCount} unenriched actor${bioCount === 1 ? "" : "s"}`}
        onClick={() => enrichBios.mutate()}
        isPending={enrichBios.isPending}
        isSuccess={enrichBios.isSuccess}
        isError={enrichBios.isError}
      />

      <AdminActionButton
        icon={<RefreshIcon size={14} />}
        label={`Enrich deaths${deathCount > 0 ? ` (${deathCount})` : ""}`}
        title={`Enrich death info for ${deathCount} unenriched actor${deathCount === 1 ? "" : "s"}`}
        onClick={() => enrichDeaths.mutate()}
        isPending={enrichDeaths.isPending}
        isSuccess={enrichDeaths.isSuccess}
        isError={enrichDeaths.isError}
      />
    </div>
  )
}
