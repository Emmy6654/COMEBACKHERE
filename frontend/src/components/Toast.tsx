import { createContext, useCallback, useContext, useState, useEffect, type ReactNode } from "react"

type ToastType = "success" | "error" | "info"

interface Toast {
  id: number
  type: ToastType
  message: string
  duration: number
}

interface ToastContextValue {
  addToast: (type: ToastType, message: string, duration?: number) => void
  removeToast: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let nextId = 0

const TOAST_ICONS: Record<ToastType, string> = {
  success: "✓",
  error: "✗",
  info: "ⓘ",
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setExiting(true), toast.duration - 300)
    const removeTimer = window.setTimeout(() => onDismiss(toast.id), toast.duration)
    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(removeTimer)
    }
  }, [toast.id, toast.duration, onDismiss])

  return (
    <div
      className={`toast toast--${toast.type}${exiting ? " toast--exiting" : ""}`}
      role="alert"
    >
      <span className="toast__icon">{TOAST_ICONS[toast.type]}</span>
      <span className="toast__message">{toast.message}</span>
      <button
        className="toast__dismiss"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
      >
        &times;
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addToast = useCallback((type: ToastType, message: string, duration = 5000) => {
    const id = ++nextId
    setToasts((prev) => [...prev, { id, type, message, duration }])
  }, [])

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within a ToastProvider")
  return ctx
}
