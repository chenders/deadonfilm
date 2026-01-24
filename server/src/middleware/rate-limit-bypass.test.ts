import { describe, it, expect, beforeEach } from "vitest"
import { Request } from "express"
import { skipRateLimitForAdmin } from "./rate-limit-utils.js"

describe("skipRateLimitForAdmin", () => {
  let mockReq: Partial<Request>

  beforeEach(() => {
    mockReq = {}
  })

  it("returns true when isAdmin is true", () => {
    mockReq.isAdmin = true

    const result = skipRateLimitForAdmin(mockReq as Request)

    expect(result).toBe(true)
  })

  it("returns false when isAdmin is false", () => {
    mockReq.isAdmin = false

    const result = skipRateLimitForAdmin(mockReq as Request)

    expect(result).toBe(false)
  })

  it("returns false when isAdmin is undefined", () => {
    mockReq.isAdmin = undefined

    const result = skipRateLimitForAdmin(mockReq as Request)

    expect(result).toBe(false)
  })

  it("returns false when isAdmin property is not set", () => {
    const result = skipRateLimitForAdmin(mockReq as Request)

    expect(result).toBe(false)
  })
})
