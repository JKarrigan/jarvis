'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'critical'

interface ToastItem {
  id: number
  type: ToastType
  message: string
}

interface ToastState {
  visible: boolean
  type: ToastType
  message: string
  seq: number
}

export function useToast() {
  const [toast, setToast] = useState<ToastState>({ visible: false, type: 'success', message: '', seq: 0 })
  const queue = useRef<ToastItem[]>([])
  const counter = useRef(0)

  function advance() {
    const next = queue.current.shift()
    if (next) {
      setToast({ visible: true, type: next.type, message: next.message, seq: next.id })
    } else {
      setToast(t => ({ ...t, visible: false }))
    }
  }

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = ++counter.current
    queue.current.push({ id, type, message })
    setToast(t => {
      if (!t.visible) {
        queue.current.shift()
        return { visible: true, type, message, seq: id }
      }
      return t
    })
  }, [])

  const dismissToast = useCallback(() => {
    advance()
  }, [])

  // Only success/error auto-dismiss — warning and critical require explicit user action
  useEffect(() => {
    if (!toast.visible) return
    if (toast.type === 'warning' || toast.type === 'critical') return
    const id = setTimeout(advance, 3000)
    return () => clearTimeout(id)
  }, [toast.visible, toast.seq, toast.type])

  return { toast, showToast, dismissToast }
}

const TOAST_STYLES: Record<ToastType, string> = {
  success: 'border-emerald-500/30 text-emerald-300',
  error: 'border-red-500/30 text-red-400',
  warning: 'border-amber-500/30 text-amber-300',
  critical: 'border-red-500/50 text-red-300 bg-red-950/60',
}

export function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss?: () => void }) {
  return (
    <div
      className={`fixed bottom-4 right-4 z-50 transition-opacity duration-300 ${
        toast.visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div className={`flex items-center gap-3 rounded-xl border bg-zinc-900 px-4 py-3 shadow-lg text-sm max-w-xs ${TOAST_STYLES[toast.type]}`}>
        <span className="flex-1">{toast.message}</span>
        {onDismiss && (
          <button onClick={onDismiss} className="text-xs opacity-60 hover:opacity-100 transition-opacity ml-1">✕</button>
        )}
      </div>
    </div>
  )
}
