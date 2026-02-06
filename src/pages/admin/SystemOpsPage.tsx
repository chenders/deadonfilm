/**
 * System Ops hub page.
 * Consolidates Cache Management, TMDB Sync, and Sitemap Management
 * into a single tabbed view.
 */

import AdminLayout from "../../components/admin/AdminLayout"
import AdminTabs from "../../components/admin/ui/AdminTabs"
import { useTabParam } from "../../hooks/admin/useTabParam"
import CacheTab from "../../components/admin/operations/CacheTab"
import SyncTab from "../../components/admin/operations/SyncTab"
import SitemapTab from "../../components/admin/operations/SitemapTab"

const tabs = [
  { id: "cache", label: "Cache", testId: "tab-cache" },
  { id: "sync", label: "TMDB Sync", testId: "tab-sync" },
  { id: "sitemap", label: "Sitemap", testId: "tab-sitemap" },
]

export default function SystemOpsPage() {
  const [activeTab, setActiveTab] = useTabParam<string>("cache")

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-admin-text-primary md:text-3xl">System Ops</h1>
          <p className="mt-2 text-admin-text-muted">
            Manage cache, TMDB sync, and sitemap operations
          </p>
        </div>

        <AdminTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
          {activeTab === "cache" && <CacheTab />}
          {activeTab === "sync" && <SyncTab />}
          {activeTab === "sitemap" && <SitemapTab />}
        </AdminTabs>
      </div>
    </AdminLayout>
  )
}
