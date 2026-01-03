import { useQuery } from "@tanstack/react-query"
import {
  getCauseCategoryIndex,
  getCauseCategoryDetail,
  getSpecificCauseDetail,
  type CauseCategoryParams,
  type SpecificCauseParams,
} from "@/services/api"

/**
 * Hook for fetching the causes of death category index
 */
export function useCauseCategoryIndex() {
  return useQuery({
    queryKey: ["causes-of-death-index"],
    queryFn: getCauseCategoryIndex,
    staleTime: 60 * 60 * 1000, // 1 hour - categories change rarely
  })
}

/**
 * Hook for fetching a specific cause category's details
 */
export function useCauseCategoryDetail(categorySlug: string, options: CauseCategoryParams = {}) {
  const { page = 1, includeObscure = false, specificCause } = options

  return useQuery({
    queryKey: ["causes-of-death-category", categorySlug, page, includeObscure, specificCause],
    queryFn: () => getCauseCategoryDetail(categorySlug, { page, includeObscure, specificCause }),
    staleTime: 10 * 60 * 1000, // 10 minutes
    enabled: !!categorySlug,
  })
}

/**
 * Hook for fetching a specific cause detail within a category
 */
export function useSpecificCauseDetail(
  categorySlug: string,
  causeSlug: string,
  options: SpecificCauseParams = {}
) {
  const { page = 1, includeObscure = false } = options

  return useQuery({
    queryKey: ["specific-cause", categorySlug, causeSlug, page, includeObscure],
    queryFn: () => getSpecificCauseDetail(categorySlug, causeSlug, { page, includeObscure }),
    staleTime: 10 * 60 * 1000, // 10 minutes
    enabled: !!categorySlug && !!causeSlug,
  })
}
