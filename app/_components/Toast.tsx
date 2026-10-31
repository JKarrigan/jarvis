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

interface QueueState {
  current: ToastItem | null
  /** Last shown toast, kept so the message stays rendered while it fades out. */
  last: ToastItem | null
  queue: ToastItem[]
}

/**
 * One toast at a time; later ones wait in a queue. All queue changes happen in
 * pure state updaters, so StrictMode's double-invoked updaters can't drop or
 * duplicate toasts.
 */
export function useToast() {
  const [state, setState] = useState<QueueState>({ current: null, last: null, queue: [] })
  const counter = useRef(0)

  const showToast = useCallback((type: ToastType, message: string) => {
    const item: ToastItem = { id: ++counter.current, type, message }
    setState(s => s.current
      ? { ...s, queue: [...s.queue, item] }
      : { current: item, last: item, queue: s.queue })
  }, [])

  const dismissToast = useCallback(() => {
    setState(s => {
      const [next, ...rest] = s.queue
      return next
        ? { current: next, last: next, queue: rest }
        : { current: null, last: s.last, queue: rest }
    })
  }, [])

  const shown = state.current ?? state.last
  const toast: ToastState = {
    visible: state.current !== null,
    type: shown?.type ?? 'success',
    message: shown?.message ?? '',
    seq: shown?.id ?? 0,
  }

  // Only success/error auto-dismiss — warning and critical require explicit user action
  const { visible, seq, type } = toast
  useEffect(() => {
    if (!visible) return
    if (type === 'warning' || type === 'critical') return
    const id = setTimeout(dismissToast, 3000)
    return () => clearTimeout(id)
  }, [visible, seq, type, dismissToast])

  return { toast, showToast, dismissToast }
}

const TOAST_STYLES: Record<ToastType, string> = {
  success: 'border-emerald-500/30 text-emerald-300',
  error: 'border-red-500/30 text-red-400',
  warning: 'border-amber-500/30 text-amber-300',
  critical: 'border-red-500/50 text-red-300 bg-red-950/60',
}

export function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss?: () => void }) {
  const urgent = toast.type === 'error' || toast.type === 'critical'
  return (
    // The live region stays mounted so screen readers announce each new message.
    <div
      role="status"
      aria-live={urgent ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={`fixed bottom-4 right-4 z-50 transition-opacity duration-300 ${
        toast.visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {toast.visible || toast.message ? (
        <div
          aria-hidden={!toast.visible}
          className={`flex items-center gap-3 rounded-xl border bg-zinc-900 px-4 py-3 shadow-lg text-sm max-w-xs ${TOAST_STYLES[toast.type]}`}
        >
          <span className="flex-1">{toast.message}</span>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss notification"
              tabIndex={toast.visible ? 0 : -1}
              className="-my-2 -mr-2 ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs opacity-60 hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
            >
              <span aria-hidden>✕</span>
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}
