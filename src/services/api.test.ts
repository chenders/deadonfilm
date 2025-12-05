import { describe, it, expect } from 'vitest'
import { getPosterUrl, getProfileUrl } from './api'

describe('getPosterUrl', () => {
  it('returns full URL for valid poster path', () => {
    expect(getPosterUrl('/abc123.jpg')).toBe('https://image.tmdb.org/t/p/w342/abc123.jpg')
  })

  it('uses default size w342', () => {
    expect(getPosterUrl('/poster.jpg')).toBe('https://image.tmdb.org/t/p/w342/poster.jpg')
  })

  it('supports w92 size', () => {
    expect(getPosterUrl('/poster.jpg', 'w92')).toBe('https://image.tmdb.org/t/p/w92/poster.jpg')
  })

  it('supports w154 size', () => {
    expect(getPosterUrl('/poster.jpg', 'w154')).toBe('https://image.tmdb.org/t/p/w154/poster.jpg')
  })

  it('supports w185 size', () => {
    expect(getPosterUrl('/poster.jpg', 'w185')).toBe('https://image.tmdb.org/t/p/w185/poster.jpg')
  })

  it('supports w500 size', () => {
    expect(getPosterUrl('/poster.jpg', 'w500')).toBe('https://image.tmdb.org/t/p/w500/poster.jpg')
  })

  it('supports original size', () => {
    expect(getPosterUrl('/poster.jpg', 'original')).toBe(
      'https://image.tmdb.org/t/p/original/poster.jpg'
    )
  })

  it('returns null for null poster path', () => {
    expect(getPosterUrl(null)).toBe(null)
  })

  it('returns null for empty poster path', () => {
    expect(getPosterUrl('')).toBe(null)
  })
})

describe('getProfileUrl', () => {
  it('returns full URL for valid profile path', () => {
    expect(getProfileUrl('/profile123.jpg')).toBe('https://image.tmdb.org/t/p/w185/profile123.jpg')
  })

  it('uses default size w185', () => {
    expect(getProfileUrl('/profile.jpg')).toBe('https://image.tmdb.org/t/p/w185/profile.jpg')
  })

  it('supports w45 size', () => {
    expect(getProfileUrl('/profile.jpg', 'w45')).toBe('https://image.tmdb.org/t/p/w45/profile.jpg')
  })

  it('supports h632 size', () => {
    expect(getProfileUrl('/profile.jpg', 'h632')).toBe(
      'https://image.tmdb.org/t/p/h632/profile.jpg'
    )
  })

  it('supports original size', () => {
    expect(getProfileUrl('/profile.jpg', 'original')).toBe(
      'https://image.tmdb.org/t/p/original/profile.jpg'
    )
  })

  it('returns null for null profile path', () => {
    expect(getProfileUrl(null)).toBe(null)
  })

  it('returns null for empty profile path', () => {
    expect(getProfileUrl('')).toBe(null)
  })
})
