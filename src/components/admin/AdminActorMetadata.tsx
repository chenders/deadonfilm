import { useOptionalAdminAuth } from "@/hooks/useAdminAuth"
import { useOptionalAdminMode } from "@/contexts/AdminModeContext"
import { useActorAdminMetadata } from "@/hooks/admin/useActorInlineActions"

interface AdminActorMetadataProps {
  actorId: number
}

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return "Never"
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  // Format as short date
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/**
 * Outer guard: uses optional hooks so it's safe outside provider tree.
 * Returns null immediately when not authenticated or admin mode is off.
 */
export default function AdminActorMetadata({ actorId }: AdminActorMetadataProps) {
  const { isAuthenticated } = useOptionalAdminAuth()
  const { adminModeEnabled } = useOptionalAdminMode()

  if (!isAuthenticated || !adminModeEnabled) return null

  return <AdminActorMetadataInner actorId={actorId} />
}

/** Inner component: only rendered when admin mode is on, safe to use all hooks */
function AdminActorMetadataInner({ actorId }: AdminActorMetadataProps) {
  const { data, isLoading } = useActorAdminMetadata(actorId, true)

  if (isLoading) {
    return (
      <div className="mb-4 rounded border border-amber-300/50 bg-amber-50/30 px-3 py-2 text-xs text-text-muted">
        Loading admin metadata...
      </div>
    )
  }

  if (!data) return null

  return (
    <div
      className="mb-4 rounded border border-amber-300/50 bg-amber-50/30 px-3 py-2 text-xs"
      data-testid="admin-actor-metadata"
    >
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-brown-dark/80">
        <span>
          <span className="font-medium">Bio:</span>{" "}
          {data.biography.hasContent
            ? `${formatRelativeDate(data.biography.generatedAt)}${data.biography.sourceType ? ` (${data.biography.sourceType})` : ""}`
            : "Not generated"}
        </span>
        <span>
          <span className="font-medium">Enrichment:</span>{" "}
          {data.enrichment.enrichedAt
            ? `${formatRelativeDate(data.enrichment.enrichedAt)}${data.enrichment.source ? ` via ${data.enrichment.source}` : ""}`
            : "Never"}
          {data.enrichment.version && (
            <span
              className={`ml-1 rounded px-1 font-medium ${
                data.enrichment.version.startsWith("3.")
                  ? data.enrichment.version.includes("no-reliability")
                    ? "bg-amber-200/60 text-amber-800"
                    : "bg-green-200/60 text-green-800"
                  : "bg-gray-200/60 text-gray-600"
              }`}
            >
              v{data.enrichment.version}
            </span>
          )}
        </span>
        <span>
          <span className="font-medium">CoD Source:</span>{" "}
          {data.enrichment.causeOfDeathSource || "N/A"}
        </span>
        <span>
          <span className="font-medium">Circumstances:</span>{" "}
          {data.enrichment.hasCircumstances ? "Yes" : "No"}
        </span>
        {data.dataQuality.isObscure && (
          <span className="rounded bg-amber-200/60 px-1 font-medium text-amber-800">Obscure</span>
        )}
        {data.dataQuality.deathdayConfidence &&
          data.dataQuality.deathdayConfidence !== "verified" && (
            <span className="rounded bg-red-200/60 px-1 font-medium text-red-800">
              Death: {data.dataQuality.deathdayConfidence}
            </span>
          )}
      </div>
    </div>
  )
}
