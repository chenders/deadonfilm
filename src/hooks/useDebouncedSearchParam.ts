import { useState, useEffect, useRef, useCallback } from "react"
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

  // Use ref to store the latest searchParams to avoid dependency issues
  // searchParams from useSearchParams can be a new object on every render
  const searchParamsRef = useRef(searchParams)
  searchParamsRef.current = searchParams

  // Sync local state when URL changes (e.g., browser back/forward)
  useEffect(() => {
    setInputValue(urlValue)
  }, [urlValue])

  // Memoized update function to avoid unnecessary effect re-runs
  const updateUrl = useCallback(
    (value: string) => {
      const newParams = new URLSearchParams(searchParamsRef.current)
      if (value) {
        newParams.set(paramName, value)
      } else {
        newParams.delete(paramName)
      }
      if (resetPageOnChange) {
        newParams.delete("page")
      }
      setSearchParams(newParams)
    },
    [paramName, resetPageOnChange, setSearchParams]
  )

  // Debounce input - update URL after user stops typing
  useEffect(() => {
    // Only set up debounce if input differs from URL
    if (inputValue === urlValue) {
      return
    }

    const timer = setTimeout(() => {
      updateUrl(inputValue)
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [inputValue, urlValue, debounceMs, updateUrl])

  return [inputValue, setInputValue, urlValue]
}
