import { useOptionalAdminAuth } from "@/hooks/useAdminAuth"
import { useOptionalAdminMode } from "@/contexts/AdminModeContext"
import {
  useRegenerateBiography,
  useInlineEnrichDeath,
  useInlineEnrichBio,
  useActorAdminMetadata,
} from "@/hooks/admin/useActorInlineActions"
import AdminActionButton from "./AdminActionButton"
import { DocumentIcon, SkullSmallIcon, SparkleIcon, GearIcon, PencilIcon } from "@/components/icons"
import { formatRelativeTime } from "@/utils/formatRelativeTime"

interface AdminActorToolbarProps {
  actorId: number
}

/**
 * Outer guard: uses optional hooks so it's safe outside provider tree.
 * Returns null immediately when not authenticated, before calling hooks
 * that require ToastProvider or other providers.
 */
export default function AdminActorToolbar({ actorId }: AdminActorToolbarProps) {
  const { isAuthenticated } = useOptionalAdminAuth()

  if (!isAuthenticated) return null

  return <AdminActorToolbarInner actorId={actorId} />
}

/** Inner component: only rendered when authenticated, safe to use all hooks */
function AdminActorToolbarInner({ actorId }: AdminActorToolbarProps) {
  const { adminModeEnabled, toggleAdminMode } = useOptionalAdminMode()
  const regenBio = useRegenerateBiography(actorId)
  const enrichDeath = useInlineEnrichDeath(actorId)
  const enrichBio = useInlineEnrichBio(actorId)
  const { data: metadata } = useActorAdminMetadata(actorId, true)

  // Compute status colors from metadata
  const regenBioStatusColor = metadata?.biography.hasContent ? "text-amber-600/70" : undefined

  const deathStatusColor = metadata?.dataQuality.hasDetailedDeathInfo
    ? "text-green-600"
    : metadata?.enrichment.enrichedAt
      ? "text-green-600/70"
      : undefined

  const enrichBioStatusColor = metadata?.biography.hasEnrichedBio ? "text-blue-500" : undefined

  // Compute status tooltips with relative time and version
  const deathStatusTitle = (() => {
    if (!metadata) return "Re-enrich death info"
    const parts = ["Re-enrich death info"]
    if (metadata.enrichment.enrichedAt) {
      const relTime = formatRelativeTime(metadata.enrichment.enrichedAt)
      const version = metadata.enrichment.version ? ` (v${metadata.enrichment.version})` : ""
      parts.push(`— Enriched ${relTime}${version}`)
    }
    return parts.join(" ")
  })()

  const enrichBioStatusTitle = (() => {
    if (!metadata) return "Enrich biography"
    const parts = ["Enrich biography"]
    if (metadata.biography.bioEnrichedAt) {
      const relTime = formatRelativeTime(metadata.biography.bioEnrichedAt)
      parts.push(`— Enriched ${relTime}`)
    }
    return parts.join(" ")
  })()

  const regenBioStatusTitle = (() => {
    if (!metadata) return "Regenerate biography"
    const parts = ["Regenerate biography"]
    if (metadata.biography.generatedAt) {
      const relTime = formatRelativeTime(metadata.biography.generatedAt)
      parts.push(`— Generated ${relTime}`)
    }
    return parts.join(" ")
  })()

  return (
    <div className="mb-2 flex items-center justify-end gap-1.5" data-testid="admin-actor-toolbar">
      <button
        type="button"
        onClick={toggleAdminMode}
        title={adminModeEnabled ? "Hide admin info" : "Show admin info"}
        aria-label="Toggle admin mode"
        data-testid="admin-mode-toggle"
        className={`rounded-full p-1.5 transition-colors ${
          adminModeEnabled
            ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
            : "text-text-muted hover:bg-beige hover:text-brown-dark"
        }`}
      >
        <GearIcon size={14} />
      </button>

      <AdminActionButton
        icon={<DocumentIcon size={14} />}
        label="Regen bio"
        title="Regenerate biography"
        statusColor={regenBioStatusColor}
        statusTitle={regenBioStatusTitle}
        onClick={() => regenBio.mutate()}
        isPending={regenBio.isPending}
        isSuccess={regenBio.isSuccess}
        isError={regenBio.isError}
      />

      <AdminActionButton
        icon={<SkullSmallIcon size={14} />}
        label="Re-enrich"
        title="Re-enrich death info"
        statusColor={deathStatusColor}
        statusTitle={deathStatusTitle}
        onClick={() => enrichDeath.mutate()}
        isPending={enrichDeath.isPending}
        isSuccess={enrichDeath.isSuccess}
        isError={enrichDeath.isError}
      />

      <AdminActionButton
        icon={<SparkleIcon size={14} />}
        label="Enrich bio"
        title="Enrich biography"
        statusColor={enrichBioStatusColor}
        statusTitle={enrichBioStatusTitle}
        onClick={() => enrichBio.mutate()}
        isPending={enrichBio.isPending}
        isSuccess={enrichBio.isSuccess}
        isError={enrichBio.isError}
      />

      <a
        href={`/admin/actors/${actorId}`}
        target="_blank"
        rel="noopener noreferrer"
        title="Open in admin editor"
        aria-label="Open admin editor"
        data-testid="admin-editor-link"
        className="rounded-full p-1.5 text-text-muted transition-colors hover:bg-beige hover:text-brown-dark"
      >
        <PencilIcon size={14} />
      </a>
    </div>
  )
}
