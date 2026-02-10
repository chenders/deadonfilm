import { useState, useEffect, type ReactNode } from "react"
import { RefreshIcon, CheckCircleIcon } from "@/components/icons"

type ActionState = "idle" | "loading" | "success" | "error"

interface AdminActionButtonProps {
  icon: ReactNode
  label: string
  onClick: () => void
  isPending: boolean
  isSuccess: boolean
  isError: boolean
  title?: string
}

export default function AdminActionButton({
  icon,
  label,
  onClick,
  isPending,
  isSuccess,
  isError,
  title,
}: AdminActionButtonProps) {
  const [state, setState] = useState<ActionState>("idle")

  useEffect(() => {
    if (isPending) {
      setState("loading")
    } else if (isSuccess && state === "loading") {
      setState("success")
      const timer = setTimeout(() => setState("idle"), 2000)
      return () => clearTimeout(timer)
    } else if (isError && state === "loading") {
      setState("error")
      const timer = setTimeout(() => setState("idle"), 3000)
      return () => clearTimeout(timer)
    }
  }, [isPending, isSuccess, isError, state])

  const renderIcon = () => {
    switch (state) {
      case "loading":
        return <RefreshIcon size={14} className="animate-spin" />
      case "success":
        return <CheckCircleIcon size={14} className="text-green-600" />
      case "error":
        return <span className="text-red-600">{icon}</span>
      default:
        return icon
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={state === "loading"}
      title={title || label}
      aria-label={label}
      data-testid={`admin-action-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className="rounded-full p-1.5 text-text-muted transition-colors hover:bg-beige hover:text-brown-dark disabled:cursor-wait disabled:opacity-60"
    >
      {renderIcon()}
    </button>
  )
}
