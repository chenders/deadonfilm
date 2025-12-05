import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useKeyboardNavigation } from './useKeyboardNavigation'
import type { KeyboardEvent } from 'react'

// Helper to create mock keyboard event
function createKeyEvent(key: string): KeyboardEvent {
  return {
    key,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent
}

describe('useKeyboardNavigation', () => {
  const items = ['item1', 'item2', 'item3']

  it('initializes with selectedIndex -1', () => {
    const onSelect = vi.fn()
    const onEscape = vi.fn()

    const { result } = renderHook(() =>
      useKeyboardNavigation({
        items,
        isOpen: true,
        onSelect,
        onEscape,
      })
    )

    expect(result.current.selectedIndex).toBe(-1)
  })

  it('navigates down with ArrowDown', () => {
    const onSelect = vi.fn()
    const onEscape = vi.fn()

    const { result } = renderHook(() =>
      useKeyboardNavigation({
        items,
        isOpen: true,
        onSelect,
        onEscape,
      })
    )

    act(() => {
      result.current.handleKeyDown(createKeyEvent('ArrowDown'))
    })
    expect(result.current.selectedIndex).toBe(0)

    act(() => {
      result.current.handleKeyDown(createKeyEvent('ArrowDown'))
    })
    expect(result.current.selectedIndex).toBe(1)

    act(() => {
      result.current.handleKeyDown(createKeyEvent('ArrowDown'))
    })
    expect(result.current.selectedIndex).toBe(2)
  })

  it('does not go past last item', () => {
    const onSelect = vi.fn()
    const onEscape = vi.fn()

    const { result } = renderHook(() =>
      useKeyboardNavigation({
        items,
        isOpen: true,
        onSelect,
        onEscape,
      })
    )

    // Navigate to last item
    act(() => {
      result.current.handleKeyDown(createKeyEvent('ArrowDown'))
      result.current.handleKeyDown(createKeyEvent('ArrowDown'))
      result.current.handleKeyDown(createKeyEvent('ArrowDown'))
    })
    expect(result.current.selectedIndex).toBe(2)

    // Try to go past
    act(() => {
      result.current.handleKeyDown(createKeyEvent('ArrowDown'))
    })
    expect(result.current.selectedIndex).toBe(2)
  })

  it('navigates up with ArrowUp', () => {
    const onSelect = vi.fn()
    const onEscape = vi.fn()

    const { result } = renderHook(() =>
      useKeyboardNavigation({
        items,
        isOpen: true,
        onSelect,
        onEscape,
      })
    )

    // First go down to item 2
    act(() => {
      result.current.handleKeyDown(createKeyEvent('ArrowDown'))
      result.current.handleKeyDown(createKeyEvent('ArrowDown'))
      result.current.handleKeyDown(createKeyEvent('ArrowDown'))
    })
    expect(result.current.selectedIndex).toBe(2)

    // Now go up
    act(() => {
      result.current.handleKeyDown(createKeyEvent('ArrowUp'))
    })
    expect(result.current.selectedIndex).toBe(1)

    act(() => {
      result.current.handleKeyDown(createKeyEvent('ArrowUp'))
    })
    expect(result.current.selectedIndex).toBe(0)
  })

  it('does not go below 0', () => {
    const onSelect = vi.fn()
    const onEscape = vi.fn()

    const { result } = renderHook(() =>
      useKeyboardNavigation({
        items,
        isOpen: true,
        onSelect,
        onEscape,
      })
    )

    // Start at 0
    act(() => {
      result.current.handleKeyDown(createKeyEvent('ArrowDown'))
    })
    expect(result.current.selectedIndex).toBe(0)

    // Try to go up
    act(() => {
      result.current.handleKeyDown(createKeyEvent('ArrowUp'))
    })
    expect(result.current.selectedIndex).toBe(0)
  })

  it('selects item on Enter', () => {
    const onSelect = vi.fn()
    const onEscape = vi.fn()

    const { result } = renderHook(() =>
      useKeyboardNavigation({
        items,
        isOpen: true,
        onSelect,
        onEscape,
      })
    )

    // Navigate to item 1
    act(() => {
      result.current.handleKeyDown(createKeyEvent('ArrowDown'))
      result.current.handleKeyDown(createKeyEvent('ArrowDown'))
    })
    expect(result.current.selectedIndex).toBe(1)

    // Press Enter
    act(() => {
      result.current.handleKeyDown(createKeyEvent('Enter'))
    })

    expect(onSelect).toHaveBeenCalledWith('item2')
  })

  it('does not select on Enter when nothing selected', () => {
    const onSelect = vi.fn()
    const onEscape = vi.fn()

    const { result } = renderHook(() =>
      useKeyboardNavigation({
        items,
        isOpen: true,
        onSelect,
        onEscape,
      })
    )

    // Press Enter without selecting
    act(() => {
      result.current.handleKeyDown(createKeyEvent('Enter'))
    })

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('calls onEscape on Escape', () => {
    const onSelect = vi.fn()
    const onEscape = vi.fn()

    const { result } = renderHook(() =>
      useKeyboardNavigation({
        items,
        isOpen: true,
        onSelect,
        onEscape,
      })
    )

    act(() => {
      result.current.handleKeyDown(createKeyEvent('Escape'))
    })

    expect(onEscape).toHaveBeenCalled()
  })

  it('calls onEscape on Tab', () => {
    const onSelect = vi.fn()
    const onEscape = vi.fn()

    const { result } = renderHook(() =>
      useKeyboardNavigation({
        items,
        isOpen: true,
        onSelect,
        onEscape,
      })
    )

    act(() => {
      result.current.handleKeyDown(createKeyEvent('Tab'))
    })

    expect(onEscape).toHaveBeenCalled()
  })

  it('does nothing when not open', () => {
    const onSelect = vi.fn()
    const onEscape = vi.fn()

    const { result } = renderHook(() =>
      useKeyboardNavigation({
        items,
        isOpen: false,
        onSelect,
        onEscape,
      })
    )

    act(() => {
      result.current.handleKeyDown(createKeyEvent('ArrowDown'))
    })

    expect(result.current.selectedIndex).toBe(-1)
  })

  it('does nothing when items are empty', () => {
    const onSelect = vi.fn()
    const onEscape = vi.fn()

    const { result } = renderHook(() =>
      useKeyboardNavigation({
        items: [],
        isOpen: true,
        onSelect,
        onEscape,
      })
    )

    act(() => {
      result.current.handleKeyDown(createKeyEvent('ArrowDown'))
    })

    expect(result.current.selectedIndex).toBe(-1)
  })

  it('resets selection when items change', () => {
    const onSelect = vi.fn()
    const onEscape = vi.fn()

    const { result, rerender } = renderHook(
      ({ items }) =>
        useKeyboardNavigation({
          items,
          isOpen: true,
          onSelect,
          onEscape,
        }),
      { initialProps: { items } }
    )

    // Select an item
    act(() => {
      result.current.handleKeyDown(createKeyEvent('ArrowDown'))
      result.current.handleKeyDown(createKeyEvent('ArrowDown'))
    })
    expect(result.current.selectedIndex).toBe(1)

    // Change items
    rerender({ items: ['new1', 'new2'] })

    // Selection should reset
    expect(result.current.selectedIndex).toBe(-1)
  })

  it('resets selection when closed', () => {
    const onSelect = vi.fn()
    const onEscape = vi.fn()

    const { result, rerender } = renderHook(
      ({ isOpen }) =>
        useKeyboardNavigation({
          items,
          isOpen,
          onSelect,
          onEscape,
        }),
      { initialProps: { isOpen: true } }
    )

    // Select an item
    act(() => {
      result.current.handleKeyDown(createKeyEvent('ArrowDown'))
    })
    expect(result.current.selectedIndex).toBe(0)

    // Close dropdown
    rerender({ isOpen: false })

    // Selection should reset
    expect(result.current.selectedIndex).toBe(-1)
  })

  it('prevents default on navigation keys', () => {
    const onSelect = vi.fn()
    const onEscape = vi.fn()

    const { result } = renderHook(() =>
      useKeyboardNavigation({
        items,
        isOpen: true,
        onSelect,
        onEscape,
      })
    )

    const downEvent = createKeyEvent('ArrowDown')
    act(() => {
      result.current.handleKeyDown(downEvent)
    })
    expect(downEvent.preventDefault).toHaveBeenCalled()

    const upEvent = createKeyEvent('ArrowUp')
    act(() => {
      result.current.handleKeyDown(upEvent)
    })
    expect(upEvent.preventDefault).toHaveBeenCalled()

    const enterEvent = createKeyEvent('Enter')
    act(() => {
      result.current.handleKeyDown(enterEvent)
    })
    expect(enterEvent.preventDefault).toHaveBeenCalled()
  })
})
