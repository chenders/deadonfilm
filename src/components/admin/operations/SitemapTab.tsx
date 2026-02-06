import { useMutation, useQuery } from "@tanstack/react-query"
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

export default function SitemapTab() {
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
      const response = await fetch(adminApi("/sitemap/submit"), {
        method: "POST",
      })
      if (!response.ok) throw new Error("Failed to submit sitemap")
      return response.json()
    },
    onSuccess: () => {
      refetch()
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
      return { color: "text-admin-text-muted", label: "Not submitted" }
    }

    const hoursSince = (Date.now() - new Date(lastSubmitted).getTime()) / (1000 * 60 * 60)

    if (hoursSince < 24) {
      return { color: "text-admin-success", label: "✓ Submitted recently" }
    } else if (hoursSince < 168) {
      // 7 days
      return { color: "text-admin-warning", label: "⚠ Submitted this week" }
    } else {
      return { color: "text-orange-400", label: "⚠ Submitted over a week ago" }
    }
  }

  return (
    <div className="space-y-8">
      {/* Loading State */}
      {isLoading && (
        <div className="rounded-lg bg-admin-surface-elevated p-12 text-center shadow-admin-sm">
          <div className="text-admin-text-muted">Loading sitemap status...</div>
        </div>
      )}

      {/* Status */}
      {status && !isLoading && (
        <div className="space-y-6">
          {/* Sitemap Overview */}
          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h3 className="mb-4 text-xl font-semibold text-admin-text-primary">Sitemap Status</h3>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-sm font-medium text-admin-text-muted">Last Generated</dt>
                <dd className="mt-1 text-lg text-admin-text-primary">
                  {formatDate(status.lastGenerated)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-admin-text-muted">Total URLs</dt>
                <dd className="mt-1 text-lg font-bold text-admin-text-primary">
                  {status.totalUrls.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-admin-text-muted">Changed URLs</dt>
                <dd className="mt-1 text-lg font-bold text-admin-interactive">
                  {status.changedSinceLastGeneration.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-admin-text-muted">Actor URLs</dt>
                <dd className="mt-1 text-lg text-admin-text-primary">
                  {status.actorUrls.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-admin-text-muted">Movie URLs</dt>
                <dd className="mt-1 text-lg text-admin-text-primary">
                  {status.movieUrls.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-admin-text-muted">Show URLs</dt>
                <dd className="mt-1 text-lg text-admin-text-primary">
                  {status.showUrls.toLocaleString()}
                </dd>
              </div>
            </dl>

            {/* Action Buttons */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => regenerateMutation.mutate()}
                disabled={regenerateMutation.isPending}
                className="rounded-md bg-admin-interactive px-4 py-2 font-semibold text-admin-text-primary hover:bg-admin-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {regenerateMutation.isPending ? "Regenerating..." : "Regenerate Sitemap"}
              </button>
            </div>

            {regenerateMutation.isError && (
              <div className="border-admin-danger/50 bg-admin-danger/20 mt-4 rounded-md border p-3 text-admin-danger">
                Error regenerating sitemap. Please try again.
              </div>
            )}

            {regenerateMutation.isSuccess && (
              <div className="border-admin-success/50 bg-admin-success/20 mt-4 rounded-md border p-3 text-admin-success">
                ✓ Sitemap regenerated successfully!
              </div>
            )}
          </div>

          {/* Search Engine Submissions */}
          <div className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
            <h3 className="mb-4 text-xl font-semibold text-admin-text-primary">
              Search Engine Submissions
            </h3>

            <div className="space-y-4">
              {/* Google */}
              <div className="rounded-lg bg-admin-surface-overlay p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-lg font-semibold text-admin-text-primary">Google</h4>
                    <p className="mt-1 text-sm text-admin-text-muted">
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
              <div className="rounded-lg bg-admin-surface-overlay p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-lg font-semibold text-admin-text-primary">Bing</h4>
                    <p className="mt-1 text-sm text-admin-text-muted">
                      Last submitted:{" "}
                      {formatDate(status.searchEngineSubmissions.bing.lastSubmitted)}
                    </p>
                    <p
                      className={`mt-1 text-sm font-medium ${
                        getSubmissionStatus(status.searchEngineSubmissions.bing.lastSubmitted).color
                      }`}
                    >
                      {getSubmissionStatus(status.searchEngineSubmissions.bing.lastSubmitted).label}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="mt-6">
              <button
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending}
                className="hover:bg-admin-success/80 rounded-md bg-admin-success px-4 py-2 font-semibold text-admin-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitMutation.isPending ? "Submitting..." : "Submit to Search Engines"}
              </button>
              <p className="mt-2 text-sm text-admin-text-muted">
                Notifies Google and Bing to re-crawl the sitemap
              </p>
            </div>

            {submitMutation.isError && (
              <div className="border-admin-danger/50 bg-admin-danger/20 mt-4 rounded-md border p-3 text-admin-danger">
                Error submitting sitemap. Please try again.
              </div>
            )}

            {submitMutation.isSuccess && (
              <div className="border-admin-success/50 bg-admin-success/20 mt-4 rounded-md border p-3 text-admin-success">
                ✓ Sitemap submitted to search engines successfully!
              </div>
            )}
          </div>

          {/* Migration Impact */}
          {status.changedSinceLastGeneration > 0 && (
            <div className="border-admin-warning/50 bg-admin-warning/20 rounded-lg border p-4">
              <h4 className="font-semibold text-admin-warning">Migration Impact</h4>
              <p className="text-admin-warning/90 mt-2 text-sm">
                {status.changedSinceLastGeneration.toLocaleString()} URLs have changed since the
                last sitemap generation (likely due to actor URL migration from tmdb_id to
                actor.id).
              </p>
              <p className="text-admin-warning/90 mt-2 text-sm">
                Consider submitting the sitemap to search engines to help them discover the new URLs
                faster.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
