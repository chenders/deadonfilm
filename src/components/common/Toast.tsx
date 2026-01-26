import { useEffect, useState } from "react"
import { Toast as ToastType, ToastType as ToastVariant } from "../../contexts/ToastContext"

interface ToastProps {
  toast: ToastType
  onDismiss: (id: string) => void
}

const iconMap: Record<ToastVariant, string> = {
  success: "✓",
  error: "✕",
  warning: "⚠",
  info: "ℹ",
}

const styleMap: Record<ToastVariant, string> = {
  success: "bg-green-600 border-green-500",
  error: "bg-red-600 border-red-500",
  warning: "bg-yellow-600 border-yellow-500",
  info: "bg-blue-600 border-blue-500",
}

export default function Toast({ toast, onDismiss }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false)
  const [isEntering, setIsEntering] = useState(true)

  useEffect(() => {
    // Remove entering state after animation
    const enterTimeout = setTimeout(() => setIsEntering(false), 50)

    // Auto-dismiss after duration
    const dismissTimeout = setTimeout(() => {
      setIsExiting(true)
      setTimeout(() => onDismiss(toast.id), 300)
    }, toast.duration)

    return () => {
      clearTimeout(enterTimeout)
      clearTimeout(dismissTimeout)
    }
  }, [toast.id, toast.duration, onDismiss])

  const handleDismiss = () => {
    setIsExiting(true)
    setTimeout(() => onDismiss(toast.id), 300)
  }

  return (
    <div
      role="alert"
      className={`
        flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg
        transition-all duration-300 ease-out
        ${styleMap[toast.type]}
        ${isEntering ? "translate-x-full opacity-0" : "translate-x-0 opacity-100"}
        ${isExiting ? "translate-x-full opacity-0" : ""}
      `}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-sm font-bold text-white">
        {iconMap[toast.type]}
      </span>
      <span className="flex-1 text-sm font-medium text-white">{toast.message}</span>
      <button
        onClick={handleDismiss}
        className="ml-2 rounded p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
        aria-label="Dismiss notification"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  )
}
