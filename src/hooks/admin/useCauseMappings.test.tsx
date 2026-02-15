import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

vi.mock("@/services/api", () => ({
  adminApi: (path: string) => `http://test-host/admin/api${path}`,
}))

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

import {
  useMannerMappings,
  useUpdateMannerMapping,
  useNormalizations,
  useUpdateNormalization,
  useCategoryPreview,
} from "./useCauseMappings"

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe("useCauseMappings hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("useMannerMappings", () => {
    it("fetches manner mappings successfully", async () => {
      const mockData = {
        mappings: [
          {
            normalizedCause: "Gunshot wound",
            manner: "homicide",
            source: "manual",
            createdAt: "2026-01-01",
            actorCount: 42,
          },
        ],
        totalMapped: 800,
        totalUnmapped: 2,
      }
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockData) })

      const { result } = renderHook(() => useMannerMappings(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockData)
      expect(mockFetch).toHaveBeenCalledWith(
        "http://test-host/admin/api/cause-mappings/manner",
        expect.objectContaining({ credentials: "include" })
      )
    })

    it("passes search and manner params", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ mappings: [], totalMapped: 0, totalUnmapped: 0 }),
      })

      const { result } = renderHook(() => useMannerMappings("cancer", "natural"), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("search=cancer"),
        expect.anything()
      )
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("manner=natural"),
        expect.anything()
      )
    })

    it("handles fetch error", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false })

      const { result } = renderHook(() => useMannerMappings(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeInstanceOf(Error)
    })
  })

  describe("useUpdateMannerMapping", () => {
    it("sends PUT request with manner update", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      const { result } = renderHook(() => useUpdateMannerMapping(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({ cause: "Gunshot wound", manner: "suicide" })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/manner/Gunshot%20wound"),
        expect.objectContaining({ method: "PUT" })
      )
    })
  })

  describe("useNormalizations", () => {
    it("fetches normalizations successfully", async () => {
      const mockData = {
        normalizations: [
          { originalCause: "lung cancer", normalizedCause: "Lung cancer", actorCount: 45 },
        ],
        total: 1,
      }
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockData) })

      const { result } = renderHook(() => useNormalizations(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockData)
    })
  })

  describe("useUpdateNormalization", () => {
    it("sends PUT request with normalization update", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      const { result } = renderHook(() => useUpdateNormalization(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({ originalCause: "lung cancer", normalizedCause: "Lung cancer" })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/normalizations/lung%20cancer"),
        expect.objectContaining({ method: "PUT" })
      )
    })
  })

  describe("useCategoryPreview", () => {
    it("fetches preview data", async () => {
      const mockData = {
        entries: [],
        summary: { totalCauses: 100, changedCauses: 0, totalActorsAffected: 0, movements: {} },
      }
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockData) })

      const { result } = renderHook(() => useCategoryPreview(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockData)
    })

    it("passes changesOnly param", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            entries: [],
            summary: { totalCauses: 0, changedCauses: 0, totalActorsAffected: 0, movements: {} },
          }),
      })

      const { result } = renderHook(() => useCategoryPreview(true), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("changesOnly=true"),
        expect.anything()
      )
    })
  })
})
