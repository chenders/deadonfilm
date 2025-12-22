import crypto from "crypto"
import type { Response, Request } from "express"

/**
 * Generate an ETag from response data using MD5 hash.
 * The hash is wrapped in quotes as per HTTP spec.
 */
export function generateETag(data: unknown): string {
  const hash = crypto.createHash("md5").update(JSON.stringify(data)).digest("hex")
  return `"${hash}"`
}

/**
 * Check if client's cached version matches the current ETag.
 * Returns true if the If-None-Match header matches the ETag.
 */
export function isNotModified(req: Request, etag: string): boolean {
  const ifNoneMatch = req.get("If-None-Match")
  return ifNoneMatch === etag
}

/**
 * Send JSON response with ETag and Cache-Control headers.
 * Returns 304 Not Modified if the client's cached version is still valid.
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param data - Response data to send as JSON
 * @param maxAge - Cache duration in seconds (default: 60)
 */
export function sendWithETag(
  req: Request,
  res: Response,
  data: unknown,
  maxAge: number = 60
): void {
  const etag = generateETag(data)

  if (isNotModified(req, etag)) {
    res.status(304).end()
    return
  }

  res.set("ETag", etag)
  res.set("Cache-Control", `public, max-age=${maxAge}`)
  res.json(data)
}
