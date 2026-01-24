import { useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import AdminLayout from "../../components/admin/AdminLayout"
import { adminApi } from "@/services/api"

interface SitemapStatus {
  lastGenerated: string | null
  actorUrls: number
  movieUrls: number
  showUrls: number
  totalUrls: number
  changedSinceLastGeneration: number
  searchEngineSubmissions: {
    google: { lastSubmitted: string | null; status: string }
    bing: { lastSubmitted: string | null; status: string }
  }
}

export default function SitemapManagementPage() {
  const [submitting, setSubmitting] = useState(false)

  // Fetch sitemap status
  const {
    data: status,
    isLoading,
    refetch,
  } = useQuery<SitemapStatus>({
    queryKey: ["sitemap-status"],
    queryFn: async () => {
      const response = await fetch(adminApi("/sitemap/status"))
      if (!response.ok) throw new Error("Failed to fetch sitemap status")
      return response.json()
    },
  })

  // Regenerate sitemap mutation
  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(adminApi("/sitemap/regenerate"), {
        method: "POST",
      })
      if (!response.ok) throw new Error("Failed to regenerate sitemap")
      return response.json()
    },
    onSuccess: () => {
      refetch()
    },
  })

  // Submit to search engines mutation
  const submitMutation = useMutation({
    mutationFn: async () => {
      setSubmitting(true)
      const response = await fetch(adminApi("/sitemap/submit"), {
        method: "POST",
      })
      if (!response.ok) throw new Error("Failed to submit sitemap")
      return response.json()
    },
    onSuccess: () => {
      refetch()
      setSubmitting(false)
    },
    onError: () => {
      setSubmitting(false)
    },
  })

  const formatDate = (date: string | null) => {
    if (!date) return "Never"
    return new Date(date).toLocaleString()
  }

  const getSubmissionStatus = (
    lastSubmitted: string | null
  ): {
    color: string
    label: string
  } => {
    if (!lastSubmitted) {
      return { color: "text-gray-400", label: "Not submitted" }
    }

    const hoursSince = (Date.now() - new Date(lastSubmitted).getTime()) / (1000 * 60 * 60)

    if (hoursSince < 24) {
      return { color: "text-green-400", label: "✓ Submitted recently" }
    } else if (hoursSince < 168) {
      // 7 days
      return { color: "text-yellow-400", label: "⚠ Submitted this week" }
    } else {
      return { color: "text-orange-400", label: "⚠ Submitted over a week ago" }
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">Sitemap Management</h1>
          <p className="mt-2 text-gray-400">
            Monitor and manage sitemap generation and search engine submissions
          </p>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="rounded-lg bg-gray-800 p-12 text-center">
            <div className="text-gray-400">Loading sitemap status...</div>
          </div>
        )}

        {/* Status */}
        {status && !isLoading && (
          <div className="space-y-6">
            {/* Sitemap Overview */}
            <div className="rounded-lg bg-gray-800 p-6">
              <h3 className="mb-4 text-xl font-semibold text-white">Sitemap Status</h3>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-sm font-medium text-gray-400">Last Generated</dt>
                  <dd className="mt-1 text-lg text-white">{formatDate(status.lastGenerated)}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-400">Total URLs</dt>
                  <dd className="mt-1 text-lg font-bold text-white">
                    {status.totalUrls.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-400">Changed URLs</dt>
                  <dd className="mt-1 text-lg font-bold text-blue-400">
                    {status.changedSinceLastGeneration.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-400">Actor URLs</dt>
                  <dd className="mt-1 text-lg text-white">{status.actorUrls.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-400">Movie URLs</dt>
                  <dd className="mt-1 text-lg text-white">{status.movieUrls.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-400">Show URLs</dt>
                  <dd className="mt-1 text-lg text-white">{status.showUrls.toLocaleString()}</dd>
                </div>
              </dl>

              {/* Action Buttons */}
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => regenerateMutation.mutate()}
                  disabled={regenerateMutation.isPending}
                  className="rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {regenerateMutation.isPending ? "Regenerating..." : "Regenerate Sitemap"}
                </button>
              </div>

              {regenerateMutation.isError && (
                <div className="mt-4 rounded-md border border-red-700 bg-red-900/20 p-3 text-red-400">
                  Error regenerating sitemap. Please try again.
                </div>
              )}

              {regenerateMutation.isSuccess && (
                <div className="mt-4 rounded-md border border-green-700 bg-green-900/20 p-3 text-green-400">
                  ✓ Sitemap regenerated successfully!
                </div>
              )}
            </div>

            {/* Search Engine Submissions */}
            <div className="rounded-lg bg-gray-800 p-6">
              <h3 className="mb-4 text-xl font-semibold text-white">Search Engine Submissions</h3>

              <div className="space-y-4">
                {/* Google */}
                <div className="rounded-lg bg-gray-700 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-lg font-semibold text-white">Google</h4>
                      <p className="mt-1 text-sm text-gray-400">
                        Last submitted:{" "}
                        {formatDate(status.searchEngineSubmissions.google.lastSubmitted)}
                      </p>
                      <p
                        className={`mt-1 text-sm font-medium ${
                          getSubmissionStatus(status.searchEngineSubmissions.google.lastSubmitted)
                            .color
                        }`}
                      >
                        {
                          getSubmissionStatus(status.searchEngineSubmissions.google.lastSubmitted)
                            .label
                        }
                      </p>
                    </div>
                  </div>
                </div>

                {/* Bing */}
                <div className="rounded-lg bg-gray-700 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-lg font-semibold text-white">Bing</h4>
                      <p className="mt-1 text-sm text-gray-400">
                        Last submitted:{" "}
                        {formatDate(status.searchEngineSubmissions.bing.lastSubmitted)}
                      </p>
                      <p
                        className={`mt-1 text-sm font-medium ${
                          getSubmissionStatus(status.searchEngineSubmissions.bing.lastSubmitted)
                            .color
                        }`}
                      >
                        {
                          getSubmissionStatus(status.searchEngineSubmissions.bing.lastSubmitted)
                            .label
                        }
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="mt-6">
                <button
                  onClick={() => submitMutation.mutate()}
                  disabled={submitting || submitMutation.isPending}
                  className="rounded-md bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting || submitMutation.isPending
                    ? "Submitting..."
                    : "Submit to Search Engines"}
                </button>
                <p className="mt-2 text-sm text-gray-400">
                  Notifies Google and Bing to re-crawl the sitemap
                </p>
              </div>

              {submitMutation.isError && (
                <div className="mt-4 rounded-md border border-red-700 bg-red-900/20 p-3 text-red-400">
                  Error submitting sitemap. Please try again.
                </div>
              )}

              {submitMutation.isSuccess && (
                <div className="mt-4 rounded-md border border-green-700 bg-green-900/20 p-3 text-green-400">
                  ✓ Sitemap submitted to search engines successfully!
                </div>
              )}
            </div>

            {/* Migration Impact */}
            {status.changedSinceLastGeneration > 0 && (
              <div className="rounded-lg border border-yellow-700 bg-yellow-900/20 p-4">
                <h4 className="font-semibold text-yellow-400">Migration Impact</h4>
                <p className="mt-2 text-sm text-yellow-300">
                  {status.changedSinceLastGeneration.toLocaleString()} URLs have changed since the
                  last sitemap generation (likely due to actor URL migration from tmdb_id to
                  actor.id).
                </p>
                <p className="mt-2 text-sm text-yellow-300">
                  Consider submitting the sitemap to search engines to help them discover the new
                  URLs faster.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
