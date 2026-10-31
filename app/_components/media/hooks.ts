'use client'

import { useCallback, useEffect, useRef, useSyncExternalStore, type RefObject } from 'react'
import { useRouter } from 'next/navigation'

// ---------------------------------------------------------------------------
// Keyboard: one shared way to bind hotkeys and Escape across the media UI.
// ---------------------------------------------------------------------------

/** True for targets that take typed text (inputs, textareas, selects, contenteditable). */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true
  if (target.tagName === 'INPUT') {
    const type = (target as HTMLInputElement).type
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color', 'file'].includes(type)
  }
  return false
}

/** The top-most open modal dialog (`aria-modal="true"`), if any. */
function topModal(): Element | null {
  const all = document.querySelectorAll('[aria-modal="true"]')
  return all.length ? all[all.length - 1] : null
}

export interface HotkeyOptions {
  enabled?: boolean
  /** Accept ⌘/Ctrl/Alt chords (default: ignored, so browser/OS shortcuts never trigger app actions). */
  allowModifiers?: boolean
  /** Fire while typing in a text field (default: ignored). */
  allowInInputs?: boolean
  /** Fire for auto-repeat (key held down). Default true. */
  allowRepeat?: boolean
  /** The element these hotkeys belong to. When a modal dialog is open that isn't (inside)
      this scope, the hotkeys stay quiet — e.g. the player under the search modal. With no
      scope, any open modal silences them. */
  scope?: RefObject<HTMLElement | null>
  /** Keep firing while a modal is open (global chords such as ⌘K). */
  ignoreModals?: boolean
}

/**
 * Window keydown binding with latest-handler semantics (no re-subscribe per render).
 * Escape is deliberately not handled here — use `useEscape`, which only notifies the
 * top-most layer.
 */
export function useHotkeys(handler: (e: KeyboardEvent) => void, opts: HotkeyOptions = {}) {
  const { enabled = true, allowModifiers = false, allowInInputs = false, allowRepeat = true, scope, ignoreModals = false } = opts
  const ref = useRef(handler)
  useEffect(() => { ref.current = handler })
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.key === 'Escape') return
      if (!allowModifiers && (e.metaKey || e.ctrlKey || e.altKey)) return
      if (!allowInInputs && isEditableTarget(e.target)) return
      if (!allowRepeat && e.repeat) return
      const modal = ignoreModals ? null : topModal()
      if (modal) {
        const own = scope?.current
        if (!own || !(modal === own || own.contains(modal) || modal.contains(own))) return
      }
      ref.current(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, allowModifiers, allowInInputs, allowRepeat, scope, ignoreModals])
}

// Escape layers: every open overlay (player, search, sheet, trailer…) pushes a layer;
// one window listener hands Escape to the newest layer only, so a sheet over the player
// closes the sheet and not both.
const escapeLayers: { current: () => void }[] = []
let escapeListening = false

function onEscapeKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented) return
  const top = escapeLayers[escapeLayers.length - 1]
  if (!top) return
  e.preventDefault()
  top.current()
}

export function useEscape(onEscape: () => void, enabled = true) {
  const ref = useRef(onEscape)
  useEffect(() => { ref.current = onEscape })
  useEffect(() => {
    if (!enabled) return
    const layer = { current: () => ref.current() }
    escapeLayers.push(layer)
    if (!escapeListening) {
      window.addEventListener('keydown', onEscapeKey)
      escapeListening = true
    }
    return () => {
      const i = escapeLayers.lastIndexOf(layer)
      if (i >= 0) escapeLayers.splice(i, 1)
    }
  }, [enabled])
}

// ---------------------------------------------------------------------------
// Dialogs: focus trap + restore + Escape.
// ---------------------------------------------------------------------------

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])'

/** Open dialogs, newest last — only the top-most one traps Tab. */
const dialogStack: HTMLElement[] = []

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.getClientRects().length > 0)
}

/**
 * Makes `ref` behave as a modal dialog: moves focus inside on open (the element with
 * `data-autofocus`, else the first focusable, else the container), keeps Tab cycling
 * within it, closes on Escape (top-most layer only) and restores focus to whatever
 * had it before on close. Pair with role="dialog" aria-modal="true" + a label.
 */
export function useDialog(ref: RefObject<HTMLElement | null>, onClose: () => void, opts: { enabled?: boolean } = {}) {
  const enabled = opts.enabled ?? true
  useEscape(onClose, enabled)
  useEffect(() => {
    if (!enabled) return
    const root = ref.current
    if (!root) return
    const previous = document.activeElement as HTMLElement | null
    dialogStack.push(root)
    const first = (root.hasAttribute('data-autofocus') ? root : null)
      ?? root.querySelector<HTMLElement>('[data-autofocus]')
      ?? focusables(root)[0]
    if (first && first !== root) first.focus({ preventScroll: true })
    else {
      if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1')
      root.focus({ preventScroll: true })
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || dialogStack[dialogStack.length - 1] !== root) return
      const items = focusables(root)
      if (items.length === 0) { e.preventDefault(); return }
      const head = items[0]
      const tail = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === head || !root.contains(active))) { e.preventDefault(); tail.focus() }
      else if (!e.shiftKey && (active === tail || !root.contains(active))) { e.preventDefault(); head.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const i = dialogStack.lastIndexOf(root)
      if (i >= 0) dialogStack.splice(i, 1)
      if (previous && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [ref, enabled])
}

// ---------------------------------------------------------------------------
// Layout + navigation
// ---------------------------------------------------------------------------

/** Matches Tailwind's `md` breakpoint (the rail ↔ tab-bar switch). */
const MOBILE_QUERY = '(max-width: 767px)'

/** SSR-safe breakpoint hook; the server snapshot is desktop. Prefer CSS where possible. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    cb => {
      const mq = window.matchMedia(MOBILE_QUERY)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  )
}

/** Whether "back" would stay inside this app (false on a deep link / fresh tab). */
function canGoBackInApp(): boolean {
  const nav = (window as unknown as { navigation?: { canGoBack?: boolean } }).navigation
  if (nav && typeof nav.canGoBack === 'boolean') return nav.canGoBack
  try {
    return window.history.length > 1 && Boolean(document.referrer) && new URL(document.referrer).origin === window.location.origin
  } catch {
    return false
  }
}

/** Back that falls back to a parent route when there is no in-app history (deep links). */
export function useBack(fallbackHref: string): () => void {
  const router = useRouter()
  return useCallback(() => {
    if (canGoBackInApp()) router.back()
    else router.push(fallbackHref)
  }, [router, fallbackHref])
}
