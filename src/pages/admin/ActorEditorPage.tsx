/**
 * Admin page for editing actor data with full audit trail.
 */

import { useState, useCallback } from "react"
import { useParams, Link } from "react-router-dom"
import AdminLayout from "../../components/admin/AdminLayout"
import { EditableField } from "../../components/admin/actor-editor"
import { useActorEditor, type UpdateActorRequest } from "../../hooks/admin/useActorEditor"
import { createActorSlug } from "../../utils/slugify"

type TabId = "basic" | "death" | "circumstances"

interface Tab {
  id: TabId
  label: string
}

const TABS: Tab[] = [
  { id: "basic", label: "Basic Info" },
  { id: "death", label: "Death Info" },
  { id: "circumstances", label: "Circumstances" },
]

// Field configurations for each tab
const BASIC_FIELDS = [
  { name: "name", label: "Name", type: "text" as const },
  { name: "birthday", label: "Birthday", type: "date" as const },
  {
    name: "birthday_precision",
    label: "Birthday Precision",
    type: "select" as const,
    options: [
      { value: "day", label: "Day" },
      { value: "month", label: "Month" },
      { value: "year", label: "Year" },
    ],
  },
  { name: "profile_path", label: "Profile Path (TMDB)", type: "text" as const },
  { name: "fallback_profile_url", label: "Fallback Profile URL", type: "text" as const },
  { name: "wikipedia_url", label: "Wikipedia URL", type: "text" as const },
]

const DEATH_FIELDS = [
  { name: "deathday", label: "Death Date", type: "date" as const },
  {
    name: "deathday_precision",
    label: "Death Date Precision",
    type: "select" as const,
    options: [
      { value: "day", label: "Day" },
      { value: "month", label: "Month" },
      { value: "year", label: "Year" },
    ],
  },
  {
    name: "deathday_confidence",
    label: "Death Date Confidence",
    type: "select" as const,
    options: [
      { value: "verified", label: "Verified" },
      { value: "unverified", label: "Unverified" },
      { value: "conflicting", label: "Conflicting" },
    ],
  },
  { name: "deathday_verification_source", label: "Verification Source", type: "text" as const },
  { name: "cause_of_death", label: "Cause of Death", type: "text" as const },
  { name: "cause_of_death_source", label: "Cause of Death Source", type: "text" as const },
  { name: "cause_of_death_details", label: "Cause of Death Details", type: "textarea" as const },
  { name: "cause_of_death_details_source", label: "Details Source", type: "text" as const },
  {
    name: "death_manner",
    label: "Manner of Death",
    type: "select" as const,
    options: [
      { value: "natural", label: "Natural" },
      { value: "accident", label: "Accident" },
      { value: "suicide", label: "Suicide" },
      { value: "homicide", label: "Homicide" },
      { value: "undetermined", label: "Undetermined" },
    ],
  },
  { name: "death_categories", label: "Death Categories", type: "array" as const },
  { name: "violent_death", label: "Violent Death", type: "boolean" as const },
  { name: "covid_related", label: "COVID Related", type: "boolean" as const },
  { name: "strange_death", label: "Strange Death", type: "boolean" as const },
  { name: "has_detailed_death_info", label: "Has Detailed Info", type: "boolean" as const },
]

const CIRCUMSTANCES_FIELDS = [
  { name: "circumstances", label: "Circumstances", type: "textarea" as const },
  {
    name: "circumstances_confidence",
    label: "Circumstances Confidence",
    type: "select" as const,
    options: [
      { value: "high", label: "High" },
      { value: "medium", label: "Medium" },
      { value: "low", label: "Low" },
    ],
  },
  { name: "rumored_circumstances", label: "Rumored Circumstances", type: "textarea" as const },
  {
    name: "cause_confidence",
    label: "Cause Confidence",
    type: "select" as const,
    options: [
      { value: "high", label: "High" },
      { value: "medium", label: "Medium" },
      { value: "low", label: "Low" },
    ],
  },
  { name: "location_of_death", label: "Location of Death", type: "text" as const },
  { name: "career_status_at_death", label: "Career Status at Death", type: "text" as const },
  { name: "additional_context", label: "Additional Context", type: "textarea" as const },
  { name: "notable_factors", label: "Notable Factors", type: "array" as const },
  { name: "related_deaths", label: "Related Deaths", type: "textarea" as const },
]

