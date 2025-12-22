import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"
import { generateETag, isNotModified, sendWithETag } from "./etag.js"

describe("etag", () => {
  describe("generateETag", () => {
    it("generates consistent hash for same data", () => {
      const data = { foo: "bar", count: 42 }
      const etag1 = generateETag(data)
      const etag2 = generateETag(data)
      expect(etag1).toBe(etag2)
    })

    it("generates different hash for different data", () => {
      const etag1 = generateETag({ foo: "bar" })
      const etag2 = generateETag({ foo: "baz" })
      expect(etag1).not.toBe(etag2)
    })

    it("wraps hash in quotes per HTTP spec", () => {
      const etag = generateETag({ test: true })
      expect(etag).toMatch(/^"[a-f0-9]{32}"$/)
    })

    it("handles arrays", () => {
      const etag = generateETag([1, 2, 3])
      expect(etag).toMatch(/^"[a-f0-9]{32}"$/)
    })

    it("handles nested objects", () => {
      const data = { outer: { inner: { deep: "value" } } }
      const etag = generateETag(data)
      expect(etag).toMatch(/^"[a-f0-9]{32}"$/)
    })

    it("handles null", () => {
      const etag = generateETag(null)
      expect(etag).toMatch(/^"[a-f0-9]{32}"$/)
    })
  })

  describe("isNotModified", () => {
    it("returns true when If-None-Match matches ETag", () => {
      const etag = '"abc123"'
      const req = { get: vi.fn().mockReturnValue('"abc123"') } as unknown as Request
      expect(isNotModified(req, etag)).toBe(true)
    })

    it("returns false when If-None-Match does not match", () => {
      const etag = '"abc123"'
      const req = { get: vi.fn().mockReturnValue('"different"') } as unknown as Request
      expect(isNotModified(req, etag)).toBe(false)
    })

    it("returns false when If-None-Match header is missing", () => {
      const etag = '"abc123"'
      const req = { get: vi.fn().mockReturnValue(undefined) } as unknown as Request
      expect(isNotModified(req, etag)).toBe(false)
    })
  })

  describe("sendWithETag", () => {
    let mockReq: Request
    let mockRes: Response

    beforeEach(() => {
      mockReq = {
        get: vi.fn().mockReturnValue(undefined),
      } as unknown as Request

      mockRes = {
        status: vi.fn().mockReturnThis(),
        end: vi.fn(),
        set: vi.fn(),
        json: vi.fn(),
      } as unknown as Response
    })

    it("sends 304 when ETag matches If-None-Match", () => {
      const data = { test: "data" }
      const etag = generateETag(data)
      ;(mockReq.get as ReturnType<typeof vi.fn>).mockReturnValue(etag)

      sendWithETag(mockReq, mockRes, data)

      expect(mockRes.status).toHaveBeenCalledWith(304)
      expect(mockRes.end).toHaveBeenCalled()
      expect(mockRes.json).not.toHaveBeenCalled()
    })

    it("sends JSON with ETag and Cache-Control when no match", () => {
      const data = { test: "data" }

      sendWithETag(mockReq, mockRes, data)

      expect(mockRes.set).toHaveBeenCalledWith("ETag", expect.stringMatching(/^"[a-f0-9]{32}"$/))
      expect(mockRes.set).toHaveBeenCalledWith("Cache-Control", "public, max-age=60")
      expect(mockRes.json).toHaveBeenCalledWith(data)
    })

    it("uses custom maxAge when provided", () => {
      const data = { test: "data" }

      sendWithETag(mockReq, mockRes, data, 300)

      expect(mockRes.set).toHaveBeenCalledWith("Cache-Control", "public, max-age=300")
    })

    it("uses default maxAge of 60 when not provided", () => {
      const data = { test: "data" }

      sendWithETag(mockReq, mockRes, data)

      expect(mockRes.set).toHaveBeenCalledWith("Cache-Control", "public, max-age=60")
    })

    it("handles empty object", () => {
      sendWithETag(mockReq, mockRes, {})

      expect(mockRes.json).toHaveBeenCalledWith({})
      expect(mockRes.set).toHaveBeenCalledWith("ETag", expect.any(String))
    })

    it("handles array data", () => {
      const data = [{ id: 1 }, { id: 2 }]

      sendWithETag(mockReq, mockRes, data)

      expect(mockRes.json).toHaveBeenCalledWith(data)
    })
  })
})
