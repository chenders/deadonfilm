import { useState, useCallback, useEffect } from "react"

interface Options<T> {
  items: T[]
  isOpen: boolean
  onSelect: (item: T) => void
  onEscape: () => void
}

export function useKeyboardNavigation<T>({ items, isOpen, onSelect, onEscape }: Options<T>) {
  const [selectedIndex, setSelectedIndex] = useState(-1)

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(-1)
  }, [items])

  // Reset when closed
  useEffect(() => {
    if (!isOpen) {
      setSelectedIndex(-1)
    }
  }, [isOpen])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || items.length === 0) return

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : prev))
          break
        case "ArrowUp":
          e.preventDefault()
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev))
          break
        case "Enter":
          e.preventDefault()
          if (selectedIndex >= 0 && items[selectedIndex]) {
            onSelect(items[selectedIndex])
          }
          break
        case "Escape":
          e.preventDefault()
          onEscape()
          break
        case "Tab":
          // Allow Tab to close dropdown naturally
          onEscape()
          break
      }
    },
    [items, isOpen, selectedIndex, onSelect, onEscape]
  )

  return { selectedIndex, handleKeyDown, setSelectedIndex }
}
