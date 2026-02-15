/**
 * Analytics Hub page.
 * Consolidates Cost Analytics, Page Views, and Death Coverage into a single tabbed view.
 */

import AdminLayout from "../../components/admin/AdminLayout"
import AdminTabs from "../../components/admin/ui/AdminTabs"
import { useTabParam } from "../../hooks/admin/useTabParam"
import CostAnalyticsTab from "../../components/admin/analytics/CostAnalyticsTab"
import PageViewsTab from "../../components/admin/analytics/PageViewsTab"
import CoverageTab from "../../components/admin/analytics/CoverageTab"
import SeoMetricsTab from "../../components/admin/analytics/SeoMetricsTab"

const tabs = [
  { id: "cost-analytics", label: "Cost Analytics", testId: "tab-cost-analytics" },
  { id: "page-views", label: "Page Views", testId: "tab-page-views" },
  { id: "coverage", label: "Death Coverage", testId: "tab-coverage" },
  { id: "seo-metrics", label: "SEO Metrics", testId: "tab-seo-metrics" },
]

export default function AnalyticsHubPage() {
  const [activeTab, setActiveTab] = useTabParam<string>("cost-analytics")

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-admin-text-primary md:text-3xl">Analytics</h1>
          <p className="mt-2 text-admin-text-muted">
            Track costs, page views, death coverage, and SEO metrics
          </p>
        </div>

        <AdminTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
          {activeTab === "cost-analytics" && <CostAnalyticsTab />}
          {activeTab === "page-views" && <PageViewsTab />}
          {activeTab === "coverage" && <CoverageTab />}
          {activeTab === "seo-metrics" && <SeoMetricsTab />}
        </AdminTabs>
      </div>
    </AdminLayout>
  )
}
