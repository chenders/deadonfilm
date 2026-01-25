import { useQuery } from "@tanstack/react-query"

interface ProviderData {
  circumstances: string | null
  rumoredCircumstances: string | null
  sources: string[]
  resolvedSources: Array<{ originalUrl: string; finalUrl: string; sourceName: string }> | null
  costUsd: number
}

interface ProviderComparison {
  actorId: number
  actorName: string
  providers: Record<string, ProviderData>
  createdAt: string
}

interface ProviderComparisonResponse {
  summary: {
    totalTests: number
    totalCost: string
    providerStats: Record<string, { foundData: number; totalCost: number }>
  }
  comparisons: ProviderComparison[]
}

export function useABTestProviderComparison() {
  return useQuery<ProviderComparisonResponse>({
    queryKey: ["ab-tests", "provider-comparison"],
    queryFn: async () => {
      const response = await fetch("/admin/api/ab-tests/provider-comparison", {
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to fetch provider comparison results")
      }

      return response.json()
    },
  })
}
