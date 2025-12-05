import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebouncedValue } from './useDebouncedValue'

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('initial', 500))
    expect(result.current).toBe('initial')
  })

  it('does not update value before delay', () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebouncedValue(value, delay), {
      initialProps: { value: 'initial', delay: 500 },
    })

    rerender({ value: 'updated', delay: 500 })

    // Advance time but not enough
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(result.current).toBe('initial')
  })

  it('updates value after delay', () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebouncedValue(value, delay), {
      initialProps: { value: 'initial', delay: 500 },
    })

    rerender({ value: 'updated', delay: 500 })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(result.current).toBe('updated')
  })

  it('resets timer on rapid changes', () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebouncedValue(value, delay), {
      initialProps: { value: 'a', delay: 300 },
    })

    // Rapid changes
    rerender({ value: 'b', delay: 300 })
    act(() => {
      vi.advanceTimersByTime(100)
    })

    rerender({ value: 'c', delay: 300 })
    act(() => {
      vi.advanceTimersByTime(100)
    })

    rerender({ value: 'd', delay: 300 })
    act(() => {
      vi.advanceTimersByTime(100)
    })

    // Still should be 'a' because timer keeps resetting
    expect(result.current).toBe('a')

    // Wait for full delay
    act(() => {
      vi.advanceTimersByTime(300)
    })

    // Now should be the final value
    expect(result.current).toBe('d')
  })

  it('works with different delay values', () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebouncedValue(value, delay), {
      initialProps: { value: 'start', delay: 1000 },
    })

    rerender({ value: 'end', delay: 1000 })

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current).toBe('start')

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current).toBe('end')
  })

  it('works with number values', () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebouncedValue(value, delay), {
      initialProps: { value: 0, delay: 100 },
    })

    rerender({ value: 42, delay: 100 })

    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(result.current).toBe(42)
  })

  it('works with object values', () => {
    const initialObj = { foo: 'bar' }
    const updatedObj = { foo: 'baz' }

    const { result, rerender } = renderHook(({ value, delay }) => useDebouncedValue(value, delay), {
      initialProps: { value: initialObj, delay: 200 },
    })

    rerender({ value: updatedObj, delay: 200 })

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(result.current).toEqual(updatedObj)
  })
})
