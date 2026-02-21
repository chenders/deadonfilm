/**
 * React Query hook for admin rejected notable factors.
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query"
import { adminApi } from "@/services/api"

export interface RejectedFactorActor {
  id: number
  name: string
}

export interface RejectedFactorItem {
  factorName: string
  factorType: "life" | "death"
  occurrenceCount: number
  lastSeen: string
  recentActors: RejectedFactorActor[]
}

export interface RejectedFactorsResponse {
  items: RejectedFactorItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

async function fetchRejectedFactors(
  page: number,
  pageSize: number,
  type?: "life" | "death"
): Promise<RejectedFactorsResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
  })
  if (type) {
    params.set("type", type)
  }

  const response = await fetch(adminApi(`/rejected-factors?${params.toString()}`), {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch rejected factors")
  }

  return response.json()
}

export function useRejectedFactors(
  page: number,
  pageSize: number,
  type?: "life" | "death"
): UseQueryResult<RejectedFactorsResponse> {
  return useQuery({
    queryKey: ["admin", "rejected-factors", page, pageSize, type],
    queryFn: () => fetchRejectedFactors(page, pageSize, type),
    staleTime: 60000,
  })
}
