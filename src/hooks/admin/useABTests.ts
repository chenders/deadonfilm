/**
 * React Query hooks for A/B test management.
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

// ============================================================================
// Types
// ============================================================================

export interface ABTestComparison {
  actorId: number
  actorName: string
  withSources: {
    circumstances: string | null
    rumoredCircumstances: string | null
    sources: string[]
    resolvedSources: Array<{ originalUrl: string; finalUrl: string; sourceName: string }> | null
    costUsd: number
  } | null
  withoutSources: {
    circumstances: string | null
    rumoredCircumstances: string | null
    sources: string[]
    resolvedSources: Array<{ originalUrl: string; finalUrl: string; sourceName: string }> | null
    costUsd: number
  } | null
  createdAt: string
}

export interface ABTestSummary {
  totalTests: number
  completeTests: number
  totalCost: string
  withSourcesFoundData: number
  withoutSourcesFoundData: number
  dataLossPercentage: string
}

export interface ABTestResults {
  summary: ABTestSummary
  comparisons: ABTestComparison[]
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchABTestResults(): Promise<ABTestResults> {
  const response = await fetch("/admin/api/ab-tests/source-requirement", {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch A/B test results")
  }

  return response.json()
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch A/B test results for source requirement experiment.
 */
export function useABTestResults(): UseQueryResult<ABTestResults, Error> {
  return useQuery({
    queryKey: ["ab-tests", "source-requirement"],
    queryFn: fetchABTestResults,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
