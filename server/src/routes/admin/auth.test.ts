import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Request, Response } from "express"
import { loginHandler, logoutHandler, statusHandler } from "./auth.js"

// Mock dependencies
vi.mock("../../lib/admin-auth.js", () => ({
  verifyPassword: vi.fn(),
  generateToken: vi.fn(),
  logAdminAction: vi.fn(),
}))

import { verifyPassword, generateToken, logAdminAction } from "../../lib/admin-auth.js"

describe("admin auth routes", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let originalNodeEnv: string | undefined

  beforeEach(() => {
    // Save original NODE_ENV
    originalNodeEnv = process.env.NODE_ENV

    mockReq = {
      body: {},
      ip: "127.0.0.1",
      get: vi.fn(),
    }
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    }
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Restore original NODE_ENV
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv
    } else {
      delete process.env.NODE_ENV
    }
  })

  describe("loginHandler", () => {
    it("should return 400 if password missing", async () => {
      mockReq.body = {}

      await loginHandler(mockReq as Request, mockRes as Response)

      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        error: { message: "Password required" },
      })
    })

    it("should return 500 if ADMIN_PASSWORD_HASH not set", async () => {
      delete process.env.ADMIN_PASSWORD_HASH
      mockReq.body = { password: "test-password" }

      await loginHandler(mockReq as Request, mockRes as Response)

      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        error: { message: "Server configuration error" },
      })
    })

    it("should return 401 if password incorrect", async () => {
      process.env.ADMIN_PASSWORD_HASH = "hashed-password"
      mockReq.body = { password: "wrong-password" }

      vi.mocked(verifyPassword).mockResolvedValue(false)

      await loginHandler(mockReq as Request, mockRes as Response)

      expect(mockRes.status).toHaveBeenCalledWith(401)
      expect(mockRes.json).toHaveBeenCalledWith({
        error: { message: "Invalid password" },
      })
      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "login_failed",
        })
      )
    })

    it("should set cookie and return success on valid password", async () => {
      process.env.ADMIN_PASSWORD_HASH = "hashed-password"
      process.env.NODE_ENV = "production"
      mockReq.body = { password: "correct-password" }

      vi.mocked(verifyPassword).mockResolvedValue(true)
      vi.mocked(generateToken).mockReturnValue("jwt-token")

      await loginHandler(mockReq as Request, mockRes as Response)

      expect(mockRes.cookie).toHaveBeenCalledWith(
        "adminToken",
        "jwt-token",
        expect.objectContaining({
          httpOnly: true,
          secure: true,
          sameSite: "strict",
        })
      )
      expect(mockRes.json).toHaveBeenCalledWith({ success: true })
      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "login",
        })
      )
    })
  })

  describe("logoutHandler", () => {
    it("should clear cookie and log action", async () => {
      await logoutHandler(mockReq as Request, mockRes as Response)

      expect(mockRes.clearCookie).toHaveBeenCalledWith("adminToken")
      expect(mockRes.json).toHaveBeenCalledWith({ success: true })
      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "logout",
        })
      )
    })
  })

  describe("statusHandler", () => {
    it("should return authenticated: true if isAdmin flag set", () => {
      mockReq.isAdmin = true

      statusHandler(mockReq as Request, mockRes as Response)

      expect(mockRes.json).toHaveBeenCalledWith({ authenticated: true })
    })

    it("should return authenticated: false if isAdmin flag not set", () => {
      mockReq.isAdmin = false

      statusHandler(mockReq as Request, mockRes as Response)

      expect(mockRes.json).toHaveBeenCalledWith({ authenticated: false })
    })
  })
})
