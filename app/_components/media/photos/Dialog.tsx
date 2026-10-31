'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { CloseIcon } from './icons'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Modal surface used by every Photos dialog/sheet: role=dialog + aria-modal, Esc and
 * backdrop close, Tab kept inside, focus restored to the opener on unmount. Renders as a
 * bottom sheet on phones and a centered panel on desktop. Sits above the viewer (z-90)
 * and below the global search modal (z-95).
 */
export function Dialog({
  title, onClose, children, footer, alert = false, wide = false, initialFocus,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  /** role="alertdialog" for destructive confirmations. */
  alert?: boolean
  wide?: boolean
  /** CSS selector inside the panel to focus first (defaults to the first focusable). */
  initialFocus?: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const el = panel.current
    const first = (initialFocus && el?.querySelector<HTMLElement>(initialFocus)) || el?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab' || !el) return
      const nodes = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(n => n.offsetParent !== null)
      if (nodes.length === 0) return
      const a = nodes[0]
      const b = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus() }
      else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus() }
    }
    // Capture so the viewer's own key handler never sees keys meant for the dialog.
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [initialFocus])

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center md:items-center md:p-6">
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-[rgba(4,3,8,0.66)] backdrop-blur-[8px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
      />
      <motion.div
        ref={panel}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
        className={`relative z-10 flex max-h-[86vh] w-full flex-col overflow-hidden rounded-t-[22px] border border-white/10 bg-[#141119]/95 pb-[env(safe-area-inset-bottom)] shadow-[0_30px_90px_rgba(0,0,0,0.6)] backdrop-blur-xl md:rounded-[18px] md:pb-0 ${wide ? 'md:max-w-[560px]' : 'md:max-w-[420px]'}`}
        style={{ fontFamily: 'var(--font-manrope), system-ui, sans-serif', color: 'var(--ink, #f3eff8)' }}
      >
        <div className="flex items-center gap-3 px-5 pb-2 pt-4">
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-[18px] font-bold tracking-[-0.01em]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.07] px-5 py-3">{footer}</div>}
      </motion.div>
    </div>
  )
}

export function Button({
  children, onClick, variant = 'glass', disabled, type = 'button', className = '', ...rest
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'accent' | 'glass' | 'danger' | 'ghost'
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
  'aria-label'?: string
  'data-autofocus'?: boolean
}) {
  const styles = {
    accent: 'text-ink-on-accent shadow-[0_10px_30px_var(--glow)] hover:brightness-[1.06]',
    glass: 'border border-white/10 bg-white/[0.06] text-ink hover:bg-white/[0.12]',
    danger: 'bg-[#e5484d] text-white hover:brightness-110',
    ghost: 'text-white/75 hover:bg-white/10 hover:text-white',
  }[variant]
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-[12px] px-4 text-[14px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${styles} ${className}`}
      style={variant === 'accent' ? { background: 'var(--accent)' } : undefined}
      {...rest}
    >
      {children}
    </button>
  )
}

/** Yes/no confirmation (alertdialog). `busy` disables the buttons while the action runs. */
export function ConfirmDialog({
  title, body, confirmLabel, onConfirm, onCancel, busy = false, danger = true,
}: {
  title: string
  body: React.ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
  danger?: boolean
}) {
  return (
    <Dialog
      title={title}
      onClose={busy ? () => {} : onCancel}
      alert
      initialFocus="[data-autofocus]"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'accent'} onClick={onConfirm} disabled={busy} data-autofocus>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[14.5px] leading-relaxed text-white/70">{body}</div>
    </Dialog>
  )
}

/** Single text field dialog (new album / rename). */
export function NameDialog({
  title, label, initial = '', submitLabel, onSubmit, onCancel,
}: {
  title: string
  label: string
  initial?: string
  submitLabel: string
  onSubmit: (name: string) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const trimmed = name.trim()

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(trimmed)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <Dialog title={title} onClose={busy ? () => {} : onCancel} initialFocus="input">
      <form onSubmit={submit} className="space-y-3 pt-1">
        <label htmlFor={inputId} className="block text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">{label}</label>
        <input
          id={inputId}
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={200}
          autoComplete="off"
          className="h-11 w-full rounded-[12px] border border-white/10 bg-white/[0.06] px-3.5 text-[15px] text-ink outline-none transition focus:border-[var(--accent)]"
        />
        {error && <p role="alert" className="text-[13px] text-[#ff8a8a]">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="accent" type="submit" disabled={!trimmed || busy}>{busy ? 'Saving…' : submitLabel}</Button>
        </div>
      </form>
    </Dialog>
  )
}
