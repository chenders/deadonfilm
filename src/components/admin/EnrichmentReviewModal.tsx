/**
 * Modal for reviewing a single enrichment result.
 *
 * Shows side-by-side comparison of staging vs production data with edit functionality.
 */

import { useState } from "react"
import LoadingSpinner from "../common/LoadingSpinner"
import ErrorMessage from "../common/ErrorMessage"
import {
  useEnrichmentReviewDetail,
  useApproveEnrichment,
  useRejectEnrichment,
  useEditEnrichment,
  type EditEnrichmentRequest,
} from "../../hooks/admin/useEnrichmentReview"
import { formatDate } from "../../utils/formatDate"

interface EnrichmentReviewModalProps {
  enrichmentRunActorId: number
  onClose: () => void
  onSuccess: () => void
}

export default function EnrichmentReviewModal({
  enrichmentRunActorId,
  onClose,
  onSuccess,
}: EnrichmentReviewModalProps) {
  const [isEditMode, setIsEditMode] = useState(false)
  const [editedData, setEditedData] = useState<EditEnrichmentRequest>({})
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

  const { data, isLoading, error } = useEnrichmentReviewDetail(enrichmentRunActorId)
  const approveMutation = useApproveEnrichment()
  const rejectMutation = useRejectEnrichment()
  const editMutation = useEditEnrichment()

  const handleEdit = () => {
    if (!data) return
    setIsEditMode(true)
    setEditedData({
      deathday: data.staging.deathday,
      cause_of_death: data.staging.cause_of_death,
      cause_of_death_details: data.staging.cause_of_death_details,
      age_at_death: data.staging.age_at_death,
      years_lost: data.staging.years_lost,
      violent_death: data.staging.violent_death,
      has_detailed_death_info: data.staging.has_detailed_death_info,
      circumstances: data.staging.circumstances,
      location_of_death: data.staging.location_of_death,
    })
  }

  const handleSaveEdits = async () => {
    try {
      await editMutation.mutateAsync({ id: enrichmentRunActorId, data: editedData })
      setIsEditMode(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save edits")
    }
  }

  const handleApprove = async () => {
    try {
      await approveMutation.mutateAsync(enrichmentRunActorId)
      onSuccess()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to approve enrichment")
    }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      alert("Please select a rejection reason")
      return
    }

    try {
      await rejectMutation.mutateAsync({
        id: enrichmentRunActorId,
        data: { reason: rejectReason },
      })
      setShowRejectDialog(false)
      onSuccess()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to reject enrichment")
    }
  }

  const hasChanges = (field: keyof EditEnrichmentRequest): boolean => {
    if (!data) return false
    return data.staging[field] !== data.production[field]
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-lg bg-gray-900 shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-700 bg-gray-900 px-6 py-4">
          <h2 className="text-xl font-bold text-white">
            Review Enrichment: {data?.actor_name || "Loading..."}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-white"
            aria-label="Close modal"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {/* Loading State */}
          {isLoading && (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          )}

          {/* Error State */}
          {error && <ErrorMessage message="Failed to load enrichment details." />}

          {/* Content */}
          {data && (
            <div className="space-y-6">
              {/* Metadata */}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div>
                  <p className="text-sm text-gray-400">Source</p>
                  <p className="mt-1 text-white">{data.winning_source || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Cost</p>
                  <p className="mt-1 text-white">${parseFloat(data.cost_usd).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Overall Confidence</p>
                  <p className="mt-1 text-white">{data.overall_confidence.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Run ID</p>
                  <p className="mt-1 text-white">#{data.run_id}</p>
                </div>
              </div>

              {/* Side-by-Side Comparison */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Staging Panel */}
                <div className="rounded-lg border-2 border-blue-600 bg-gray-800 p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-blue-400">New Data (Staging)</h3>
                    {!isEditMode && (
                      <button
                        onClick={handleEdit}
                        className="rounded bg-blue-600 px-3 py-1 text-sm text-white transition-colors hover:bg-blue-700"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  <DataFields
                    data={isEditMode ? editedData : data.staging}
                    isEditable={isEditMode}
                    onChange={setEditedData}
                    hasChanges={hasChanges}
                  />
                </div>

                {/* Production Panel */}
                <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
                  <h3 className="mb-4 text-lg font-semibold text-gray-400">
                    Current Data (Production)
                  </h3>
                  <DataFields data={data.production} isEditable={false} />
                </div>
              </div>

              {/* Confidence Breakdown */}
              <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
                <h3 className="mb-4 text-lg font-semibold text-white">Confidence Breakdown</h3>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                  <ConfidenceItem
                    label="Cause"
                    value={data.confidence_breakdown.cause_confidence}
                  />
                  <ConfidenceItem
                    label="Details"
                    value={data.confidence_breakdown.details_confidence}
                  />
                  <ConfidenceItem
                    label="Deathday"
                    value={data.confidence_breakdown.deathday_confidence}
                  />
                  <ConfidenceItem
                    label="Birthday"
                    value={data.confidence_breakdown.birthday_confidence}
                  />
                  <ConfidenceItem
                    label="Circumstances"
                    value={data.confidence_breakdown.circumstances_confidence}
                  />
                </div>
              </div>

              {/* Death Circumstances (Collapsible) */}
              {data.staging.circumstances && (
                <details className="rounded-lg border border-gray-700 bg-gray-800 p-4">
                  <summary className="cursor-pointer text-lg font-semibold text-white">
                    Death Circumstances
                  </summary>
                  <p className="mt-4 whitespace-pre-wrap text-gray-300">
                    {data.staging.circumstances}
                  </p>
                </details>
              )}

              {/* Raw Response (Collapsible) */}
              {data.raw_response && (
                <details className="rounded-lg border border-gray-700 bg-gray-800 p-4">
                  <summary className="cursor-pointer text-lg font-semibold text-white">
                    Raw Response
                  </summary>
                  <pre className="mt-4 overflow-x-auto whitespace-pre-wrap text-sm text-gray-300">
                    {data.raw_response}
                  </pre>
                </details>
              )}

              {/* Footer Actions */}
              <div className="flex items-center justify-between border-t border-gray-700 pt-4">
                <button
                  onClick={() => setShowRejectDialog(true)}
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                  className="rounded bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Reject
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={onClose}
                    className="rounded border border-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  {isEditMode && (
                    <button
                      onClick={handleSaveEdits}
                      disabled={editMutation.isPending}
                      className="rounded bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {editMutation.isPending ? "Saving..." : "Save Edits"}
                    </button>
                  )}
                  <button
                    onClick={handleApprove}
                    disabled={isEditMode || approveMutation.isPending || rejectMutation.isPending}
                    className="rounded bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {approveMutation.isPending ? "Approving..." : "Approve"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reject Dialog */}
      {showRejectDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4">
          <div className="w-full max-w-md rounded-lg bg-gray-900 p-6">
            <h3 className="mb-4 text-lg font-bold text-white">Reject Enrichment</h3>
            <label htmlFor="rejectReason" className="mb-2 block text-sm text-gray-400">
              Reason for rejection
            </label>
            <select
              id="rejectReason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="mb-4 w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white"
            >
              <option value="">Select a reason</option>
              <option value="incorrect_data">Incorrect Data</option>
              <option value="low_confidence">Low Confidence</option>
              <option value="duplicate">Duplicate</option>
              <option value="other">Other</option>
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowRejectDialog(false)}
                className="rounded border border-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={rejectMutation.isPending}
                className="rounded bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {rejectMutation.isPending ? "Rejecting..." : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface DataFieldsProps {
  data: EditEnrichmentRequest | Record<string, unknown>
  isEditable: boolean
  onChange?: (data: EditEnrichmentRequest) => void
  hasChanges?: (field: keyof EditEnrichmentRequest) => boolean
}

function DataFields({ data, isEditable, onChange, hasChanges }: DataFieldsProps) {
  const fields = [
    { key: "deathday", label: "Deathday", type: "date" },
    { key: "cause_of_death", label: "Cause of Death", type: "text" },
    { key: "cause_of_death_details", label: "Cause Details", type: "text" },
    { key: "age_at_death", label: "Age at Death", type: "number" },
    { key: "years_lost", label: "Years Lost", type: "number" },
    { key: "location_of_death", label: "Location", type: "text" },
    { key: "violent_death", label: "Violent Death", type: "boolean" },
    { key: "has_detailed_death_info", label: "Has Detailed Info", type: "boolean" },
  ]

  return (
    <div className="space-y-3">
      {fields.map(({ key, label, type }) => {
        const value = data[key as keyof typeof data]
        const isChanged = hasChanges ? hasChanges(key as keyof EditEnrichmentRequest) : false

        return (
          <div key={key} className={isChanged ? "rounded bg-yellow-900 bg-opacity-20 p-2" : ""}>
            <label className="block text-sm text-gray-400">{label}</label>
            {isEditable && onChange ? (
              type === "boolean" ? (
                <select
                  value={value === null ? "" : String(value)}
                  onChange={(e) =>
                    onChange({
                      ...data,
                      [key]: e.target.value === "" ? null : e.target.value === "true",
                    })
                  }
                  className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white"
                >
                  <option value="">-</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : (
                <input
                  type={type}
                  value={value === null ? "" : String(value)}
                  onChange={(e) =>
                    onChange({
                      ...data,
                      [key]:
                        type === "number"
                          ? e.target.value
                            ? key === "years_lost"
                              ? parseFloat(e.target.value)
                              : parseInt(e.target.value, 10)
                            : null
                          : e.target.value || null,
                    })
                  }
                  className="mt-1 w-full rounded border-2 border-blue-600 bg-gray-900 px-3 py-2 text-white"
                />
              )
            ) : (
              <p className="mt-1 text-white">
                {type === "boolean"
                  ? value === null
                    ? "-"
                    : value === true
                      ? "Yes"
                      : "No"
                  : type === "date" && value
                    ? formatDate(String(value))
                    : String(value || "-")}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ConfidenceItem({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value?.toFixed(2) || "-"}</p>
    </div>
  )
}
