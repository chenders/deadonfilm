import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { QueryClientProvider, HydrationBoundary, type DehydratedState } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import { createQueryClient } from "./query-client"
import App from "./App"
import "./index.css"

declare global {
  interface Window {
    __REACT_QUERY_STATE__?: DehydratedState
  }
}

const queryClient = createQueryClient()

// Read dehydrated React Query state from SSR, if present
const dehydratedState = window.__REACT_QUERY_STATE__

const rootEl = document.getElementById("root")!

// Detect real SSR content — the raw template placeholder <!--app-html--> doesn't count
const rootHtml = rootEl.innerHTML.trim()
const hasSSRContent = rootHtml.length > 0 && rootHtml !== "<!--app-html-->"

// If the root has SSR content, hydrate; otherwise do a full client render
if (hasSSRContent) {
  ReactDOM.hydrateRoot(
    rootEl,
    <React.StrictMode>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <HydrationBoundary state={dehydratedState}>
            <BrowserRouter
              future={{
                v7_startTransition: true,
                v7_relativeSplatPath: true,
              }}
            >
              <App />
            </BrowserRouter>
          </HydrationBoundary>
        </QueryClientProvider>
      </HelmetProvider>
    </React.StrictMode>
  )
} else {
  // Fallback: no SSR content (dev mode or SSR failure) — full client render
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </HelmetProvider>
    </React.StrictMode>
  )
}
