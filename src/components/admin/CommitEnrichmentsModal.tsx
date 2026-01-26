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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--admin-overlay-bg)] p-2 md:p-4">
      <div className="w-full max-w-2xl rounded-lg bg-admin-surface-base shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-admin-border px-4 py-3 md:px-6 md:py-4">
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
            <h2 className="text-lg font-bold text-admin-text-primary md:text-xl">
              Commit Enrichments
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-admin-text-muted transition-colors hover:text-admin-text-primary"
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

        <div className="p-4 md:p-6">
          {commitMutation.isPending ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary */}
              <div>
                <p className="text-admin-text-secondary">
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
              <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isConfirmed}
                    onChange={(e) => setIsConfirmed(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-admin-border bg-admin-surface-overlay text-red-600 focus:ring-2 focus:ring-admin-interactive"
                  />
                  <span className="text-sm text-admin-text-secondary">
                    I understand this will update production data and invalidate caches. This action
                    cannot be undone.
                  </span>
                </label>
              </div>

              {/* Footer Actions */}
              <div className="flex flex-col gap-2 border-t border-admin-border pt-4 sm:flex-row sm:justify-end">
                <button
                  onClick={onClose}
                  disabled={commitMutation.isPending}
                  className="rounded border border-admin-border px-4 py-2 text-admin-text-primary transition-colors hover:bg-admin-interactive-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCommit}
                  disabled={!isConfirmed || commitMutation.isPending}
                  className="rounded bg-red-600 px-4 py-2 text-admin-text-primary transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
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
