import { useToast } from "../../contexts/ToastContext"
import Toast from "./Toast"

export default function ToastContainer() {
  const { toasts, removeToast } = useToast()

  if (toasts.length === 0) {
    return null
  }

  return (
    <div
      className="pointer-events-none fixed right-0 top-0 z-50 flex flex-col gap-2 p-4"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast toast={toast} onDismiss={removeToast} />
        </div>
      ))}
    </div>
  )
}
