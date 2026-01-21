import { describe, it, expect, beforeEach, vi } from "vitest"
import { hashPassword, verifyPassword, generateToken, verifyToken } from "./admin-auth.js"

describe("admin-auth", () => {
  describe("hashPassword", () => {
    it("should hash a password", async () => {
      const password = "test-password"
      const hash = await hashPassword(password)

      expect(hash).toBeTruthy()
      expect(hash).not.toBe(password)
      expect(hash.startsWith("$2b$")).toBe(true) // bcrypt hash format
    })

    it("should generate different hashes for the same password", async () => {
      const password = "test-password"
      const hash1 = await hashPassword(password)
      const hash2 = await hashPassword(password)

      expect(hash1).not.toBe(hash2) // Different salts
    })
  })

  describe("verifyPassword", () => {
    it("should verify a correct password", async () => {
      const password = "test-password"
      const hash = await hashPassword(password)

      const isValid = await verifyPassword(password, hash)
      expect(isValid).toBe(true)
    })

    it("should reject an incorrect password", async () => {
      const password = "test-password"
      const hash = await hashPassword(password)

      const isValid = await verifyPassword("wrong-password", hash)
      expect(isValid).toBe(false)
    })
  })

  describe("generateToken", () => {
    beforeEach(() => {
      process.env.JWT_SECRET = "test-secret"
    })

    it("should generate a JWT token", () => {
      const token = generateToken()

      expect(token).toBeTruthy()
      expect(typeof token).toBe("string")
      expect(token.split(".").length).toBe(3) // JWT format: header.payload.signature
    })

    it("should throw error if JWT_SECRET not set", () => {
      delete process.env.JWT_SECRET

      expect(() => generateToken()).toThrow("JWT_SECRET environment variable not set")
    })

    it("should generate tokens with isAdmin: true", () => {
      const token = generateToken()
      const [, payloadBase64] = token.split(".")
      const payload = JSON.parse(Buffer.from(payloadBase64, "base64").toString())

      expect(payload.isAdmin).toBe(true)
    })
  })

  describe("verifyToken", () => {
    beforeEach(() => {
      process.env.JWT_SECRET = "test-secret"
    })

    it("should verify a valid token", () => {
      const token = generateToken()
      const decoded = verifyToken(token)

      expect(decoded).toBeTruthy()
      expect(decoded?.isAdmin).toBe(true)
      expect(decoded?.iat).toBeTruthy()
      expect(decoded?.exp).toBeTruthy()
    })

    it("should reject an invalid token", () => {
      const decoded = verifyToken("invalid.token.here")

      expect(decoded).toBe(null)
    })

    it("should reject a token with wrong secret", () => {
      const token = generateToken()

      process.env.JWT_SECRET = "different-secret"
      const decoded = verifyToken(token)

      expect(decoded).toBe(null)
    })

    it("should return null if JWT_SECRET not set", () => {
      const token = generateToken()
      delete process.env.JWT_SECRET

      const decoded = verifyToken(token)

      expect(decoded).toBe(null)
    })
  })
})
