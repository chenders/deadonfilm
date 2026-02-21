import { QueryClient } from "@tanstack/react-query"

/**
 * Shared QueryClient factory used by both client and server entry points.
 * staleTime is set to 60s so data prefetched on the server isn't immediately
 * refetched on the client during hydration.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: 1,
      },
    },
  })
}
