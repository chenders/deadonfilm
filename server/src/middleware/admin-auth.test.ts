import { describe, it, expect, vi, beforeEach } from "vitest"
import { Request, Response, NextFunction } from "express"
import { adminAuthMiddleware, optionalAdminAuth } from "./admin-auth.js"
import { generateToken } from "../lib/admin-auth.js"

// Mock verifyToken
vi.mock("../lib/admin-auth.js", async () => {
  const actual = await vi.importActual("../lib/admin-auth.js")
  return {
    ...actual,
    verifyToken: vi.fn(),
  }
})

import { verifyToken } from "../lib/admin-auth.js"

describe("admin-auth middleware", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockNext: NextFunction

  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret"
    mockReq = {
      cookies: {},
    }
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    }
    mockNext = vi.fn()
  })

  describe("adminAuthMiddleware", () => {
    it("should set isAdmin flag for valid token", () => {
      const token = "valid-token"
      mockReq.cookies = { adminToken: token }

      vi.mocked(verifyToken).mockReturnValue({ isAdmin: true, iat: 123, exp: 456 })

      adminAuthMiddleware(mockReq as Request, mockRes as Response, mockNext)

      expect(mockReq.isAdmin).toBe(true)
      expect(mockNext).toHaveBeenCalled()
    })

    it("should return 401 if token missing", () => {
      mockReq.cookies = {}

      adminAuthMiddleware(mockReq as Request, mockRes as Response, mockNext)

      expect(mockRes.status).toHaveBeenCalledWith(401)
      expect(mockRes.json).toHaveBeenCalledWith({
        error: { message: "Authentication required" },
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it("should return 401 if token invalid", () => {
      mockReq.cookies = { adminToken: "invalid-token" }

      vi.mocked(verifyToken).mockReturnValue(null)

      adminAuthMiddleware(mockReq as Request, mockRes as Response, mockNext)

      expect(mockRes.status).toHaveBeenCalledWith(401)
      expect(mockRes.json).toHaveBeenCalledWith({
        error: { message: "Invalid authentication token" },
      })
      expect(mockNext).not.toHaveBeenCalled()
    })
  })

  describe("optionalAdminAuth", () => {
    it("should set isAdmin flag if valid token present", () => {
      const token = "valid-token"
      mockReq.cookies = { adminToken: token }

      vi.mocked(verifyToken).mockReturnValue({ isAdmin: true, iat: 123, exp: 456 })

      optionalAdminAuth(mockReq as Request, mockRes as Response, mockNext)

      expect(mockReq.isAdmin).toBe(true)
      expect(mockNext).toHaveBeenCalled()
    })

    it("should not set isAdmin flag if token invalid", () => {
      mockReq.cookies = { adminToken: "invalid-token" }

      vi.mocked(verifyToken).mockReturnValue(null)

      optionalAdminAuth(mockReq as Request, mockRes as Response, mockNext)

      expect(mockReq.isAdmin).toBeUndefined()
      expect(mockNext).toHaveBeenCalled()
    })

    it("should continue without error if no token", () => {
      mockReq.cookies = {}

      optionalAdminAuth(mockReq as Request, mockRes as Response, mockNext)

      expect(mockReq.isAdmin).toBeUndefined()
      expect(mockNext).toHaveBeenCalled()
    })
  })
})