export default function ActorEditorPage() {
  const { id } = useParams<{ id: string }>()
  const actorId = id ? parseInt(id, 10) : undefined

  const [activeTab, setActiveTab] = useState<TabId>("basic")
  const [pendingChanges, setPendingChanges] = useState<{
    actor: Record<string, unknown>
    circumstances: Record<string, unknown>
  }>({ actor: {}, circumstances: {} })

  const {
    isLoading,
    isError,
    error,
    actor,
    circumstances,
    dataQualityIssues,
    recentHistory,
    updateActorAsync,
    isUpdating,
    updateError,
  } = useActorEditor(actorId)

  const hasChanges =
    Object.keys(pendingChanges.actor).length > 0 ||
    Object.keys(pendingChanges.circumstances).length > 0

  const handleFieldChange = useCallback(
    (table: "actor" | "circumstances", field: string, value: unknown) => {
      setPendingChanges((prev) => ({
        ...prev,
        [table]: { ...prev[table], [field]: value },
      }))
    },
    []
  )

  const handleReset = useCallback(() => {
    setPendingChanges({ actor: {}, circumstances: {} })
  }, [])

  const handleSave = useCallback(async () => {
    if (!hasChanges) return

    const request: UpdateActorRequest = {}
    if (Object.keys(pendingChanges.actor).length > 0) {
      request.actor = pendingChanges.actor
    }
    if (Object.keys(pendingChanges.circumstances).length > 0) {
      request.circumstances = pendingChanges.circumstances
    }

    try {
      await updateActorAsync(request)
      setPendingChanges({ actor: {}, circumstances: {} })
    } catch {
      // Hook sets updateError state; displayed by the error UI section below
    }
  }, [hasChanges, pendingChanges, updateActorAsync])

  const getFieldValue = useCallback(
    (table: "actor" | "circumstances", field: string) => {
      // Return pending change if exists, otherwise return current data
      if (pendingChanges[table][field] !== undefined) {
        return pendingChanges[table][field]
      }
      if (table === "actor" && actor) {
        return (actor as unknown as Record<string, unknown>)[field]
      }
      if (table === "circumstances" && circumstances) {
        return (circumstances as unknown as Record<string, unknown>)[field]
      }
      return null
    },
    [actor, circumstances, pendingChanges]
  )

  const getFieldHistory = useCallback(
    (field: string) => {
      return recentHistory.filter(
        (h) => h.field_name === field || h.field_name === `circumstances.${field}`
      )
    },
    [recentHistory]
  )

  if (!actorId || isNaN(actorId)) {
    return (
      <AdminLayout>
        <div className="py-12 text-center">
          <p className="text-admin-text-muted">Invalid actor ID</p>
          <Link
            to="/admin/actors"
            className="mt-4 inline-block text-admin-interactive hover:underline"
          >
            Back to Actor Management
          </Link>
        </div>
      </AdminLayout>
    )
  }

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="animate-pulse space-y-4">
          <div className="bg-admin-surface-raised h-8 w-64 rounded" />
          <div className="bg-admin-surface-raised h-4 w-96 rounded" />
          <div className="bg-admin-surface-raised h-64 rounded" />
        </div>
      </AdminLayout>
    )
  }

  if (isError) {
    return (
      <AdminLayout>
        <div className="py-12 text-center">
          <p className="text-admin-danger">{error?.message || "Failed to load actor"}</p>
          <Link
            to="/admin/actors"
            className="mt-4 inline-block text-admin-interactive hover:underline"
          >
            Back to Actor Management
          </Link>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Link
                to="/admin/actors"
                className="text-admin-text-muted hover:text-admin-text-primary"
                title="Back to Actor Management"
              >
                &larr;
              </Link>
              <h1 className="text-2xl font-bold text-admin-text-primary">Edit: {actor?.name}</h1>
            </div>
            <p className="mt-1 text-sm text-admin-text-muted">
              ID: {actor?.id} | TMDB: {actor?.tmdb_id ?? "N/A"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to={`/admin/actors/${actorId}/diagnostic`}
              className="bg-admin-surface-raised rounded px-3 py-2 text-sm text-admin-text-muted hover:bg-admin-surface-inset"
            >
              Diagnostic
            </Link>
            {actor && (
              <Link
                to={`/actor/${createActorSlug(actor.name, actor.id)}`}
                target="_blank"
                className="bg-admin-surface-raised rounded px-3 py-2 text-sm text-admin-text-muted hover:bg-admin-surface-inset"
              >
                View Public Page
              </Link>
            )}
          </div>
        </div>

        {/* Data Quality Alerts */}
        {dataQualityIssues.length > 0 && (
          <div className="bg-admin-warning/10 rounded-lg border border-admin-warning p-4">
            <h2 className="font-medium text-admin-warning">Data Quality Issues</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {dataQualityIssues.map((issue, idx) => (
                <li
                  key={idx}
                  className={
                    issue.severity === "error" ? "text-admin-danger" : "text-admin-warning"
                  }
                >
                  <span className="font-medium">{issue.field}:</span> {issue.issue}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-admin-border">
          <nav className="-mb-px flex gap-4">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "border-admin-interactive text-admin-interactive"
                    : "border-transparent text-admin-text-muted hover:border-admin-border hover:text-admin-text-primary"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="rounded-lg bg-admin-surface-elevated p-6 shadow-admin-sm">
          {activeTab === "basic" && (
            <div className="grid gap-6 md:grid-cols-2">
              {BASIC_FIELDS.map((field) => (
                <EditableField
                  key={field.name}
                  name={field.name}
                  label={field.label}
                  type={field.type}
                  options={field.options}
                  value={getFieldValue("actor", field.name)}
                  onChange={(value) => handleFieldChange("actor", field.name, value)}
                  history={getFieldHistory(field.name)}
                  onRevert={(oldValue) => handleFieldChange("actor", field.name, oldValue)}
                />
              ))}
            </div>
          )}

          {activeTab === "death" && (
            <div className="grid gap-6 md:grid-cols-2">
              {DEATH_FIELDS.map((field) => (
                <EditableField
                  key={field.name}
                  name={field.name}
                  label={field.label}
                  type={field.type}
                  options={field.options}
                  value={getFieldValue("actor", field.name)}
                  onChange={(value) => handleFieldChange("actor", field.name, value)}
                  history={getFieldHistory(field.name)}
                  onRevert={(oldValue) => handleFieldChange("actor", field.name, oldValue)}
                  className={field.type === "textarea" ? "md:col-span-2" : ""}
                />
              ))}
            </div>
          )}

          {activeTab === "circumstances" && (
            <div className="grid gap-6 md:grid-cols-2">
              {CIRCUMSTANCES_FIELDS.map((field) => (
                <EditableField
                  key={field.name}
                  name={field.name}
                  label={field.label}
                  type={field.type}
                  options={field.options}
                  value={getFieldValue("circumstances", field.name)}
                  onChange={(value) => handleFieldChange("circumstances", field.name, value)}
                  history={getFieldHistory(field.name)}
                  onRevert={(oldValue) => handleFieldChange("circumstances", field.name, oldValue)}
                  className={field.type === "textarea" ? "md:col-span-2" : ""}
                />
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm">
          <div className="text-sm text-admin-text-muted">
            {hasChanges ? (
              <span className="text-admin-warning">
                {Object.keys(pendingChanges.actor).length +
                  Object.keys(pendingChanges.circumstances).length}{" "}
                unsaved changes
              </span>
            ) : (
              "No changes"
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleReset}
              disabled={!hasChanges || isUpdating}
              className="bg-admin-surface-raised rounded px-4 py-2 text-sm text-admin-text-muted hover:bg-admin-surface-inset disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!hasChanges || isUpdating}
              className="rounded bg-admin-interactive px-4 py-2 text-sm font-medium text-white hover:bg-admin-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUpdating ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>

        {/* Update Error */}
        {updateError && (
          <div className="bg-admin-danger/10 rounded-lg border border-admin-danger p-4 text-admin-danger">
            {updateError.message}
          </div>
        )}

        {/* Read-only Info */}
        <div className="rounded-lg bg-admin-surface-elevated p-6 shadow-admin-sm">
          <h2 className="mb-4 text-lg font-medium text-admin-text-primary">
            Read-only Information
          </h2>
          <dl className="grid gap-4 text-sm md:grid-cols-3">
            <div>
              <dt className="text-admin-text-muted">TMDB Popularity</dt>
              <dd className="font-medium text-admin-text-primary">
                {actor?.tmdb_popularity ?? "N/A"}
              </dd>
            </div>
            <div>
              <dt className="text-admin-text-muted">DOF Popularity</dt>
              <dd className="font-medium text-admin-text-primary">
                {actor?.dof_popularity ?? "N/A"}
              </dd>
            </div>
            <div>
              <dt className="text-admin-text-muted">Is Obscure</dt>
              <dd className="font-medium text-admin-text-primary">
                {actor?.is_obscure ? "Yes" : "No"}
              </dd>
            </div>
            <div>
              <dt className="text-admin-text-muted">Age at Death</dt>
              <dd className="font-medium text-admin-text-primary">
                {actor?.age_at_death ?? "N/A"}
              </dd>
            </div>
            <div>
              <dt className="text-admin-text-muted">Expected Lifespan</dt>
              <dd className="font-medium text-admin-text-primary">
                {actor?.expected_lifespan ?? "N/A"}
              </dd>
            </div>
            <div>
              <dt className="text-admin-text-muted">Years Lost</dt>
              <dd className="font-medium text-admin-text-primary">{actor?.years_lost ?? "N/A"}</dd>
            </div>
            <div>
              <dt className="text-admin-text-muted">Enriched At</dt>
              <dd className="font-medium text-admin-text-primary">
                {actor?.enriched_at ? new Date(actor.enriched_at).toLocaleString() : "Never"}
              </dd>
            </div>
            <div>
              <dt className="text-admin-text-muted">Enrichment Source</dt>
              <dd className="font-medium text-admin-text-primary">
                {actor?.enrichment_source ?? "N/A"}
              </dd>
            </div>
            <div>
              <dt className="text-admin-text-muted">Created At</dt>
              <dd className="font-medium text-admin-text-primary">
                {actor?.created_at ? new Date(actor.created_at).toLocaleString() : "N/A"}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </AdminLayout>
  )
}
