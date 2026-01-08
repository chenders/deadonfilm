import { lazy, ComponentType } from "react"

type ComponentImport<T> = () => Promise<{ default: T }>

/**
 * A wrapper around React.lazy that handles chunk loading failures gracefully.
 *
 * When a new build is deployed, the hashed chunk filenames change. Users with
 * cached bundles will try to load chunks that no longer exist, causing 404s.
 * This wrapper catches those errors and triggers a page reload to get fresh assets.
 *
 * To prevent infinite reload loops, we track reload attempts in sessionStorage.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  componentImport: ComponentImport<T>
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    const storageKey = "chunk_reload_count"
    const maxRetries = 1

    // Get current reload count for this session
    const reloadCount = parseInt(sessionStorage.getItem(storageKey) || "0", 10)

    try {
      const component = await componentImport()
      // Success - reset the reload counter
      sessionStorage.removeItem(storageKey)
      return component
    } catch (error) {
      // Check if this is a chunk loading error
      const isChunkLoadError =
        error instanceof Error &&
        (error.message.includes("Failed to fetch dynamically imported module") ||
          error.message.includes("Loading chunk") ||
          error.message.includes("ChunkLoadError") ||
          error.name === "ChunkLoadError")

      if (isChunkLoadError && reloadCount < maxRetries) {
        // Increment reload count and refresh
        sessionStorage.setItem(storageKey, String(reloadCount + 1))
        window.location.reload()

        // Return a never-resolving promise since we're reloading
        return new Promise(() => {})
      }

      // Either not a chunk error, or we've already retried - throw the error
      throw error
    }
  })
}
