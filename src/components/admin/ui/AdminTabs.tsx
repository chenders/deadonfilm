import { ReactNode } from "react"

export interface TabDefinition {
  /** Unique tab identifier used in URL params */
  id: string
  /** Display label */
  label: string
  /** Optional badge count */
  badge?: number
  /** data-testid for the tab button */
  testId?: string
}

export interface AdminTabsProps {
  /** Tab definitions */
  tabs: TabDefinition[]
  /** Currently active tab ID */
  activeTab: string
  /** Callback when a tab is clicked */
  onTabChange: (tabId: string) => void
  /** Content to render for the active tab */
  children: ReactNode
}

export default function AdminTabs({ tabs, activeTab, onTabChange, children }: AdminTabsProps) {
  return (
    <div>
      {/* Tab bar with horizontal scroll on mobile */}
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="border-b border-admin-border">
          <div role="tablist" className="-mb-px flex min-w-max space-x-4 md:space-x-8">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onTabChange(tab.id)}
                  data-testid={tab.testId}
                  className={`inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
                    isActive
                      ? "border-admin-interactive text-admin-interactive"
                      : "border-transparent text-admin-text-muted hover:border-admin-border hover:text-admin-text-secondary"
                  }`}
                >
                  {tab.label}
                  {tab.badge !== undefined && (
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        isActive
                          ? "bg-admin-interactive/10 text-admin-interactive"
                          : "bg-admin-surface-overlay text-admin-text-muted"
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Tab panel */}
      <div role="tabpanel" className="mt-6">
        {children}
      </div>
    </div>
  )
}
