import { useQuery } from "@tanstack/react-query"

interface Inference {
  timestamp: string
  message: string
  data?: unknown
}

interface TestRun {
  id: number
  testName: string
  status: "running" | "completed" | "failed"
  totalActors: number
  completedActors: number
  totalVariants: number
  completedVariants: number
  providers: string[]
  strategies: string[]
  totalCost: number
  inferences: Inference[]
  actorCriteria: unknown
  startedAt: string
  completedAt: string | null
}

interface ComprehensiveTestRunsResponse {
  runs: TestRun[]
}

export function useComprehensiveTestRuns() {
  return useQuery<ComprehensiveTestRunsResponse>({
    queryKey: ["ab-tests", "comprehensive"],
    queryFn: async () => {
      const response = await fetch("/admin/api/ab-tests/comprehensive", {
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to fetch comprehensive test runs")
      }

      return response.json()
    },
    refetchInterval: (query) => {
      // Auto-refresh every 5 seconds if any run is still running
      const hasRunningTests = query.state.data?.runs.some((run) => run.status === "running")
      return hasRunningTests ? 5000 : false
    },
  })
}

interface VariantResult {
  provider: string
  strategy: string
  whatWeKnow: string | null
  alternativeAccounts: string | null
  additionalContext: string | null
  sources: string[]
  resolvedSources: unknown[]
  costUsd: number
  responseTimeMs: number | null
  createdAt: string
}

interface ActorResult {
  actorId: number
  actorName: string
  variants: Record<string, VariantResult>
}

interface ComprehensiveTestRunDetailResponse {
  run: TestRun
  results: ActorResult[]
}

export function useComprehensiveTestRunDetail(runId: number) {
  return useQuery<ComprehensiveTestRunDetailResponse>({
    queryKey: ["ab-tests", "comprehensive", runId],
    queryFn: async () => {
      const response = await fetch(`/admin/api/ab-tests/comprehensive/${runId}`, {
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to fetch comprehensive test run details")
      }

      return response.json()
    },
    refetchInterval: (query) => {
      // Auto-refresh every 3 seconds if run is still running
      return query.state.data?.run.status === "running" ? 3000 : false
    },
  })
}
