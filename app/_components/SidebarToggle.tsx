'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { SIDEBAR_CHANGE_EVENT as CHANGE_EVENT, SIDEBAR_KEY } from '@/lib/sidebar'

function read(): boolean {
  try { return localStorage.getItem(SIDEBAR_KEY) === 'collapsed' } catch { return false }
}

function apply(collapsed: boolean): void {
  if (collapsed) document.documentElement.dataset.sidebar = 'collapsed'
  else delete document.documentElement.dataset.sidebar
}

function subscribe(onChange: () => void): () => void {
  // Another tab changed it: follow, and bring this document's attribute in line.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== SIDEBAR_KEY) return
    apply(read())
    onChange()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

/**
 * Collapses the labelled sidebar to the icon rail and back. Only shown from `xl`, where
 * the labelled sidebar exists; below that the rail is the only form. `[` toggles it too.
 * `tone` only picks the focus-ring colour so it matches the sidebar it sits in.
 */
export function SidebarToggle({ tone }: { tone: 'air' | 'media' }) {
  const collapsed = useSyncExternalStore(subscribe, read, () => false)

  const toggle = useCallback(() => {
    const next = !read()
    try { localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'open') } catch { /* private mode: still applies for this page */ }
    apply(next)
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '[' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      if (isTyping(e.target) || document.querySelector('[role="dialog"][aria-modal="true"]')) return
      if (!window.matchMedia('(min-width: 1280px)').matches) return
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={collapsed}
      title={`${label} ( [ )`}
      className={`hidden h-11 shrink-0 items-center gap-3 overflow-hidden rounded-[10px] pl-[15px] pr-3 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 xl:flex ${
        tone === 'air' ? 'focus-visible:ring-emerald-400' : 'focus-visible:ring-accent'
      }`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0">
        <path d="M4 5h16v14H4zM9 5v14" />
        <path d={collapsed ? 'M14 10l2 2-2 2' : 'M16 10l-2 2 2 2'} />
      </svg>
      <span className="flex-1 whitespace-nowrap opacity-0 transition-opacity duration-200 wide:opacity-100 text-left">{label}</span>
      <kbd aria-hidden="true" className="hidden rounded-md bg-white/10 px-1.5 py-0.5 font-sans text-xs text-white/70 wide:inline">[</kbd>
    </button>
  )
}
