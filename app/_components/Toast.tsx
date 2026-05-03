'use client'

import { useCallback, useEffect, useState } from 'react'

interface ToastState {
  visible: boolean
  type: 'success' | 'error'
  message: string
  seq: number
}

export function useToast() {
  const [toast, setToast] = useState<ToastState>({ visible: false, type: 'success', message: '', seq: 0 })

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast(t => ({ visible: true, type, message, seq: t.seq + 1 }))
  }, [])

  useEffect(() => {
    if (!toast.visible) return
    const id = setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000)
    return () => clearTimeout(id)
  }, [toast.visible, toast.seq])

  return { toast, showToast }
}

export function Toast({ toast }: { toast: ToastState }) {
  return (
    <div
      className={`fixed bottom-4 right-4 z-50 transition-opacity duration-300 ${
        toast.visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div className={`flex items-center gap-3 rounded-xl border bg-zinc-900 px-4 py-3 shadow-lg text-sm max-w-xs ${
        toast.type === 'success'
          ? 'border-emerald-500/30 text-emerald-300'
          : 'border-red-500/30 text-red-400'
      }`}>
        {toast.message}
      </div>
    </div>
  )
}
