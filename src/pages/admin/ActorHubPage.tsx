/**
 * Actor Hub page.
 * Consolidates Actor Management, Actor Diagnostic, Biographies, Bio Enrichment,
 * Data Quality, Popularity, and Rejected Factors into a single tabbed view.
 */

import AdminLayout from "../../components/admin/AdminLayout"
import AdminTabs from "../../components/admin/ui/AdminTabs"
import { useTabParam } from "../../hooks/admin/useTabParam"
import ActorManagementTab from "../../components/admin/actors/ActorManagementTab"
import ActorDiagnosticTab from "../../components/admin/actors/ActorDiagnosticTab"
import BiographiesTab from "../../components/admin/actors/BiographiesTab"
import BiographyEnrichmentTab from "../../components/admin/actors/BiographyEnrichmentTab"
import DataQualityTab from "../../components/admin/actors/DataQualityTab"
import PopularityTab from "../../components/admin/actors/PopularityTab"
import RejectedFactorsTab from "../../components/admin/actors/RejectedFactorsTab"

const tabs = [
  { id: "management", label: "Management", testId: "tab-management" },
  { id: "diagnostic", label: "Diagnostic", testId: "tab-diagnostic" },
  { id: "biographies", label: "Biographies", testId: "tab-biographies" },
  { id: "bio-enrichment", label: "Bio Enrichment", testId: "tab-bio-enrichment" },
  { id: "data-quality", label: "Data Quality", testId: "tab-data-quality" },
  { id: "popularity", label: "Popularity", testId: "tab-popularity" },
  { id: "rejected-factors", label: "Rejected Factors", testId: "tab-rejected-factors" },
]

export default function ActorHubPage() {
  const [activeTab, setActiveTab] = useTabParam<string>("management")

  return (
    <AdminLayout fullWidth hideSidebar>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-admin-text-primary md:text-3xl">Actors</h1>
          <p className="mt-2 text-admin-text-muted">
            Manage actors, diagnostics, biographies, bio enrichment, data quality, popularity
            scores, and rejected factors
          </p>
        </div>

        <AdminTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
          {activeTab === "management" && <ActorManagementTab />}
          {activeTab === "diagnostic" && <ActorDiagnosticTab />}
          {activeTab === "biographies" && <BiographiesTab />}
          {activeTab === "bio-enrichment" && <BiographyEnrichmentTab />}
          {activeTab === "data-quality" && <DataQualityTab />}
          {activeTab === "popularity" && <PopularityTab />}
          {activeTab === "rejected-factors" && <RejectedFactorsTab />}
        </AdminTabs>
      </div>
    </AdminLayout>
  )
}
