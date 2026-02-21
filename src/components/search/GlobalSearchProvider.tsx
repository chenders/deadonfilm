import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react"
import { createPortal } from "react-dom"
import SearchModal from "./SearchModal"

interface GlobalSearchContextValue {
  isOpen: boolean
  openSearch: () => void
  closeSearch: () => void
}

const GlobalSearchContext = createContext<GlobalSearchContextValue | null>(null)

export function useGlobalSearch() {
  const context = useContext(GlobalSearchContext)
  if (!context) {
    throw new Error("useGlobalSearch must be used within GlobalSearchProvider")
  }
  return context
}

interface GlobalSearchProviderProps {
  children: ReactNode
}

export function GlobalSearchProvider({ children }: GlobalSearchProviderProps) {
  const [isOpen, setIsOpen] = useState(false)

  const openSearch = useCallback(() => setIsOpen(true), [])
  const closeSearch = useCallback(() => setIsOpen(false), [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setIsOpen((prev) => !prev)
        return
      }

      // "/" key when not in an input or textarea
      if (e.key === "/" && !isOpen) {
        const target = e.target as HTMLElement | null
        if (!target) {
          e.preventDefault()
          setIsOpen(true)
          return
        }

        const tagName = target.tagName?.toLowerCase() ?? ""
        const isEditable = target.isContentEditable
        const isInput = tagName === "input" || tagName === "textarea"

        if (!isEditable && !isInput) {
          e.preventDefault()
          setIsOpen(true)
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen])

  const value: GlobalSearchContextValue = {
    isOpen,
    openSearch,
    closeSearch,
  }

  return (
    <GlobalSearchContext.Provider value={value}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(<SearchModal isOpen={isOpen} onClose={closeSearch} />, document.body)}
    </GlobalSearchContext.Provider>
  )
}
