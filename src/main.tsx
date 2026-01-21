import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HelmetProvider } from "react-helmet-async"
import App from "./App"
import "./index.css"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0, // Always refetch - server Redis cache handles caching
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById("root")!).render(
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
