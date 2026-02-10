import { useOptionalAdminAuth } from "@/hooks/useAdminAuth"
import { useOptionalAdminMode } from "@/contexts/AdminModeContext"
import { useRegenerateBiography, useInlineEnrichDeath } from "@/hooks/admin/useActorInlineActions"
import AdminActionButton from "./AdminActionButton"
import { RefreshIcon, GearIcon, PencilIcon } from "@/components/icons"

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

  return (
    <div className="mb-2 flex items-center justify-end gap-1.5" data-testid="admin-actor-toolbar">
      <button
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
        icon={<RefreshIcon size={14} />}
        label="Regen bio"
        title="Regenerate biography"
        onClick={() => regenBio.mutate()}
        isPending={regenBio.isPending}
        isSuccess={regenBio.isSuccess}
        isError={regenBio.isError}
      />

      <AdminActionButton
        icon={<RefreshIcon size={14} />}
        label="Re-enrich"
        title="Re-enrich death info"
        onClick={() => enrichDeath.mutate()}
        isPending={enrichDeath.isPending}
        isSuccess={enrichDeath.isSuccess}
        isError={enrichDeath.isError}
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
