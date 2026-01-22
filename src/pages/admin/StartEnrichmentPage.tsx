/**
 * Admin page for starting a new enrichment run.
 *
 * Note: This is a placeholder UI. The actual enrichment run triggering
 * functionality is not yet implemented and requires spawning the enrichment
 * script as a child process from the backend.
 */

import { Link } from "react-router-dom"
import AdminLayout from "../../components/admin/AdminLayout"

export default function StartEnrichmentPage() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <Link
            to="/admin/enrichment/runs"
            className="mb-2 inline-block text-sm text-gray-400 hover:text-white"
          >
            ← Back to Runs
          </Link>
          <h1 className="text-2xl font-bold text-white">Start Enrichment Run</h1>
          <p className="mt-1 text-gray-400">
            Configure and start a new death information enrichment run
          </p>
        </div>

        {/* Not Implemented Notice */}
        <div className="rounded-lg border border-yellow-700 bg-yellow-900 p-6">
          <h2 className="mb-2 text-lg font-semibold text-yellow-200">Not Yet Implemented</h2>
          <p className="mb-4 text-yellow-100">
            Starting enrichment runs from the admin UI is not yet implemented. This feature requires
            spawning the enrichment script as a child process and tracking its progress.
          </p>
          <p className="mb-4 text-yellow-100">For now, please use the CLI script directly:</p>
          <div className="overflow-x-auto rounded bg-gray-900 p-4 font-mono text-sm text-gray-300">
            cd server && npm run enrich:death-details -- --limit 100 --max-total-cost 10
          </div>
        </div>

        {/* Planned Features */}
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Planned Features</h2>
          <ul className="space-y-2 text-gray-300">
            <li className="flex items-start gap-2">
              <span className="text-gray-500">•</span>
              <span>Configure actor limits (1-1000)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-500">•</span>
              <span>Set max cost per run and per actor</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-500">•</span>
              <span>Select which death sources to use</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-500">•</span>
              <span>Filter by actor popularity and date ranges</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-500">•</span>
              <span>Dry-run mode to preview without writing</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-500">•</span>
              <span>Real-time progress tracking</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-500">•</span>
              <span>Ability to stop running enrichments</span>
            </li>
          </ul>
        </div>

        {/* CLI Reference */}
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">CLI Reference</h2>
          <p className="mb-4 text-gray-300">
            Until the UI is implemented, use these common CLI commands:
          </p>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-sm text-gray-400">Process 50 actors with $5 cost limit:</p>
              <div className="overflow-x-auto rounded bg-gray-900 p-3 font-mono text-sm text-gray-300">
                npm run enrich:death-details -- --limit 50 --max-total-cost 5
              </div>
            </div>
            <div>
              <p className="mb-1 text-sm text-gray-400">Dry run (preview without writing):</p>
              <div className="overflow-x-auto rounded bg-gray-900 p-3 font-mono text-sm text-gray-300">
                npm run enrich:death-details -- --limit 10 --dry-run
              </div>
            </div>
            <div>
              <p className="mb-1 text-sm text-gray-400">Process specific actor by TMDB ID:</p>
              <div className="overflow-x-auto rounded bg-gray-900 p-3 font-mono text-sm text-gray-300">
                npm run enrich:death-details -- --tmdb-id 12345 --dry-run
              </div>
            </div>
            <div>
              <p className="mb-1 text-sm text-gray-400">Recent deaths only (last 2 years):</p>
              <div className="overflow-x-auto rounded bg-gray-900 p-3 font-mono text-sm text-gray-300">
                npm run enrich:death-details -- --recent-only --limit 100
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
