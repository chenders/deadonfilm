import { useCallback } from "react"
import { useSearchParams } from "react-router-dom"

/**
 * Hook to sync active tab state with the `?tab=` URL search parameter.
 *
 * @param defaultTab - The tab ID to use when no `?tab=` param is present
 * @param paramName - The search param name (default: "tab")
 * @returns Tuple of [activeTab, setActiveTab]
 */
export function useTabParam<T extends string>(
  defaultTab: T,
  paramName = "tab"
): [T, (tab: T) => void] {
  const [searchParams, setSearchParams] = useSearchParams()

  const activeTab = (searchParams.get(paramName) as T) || defaultTab

  const setActiveTab = useCallback(
    (tab: T) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (tab === defaultTab) {
            next.delete(paramName)
          } else {
            next.set(paramName, tab)
          }
          return next
        },
        { replace: true }
      )
    },
    [defaultTab, paramName, setSearchParams]
  )

  return [activeTab, setActiveTab]
}
