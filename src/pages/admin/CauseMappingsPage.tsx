import AdminLayout from "../../components/admin/AdminLayout"
import AdminTabs from "../../components/admin/ui/AdminTabs"
import { useTabParam } from "../../hooks/admin/useTabParam"
import MannerMappingsTab from "../../components/admin/cause-mappings/MannerMappingsTab"
import NormalizationsTab from "../../components/admin/cause-mappings/NormalizationsTab"
import CategoryPreviewTab from "../../components/admin/cause-mappings/CategoryPreviewTab"

const tabs = [
  { id: "manner", label: "Manner Mappings", testId: "tab-manner" },
  { id: "normalizations", label: "Normalizations", testId: "tab-normalizations" },
  { id: "preview", label: "Category Preview", testId: "tab-preview" },
]

export default function CauseMappingsPage() {
  const [activeTab, setActiveTab] = useTabParam<string>("manner")

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-admin-text-primary md:text-3xl">Cause Mappings</h1>
          <p className="mt-2 text-admin-text-muted">
            Manage manner-of-death classifications and cause normalizations
          </p>
        </div>

        <AdminTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
          {activeTab === "manner" && <MannerMappingsTab />}
          {activeTab === "normalizations" && <NormalizationsTab />}
          {activeTab === "preview" && <CategoryPreviewTab />}
        </AdminTabs>
      </div>
    </AdminLayout>
  )
}
