/**
 * Modal for confirming commit of approved enrichments to production.
 *
 * Shows summary and requires confirmation before committing.
 */

import { useState } from "react"
import LoadingSpinner from "../common/LoadingSpinner"
import { useCommitEnrichmentRun } from "../../hooks/admin/useEnrichmentReview"

interface CommitEnrichmentsModalProps {
  runId: number
  onClose: () => void
  onSuccess: () => void
}

export default function CommitEnrichmentsModal({
  runId,
  onClose,
  onSuccess,
}: CommitEnrichmentsModalProps) {
  const [isConfirmed, setIsConfirmed] = useState(false)
  const commitMutation = useCommitEnrichmentRun()

  const handleCommit = async () => {
    if (!isConfirmed) {
      alert("Please confirm you understand this action")
      return
    }

    try {
      await commitMutation.mutateAsync(runId)
      onSuccess()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to commit enrichments")
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-gray-900 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-6 py-4">
          <div className="flex items-center gap-2">
            <svg
              className="h-6 w-6 text-yellow-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <h2 className="text-xl font-bold text-white">Commit Enrichments</h2>
          </div>
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
          {commitMutation.isPending ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary */}
              <div>
                <p className="text-gray-300">
                  You are about to commit all approved enrichments from run #{runId} to production.
                </p>
              </div>

              {/* Warning */}
              <div className="rounded-lg border border-yellow-700 bg-yellow-900 bg-opacity-30 p-4">
                <div className="flex items-start gap-3">
                  <svg
                    className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <div className="space-y-2">
                    <p className="font-semibold text-yellow-200">Warning</p>
                    <ul className="list-inside list-disc space-y-1 text-sm text-yellow-100">
                      <li>This will update production data for all approved actors</li>
                      <li>All relevant caches will be invalidated</li>
                      <li>This action cannot be undone</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Confirmation Checkbox */}
              <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isConfirmed}
                    onChange={(e) => setIsConfirmed(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-600 bg-gray-700 text-red-600 focus:ring-2 focus:ring-red-500"
                  />
                  <span className="text-sm text-gray-300">
                    I understand this will update production data and invalidate caches. This action
                    cannot be undone.
                  </span>
                </label>
              </div>

              {/* Footer Actions */}
              <div className="flex justify-end gap-2 border-t border-gray-700 pt-4">
                <button
                  onClick={onClose}
                  disabled={commitMutation.isPending}
                  className="rounded border border-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCommit}
                  disabled={!isConfirmed || commitMutation.isPending}
                  className="rounded bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Commit to Production
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
