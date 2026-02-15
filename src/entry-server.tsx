import { renderToPipeableStream, type RenderToPipeableStreamOptions } from "react-dom/server"
import { StaticRouter } from "react-router-dom/server"
import { QueryClientProvider, dehydrate, type QueryClient } from "@tanstack/react-query"
import { HelmetProvider, type HelmetServerState } from "react-helmet-async"
import App from "./App"

export interface SSRRenderResult {
  stream: ReturnType<typeof renderToPipeableStream>
  helmetContext: { helmet?: HelmetServerState }
  getDehydratedState: () => ReturnType<typeof dehydrate>
}

/**
 * Server-side render the app for a given URL.
 *
 * Returns a pipeable stream plus helpers to extract head tags and
 * dehydrated React Query state after rendering completes.
 */
export function render(
  url: string,
  queryClient: QueryClient,
  streamOptions?: RenderToPipeableStreamOptions
): SSRRenderResult {
  const helmetContext: { helmet?: HelmetServerState } = {}

  const stream = renderToPipeableStream(
    <HelmetProvider context={helmetContext}>
      <QueryClientProvider client={queryClient}>
        <StaticRouter location={url}>
          <App />
        </StaticRouter>
      </QueryClientProvider>
    </HelmetProvider>,
    streamOptions
  )

  return {
    stream,
    helmetContext,
    getDehydratedState: () => dehydrate(queryClient),
  }
}

export { createQueryClient } from "./query-client"
