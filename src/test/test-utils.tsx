import { BrowserRouter, MemoryRouter, MemoryRouterProps } from "react-router-dom"

const futureFlags = { v7_startTransition: true, v7_relativeSplatPath: true }

/**
 * Test wrapper for BrowserRouter with React Router v7 future flags enabled.
 * Use this instead of BrowserRouter directly in tests to avoid future flag warnings.
 */
export function TestRouter({ children }: { children: React.ReactNode }) {
  return <BrowserRouter future={futureFlags}>{children}</BrowserRouter>
}

/**
 * Test wrapper for MemoryRouter with React Router v7 future flags enabled.
 * Use this instead of MemoryRouter directly in tests to avoid future flag warnings.
 * Accepts all MemoryRouterProps for flexibility.
 */
export function TestMemoryRouter({
  children,
  ...routerProps
}: MemoryRouterProps & { children: React.ReactNode }) {
  return (
    <MemoryRouter future={futureFlags} {...routerProps}>
      {children}
    </MemoryRouter>
  )
}
