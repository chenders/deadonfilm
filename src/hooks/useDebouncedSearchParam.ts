import { useState, useEffect } from "react"
import { useSearchParams } from "react-router-dom"

interface UseDebouncedSearchParamOptions {
  paramName?: string
  debounceMs?: number
  resetPageOnChange?: boolean
}

/**
 * Hook for managing a debounced search input that syncs with URL parameters.
 *
 * Features:
 * - Local state for immediate input feedback
 * - Debounced URL updates (default 300ms)
 * - Syncs with browser back/forward navigation
 * - Optionally resets pagination when search changes
 *
 * @param options Configuration options
 * @returns [inputValue, setInputValue, debouncedValue] - local input state, setter, and URL-synced value
 */
export function useDebouncedSearchParam(
  options: UseDebouncedSearchParamOptions = {}
): [string, (value: string) => void, string] {
  const { paramName = "search", debounceMs = 300, resetPageOnChange = true } = options

  const [searchParams, setSearchParams] = useSearchParams()
  const urlValue = searchParams.get(paramName) || ""

  // Local state for immediate input feedback
  const [inputValue, setInputValue] = useState(urlValue)

  // Sync local state when URL changes (e.g., browser back/forward)
  useEffect(() => {
    setInputValue(urlValue)
  }, [urlValue])

  // Debounce input - update URL after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputValue !== urlValue) {
        const newParams = new URLSearchParams(searchParams)
        if (inputValue) {
          newParams.set(paramName, inputValue)
        } else {
          newParams.delete(paramName)
        }
        if (resetPageOnChange) {
          newParams.delete("page")
        }
        setSearchParams(newParams)
      }
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [
    inputValue,
    urlValue,
    searchParams,
    setSearchParams,
    paramName,
    debounceMs,
    resetPageOnChange,
  ])

  return [inputValue, setInputValue, urlValue]
}
