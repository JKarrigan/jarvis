'use client'

import { useEffect, useId, useRef, useSyncExternalStore } from 'react'
import { motion, useIsPresent } from 'framer-motion'

// ── Breakpoint ───────────────────────────────────────────────────────────────

const MOBILE_QUERY = '(max-width: 639px)'

function subscribeMobile(cb: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** SSR-safe breakpoint hook. Server snapshot = desktop; dialogs opened after hydration get the real value on first render. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  )
}

// ── Dialog stack ─────────────────────────────────────────────────────────────

/** Open dialogs, innermost last. Only the top one handles Escape and traps focus. */
const stack: symbol[] = []

const FOCUSABLE = [
  'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', 'iframe', 'audio[controls]', 'video[controls]',
  '[contenteditable]:not([contenteditable="false"])', '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter(el => !el.closest('[inert]') && el.getClientRects().length > 0)
}

/**
 * Makes everything outside `root` inert (not focusable, clickable or exposed to
 * assistive tech) by walking up to <body> and marking each ancestor's siblings.
 * Elements that were already inert (e.g. by an outer dialog) are left alone, and
 * live regions (toasts) stay reachable. Returns the undo function.
 */
function inertOthers(root: HTMLElement): () => void {
  const changed: HTMLElement[] = []
  let node: HTMLElement = root
  while (node.parentElement && node !== document.body) {
    const parent: HTMLElement = node.parentElement
    for (const sib of Array.from(parent.children)) {
      if (sib === node || !(sib instanceof HTMLElement)) continue
      if (sib.inert || sib.hasAttribute('aria-live') || sib.tagName === 'SCRIPT' || sib.tagName === 'STYLE') continue
      sib.inert = true
      changed.push(sib)
    }
    node = parent
  }
  return () => { for (const el of changed) el.inert = false }
}

/**
 * Shared modal behaviour: stack membership, Escape (top-most only), focus moved
 * in on open, Tab trapped, background inert, focus restored on close. A dialog
 * leaving under AnimatePresence stops being modal as soon as its exit starts.
 */
function useModalDialog(
  panelRef: React.RefObject<HTMLDivElement | null>,
  rootRef: React.RefObject<HTMLDivElement | null>,
  onClose: () => void,
  titleId: string,
  label: string | undefined,
) {
  const isPresent = useIsPresent()
  const onCloseRef = useRef(onClose)
  const labelRef = useRef(label)
  useEffect(() => {
    onCloseRef.current = onClose
    labelRef.current = label
  })

  useEffect(() => {
    const panel = panelRef.current
    const root = rootRef.current
    if (!isPresent || !panel || !root) return

    const token = Symbol('dialog')
    stack.push(token)
    const isTop = () => stack[stack.length - 1] === token

    // Accessible name: explicit label, else the first heading inside the dialog.
    if (!labelRef.current && !panel.hasAttribute('aria-labelledby')) {
      const heading = panel.querySelector<HTMLElement>('[data-dialog-title], h1, h2, h3, h4')
      if (heading) {
        if (!heading.id) heading.id = titleId
        panel.setAttribute('aria-labelledby', heading.id)
      }
    }

    const restoreInert = inertOthers(root)
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // Respect autoFocus inside the dialog; otherwise focus the panel itself.
    if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true })

    function onKey(e: KeyboardEvent) {
      if (!isTop() || !panel) return
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return // an inner control (e.g. a combobox) consumed it
        e.preventDefault()
        e.stopPropagation() // keep outer window-level Escape handlers from also closing
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables(panel)
      if (items.length === 0) { e.preventDefault(); panel.focus(); return }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (!panel.contains(active)) { e.preventDefault(); first.focus(); return }
      if (e.shiftKey && (active === first || active === panel)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('keydown', onKey)
      const i = stack.indexOf(token)
      if (i !== -1) stack.splice(i, 1)
      restoreInert() // before restoring focus: inert elements can't take focus
      if (previouslyFocused?.isConnected && !previouslyFocused.closest('[inert]')) {
        previouslyFocused.focus({ preventScroll: true })
      }
    }
  }, [isPresent, panelRef, rootRef, titleId])
}

const panelFocusCls = 'outline-none'

export function Modal({ onClose, wide, label, children }: {
  onClose: () => void
  wide?: boolean
  /** Accessible name; defaults to the first heading inside the dialog. */
  label?: string
  children: React.ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useModalDialog(panelRef, rootRef, onClose, titleId, label)

  return (
    <div ref={rootRef} className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        onClick={onClose}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`relative z-[90] w-full ${wide ? 'max-w-md' : 'max-w-sm'} max-h-[85vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl ${panelFocusCls}`}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.18, ease: [0.32, 0, 0.67, 0] } }}
        transition={{ type: 'spring', bounce: 0.25, duration: 0.4 }}
      >
        {children}
      </motion.div>
    </div>
  )
}

/**
 * Bottom sheet. `secondary` stacks it below a primary sheet (z-order only — Escape
 * always closes whichever dialog was opened last).
 */
export function Drawer({ onClose, secondary, label, children }: {
  onClose: () => void
  secondary?: boolean
  label?: string
  children: React.ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useModalDialog(panelRef, rootRef, onClose, titleId, label)

  return (
    <div ref={rootRef} className={`fixed inset-0 flex flex-col justify-end ${secondary ? 'z-[60]' : 'z-[80]'}`}>
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.22, ease: 'easeIn' } }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        onClick={onClose}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`relative w-full max-h-[92vh] overflow-y-auto rounded-t-2xl border-t border-zinc-700 bg-zinc-900 shadow-2xl ${secondary ? 'z-[70]' : 'z-[90]'} ${panelFocusCls}`}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%', transition: { duration: 0.28, ease: [0.32, 0, 0.67, 0] } }}
        transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
      >
        <div aria-hidden className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-zinc-700" />
        </div>
        {children}
      </motion.div>
    </div>
  )
}

/** Centered modal on desktop, bottom drawer below 640 px. */
export function Sheet({ onClose, wide, secondary, label, children }: {
  onClose: () => void
  wide?: boolean
  secondary?: boolean
  label?: string
  children: React.ReactNode
}) {
  const isMobile = useIsMobile()
  return isMobile
    ? <Drawer onClose={onClose} secondary={secondary} label={label}>{children}</Drawer>
    : <Modal onClose={onClose} wide={wide} label={label}>{children}</Modal>
}

/** Icon-only close button with a 40 px hit area and an accessible name. */
export function CloseButton({ onClick, label = 'Close', className = '' }: { onClick: () => void; label?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`-m-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl leading-none text-zinc-500 transition-colors hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${className}`}
    >
      <span aria-hidden>×</span>
    </button>
  )
}
