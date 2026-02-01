import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useActorForEditing, useUpdateActor, useActorEditor } from "./useActorEditor"

const mockActorData = {
  actor: {
    id: 123,
    tmdb_id: 456,
    name: "John Wayne",
    birthday: "1907-05-26",
    deathday: "1979-06-11",
    cause_of_death: "Stomach cancer",
    profile_path: "/path.jpg",
    is_obscure: false,
  },
  circumstances: {
    id: 1,
    actor_id: 123,
    circumstances: "Died peacefully",
    circumstances_confidence: "high",
  },
  dataQualityIssues: [],
  recentHistory: [],
  editableFields: {
    actor: ["name", "birthday", "deathday", "cause_of_death"],
    circumstances: ["circumstances"],
  },
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe("useActorEditor hooks", () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("fetch", mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("useActorForEditing", () => {
    it("should fetch actor data successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockActorData),
      })

      const { result } = renderHook(() => useActorForEditing(123), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data?.actor.name).toBe("John Wayne")
      expect(result.current.data?.circumstances?.circumstances).toBe("Died peacefully")
      expect(mockFetch).toHaveBeenCalledWith("/admin/api/actors/123", expect.any(Object))
    })

    it("should not fetch when actorId is undefined", () => {
      const { result } = renderHook(() => useActorForEditing(undefined), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(false)
      expect(result.current.fetchStatus).toBe("idle")
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("should handle fetch errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: { message: "Actor not found" } }),
      })

      const { result } = renderHook(() => useActorForEditing(999), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toBe("Actor not found")
    })
  })

  describe("useUpdateActor", () => {
    it("should update actor successfully", async () => {
      const updateResponse = {
        success: true,
        snapshotId: 1,
        batchId: "test-batch",
        changes: [{ table: "actors", field: "cause_of_death", oldValue: "Old", newValue: "New" }],
        actor: { ...mockActorData.actor, cause_of_death: "Lung cancer" },
        circumstances: mockActorData.circumstances,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(updateResponse),
      })

      const { result } = renderHook(() => useUpdateActor(123), {
        wrapper: createWrapper(),
      })

      result.current.mutate({ actor: { cause_of_death: "Lung cancer" } })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data?.success).toBe(true)
      expect(result.current.data?.snapshotId).toBe(1)
      expect(mockFetch).toHaveBeenCalledWith(
        "/admin/api/actors/123",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ actor: { cause_of_death: "Lung cancer" } }),
        })
      )
    })

    it("should handle update errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: { message: "Cannot update non-editable fields" } }),
      })

      const { result } = renderHook(() => useUpdateActor(123), {
        wrapper: createWrapper(),
      })

      result.current.mutate({ actor: { tmdb_popularity: 99 } })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toBe("Cannot update non-editable fields")
    })
  })

  describe("useActorEditor", () => {
    it("should provide combined state and methods", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockActorData),
      })

      const { result } = renderHook(() => useActorEditor(123), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.actor?.name).toBe("John Wayne")
      expect(result.current.circumstances?.circumstances).toBe("Died peacefully")
      expect(result.current.dataQualityIssues).toEqual([])
      expect(result.current.editableFields.actor).toContain("name")
      expect(typeof result.current.updateActor).toBe("function")
      expect(typeof result.current.refetch).toBe("function")
    })

    it("should return empty arrays for missing data", () => {
      const { result } = renderHook(() => useActorEditor(undefined), {
        wrapper: createWrapper(),
      })

      expect(result.current.dataQualityIssues).toEqual([])
      expect(result.current.recentHistory).toEqual([])
      expect(result.current.editableFields).toEqual({ actor: [], circumstances: [] })
    })
  })
})
